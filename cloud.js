(() => {
  'use strict';

  const API_ROOT = './api';
  const USER_STORAGE_PREFIX = 'dailyXpGame.v1.user.';
  const INVITE_SESSION_KEY = 'dalli.pendingInvite.v1';
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
  let pendingInvite = captureInviteFromHash();

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

  function captureInviteFromHash() {
    try {
      const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
      const params = new URLSearchParams(hash);
      const fromHash = params.get('invite');

      if (fromHash) {
        sessionStorage.setItem(INVITE_SESSION_KEY, fromHash);
        history.replaceState(null, '', location.pathname + location.search);
        return fromHash;
      }

      return sessionStorage.getItem(INVITE_SESSION_KEY) || '';
    } catch (error) {
      return '';
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

  const accountButton = makeElement('button', 'account-button');
  accountButton.type = 'button';
  accountButton.hidden = true;

  accountZone.append(syncStatus, signInButton, createAccountButton, accountButton);
  document.querySelector('.topbar')?.append(accountZone);

  function setSyncStatus(text, kind = '') {
    syncStatus.textContent = text;
    syncStatus.dataset.kind = kind;
  }

  function setSignedOutUi() {
    signInButton.hidden = false;
    createAccountButton.hidden = false;
    accountButton.hidden = true;
    accountButton.textContent = '';
    setSyncStatus('Local');
  }

  function setSignedInUi() {
    signInButton.hidden = true;
    createAccountButton.hidden = true;
    accountButton.hidden = false;
    accountButton.textContent = user?.username || 'Account';
    accountButton.title = 'Account';
  }

  // ---------------------------------------------------------------------------
  // Login / registration dialog
  // ---------------------------------------------------------------------------

  const authDialog = makeElement('dialog', 'login-dialog');
  const authForm = makeElement('form', 'login-card');
  authForm.method = 'dialog';

  const authTitle = makeElement('h2', '', 'Dalli account');
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
  const authSubmitButton = makeElement('button', 'primary-button', 'Log in');
  authSubmitButton.type = 'submit';
  authButtons.append(authCancelButton, authSubmitButton);

  authForm.append(
    authTitle,
    authText,
    authTabs,
    usernameField,
    passwordField,
    confirmPasswordField,
    ownerSetupField,
    rememberLabel,
    authMessage,
    authButtons
  );
  authDialog.append(authForm);
  document.body.append(authDialog);

  let authMode = 'login';

  function setAuthMode(mode) {
    authMode = mode === 'register' ? 'register' : 'login';
    authMessage.textContent = '';
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    ownerSetupInput.value = '';

    loginTab.classList.toggle('is-active', authMode === 'login');
    registerTab.classList.toggle('is-active', authMode === 'register');

    const registering = authMode === 'register';
    confirmPasswordField.hidden = !registering;
    ownerSetupField.hidden = !(registering && registrationMode === 'owner-setup');

    passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
    confirmPasswordInput.required = registering;
    ownerSetupInput.required = registering && registrationMode === 'owner-setup';

    if (!registering) {
      authText.textContent = 'Log in once and Dalli can keep you signed in on this device.';
      authSubmitButton.textContent = 'Log in';
      authSubmitButton.disabled = false;
      return;
    }

    authSubmitButton.textContent = registrationMode === 'owner-setup'
      ? 'Create owner account'
      : 'Create account';

    if (registrationMode === 'owner-setup') {
      authText.textContent = 'This is the first Dalli account. Enter the one-time owner setup code from your private server configuration.';
      authSubmitButton.disabled = false;
    } else if (pendingInvite) {
      authText.textContent = 'You have a Dalli invite. Choose a username and password to create your account.';
      authSubmitButton.disabled = false;
    } else {
      authText.textContent = 'New accounts require an invite link from the Dalli owner.';
      authSubmitButton.disabled = true;
    }
  }

  function openAuth(mode) {
    setAuthMode(mode);
    authDialog.showModal();
    requestAnimationFrame(() => usernameInput.focus());
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

  async function openAccountDialog() {
    if (!user) return;

    accountIdentity.textContent = `Signed in as ${user.username}`;
    inviteSection.hidden = !user.isOwner;
    generatedInvite.hidden = true;
    accountMessage.textContent = '';
    accountDialog.showModal();

    if (user.isOwner) {
      await loadInvites();
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
      authMessage.textContent = error instanceof ApiError ? error.message : 'Could not reach Dalli.';
    } finally {
      authSubmitButton.disabled = false;
    }
  }

  async function registerAccount(username, password, confirmPassword, remember) {
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
          password,
          remember,
          inviteToken: pendingInvite,
          ownerSetupToken: ownerSetupInput.value
        })
      });

      clearPendingInvite();
      registrationMode = 'invite-only';
      authDialog.close();
      await activateSession(session, { newAccount: true });
    } catch (error) {
      authMessage.textContent = error instanceof ApiError ? error.message : 'Could not create account.';
    } finally {
      authSubmitButton.disabled = false;
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
      if (!window.confirm('Dalli could not confirm sign-out with the server. Sign out on this device anyway?')) {
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

  // ---------------------------------------------------------------------------
  // Cloud state
  // ---------------------------------------------------------------------------

  function hasMeaningfulLocalState(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;

    const fresh = window.DalliApp.getDefaultState();
    const hasTransactions = Array.isArray(candidate.current?.transactions)
      && candidate.current.transactions.length > 0;
    const hasHistory = Array.isArray(candidate.history) && candidate.history.length > 0;
    const customizedSettings = JSON.stringify(candidate.settings) !== JSON.stringify(fresh.settings);

    return hasTransactions || hasHistory || customizedSettings;
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
      revision = remote.revision;
      cloudReady = true;
      window.DalliApp.replaceState(remote.state, storageKey);
      setSyncStatus('Synced', 'ok');
      return;
    }

    let initialState = cachedUserState;

    if (!initialState) {
      const guestState = window.DalliApp.getState();

      if (hasMeaningfulLocalState(guestState)) {
        const importLocal = window.confirm(
          `Import the Dalli setup and history currently stored on this device into ${user.username}'s account?\n\nOK = import it\nCancel = start fresh`
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
      window.alert('Dalli found a cloud sync conflict. Your local copy is still safe on this device.');
      return;
    }

    const loadRemote = window.confirm(
      'Dalli changed on another device before this save reached the server.\n\nLoad the newer cloud copy now?\n\nCancel keeps this device\'s local copy, but cloud saving will stay paused until you sign out and back in.'
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
  accountCloseButton.addEventListener('click', () => accountDialog.close());
  signOutButton.addEventListener('click', signOut);

  authForm.addEventListener('submit', event => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const remember = rememberInput.checked;

    if (authMode === 'register') {
      registerAccount(username, password, confirmPasswordInput.value, remember);
    } else {
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

    try {
      const session = await apiRequest('session.php', {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (session.authenticated) {
        await activateSession(session);
        return;
      }

      registrationMode = session.registration?.mode || 'invite-only';
      setSignedOutUi();

      if (pendingInvite) {
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
