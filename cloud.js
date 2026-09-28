(() => {
  'use strict';

  const API_ROOT = './api';
  const USER_STORAGE_PREFIX = 'dailyXpGame.v1.user.';
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

  const accountZone = document.createElement('div');
  accountZone.className = 'account-zone';

  const syncStatus = document.createElement('span');
  syncStatus.className = 'sync-status';
  syncStatus.textContent = 'Local';

  const accountButton = document.createElement('button');
  accountButton.type = 'button';
  accountButton.className = 'account-button';
  accountButton.textContent = 'Sign in';

  accountZone.append(syncStatus, accountButton);
  document.querySelector('.topbar')?.append(accountZone);

  const loginDialog = document.createElement('dialog');
  loginDialog.className = 'login-dialog';

  const loginForm = document.createElement('form');
  loginForm.method = 'dialog';
  loginForm.className = 'login-card';

  const loginTitle = document.createElement('h2');
  loginTitle.textContent = 'Sign in to Dalli';

  const loginText = document.createElement('p');
  loginText.className = 'muted';
  loginText.textContent = 'Cloud sync is private to your account. There is no public registration.';

  const usernameLabel = document.createElement('label');
  usernameLabel.className = 'login-field';
  const usernameSpan = document.createElement('span');
  usernameSpan.textContent = 'Username';
  const usernameInput = document.createElement('input');
  usernameInput.name = 'username';
  usernameInput.type = 'text';
  usernameInput.autocomplete = 'username';
  usernameInput.maxLength = 64;
  usernameInput.required = true;
  usernameLabel.append(usernameSpan, usernameInput);

  const passwordLabel = document.createElement('label');
  passwordLabel.className = 'login-field';
  const passwordSpan = document.createElement('span');
  passwordSpan.textContent = 'Password';
  const passwordInput = document.createElement('input');
  passwordInput.name = 'password';
  passwordInput.type = 'password';
  passwordInput.autocomplete = 'current-password';
  passwordInput.maxLength = 200;
  passwordInput.required = true;
  passwordLabel.append(passwordSpan, passwordInput);

  const loginMessage = document.createElement('div');
  loginMessage.className = 'login-message';
  loginMessage.setAttribute('role', 'status');
  loginMessage.setAttribute('aria-live', 'polite');

  const loginButtons = document.createElement('div');
  loginButtons.className = 'login-buttons';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'secondary-button';
  cancelButton.textContent = 'Cancel';

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'primary-button';
  submitButton.textContent = 'Sign in';

  loginButtons.append(cancelButton, submitButton);
  loginForm.append(loginTitle, loginText, usernameLabel, passwordLabel, loginMessage, loginButtons);
  loginDialog.append(loginForm);
  document.body.append(loginDialog);

  class ApiError extends Error {
    constructor(message, status, data = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  }

  function setSyncStatus(text, kind = '') {
    syncStatus.textContent = text;
    syncStatus.dataset.kind = kind;
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

  function setSignedOutUi() {
    accountButton.textContent = 'Sign in';
    accountButton.title = 'Sign in for cloud sync';
    setSyncStatus('Local');
  }

  function setSignedInUi() {
    accountButton.textContent = user?.username || 'Account';
    accountButton.title = 'Click to sign out';
  }

  function openLogin() {
    loginMessage.textContent = '';
    passwordInput.value = '';
    loginDialog.showModal();
    requestAnimationFrame(() => usernameInput.focus());
  }

  async function signIn(username, password) {
    submitButton.disabled = true;
    loginMessage.textContent = 'Signing in…';

    try {
      const session = await apiRequest('login.php', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      loginDialog.close();
      passwordInput.value = '';
      await activateSession(session);
    } catch (error) {
      loginMessage.textContent = error instanceof ApiError ? error.message : 'Could not reach Dalli.';
    } finally {
      submitButton.disabled = false;
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
  }

  async function activateSession(session) {
    user = session.user;
    csrfToken = session.csrfToken;
    revision = 0;
    cloudReady = false;
    conflict = false;
    queuedState = null;

    setSignedInUi();
    setSyncStatus('Loading cloud…', 'busy');

    const remote = await apiRequest('state.php');
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
      const importLocal = window.confirm(
        `This cloud account has no Dalli data yet.\n\nImport the current local Dalli setup and history into ${user.username}'s account?\n\nOK = import it\nCancel = start with a fresh Dalli setup`
      );
      initialState = importLocal ? guestState : window.DalliApp.getDefaultState();
    }

    window.DalliApp.replaceState(initialState, storageKey);
    revision = 0;
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
      const remote = await apiRequest('state.php');
      if (remote.state && remote.revision > revision) {
        revision = remote.revision;
        window.DalliApp.replaceState(remote.state, userStorageKey(user.id));
      }
      setSyncStatus('Synced', 'ok');
    } catch (error) {
      setSyncStatus('Local · offline', 'warning');
    }
  }

  async function initialize() {
    if (!window.DalliApp) return;

    try {
      const session = await apiRequest('session.php');
      if (session.authenticated) {
        await activateSession(session);
      } else {
        setSignedOutUi();
      }
    } catch (error) {
      setSignedOutUi();
      setSyncStatus('Local · offline', 'warning');
    }
  }

  accountButton.addEventListener('click', async () => {
    if (!user) {
      openLogin();
      return;
    }

    if (window.confirm(`Sign out ${user.username}?`)) {
      await signOut();
    }
  });

  cancelButton.addEventListener('click', () => loginDialog.close());

  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    signIn(usernameInput.value.trim(), passwordInput.value);
  });

  window.addEventListener('focus', pullCloudState);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pullCloudState();
  });

  window.DalliCloud = Object.freeze({
    queueSave
  });

  initialize();
})();
