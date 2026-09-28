(() => {
  'use strict';

  const STORAGE_KEY = 'dailyXpGame.v1';
  let activeStorageKey = STORAGE_KEY;
  let suppressCloudSave = false;
  const BALANCE_FACTOR = 0.70;
  const HISTORY_LIMIT = 30;
  const UNCATEGORIZED_ID = 'uncategorized';

  const CATEGORY_COLORS = {
    wellbeing: '#48d99a',
    health: '#48d99a',
    work: '#7f8cff',
    chores: '#ffb45f',
    uncategorized: '#8a93a3'
  };

  const DEFAULT_STATE = {
    version: 1,
    settings: {
      goal: 100,
      categories: [
        { id: 'wellbeing', name: 'Wellbeing', icon: '♥', weight: 1 },
        { id: 'work', name: 'Work', icon: '◆', weight: 1 },
        { id: 'chores', name: 'Chores', icon: '⌂', weight: 1 },
        { id: UNCATEGORIZED_ID, name: 'Uncategorized', icon: '•', weight: 0 }
      ],
      actions: [
        { id: 'health-workout-30', categoryId: 'wellbeing', name: 'Workout — 30 min', xp: 20, type: 'repeatable' },
        { id: 'health-walk-20', categoryId: 'wellbeing', name: 'Walk — 20 min', xp: 10, type: 'repeatable' },
        { id: 'health-mobility-10', categoryId: 'wellbeing', name: 'Stretch / mobility — 10 min', xp: 5, type: 'repeatable' },
        { id: 'health-good-meal', categoryId: 'wellbeing', name: 'Proper healthy meal', xp: 10, type: 'once' },
        { id: 'work-focus-25', categoryId: 'work', name: 'Focused work — 25 min', xp: 15, type: 'repeatable' },
        { id: 'work-focus-50', categoryId: 'work', name: 'Focused work — 50 min', xp: 30, type: 'repeatable' },
        { id: 'work-practice-20', categoryId: 'work', name: 'Practice / skill — 20 min', xp: 10, type: 'repeatable' },
        { id: 'work-admin', categoryId: 'work', name: 'Annoying admin task', xp: 10, type: 'once' },
        { id: 'chores-small', categoryId: 'chores', name: 'Small chore — 5–10 min', xp: 5, type: 'repeatable' },
        { id: 'chores-medium', categoryId: 'chores', name: 'Cleaning — 15–30 min', xp: 10, type: 'repeatable' },
        { id: 'chores-laundry', categoryId: 'chores', name: 'Laundry', xp: 10, type: 'once' },
        { id: 'chores-big', categoryId: 'chores', name: 'Big chore / deep clean', xp: 20, type: 'repeatable' }
      ]
    },
    current: {
      date: '',
      transactions: []
    },
    history: []
  };

  const els = {
    todayLabel: document.querySelector('#todayLabel'),
    totalXp: document.querySelector('#totalXp'),
    goalXp: document.querySelector('#goalXp'),
    statusBadge: document.querySelector('#statusBadge'),
    heroMessage: document.querySelector('#heroMessage'),
    xpOrb: document.querySelector('#xpOrb'),
    orbPercent: document.querySelector('#orbPercent'),
    totalProgress: document.querySelector('#totalProgress'),
    victoryBanner: document.querySelector('#victoryBanner'),
    categoriesGrid: document.querySelector('#categoriesGrid'),
    logList: document.querySelector('#logList'),
    historyList: document.querySelector('#historyList'),
    categoryTemplate: document.querySelector('#categoryTemplate'),
    settingsButton: document.querySelector('#settingsButton'),
    settingsDialog: document.querySelector('#settingsDialog'),
    settingsForm: document.querySelector('#settingsForm'),
    goalInput: document.querySelector('#goalInput'),
    categoriesEditor: document.querySelector('#categoriesEditor'),
    newCategoryName: document.querySelector('#newCategoryName'),
    newCategoryIcon: document.querySelector('#newCategoryIcon'),
    newCategoryWeight: document.querySelector('#newCategoryWeight'),
    addCategoryButton: document.querySelector('#addCategoryButton'),
    actionsEditor: document.querySelector('#actionsEditor'),
    newActionName: document.querySelector('#newActionName'),
    newActionCategory: document.querySelector('#newActionCategory'),
    newActionXp: document.querySelector('#newActionXp'),
    newActionType: document.querySelector('#newActionType'),
    addActionButton: document.querySelector('#addActionButton'),
    settingsMessage: document.querySelector('#settingsMessage')
  };

  let state = loadState();
  let settingsDraft = null;
  let editingCategoryId = null;
  let editingActionId = null;
  let wasVictory = false;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDate(dateKey, options = {}) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function makeId(prefix = 'id') {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function loadState(storageKey = activeStorageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return deepClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return deepClone(DEFAULT_STATE);
      return normalizeState(parsed);
    } catch (error) {
      console.warn('Could not load saved Dalli data:', error);
      return deepClone(DEFAULT_STATE);
    }
  }

  function normalizeState(candidate) {
    const next = deepClone(DEFAULT_STATE);
    next.settings.goal = clampInt(candidate.settings?.goal, 20, 1000, 100);

    if (Array.isArray(candidate.settings?.categories) && candidate.settings.categories.length) {
      next.settings.categories = candidate.settings.categories.map((category, index) => ({
        id: String(category.id || `category-${index + 1}`),
        name: String(category.name || `Category ${index + 1}`),
        icon: String(category.icon || '•'),
        weight: clampNumber(category.weight, 0.25, 10, 1)
      }));
    }

    if (Array.isArray(candidate.settings?.actions)) {
      const categoryIds = new Set(next.settings.categories.map(c => c.id));
      next.settings.actions = candidate.settings.actions
        .filter(action => categoryIds.has(String(action.categoryId)))
        .map((action, index) => ({
          id: String(action.id || `action-${index + 1}`),
          categoryId: String(action.categoryId),
          name: String(action.name || 'Unnamed action'),
          xp: clampInt(action.xp, 1, 200, 10),
          type: action.type === 'once' ? 'once' : 'repeatable'
        }));
    }

    next.current.date = String(candidate.current?.date || '');
    next.current.transactions = Array.isArray(candidate.current?.transactions)
      ? candidate.current.transactions.map(tx => ({
          id: String(tx.id || makeId('tx')),
          actionId: String(tx.actionId || ''),
          actionName: String(tx.actionName || 'Action'),
          categoryId: String(tx.categoryId || ''),
          xp: clampInt(tx.xp, 0, 200, 0),
          timestamp: Number.isFinite(Number(tx.timestamp)) ? Number(tx.timestamp) : Date.now()
        })).filter(tx => tx.xp > 0)
      : [];

    next.history = Array.isArray(candidate.history)
      ? candidate.history.slice(0, HISTORY_LIMIT).map(day => ({
          date: String(day.date || ''),
          xp: clampInt(day.xp, 0, 100000, 0),
          goal: clampInt(day.goal, 20, 1000, 100),
          won: Boolean(day.won),
          categoryXp: typeof day.categoryXp === 'object' && day.categoryXp ? day.categoryXp : {}
        })).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
      : [];

    return next;
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function saveState() {
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
    if (!suppressCloudSave && window.DalliCloud && typeof window.DalliCloud.queueSave === 'function') {
      window.DalliCloud.queueSave(deepClone(state));
    }
  }

  function readStoredState(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return null;
      return normalizeState(parsed);
    } catch (error) {
      console.warn('Could not read cached Dalli data:', error);
      return null;
    }
  }

  function replaceState(candidate, storageKey = activeStorageKey) {
    suppressCloudSave = true;
    try {
      activeStorageKey = storageKey;
      state = normalizeState(candidate);
      ensureToday();
      localStorage.setItem(activeStorageKey, JSON.stringify(state));
      render();
    } finally {
      suppressCloudSave = false;
    }
  }

  function useStorageKey(storageKey) {
    suppressCloudSave = true;
    try {
      activeStorageKey = storageKey;
      state = loadState(activeStorageKey);
      ensureToday();
      render();
    } finally {
      suppressCloudSave = false;
    }
  }

  function ensureToday() {
    const today = localDateKey();
    if (!state.current.date) {
      state.current.date = today;
      saveState();
      return;
    }
    if (state.current.date === today) return;

    archiveCurrentDay();
    state.current = { date: today, transactions: [] };
    saveState();
  }

  function archiveCurrentDay() {
    if (!state.current.date) return;
    const summary = getSummary();
    const record = {
      date: state.current.date,
      xp: summary.totalXp,
      goal: state.settings.goal,
      won: summary.isVictory,
      categoryXp: summary.categoryXp
    };
    state.history = state.history.filter(day => day.date !== record.date);
    state.history.unshift(record);
    state.history = state.history.slice(0, HISTORY_LIMIT);
  }

  function getCategoryRequirements() {
    const categories = state.settings.categories;
    const weightTotal = categories.reduce((sum, category) => sum + category.weight, 0) || 1;
    return Object.fromEntries(categories.map(category => {
      const weightedShare = state.settings.goal * (category.weight / weightTotal);
      const minimum = Math.max(1, Math.round(weightedShare * BALANCE_FACTOR));
      return [category.id, minimum];
    }));
  }

  function getSummary() {
    const categoryXp = Object.fromEntries(state.settings.categories.map(c => [c.id, 0]));
    let totalXp = 0;
    for (const tx of state.current.transactions) {
      totalXp += tx.xp;
      if (tx.categoryId in categoryXp) categoryXp[tx.categoryId] += tx.xp;
    }
    const requirements = getCategoryRequirements();
    const allMinimumsMet = state.settings.categories.every(category => (categoryXp[category.id] || 0) >= requirements[category.id]);
    return {
      totalXp,
      categoryXp,
      requirements,
      allMinimumsMet,
      isVictory: totalXp >= state.settings.goal && allMinimumsMet
    };
  }

  function hasCompletedOnceAction(actionId) {
    return state.current.transactions.some(tx => tx.actionId === actionId);
  }

  function addXp(actionId) {
    ensureToday();
    const action = state.settings.actions.find(item => item.id === actionId);
    if (!action) return;
    if (action.type === 'once' && hasCompletedOnceAction(action.id)) return;

    state.current.transactions.push({
      id: makeId('tx'),
      actionId: action.id,
      actionName: action.name,
      categoryId: action.categoryId,
      xp: action.xp,
      timestamp: Date.now()
    });
    saveState();
    render();
  }

  function undoTransaction(transactionId) {
    const index = state.current.transactions.findIndex(tx => tx.id === transactionId);
    if (index < 0) return;
    state.current.transactions.splice(index, 1);
    saveState();
    render();
  }

  function categoryColor(categoryId, index = 0) {
    if (CATEGORY_COLORS[categoryId]) return CATEGORY_COLORS[categoryId];
    const fallbacks = ['#69d5ff', '#d37cff', '#e9d96b', '#ff7daf', '#8fd56a', '#65cfc8'];
    return fallbacks[index % fallbacks.length];
  }

  function render() {
    ensureToday();
    const summary = getSummary();
    renderHero(summary);
    renderCategories(summary);
    renderLog();
    renderHistory();
    if (summary.isVictory && !wasVictory) {
      els.victoryBanner.classList.remove('victory-pop');
      requestAnimationFrame(() => els.victoryBanner.classList.add('victory-pop'));
    }
    wasVictory = summary.isVictory;
  }

  function renderHero(summary) {
    els.todayLabel.textContent = formatDate(state.current.date, { weekday: 'long', day: 'numeric', month: 'long' });
    els.totalXp.textContent = summary.totalXp;
    els.goalXp.textContent = state.settings.goal;

    const progress = Math.min(1, summary.totalXp / state.settings.goal);
    const percent = Math.round(progress * 100);
    els.totalProgress.style.width = `${percent}%`;
    els.xpOrb.style.setProperty('--progress', `${progress * 360}deg`);
    els.orbPercent.textContent = `${percent}%`;

    if (summary.isVictory) {
      els.statusBadge.textContent = 'VICTORY';
      els.heroMessage.textContent = 'Challenge cleared. Extra XP is optional high score territory.';
      els.victoryBanner.hidden = false;
    } else if (summary.totalXp >= state.settings.goal && !summary.allMinimumsMet) {
      els.statusBadge.textContent = 'BALANCE REQUIRED';
      const missing = state.settings.categories
        .filter(category => (summary.categoryXp[category.id] || 0) < summary.requirements[category.id])
        .map(category => category.name);
      els.heroMessage.textContent = `Enough total XP — now cover ${missing.join(', ')} to win.`;
      els.victoryBanner.hidden = true;
    } else {
      els.statusBadge.textContent = 'IN PROGRESS';
      els.heroMessage.textContent = 'Build XP across every category to clear today\'s challenge.';
      els.victoryBanner.hidden = true;
    }
  }

  function renderCategories(summary) {
    els.categoriesGrid.replaceChildren();

    state.settings.categories.forEach((category, index) => {
      const fragment = els.categoryTemplate.content.cloneNode(true);
      const card = fragment.querySelector('.category-card');
      const icon = fragment.querySelector('.category-icon');
      const title = fragment.querySelector('.category-title');
      const subtitle = fragment.querySelector('.category-subtitle');
      const score = fragment.querySelector('.category-score');
      const fill = fragment.querySelector('.category-meter-fill');
      const actionsList = fragment.querySelector('.actions-list');

      const currentXp = summary.categoryXp[category.id] || 0;
      const requiredXp = summary.requirements[category.id] || 0;
      const completed = currentXp >= requiredXp;
      const color = categoryColor(category.id, index);

      card.style.setProperty('--category-color', color);
      icon.textContent = category.icon;
      title.textContent = category.name;
      subtitle.textContent = `${category.weight}× weight · ${requiredXp} XP minimum`;
      score.textContent = `${currentXp} / ${requiredXp}${completed ? ' ✓' : ''}`;
      if (completed) score.style.color = color;
      fill.style.width = `${Math.min(100, (currentXp / Math.max(requiredXp, 1)) * 100)}%`;

      const actions = state.settings.actions.filter(action => action.categoryId === category.id);
      if (!actions.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No actions yet. Add one in Settings.';
        actionsList.append(empty);
      } else {
        actions.forEach(action => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'action-button';
          button.dataset.actionId = action.id;
          const used = action.type === 'once' && hasCompletedOnceAction(action.id);
          button.disabled = used;
          button.innerHTML = `
            <span class="action-name">
              <strong></strong>
              <small>${action.type === 'once' ? (used ? 'Completed today' : 'Once per day') : 'Repeatable'}</small>
            </span>
            <span class="action-xp">+${action.xp}</span>`;
          button.querySelector('strong').textContent = action.name;
          button.addEventListener('click', () => addXp(action.id));
          actionsList.append(button);
        });
      }

      els.categoriesGrid.append(fragment);
    });
  }

  function renderLog() {
    els.logList.replaceChildren();
    const txs = [...state.current.transactions].sort((a, b) => b.timestamp - a.timestamp);
    if (!txs.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No XP yet. Your first action starts the run.';
      els.logList.append(empty);
      return;
    }

    txs.forEach(tx => {
      const row = document.createElement('div');
      row.className = 'log-row';
      const category = state.settings.categories.find(c => c.id === tx.categoryId);
      const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(tx.timestamp));
      row.innerHTML = `
        <div class="log-main"><strong></strong><span></span></div>
        <div class="log-actions"><span class="log-xp">+${tx.xp} XP</span><button type="button" class="undo-button">Undo</button></div>`;
      row.querySelector('.log-main strong').textContent = tx.actionName;
      row.querySelector('.log-main span').textContent = `${category?.name || 'Unknown'} · ${time}`;
      row.querySelector('.undo-button').addEventListener('click', () => undoTransaction(tx.id));
      els.logList.append(row);
    });
  }

  function renderHistory() {
    els.historyList.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Past days will appear here automatically.';
      els.historyList.append(empty);
      return;
    }

    state.history.slice(0, 14).forEach(day => {
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML = `
        <div class="history-date"><strong></strong><span></span></div>
        <div class="history-score"></div>`;
      row.querySelector('.history-date strong').textContent = formatDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' });
      row.querySelector('.history-date span').textContent = day.won ? 'Challenge cleared' : 'Challenge incomplete';
      const score = row.querySelector('.history-score');
      score.innerHTML = `${day.xp} / ${day.goal}<span>${day.won ? '<span class="win-mark">VICTORY</span>' : 'XP'}</span>`;
      els.historyList.append(row);
    });
  }

  function openSettings() {
    settingsDraft = deepClone(state.settings);
    editingActionId = null;
    populateSettings();
    if (typeof els.settingsDialog.showModal === 'function') els.settingsDialog.showModal();
    else els.settingsDialog.setAttribute('open', '');
  }

  function populateSettings() {
    els.settingsMessage.textContent = '';
    els.goalInput.value = settingsDraft.goal;
    renderWeightsEditor();
    renderActionsEditor();
    populateCategorySelect();
  }

  function renderWeightsEditor() {
    els.weightsEditor.replaceChildren();
    const weightTotal = settingsDraft.categories.reduce((sum, category) => sum + category.weight, 0) || 1;
    const requirements = Object.fromEntries(settingsDraft.categories.map(category => [
      category.id,
      Math.max(1, Math.round(settingsDraft.goal * (category.weight / weightTotal) * BALANCE_FACTOR))
    ]));

    settingsDraft.categories.forEach(category => {
      const row = document.createElement('div');
      row.className = 'weight-row';
      row.innerHTML = `
        <div class="weight-name"><span class="weight-icon"></span><strong></strong></div>
        <div class="weight-controls"><input type="number" min="0.25" max="10" step="0.25" inputmode="decimal"></div>
        <div class="weight-requirement"></div>`;
      row.querySelector('.weight-icon').textContent = category.icon;
      row.querySelector('.weight-name strong').textContent = category.name;
      const input = row.querySelector('input');
      input.value = category.weight;
      input.dataset.categoryId = category.id;
      row.querySelector('.weight-requirement').textContent = `${requirements[category.id]} XP minimum`;
      input.addEventListener('input', previewWeightRequirements);
      els.weightsEditor.append(row);
    });
  }

  function previewWeightRequirements() {
    const goal = clampInt(els.goalInput.value, 20, 1000, settingsDraft.goal);
    const rows = [...els.weightsEditor.querySelectorAll('.weight-row')];
    const values = rows.map(row => clampNumber(row.querySelector('input').value, 0.25, 10, 1));
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    rows.forEach((row, index) => {
      const req = Math.max(1, Math.round(goal * (values[index] / total) * BALANCE_FACTOR));
      row.querySelector('.weight-requirement').textContent = `${req} XP minimum`;
    });
  }

  function renderActionsEditor() {
    els.actionsEditor.replaceChildren();
    settingsDraft.actions.forEach(action => {
      const category = settingsDraft.categories.find(c => c.id === action.categoryId);
      const row = document.createElement('div');
      row.className = `action-editor-row${editingActionId === action.id ? ' is-editing' : ''}`;

      if (editingActionId === action.id) {
        row.innerHTML = `
          <div class="action-inline-editor">
            <label class="action-edit-name">
              <span>Name</span>
              <input class="edit-action-name" type="text" maxlength="40">
            </label>
            <label>
              <span>Category</span>
              <select class="edit-action-category"></select>
            </label>
            <label>
              <span>XP</span>
              <input class="edit-action-xp" type="number" min="1" max="200" step="1" inputmode="numeric">
            </label>
            <label>
              <span>Type</span>
              <select class="edit-action-type">
                <option value="repeatable">Repeatable</option>
                <option value="once">Once per day</option>
              </select>
            </label>
            <div class="action-edit-buttons">
              <button class="action-edit-cancel" type="button">Cancel</button>
              <button class="action-edit-apply" type="button">Apply</button>
            </div>
          </div>`;

        const nameInput = row.querySelector('.edit-action-name');
        const categorySelect = row.querySelector('.edit-action-category');
        const xpInput = row.querySelector('.edit-action-xp');
        const typeSelect = row.querySelector('.edit-action-type');

        nameInput.value = action.name;
        xpInput.value = action.xp;
        typeSelect.value = action.type;

        settingsDraft.categories.forEach(categoryOption => {
          const option = document.createElement('option');
          option.value = categoryOption.id;
          option.textContent = categoryOption.name;
          categorySelect.append(option);
        });
        categorySelect.value = action.categoryId;

        const applyEdit = () => {
          const name = nameInput.value.trim();
          if (!name) {
            els.settingsMessage.textContent = 'Give the action a name first.';
            nameInput.focus();
            return;
          }

          const categoryId = categorySelect.value;
          if (!settingsDraft.categories.some(c => c.id === categoryId)) {
            els.settingsMessage.textContent = 'Choose a valid category.';
            categorySelect.focus();
            return;
          }

          action.name = name;
          action.categoryId = categoryId;
          action.xp = clampInt(xpInput.value, 1, 200, action.xp);
          action.type = typeSelect.value === 'once' ? 'once' : 'repeatable';
          editingActionId = null;
          renderActionsEditor();
          els.settingsMessage.textContent = 'Action updated. Save settings to keep the change.';
        };

        row.querySelector('.action-edit-apply').addEventListener('click', applyEdit);
        row.querySelector('.action-edit-cancel').addEventListener('click', () => {
          editingActionId = null;
          renderActionsEditor();
          els.settingsMessage.textContent = '';
        });

        row.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            editingActionId = null;
            renderActionsEditor();
            els.settingsMessage.textContent = '';
          } else if (event.key === 'Enter' && event.target.tagName !== 'SELECT') {
            event.preventDefault();
            applyEdit();
          }
        });

        els.actionsEditor.append(row);
        requestAnimationFrame(() => nameInput.focus());
        return;
      }

      row.innerHTML = `
        <div class="action-editor-main"><strong></strong><span></span></div>
        <div class="action-editor-controls">
          <span class="action-editor-xp">+${action.xp} XP</span>
          <button class="edit-action" type="button" aria-label="Edit action">Edit</button>
          <button class="delete-action" type="button" aria-label="Delete action">×</button>
        </div>`;
      row.querySelector('.action-editor-main strong').textContent = action.name;
      row.querySelector('.action-editor-main span').textContent = `${category?.name || 'Unknown'} · ${action.type === 'once' ? 'Once per day' : 'Repeatable'}`;
      row.querySelector('.edit-action').addEventListener('click', () => {
        editingActionId = action.id;
        renderActionsEditor();
        els.settingsMessage.textContent = '';
      });
      row.querySelector('.delete-action').addEventListener('click', () => {
        if (editingActionId === action.id) editingActionId = null;
        settingsDraft.actions = settingsDraft.actions.filter(item => item.id !== action.id);
        renderActionsEditor();
        els.settingsMessage.textContent = 'Action removed. Save settings to keep the change.';
      });
      els.actionsEditor.append(row);
    });
  }

  function populateCategorySelect() {
    els.newActionCategory.replaceChildren();
    settingsDraft.categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      els.newActionCategory.append(option);
    });
  }

  function addActionFromForm() {
    const name = els.newActionName.value.trim();
    const categoryId = els.newActionCategory.value;
    const xp = clampInt(els.newActionXp.value, 1, 200, 10);
    const type = els.newActionType.value === 'once' ? 'once' : 'repeatable';

    if (!name) {
      els.settingsMessage.textContent = 'Give the action a name first.';
      els.newActionName.focus();
      return;
    }
    if (!settingsDraft.categories.some(c => c.id === categoryId)) {
      els.settingsMessage.textContent = 'Choose a valid category.';
      return;
    }

    settingsDraft.actions.push({ id: makeId('action'), categoryId, name, xp, type });
    editingActionId = null;
    els.newActionName.value = '';
    els.newActionXp.value = '10';
    els.newActionType.value = 'repeatable';
    els.settingsMessage.textContent = 'Action added. Save settings to keep the change.';
    renderActionsEditor();
  }

  function saveSettingsFromDialog(event) {
    if (event.submitter && event.submitter.value === 'cancel') {
      settingsDraft = null;
      editingActionId = null;
      return;
    }

    settingsDraft.goal = clampInt(els.goalInput.value, 20, 1000, 100);
    const inputs = els.weightsEditor.querySelectorAll('input[data-category-id]');
    inputs.forEach(input => {
      const category = settingsDraft.categories.find(c => c.id === input.dataset.categoryId);
      if (category) category.weight = clampNumber(input.value, 0.25, 10, 1);
    });
    state.settings = settingsDraft;
    settingsDraft = null;
    editingActionId = null;
    saveState();
    render();
  }

  window.DalliApp = Object.freeze({
    getState: () => deepClone(state),
    getDefaultState: () => deepClone(DEFAULT_STATE),
    getStorageKey: () => activeStorageKey,
    readStoredState,
    replaceState,
    useStorageKey,
    guestStorageKey: STORAGE_KEY
  });

  els.settingsButton.addEventListener('click', openSettings);
  els.goalInput.addEventListener('input', previewWeightRequirements);
  els.addActionButton.addEventListener('click', addActionFromForm);
  els.settingsForm.addEventListener('submit', saveSettingsFromDialog);

  window.addEventListener('focus', () => {
    const before = state.current.date;
    ensureToday();
    if (before !== state.current.date) render();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const before = state.current.date;
      ensureToday();
      if (before !== state.current.date) render();
    }
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  }

  ensureToday();
  render();
})();
