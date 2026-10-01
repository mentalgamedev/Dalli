(() => {
  'use strict';

  const API_ROOT = './api';
  // Keep the legacy key so signed-in users migrate in place instead of starting over.
  const USER_STORAGE_PREFIX = 'dailyXpGame.v2.user.';
  const INVITE_SESSION_KEY = 'dalli.pendingInvite.v1';
  const VERIFY_SESSION_KEY = 'molife.pendingVerification.v1';
  const SAVE_DELAY_MS = 450;
  const RETRY_DELAY_MS = 5000;

  let user = null;
  let csrfToken = '';
  let revision = 0;
  let cloudReady = false;
  let conflict = false;
  let saveTimer = null;
  let retryTimer = null;
  let saving = false;
  let queuedState = null;
  let registrationMode = 'unknown';
  let publicSignupReady = false;
  const capturedAuthTokens = captureAuthTokens();
  let pendingInvite = capturedAuthTokens.invite;
  let pendingVerification = capturedAuthTokens.verify;

  class ApiError extends Error {
    constructor(message, status, data = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  }

  function makeElement(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function captureAuthTokens() {
    try {
      const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
      const params = new URLSearchParams(hash);
      const invite = params.get('invite') || '';
      const verify = params.get('verify') || '';

      if (invite) sessionStorage.setItem(INVITE_SESSION_KEY, invite);
      if (verify) sessionStorage.setItem(VERIFY_SESSION_KEY, verify);

      if (invite || verify) {
        history.replaceState(null, '', location.pathname + location.search);
      }

      return {
        invite: invite || sessionStorage.getItem(INVITE_SESSION_KEY) || '',
        verify: verify || sessionStorage.getItem(VERIFY_SESSION_KEY) || ''
      };
    } catch (error) {
      return { invite: '', verify: '' };
    }
  }

  function clearPendingInvite() {
    pendingInvite = '';
    try {
      sessionStorage.removeItem(INVITE_SESSION_KEY);
    } catch (error) {
      // Storage can be unavailable in hardened/private browser modes.
    }
  }

  function clearPendingVerification() {
    pendingVerification = '';
    try {
      sessionStorage.removeItem(VERIFY_SESSION_KEY);
    } catch (error) {
      // Storage can be unavailable in hardened/private browser modes.
    }
  }

  function userStorageKey(userId) {
    return `${USER_STORAGE_PREFIX}${userId}`;
  }

  async function apiRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_ROOT}/${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      cache: 'no-store'
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      throw new ApiError('Server returned an invalid response.', response.status, null);
    }

    if (!response.ok) {
      throw new ApiError(data?.error || 'Request failed.', response.status, data);
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Header account controls
  // ---------------------------------------------------------------------------

  const accountZone = makeElement('div', 'account-zone');
  const syncStatus = makeElement('span', 'sync-status', 'Local');

  const signInButton = makeElement('button', 'account-button', 'Log in');
  signInButton.type = 'button';

  const createAccountButton = makeElement('button', 'account-button account-button-secondary', 'Create account');
  createAccountButton.type = 'button';

  const accountButton = makeElement('button', 'account-button profile-button');
  accountButton.type = 'button';
  accountButton.hidden = true;
  const profileButtonName = makeElement('span', 'profile-button-name', 'Account');
  accountButton.append(profileButtonName);

  accountZone.append(syncStatus, signInButton, createAccountButton, accountButton);
  const settingsButton = document.querySelector('#settingsButton');
  if (settingsButton) {
    settingsButton.before(accountZone);
  } else {
    document.querySelector('.topbar')?.append(accountZone);
  }

  function setSyncStatus(text, kind = '') {
    syncStatus.textContent = text;
    syncStatus.dataset.kind = kind;
  }

  function setSignedOutUi() {
    signInButton.hidden = false;
    createAccountButton.hidden = false;
    createAccountButton.disabled = registrationMode === 'closed';
    createAccountButton.title = registrationMode === 'closed'
      ? 'New account creation is currently closed'
      : '';
    accountButton.hidden = true;
    setSyncStatus('Local');
  }

  function setSignedInUi() {
    signInButton.hidden = true;
    createAccountButton.hidden = true;
    accountButton.hidden = false;
    profileButtonName.textContent = user?.username || 'Account';
    accountButton.setAttribute('aria-label', `Open account for ${profileButtonName.textContent}`);
    accountButton.title = 'Account';
  }

  // ---------------------------------------------------------------------------
  // Login / registration dialog
  // ---------------------------------------------------------------------------

  const authDialog = makeElement('dialog', 'login-dialog');
  const authForm = makeElement('form', 'login-card');
  authForm.method = 'dialog';

  const authTitle = makeElement('h2', '', 'MoLife account');
  const authText = makeElement('p', 'muted');

  const authTabs = makeElement('div', 'auth-tabs');
  const loginTab = makeElement('button', 'auth-tab', 'Log in');
  loginTab.type = 'button';
  const registerTab = makeElement('button', 'auth-tab', 'Create account');
  registerTab.type = 'button';
  authTabs.append(loginTab, registerTab);

  function makeField(labelText, input) {
    const label = makeElement('label', 'login-field');
    label.append(makeElement('span', '', labelText), input);
    return label;
  }

  const usernameInput = document.createElement('input');
  usernameInput.type = 'text';
  usernameInput.name = 'username';
  usernameInput.autocomplete = 'username';
  usernameInput.minLength = 3;
  usernameInput.maxLength = 64;
  usernameInput.required = true;
  const usernameField = makeField('Username', usernameInput);

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.name = 'email';
  emailInput.autocomplete = 'email';
  emailInput.maxLength = 254;
  const emailField = makeField('Email', emailInput);

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.name = 'password';
  passwordInput.autocomplete = 'current-password';
  passwordInput.maxLength = 200;
  passwordInput.required = true;
  const passwordField = makeField('Password', passwordInput);

  const confirmPasswordInput = document.createElement('input');
  confirmPasswordInput.type = 'password';
  confirmPasswordInput.name = 'confirmPassword';
  confirmPasswordInput.autocomplete = 'new-password';
  confirmPasswordInput.maxLength = 200;
  const confirmPasswordField = makeField('Confirm password', confirmPasswordInput);

  const ownerSetupInput = document.createElement('input');
  ownerSetupInput.type = 'password';
  ownerSetupInput.name = 'ownerSetupToken';
  ownerSetupInput.autocomplete = 'off';
  ownerSetupInput.maxLength = 200;
  const ownerSetupField = makeField('Owner setup code', ownerSetupInput);

  const websiteInput = document.createElement('input');
  websiteInput.type = 'text';
  websiteInput.name = 'website';
  websiteInput.tabIndex = -1;
  websiteInput.autocomplete = 'off';
  websiteInput.setAttribute('aria-hidden', 'true');
  const websiteField = makeField('Website', websiteInput);
  websiteField.classList.add('auth-honeypot');

  const rememberLabel = makeElement('label', 'remember-row');
  const rememberInput = document.createElement('input');
  rememberInput.type = 'checkbox';
  rememberInput.checked = true;
  rememberLabel.append(rememberInput, makeElement('span', '', 'Stay signed in on this device'));

  const authMessage = makeElement('div', 'login-message');
  authMessage.setAttribute('role', 'status');
  authMessage.setAttribute('aria-live', 'polite');

  const authButtons = makeElement('div', 'login-buttons');
  const authCancelButton = makeElement('button', 'secondary-button', 'Cancel');
  authCancelButton.type = 'button';
  const resendVerificationButton = makeElement('button', 'secondary-button', 'Resend activation email');
  resendVerificationButton.type = 'button';
  resendVerificationButton.hidden = true;
  const authSubmitButton = makeElement('button', 'primary-button', 'Log in');
  authSubmitButton.type = 'submit';
  authButtons.append(authCancelButton, resendVerificationButton, authSubmitButton);

  authForm.append(
    authTitle,
    authText,
    authTabs,
    usernameField,
    emailField,
    passwordField,
    confirmPasswordField,
    ownerSetupField,
    websiteField,
    rememberLabel,
    authMessage,
    authButtons
  );
  authDialog.append(authForm);
  document.body.append(authDialog);

  let authMode = 'login';
  let pendingVerificationEmail = '';

  function setAuthMode(mode) {
    authMode = mode === 'register' ? 'register' : 'login';
    authTitle.textContent = 'MoLife account';
    authTabs.hidden = false;
    authMessage.textContent = '';
    authMessage.dataset.kind = '';
    pendingVerificationEmail = '';
    authCancelButton.textContent = 'Cancel';
    resendVerificationButton.hidden = true;
    authSubmitButton.hidden = false;
    usernameField.hidden = false;
    passwordField.hidden = false;
    websiteField.hidden = false;
    rememberLabel.hidden = false;

    // Restore normal form participation after special auth screens such as
    // email verification. Hidden required controls must never be allowed to
    // block native form submission.
    usernameInput.disabled = false;
    usernameInput.required = true;
    passwordInput.disabled = false;
    passwordInput.required = true;
    websiteInput.disabled = false;
    rememberInput.disabled = false;

    passwordInput.value = '';
    confirmPasswordInput.value = '';
    ownerSetupInput.value = '';
    websiteInput.value = '';

    loginTab.classList.toggle('is-active', authMode === 'login');
    registerTab.classList.toggle('is-active', authMode === 'register');

    const registering = authMode === 'register';
    const publicRegistration = registering
      && registrationMode === 'public'
      && publicSignupReady
      && !pendingInvite;

    resendVerificationButton.hidden = !publicRegistration;
    resendVerificationButton.textContent = 'Resend activation';
    emailField.hidden = !publicRegistration;
    confirmPasswordField.hidden = !registering;
    ownerSetupField.hidden = !(registering && registrationMode === 'owner-setup');

    emailInput.required = publicRegistration;
    emailInput.disabled = !publicRegistration;
    passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
    passwordInput.minLength = registering ? 12 : 1;
    confirmPasswordInput.required = registering;
    confirmPasswordInput.disabled = !registering;
    confirmPasswordInput.minLength = registering ? 12 : 0;
    ownerSetupInput.required = registering && registrationMode === 'owner-setup';
    ownerSetupInput.disabled = !(registering && registrationMode === 'owner-setup');

    if (!registering) {
      authText.textContent = 'Log in once and MoLife can keep you signed in on this device.';
      authSubmitButton.textContent = 'Log in';
      authSubmitButton.disabled = false;
      return;
    }

    authSubmitButton.textContent = registrationMode === 'owner-setup'
      ? 'Create owner account'
      : 'Create account';

    if (registrationMode === 'owner-setup') {
      authText.textContent = 'This is the first MoLife account. Enter the one-time owner setup code from your private server configuration.';
      authSubmitButton.disabled = false;
    } else if (registrationMode === 'closed') {
      authText.textContent = 'New account creation is currently closed. Local-only MoLife still works normally.';
      authSubmitButton.disabled = true;
    } else if (pendingInvite) {
      authText.textContent = 'You have a MoLife invite. Choose a username and password to create your account.';
      authSubmitButton.disabled = false;
    } else if (registrationMode === 'public' && publicSignupReady) {
      authText.textContent = 'Create a cloud identity for cross-device sync. We will send a one-use activation link to your email.';
      authSubmitButton.disabled = false;
    } else if (registrationMode === 'public') {
      authText.textContent = 'Public account creation is temporarily unavailable. Local-only MoLife still works normally.';
      authSubmitButton.disabled = true;
    } else {
      authText.textContent = 'New accounts require an invite link from the MoLife owner.';
      authSubmitButton.disabled = true;
    }
  }

  function showVerificationSent(email, deliveryFailed = false) {
    authMode = 'verification-sent';
    pendingVerificationEmail = email;
    authTitle.textContent = deliveryFailed ? 'TRANSMISSION INTERRUPTED' : 'TRANSMISSION SENT';
    authText.textContent = deliveryFailed
      ? 'Your pending account exists, but the activation email could not be delivered. You can try sending it again.'
      : 'Check your email for a one-use MoLife activation link. It expires after 60 minutes.';
    authTabs.hidden = true;
    usernameField.hidden = true;
    emailField.hidden = true;
    passwordField.hidden = true;
    confirmPasswordField.hidden = true;
    ownerSetupField.hidden = true;
    websiteField.hidden = true;
    rememberLabel.hidden = true;
    authSubmitButton.hidden = true;
    resendVerificationButton.hidden = false;
    resendVerificationButton.textContent = 'Resend activation email';
    authCancelButton.textContent = 'Close';
    authMessage.dataset.kind = deliveryFailed ? 'error' : 'ok';
    authMessage.textContent = email ? `Activation address: ${email}` : '';
  }

  function showVerificationPrompt(message = '') {
    authMode = 'verify';
    authTitle.textContent = 'CONFIRM YOUR IDENTITY';
    authText.textContent = 'Enter the password you chose when registering. The email link alone cannot activate the account.';
    authTabs.hidden = true;
    usernameField.hidden = true;
    emailField.hidden = true;
    passwordField.hidden = false;
    confirmPasswordField.hidden = true;
    ownerSetupField.hidden = true;
    websiteField.hidden = true;
    rememberLabel.hidden = true;
    resendVerificationButton.hidden = true;
    authSubmitButton.hidden = false;
    authSubmitButton.disabled = false;
    authSubmitButton.textContent = 'Activate account';
    authCancelButton.textContent = 'Close';

    // Verification needs only the password. Disable every hidden control so
    // browser constraint validation cannot silently reject the submit before
    // our submit handler runs (notably the normally-required username field).
    usernameInput.required = false;
    usernameInput.disabled = true;
    emailInput.required = false;
    emailInput.disabled = true;
    confirmPasswordInput.required = false;
    confirmPasswordInput.disabled = true;
    ownerSetupInput.required = false;
    ownerSetupInput.disabled = true;
    websiteInput.disabled = true;
    rememberInput.disabled = true;
    passwordInput.disabled = false;
    passwordInput.required = true;
    passwordInput.value = '';
    passwordInput.autocomplete = 'current-password';
    passwordInput.minLength = 1;
    authMessage.dataset.kind = message ? 'error' : '';
    authMessage.textContent = message;

    if (!authDialog.open) authDialog.showModal();
    requestAnimationFrame(() => passwordInput.focus());
  }

  async function activatePendingVerification(password) {
    if (!pendingVerification) {
      clearPendingVerification();
      setAuthMode('login');
      authMessage.dataset.kind = 'error';
      authMessage.textContent = 'Activation link is missing or expired.';
      return;
    }

    authSubmitButton.disabled = true;
    authMessage.dataset.kind = '';
    authMessage.textContent = 'Verifying identity…';

    try {
      const activated = await apiRequest('verify-email.php', {
        method: 'POST',
        body: JSON.stringify({ token: pendingVerification, password })
      });
      clearPendingVerification();
      authDialog.close();
      registrationMode = 'public';
      publicSignupReady = true;
      await activateSession(activated, { newAccount: true });
      setSyncStatus('Activated · Synced', 'ok');
      setTimeout(() => {
        if (user && !conflict) setSyncStatus('Synced', 'ok');
      }, 3500);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        showVerificationPrompt(error.message);
        return;
      }

      clearPendingVerification();
      setAuthMode('login');
      authMessage.dataset.kind = 'error';
      authMessage.textContent = error instanceof ApiError
        ? error.message
        : 'Could not activate this MoLife account.';
    } finally {
      authSubmitButton.disabled = false;
    }
  }

  function openAuth(mode) {
    setAuthMode(mode);
    if (!authDialog.open) authDialog.showModal();
    requestAnimationFrame(() => {
      if (mode === 'register' && !emailField.hidden) {
        usernameInput.focus();
      } else {
        usernameInput.focus();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Signed-in account dialog
  // ---------------------------------------------------------------------------

  const accountDialog = makeElement('dialog', 'login-dialog account-dialog');
  const accountCard = makeElement('div', 'login-card');

  const accountHeading = makeElement('h2', '', 'Account');
  const accountIdentity = makeElement('p', 'muted');

  const inviteSection = makeElement('section', 'invite-section');
  const inviteHeading = makeElement('h3', '', 'Invite someone');
  const inviteHelp = makeElement(
    'p',
    'muted',
    'Create a one-use link. It expires automatically after 7 days.'
  );
  const createInviteButton = makeElement('button', 'secondary-button', 'Create invite link');
  createInviteButton.type = 'button';

  const generatedInvite = makeElement('div', 'generated-invite');
  generatedInvite.hidden = true;
  const generatedInviteInput = document.createElement('input');
  generatedInviteInput.type = 'text';
  generatedInviteInput.readOnly = true;
  generatedInviteInput.setAttribute('aria-label', 'Generated invite link');
  const copyInviteButton = makeElement('button', 'secondary-button', 'Copy');
  copyInviteButton.type = 'button';
  const generatedInviteNote = makeElement('small', 'muted');
  generatedInvite.append(generatedInviteInput, copyInviteButton, generatedInviteNote);

  const inviteList = makeElement('div', 'invite-list');

  inviteSection.append(
    inviteHeading,
    inviteHelp,
    createInviteButton,
    generatedInvite,
    inviteList
  );

  const mailTestSection = makeElement('section', 'invite-section mail-test-section');
  const mailTestHeading = makeElement('h3', '', 'Email system');
  const mailTestHelp = makeElement(
    'p',
    'muted',
    'Send a real transactional email through the configured SMTP account. Delivery proves SMTP acceptance, not inbox placement; SPF, DKIM and DMARC still matter.'
  );
  const mailTestInput = document.createElement('input');
  mailTestInput.type = 'email';
  mailTestInput.maxLength = 254;
  mailTestInput.autocomplete = 'email';
  mailTestInput.placeholder = 'you@example.com';
  const mailTestField = makeField('Test recipient', mailTestInput);
  const sendMailTestButton = makeElement('button', 'secondary-button', 'Send test email');
  sendMailTestButton.type = 'button';
  const mailTestControls = makeElement('div', 'mail-test-controls');
  mailTestControls.append(mailTestField, sendMailTestButton);
  const mailTestMessage = makeElement('div', 'login-message');
  mailTestMessage.setAttribute('role', 'status');
  mailTestMessage.setAttribute('aria-live', 'polite');

  mailTestSection.append(
    mailTestHeading,
    mailTestHelp,
    mailTestControls,
    mailTestMessage
  );

  const securitySection = makeElement('section', 'invite-section security-status-section');
  const securityHeading = makeElement('h3', '', 'Public registration firewall');
  const securityHelp = makeElement(
    'p',
    'muted',
    'Circuit breakers protect the database and mail account from automated signup floods.'
  );
  const securityStatus = makeElement('div', 'security-status');
  const refreshSecurityButton = makeElement('button', 'secondary-button', 'Refresh status');
  refreshSecurityButton.type = 'button';
  securitySection.append(securityHeading, securityHelp, securityStatus, refreshSecurityButton);

  const accountMessage = makeElement('div', 'login-message');
  accountMessage.setAttribute('role', 'status');
  accountMessage.setAttribute('aria-live', 'polite');

  const accountButtons = makeElement('div', 'login-buttons');
  const signOutButton = makeElement('button', 'danger-button', 'Sign out');
  signOutButton.type = 'button';
  const accountCloseButton = makeElement('button', 'secondary-button', 'Close');
  accountCloseButton.type = 'button';
  accountButtons.append(signOutButton, accountCloseButton);

  accountCard.append(
    accountHeading,
    accountIdentity,
    inviteSection,
    mailTestSection,
    securitySection,
    accountMessage,
    accountButtons
  );
  accountDialog.append(accountCard);
  document.body.append(accountDialog);

  function formatShortDate(timestampSeconds) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(timestampSeconds * 1000));
  }

  function renderInvites(invites) {
    inviteList.replaceChildren();

    if (!Array.isArray(invites) || invites.length === 0) {
      inviteList.append(makeElement('div', 'empty-state', 'No active unused invites.'));
      return;
    }

    invites.forEach(invite => {
      const row = makeElement('div', 'invite-row');
      const copy = makeElement('div', 'invite-row-copy');
      copy.append(
        makeElement('strong', '', 'Unused invite'),
        makeElement('span', 'muted', `Expires ${formatShortDate(invite.expiresAt)}`)
      );

      const revoke = makeElement('button', 'small-button', 'Revoke');
      revoke.type = 'button';
      revoke.addEventListener('click', async () => {
        revoke.disabled = true;
        try {
          const result = await apiRequest('invite.php', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({
              operation: 'revoke',
              inviteId: invite.id
            })
          });
          renderInvites(result.invites);
        } catch (error) {
          accountMessage.textContent = error instanceof ApiError ? error.message : 'Could not revoke invite.';
        } finally {
          revoke.disabled = false;
        }
      });

      row.append(copy, revoke);
      inviteList.append(row);
    });
  }

  async function loadInvites() {
    if (!user?.isOwner) return;

    try {
      const result = await apiRequest('invite.php', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ operation: 'list' })
      });
      renderInvites(result.invites);
    } catch (error) {
      accountMessage.textContent = error instanceof ApiError ? error.message : 'Could not load invites.';
    }
  }

  async function loadSecurityStatus() {
    if (!user?.isOwner) return;

    securityStatus.textContent = 'Checking perimeter…';
    refreshSecurityButton.disabled = true;

    try {
      const result = await apiRequest('security-status.php', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({})
      });

      const limits = result.limits || {};
      const mail = result.mailDeliverability || {};
      const registrationState = result.publicSignupReady ? 'OPEN' : 'SAFE MODE';
      const dnsState = value => value === true ? 'FOUND' : value === false ? 'MISSING' : 'UNKNOWN';
      const lines = [
        `Public registration: ${registrationState}`,
        `Accounts: ${result.activeAccounts ?? 0} active · ${result.pendingAccounts ?? 0} pending / ${limits.maxPendingAccounts ?? '?'} max`,
        `Registrations: ${limits.registrationHour?.used ?? 0}/${limits.registrationHour?.limit ?? '?'} this hour · ${limits.registrationDay?.used ?? 0}/${limits.registrationDay?.limit ?? '?'} / 24h`,
        `Account mail: ${limits.mailHour?.used ?? 0}/${limits.mailHour?.limit ?? '?'} this hour · ${limits.mailDay?.used ?? 0}/${limits.mailDay?.limit ?? '?'} / 24h`
      ];
      if (mail.senderDomain) {
        lines.push(`Sender domain: ${mail.senderDomain}`);
        lines.push(`SPF: ${dnsState(mail.spfFound)} · DMARC: ${dnsState(mail.dmarcFound)}`);
        lines.push(mail.dkimSelector
          ? `DKIM (${mail.dkimSelector}): ${dnsState(mail.dkimFound)}`
          : 'DKIM: selector not configured in MoLife · verify signing with your SMTP provider');
      }
      securityStatus.replaceChildren(...lines.map(line => makeElement('div', 'security-status-line', line)));
      const deliverabilityWarning = mail.spfFound === false || mail.dmarcFound === false || mail.dkimFound === false;
      securityStatus.dataset.kind = result.publicSignupReady && !deliverabilityWarning ? 'ok' : 'warning';
    } catch (error) {
      securityStatus.dataset.kind = 'error';
      securityStatus.textContent = error instanceof ApiError
        ? error.message
        : 'Could not read registration security status.';
    } finally {
      refreshSecurityButton.disabled = false;
    }
  }

  async function openAccountDialog() {
    if (!user) return;

    accountIdentity.textContent = user.email
      ? `Signed in as ${user.username} · ${user.email}${user.emailVerified ? ' ✓' : ''}`
      : `Signed in as ${user.username}`;
    inviteSection.hidden = !user.isOwner;
    mailTestSection.hidden = !user.isOwner;
    securitySection.hidden = !user.isOwner;
    generatedInvite.hidden = true;
    accountMessage.textContent = '';
    mailTestMessage.textContent = '';
    mailTestMessage.dataset.kind = '';
    if (user.isOwner && !mailTestInput.value && user.email) {
      mailTestInput.value = user.email;
    }
    accountDialog.showModal();

    if (user.isOwner) {
      await Promise.all([loadInvites(), loadSecurityStatus()]);
    }
  }

  // ---------------------------------------------------------------------------
  // Authentication actions
  // ---------------------------------------------------------------------------

  async function signIn(username, password, remember) {
    authSubmitButton.disabled = true;
    authMessage.textContent = 'Logging in…';

    try {
      const session = await apiRequest('login.php', {
        method: 'POST',
        body: JSON.stringify({ username, password, remember })
      });

      authDialog.close();
      await activateSession(session);
    } catch (error) {
      authMessage.textContent = error instanceof ApiError ? error.message : 'Could not reach MoLife.';
    } finally {
      authSubmitButton.disabled = false;
    }
  }

  async function registerAccount(username, email, password, confirmPassword, remember) {
    if (password !== confirmPassword) {
      authMessage.textContent = 'The passwords do not match.';
      return;
    }

    authSubmitButton.disabled = true;
    authMessage.textContent = 'Creating account…';

    try {
      const session = await apiRequest('register.php', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          password,
          remember,
          website: websiteInput.value,
          inviteToken: pendingInvite,
          ownerSetupToken: ownerSetupInput.value
        })
      });

      if (session.pending) {
        showVerificationSent(email);
        return;
      }

      clearPendingInvite();
      authDialog.close();
      await activateSession(session, { newAccount: true });
    } catch (error) {
      if (error instanceof ApiError && error.data?.pending) {
        showVerificationSent(email, error.data?.emailDeliveryFailed === true);
      } else {
        authMessage.textContent = error instanceof ApiError ? error.message : 'Could not create account.';
      }
    } finally {
      authSubmitButton.disabled = false;
    }
  }

  async function resendVerification() {
    const email = pendingVerificationEmail || emailInput.value.trim();
    if (!email) {
      authMessage.dataset.kind = 'error';
      authMessage.textContent = 'Enter your email address first.';
      emailInput.focus();
      return;
    }

    resendVerificationButton.disabled = true;
    authMessage.dataset.kind = '';
    authMessage.textContent = 'Requesting a fresh activation transmission…';

    try {
      const result = await apiRequest('resend-verification.php', {
        method: 'POST',
        body: JSON.stringify({ email, remember: rememberInput.checked })
      });
      authTitle.textContent = 'TRANSMISSION SENT';
      authText.textContent = 'If this address has a pending MoLife account, fresh activation instructions have been sent.';
      authMessage.dataset.kind = 'ok';
      authMessage.textContent = `Activation address: ${email}`;
    } catch (error) {
      authMessage.dataset.kind = 'error';
      authMessage.textContent = error instanceof ApiError
        ? error.message
        : 'Could not request another activation email.';
    } finally {
      resendVerificationButton.disabled = false;
    }
  }

  async function signOut() {
    if (!user) return;

    try {
      await flushSave();
      await apiRequest('logout.php', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({})
      });
    } catch (error) {
      if (!window.confirm('MoLife could not confirm sign-out with the server. Sign out on this device anyway?')) {
        return;
      }
    }

    user = null;
    csrfToken = '';
    revision = 0;
    cloudReady = false;
    conflict = false;
    queuedState = null;
    clearTimeout(saveTimer);
    clearTimeout(retryTimer);
    window.DalliApp.useStorageKey(window.DalliApp.guestStorageKey);
    setSignedOutUi();
    accountDialog.close();
  }

  createInviteButton.addEventListener('click', async () => {
    if (!user?.isOwner) return;

    createInviteButton.disabled = true;
    accountMessage.textContent = '';

    try {
      const result = await apiRequest('invite.php', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ operation: 'create' })
      });

      generatedInviteInput.value = result.invite.url;
      generatedInviteNote.textContent = `Expires ${formatShortDate(result.invite.expiresAt)} · works once`;
      generatedInvite.hidden = false;
      renderInvites(result.invites);
    } catch (error) {
      accountMessage.textContent = error instanceof ApiError ? error.message : 'Could not create invite.';
    } finally {
      createInviteButton.disabled = false;
    }
  });

  copyInviteButton.addEventListener('click', async () => {
    if (!generatedInviteInput.value) return;

    try {
      await navigator.clipboard.writeText(generatedInviteInput.value);
      copyInviteButton.textContent = 'Copied';
      setTimeout(() => { copyInviteButton.textContent = 'Copy'; }, 1500);
    } catch (error) {
      generatedInviteInput.focus();
      generatedInviteInput.select();
      accountMessage.textContent = 'Select and copy the invite link manually.';
    }
  });

  refreshSecurityButton.addEventListener('click', loadSecurityStatus);

  sendMailTestButton.addEventListener('click', async () => {
    if (!user?.isOwner) return;

    const email = mailTestInput.value.trim();
    if (!email || !mailTestInput.checkValidity()) {
      mailTestMessage.dataset.kind = 'error';
      mailTestMessage.textContent = 'Enter a valid recipient email address.';
      mailTestInput.focus();
      return;
    }

    sendMailTestButton.disabled = true;
    mailTestMessage.dataset.kind = '';
    mailTestMessage.textContent = 'Sending SMTP test…';

    try {
      const result = await apiRequest('test-mail.php', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ email })
      });
      mailTestMessage.dataset.kind = 'ok';
      mailTestMessage.textContent = result.message || 'SMTP test email sent.';
    } catch (error) {
      mailTestMessage.dataset.kind = 'error';
      mailTestMessage.textContent = error instanceof ApiError
        ? error.message
        : 'Could not send the SMTP test email.';
    } finally {
      sendMailTestButton.disabled = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Cloud state
  // ---------------------------------------------------------------------------

  function hasMeaningfulLocalState(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;

    const fresh = window.DalliApp.getDefaultState();
    const hasTransactions = Array.isArray(candidate.current?.transactions)
      && candidate.current.transactions.length > 0;
    const hasHistory = Array.isArray(candidate.history) && candidate.history.length > 0;
    const hasItems = Array.isArray(candidate.inventory?.items) && candidate.inventory.items.length > 0;
    const hasOneOffs = Array.isArray(candidate.oneOffs) && candidate.oneOffs.length > 0;
    const customizedSettings = JSON.stringify(candidate.settings) !== JSON.stringify(fresh.settings);

    return hasTransactions || hasHistory || hasItems || hasOneOffs || customizedSettings;
  }

  async function activateSession(session, options = {}) {
    user = session.user;
    csrfToken = session.csrfToken;
    revision = 0;
    cloudReady = false;
    conflict = false;
    queuedState = null;

    setSignedInUi();
    setSyncStatus('Loading cloud…', 'busy');

    const remote = await apiRequest('state.php', {
      method: 'POST',
      body: JSON.stringify({ operation: 'read' })
    });

    const storageKey = userStorageKey(user.id);
    const cachedUserState = window.DalliApp.readStoredState(storageKey);

    if (remote.state) {
      const remoteVersion = Number(remote.state.version || 0);
      revision = remote.revision;
      cloudReady = true;
      window.DalliApp.replaceState(remote.state, storageKey);

      if (remoteVersion !== window.DalliApp.stateVersion) {
        try {
          await saveNow(window.DalliApp.getState());
          setSyncStatus(`MoLife v${window.DalliApp.stateVersion} state migrated · synced`, 'ok');
        } catch (error) {
          handleSaveError(error, window.DalliApp.getState());
        }
      } else {
        setSyncStatus('Synced', 'ok');
      }
      return;
    }

    let initialState = cachedUserState;

    if (!initialState) {
      const guestState = window.DalliApp.getState();

      if (hasMeaningfulLocalState(guestState)) {
        const importLocal = window.confirm(
          `Import the MoLife setup and history currently stored on this device into ${user.username}'s account?\n\nOK = import it\nCancel = start fresh`
        );
        initialState = importLocal ? guestState : window.DalliApp.getDefaultState();
      } else {
        initialState = window.DalliApp.getDefaultState();
      }
    }

    window.DalliApp.replaceState(initialState, storageKey);
    revision = remote.revision || 0;
    cloudReady = true;

    try {
      await saveNow(window.DalliApp.getState());
      setSyncStatus('Synced', 'ok');
    } catch (error) {
      handleSaveError(error, window.DalliApp.getState());
    }
  }

  async function saveNow(snapshot) {
    if (!user || !cloudReady || conflict) return;

    const response = await apiRequest('state.php', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        operation: 'save',
        state: snapshot,
        expectedRevision: revision
      })
    });

    revision = response.revision;
  }

  function handleConflict(error) {
    conflict = true;
    queuedState = null;
    setSyncStatus('Sync conflict', 'error');

    const remote = error.data;
    if (!remote?.state) {
      window.alert('MoLife found a cloud sync conflict. Your local copy is still safe on this device.');
      return;
    }

    const loadRemote = window.confirm(
      'MoLife changed on another device before this save reached the server.\n\nLoad the newer cloud copy now?\n\nCancel keeps this device\'s local copy, but cloud saving will stay paused until you sign out and back in.'
    );

    if (loadRemote) {
      revision = remote.revision;
      conflict = false;
      window.DalliApp.replaceState(remote.state, userStorageKey(user.id));
      setSyncStatus('Synced', 'ok');
    }
  }

  function handleSaveError(error, snapshot) {
    if (error instanceof ApiError && error.status === 409 && error.data?.conflict) {
      handleConflict(error);
      return;
    }

    queuedState = snapshot;
    setSyncStatus('Local · retrying', 'warning');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (!saving && queuedState && !conflict) flushSave();
    }, RETRY_DELAY_MS);
  }

  async function flushSave() {
    clearTimeout(saveTimer);

    if (!user || !cloudReady || conflict || saving || !queuedState) return;

    const snapshot = queuedState;
    queuedState = null;
    saving = true;
    setSyncStatus('Syncing…', 'busy');

    try {
      await saveNow(snapshot);
      setSyncStatus('Synced', 'ok');
    } catch (error) {
      handleSaveError(error, snapshot);
    } finally {
      saving = false;
      if (queuedState && !conflict) {
        saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
      }
    }
  }

  function queueSave(snapshot) {
    if (!user || !cloudReady || conflict) return;

    queuedState = snapshot;
    setSyncStatus('Saving…', 'busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
  }

  async function pullCloudState() {
    if (!user || !cloudReady || conflict || saving || queuedState) return;

    try {
      const remote = await apiRequest('state.php', {
        method: 'POST',
        body: JSON.stringify({ operation: 'read' })
      });

      if (remote.state && remote.revision > revision) {
        revision = remote.revision;
        window.DalliApp.replaceState(remote.state, userStorageKey(user.id));
      }
      setSyncStatus('Synced', 'ok');
    } catch (error) {
      setSyncStatus('Local · offline', 'warning');
    }
  }

  // ---------------------------------------------------------------------------
  // Events / startup
  // ---------------------------------------------------------------------------

  signInButton.addEventListener('click', () => openAuth('login'));
  createAccountButton.addEventListener('click', () => openAuth('register'));
  accountButton.addEventListener('click', openAccountDialog);

  loginTab.addEventListener('click', () => setAuthMode('login'));
  registerTab.addEventListener('click', () => setAuthMode('register'));
  authCancelButton.addEventListener('click', () => authDialog.close());
  resendVerificationButton.addEventListener('click', resendVerification);
  accountCloseButton.addEventListener('click', () => accountDialog.close());
  signOutButton.addEventListener('click', signOut);

  authForm.addEventListener('submit', event => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const remember = rememberInput.checked;

    if (authMode === 'register') {
      registerAccount(username, email, password, confirmPasswordInput.value, remember);
    } else if (authMode === 'verify') {
      activatePendingVerification(password);
    } else if (authMode === 'login') {
      signIn(username, password, remember);
    }
  });

  window.addEventListener('focus', pullCloudState);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pullCloudState();
  });

  window.DalliCloud = Object.freeze({ queueSave });

  async function initialize() {
    if (!window.DalliApp) return;

    if (pendingVerification) {
      setSignedOutUi();
      showVerificationPrompt();
      return;
    }

    try {
      const session = await apiRequest('session.php', {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (session.authenticated) {
        await activateSession(session);
        return;
      }

      registrationMode = session.registration?.mode || 'invite';
      publicSignupReady = session.registration?.publicSignupReady === true;
      setSignedOutUi();

      if (pendingInvite && registrationMode !== 'closed') {
        openAuth('register');
      }
    } catch (error) {
      setSignedOutUi();
      createAccountButton.disabled = true;
      createAccountButton.title = 'Account server is currently unavailable';
      setSyncStatus('Local · offline', 'warning');
    }
  }

  initialize();
})();
