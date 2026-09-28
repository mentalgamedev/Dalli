(() => {
  'use strict';

  const STATE_VERSION = 2;
  const STORAGE_KEY = 'dailyXpGame.v2';
  const HISTORY_LIMIT = 365;
  const DETAILED_HISTORY_DAYS = 90;
  const UNCATEGORIZED_ID = 'uncategorized';
  const UNCATEGORIZED_EFFICIENCY = 0.50;
  const EFFICIENCY_TIERS = [1, 0.8, 0.6, 0.4];

  let activeStorageKey = STORAGE_KEY;
  let suppressCloudSave = false;

  const CATEGORY_COLORS = {
    wellbeing: '#49d89b',
    work: '#818bff',
    chores: '#ffb35f',
    uncategorized: '#8b93a4'
  };

  const RANKS = [
    { name: 'Nobody', min: 0 },
    { name: 'Low-Life', min: 3 },
    { name: 'Hustler', min: 7 },
    { name: 'Thug', min: 12 },
    { name: 'Gangsta', min: 17 },
    { name: 'Kingpin', min: 22 },
    { name: 'Head Honcho', min: 27 }
  ];

  const DEFAULT_STATE = {
    version: STATE_VERSION,
    settings: {
      goal: 100,
      categories: [
        { id: 'wellbeing', name: 'Wellbeing', icon: '♥', focus: 1 },
        { id: 'work', name: 'Work', icon: '◆', focus: 1 },
        { id: 'chores', name: 'Chores', icon: '⌂', focus: 1 },
        { id: UNCATEGORIZED_ID, name: 'Uncategorized', icon: '•', focus: 0 }
      ],
      actions: [
        { id: 'wellbeing-workout-30', categoryId: 'wellbeing', name: 'Workout — 30 min', baseXp: 20, type: 'repeatable' },
        { id: 'wellbeing-walk-20', categoryId: 'wellbeing', name: 'Walk — 20 min', baseXp: 10, type: 'repeatable' },
        { id: 'wellbeing-mobility-10', categoryId: 'wellbeing', name: 'Stretch / mobility — 10 min', baseXp: 5, type: 'repeatable' },
        { id: 'wellbeing-good-meal', categoryId: 'wellbeing', name: 'Proper healthy meal', baseXp: 10, type: 'once' },
        { id: 'work-focus-25', categoryId: 'work', name: 'Focused work — 25 min', baseXp: 15, type: 'repeatable' },
        { id: 'work-focus-50', categoryId: 'work', name: 'Focused work — 50 min', baseXp: 30, type: 'repeatable' },
        { id: 'work-practice-20', categoryId: 'work', name: 'Practice / skill — 20 min', baseXp: 10, type: 'repeatable' },
        { id: 'work-admin', categoryId: 'work', name: 'Annoying admin task', baseXp: 10, type: 'once' },
        { id: 'chores-small', categoryId: 'chores', name: 'Small chore — 5–10 min', baseXp: 5, type: 'repeatable' },
        { id: 'chores-medium', categoryId: 'chores', name: 'Cleaning — 15–30 min', baseXp: 10, type: 'repeatable' },
        { id: 'chores-laundry', categoryId: 'chores', name: 'Laundry', baseXp: 10, type: 'once' },
        { id: 'chores-big', categoryId: 'chores', name: 'Big chore / deep clean', baseXp: 20, type: 'repeatable' }
      ]
    },
    progression: {
      lifetimeXp: 0,
      bestStreak: 0,
      archivedStreak: 0,
      streakThrough: ''
    },
    current: {
      date: '',
      transactions: [],
      clearedAt: null,
      dayCard: null
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
    rankName: document.querySelector('#rankName'),
    streetCred: document.querySelector('#streetCred'),
    rankProgress: document.querySelector('#rankProgress'),
    rankHint: document.querySelector('#rankHint'),
    rankStamp: document.querySelector('#rankStamp'),
    levelNumber: document.querySelector('#levelNumber'),
    levelProgressText: document.querySelector('#levelProgressText'),
    levelProgress: document.querySelector('#levelProgress'),
    streakCount: document.querySelector('#streakCount'),
    bestStreak: document.querySelector('#bestStreak'),
    victoryBanner: document.querySelector('#victoryBanner'),
    victorySummary: document.querySelector('#victorySummary'),
    viewDayCardButton: document.querySelector('#viewDayCardButton'),
    categoriesGrid: document.querySelector('#categoriesGrid'),
    logList: document.querySelector('#logList'),
    historyList: document.querySelector('#historyList'),
    categoryTemplate: document.querySelector('#categoryTemplate'),

    dayCardDialog: document.querySelector('#dayCardDialog'),
    dayCardDate: document.querySelector('#dayCardDate'),
    dayCardXp: document.querySelector('#dayCardXp'),
    dayCardType: document.querySelector('#dayCardType'),
    dayCardHeadline: document.querySelector('#dayCardHeadline'),
    dayCardCopy: document.querySelector('#dayCardCopy'),
    dayCardRank: document.querySelector('#dayCardRank'),
    dayCardStreak: document.querySelector('#dayCardStreak'),
    closeDayCardButton: document.querySelector('#closeDayCardButton'),

    settingsButton: document.querySelector('#settingsButton'),
    settingsDialog: document.querySelector('#settingsDialog'),
    settingsForm: document.querySelector('#settingsForm'),
    goalInput: document.querySelector('#goalInput'),
    categoriesEditor: document.querySelector('#categoriesEditor'),
    newCategoryName: document.querySelector('#newCategoryName'),
    newCategoryIcon: document.querySelector('#newCategoryIcon'),
    newCategoryFocus: document.querySelector('#newCategoryFocus'),
    addCategoryButton: document.querySelector('#addCategoryButton'),
    actionsEditor: document.querySelector('#actionsEditor'),
    newActionName: document.querySelector('#newActionName'),
    newActionCategory: document.querySelector('#newActionCategory'),
    newActionXp: document.querySelector('#newActionXp'),
    newActionType: document.querySelector('#newActionType'),
    addActionButton: document.querySelector('#addActionButton'),
    resetGameButton: document.querySelector('#resetGameButton'),
    settingsMessage: document.querySelector('#settingsMessage')
  };

  let state = loadState();
  let settingsDraft = null;
  let wasVictory = false;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function makeId(prefix = 'id') {
    const random = Math.random().toString(36).slice(2, 9);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function dateFromKey(dateKey) {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  function addDays(dateKey, amount) {
    const date = dateFromKey(dateKey);
    date.setDate(date.getDate() + amount);
    return localDateKey(date);
  }

  function formatDate(dateKey, options = {}) {
    return new Intl.DateTimeFormat(undefined, options).format(dateFromKey(dateKey));
  }

  function freshState() {
    return deepClone(DEFAULT_STATE);
  }

  function uncategorizedCategory() {
    return { id: UNCATEGORIZED_ID, name: 'Uncategorized', icon: '•', focus: 0 };
  }

  function ensureUncategorizedCategory(categories) {
    const cleaned = categories.filter(category => category.id !== UNCATEGORIZED_ID);
    cleaned.push(uncategorizedCategory());
    return cleaned;
  }

  function normalizeState(candidate) {
    if (!candidate || candidate.version !== STATE_VERSION) {
      return freshState();
    }

    const next = freshState();
    next.settings.goal = clampInt(candidate.settings?.goal, 20, 1000, 100);

    const seen = new Set();
    const categories = [];
    const sourceCategories = Array.isArray(candidate.settings?.categories)
      ? candidate.settings.categories
      : DEFAULT_STATE.settings.categories;

    sourceCategories.forEach((category, index) => {
      const id = String(category?.id || `category-${index + 1}`);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || seen.has(id) || id === UNCATEGORIZED_ID) return;
      seen.add(id);
      categories.push({
        id,
        name: String(category?.name || `Category ${index + 1}`).slice(0, 80),
        icon: String(category?.icon || '•').slice(0, 24),
        focus: clampNumber(category?.focus, 0.25, 10, 1)
      });
    });
    next.settings.categories = ensureUncategorizedCategory(categories);

    const categoryIds = new Set(next.settings.categories.map(category => category.id));
    const sourceActions = Array.isArray(candidate.settings?.actions)
      ? candidate.settings.actions
      : DEFAULT_STATE.settings.actions;

    next.settings.actions = sourceActions.slice(0, 500).map((action, index) => ({
      id: String(action?.id || `action-${index + 1}`).slice(0, 128),
      categoryId: categoryIds.has(String(action?.categoryId)) ? String(action.categoryId) : UNCATEGORIZED_ID,
      name: String(action?.name || 'Unnamed action').slice(0, 100),
      baseXp: clampInt(action?.baseXp, 1, 200, 10),
      type: action?.type === 'once' ? 'once' : 'repeatable'
    }));

    next.progression.lifetimeXp = clampInt(candidate.progression?.lifetimeXp, 0, 1000000000, 0);
    next.progression.bestStreak = clampInt(candidate.progression?.bestStreak, 0, 1000000, 0);
    next.progression.archivedStreak = clampInt(candidate.progression?.archivedStreak, 0, 1000000, 0);
    next.progression.streakThrough = /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.progression?.streakThrough || ''))
      ? String(candidate.progression.streakThrough)
      : '';

    next.current.date = /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.current?.date || ''))
      ? String(candidate.current.date)
      : '';
    next.current.transactions = normalizeTransactions(candidate.current?.transactions);
    next.current.clearedAt = normalizeTimestamp(candidate.current?.clearedAt);
    next.current.dayCard = normalizeDayCard(candidate.current?.dayCard);

    next.history = Array.isArray(candidate.history)
      ? candidate.history.slice(0, HISTORY_LIMIT).map(normalizeHistoryDay).filter(Boolean)
      : [];

    return next;
  }

  function normalizeTimestamp(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  function normalizeTransactions(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 3000).map(tx => ({
      id: String(tx?.id || makeId('tx')).slice(0, 128),
      actionId: String(tx?.actionId || '').slice(0, 128),
      actionName: String(tx?.actionName || 'Action').slice(0, 100),
      categoryId: /^[A-Za-z0-9_-]{1,64}$/.test(String(tx?.categoryId || ''))
        ? String(tx.categoryId)
        : UNCATEGORIZED_ID,
      categoryName: String(tx?.categoryName || 'Uncategorized').slice(0, 80),
      baseXp: clampInt(tx?.baseXp, 1, 200, 1),
      effectiveXp: clampInt(tx?.effectiveXp, 1, 200, 1),
      efficiency: clampNumber(tx?.efficiency, 0.01, 1, 1),
      timestamp: normalizeTimestamp(tx?.timestamp) || Date.now()
    }));
  }

  function normalizeDayCard(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      date: String(value.date || '').slice(0, 10),
      type: String(value.type || 'DAILY REPORT').slice(0, 80),
      headline: String(value.headline || 'PRODUCTIVITY OCCURRED').slice(0, 220),
      copy: String(value.copy || '').slice(0, 500),
      xp: clampInt(value.xp, 0, 100000, 0),
      rank: String(value.rank || 'Nobody').slice(0, 40),
      streak: clampInt(value.streak, 0, 1000000, 0)
    };
  }

  function normalizeHistoryDay(day) {
    const date = String(day?.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

    const cleanMap = value => {
      const result = {};
      if (!value || typeof value !== 'object') return result;
      Object.entries(value).forEach(([key, amount]) => {
        if (/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
          result[key] = clampInt(amount, 0, 100000, 0);
        }
      });
      return result;
    };

    return {
      date,
      xp: clampInt(day?.xp, 0, 100000, 0),
      baseXp: clampInt(day?.baseXp, 0, 100000, 0),
      goal: clampInt(day?.goal, 20, 1000, 100),
      won: Boolean(day?.won),
      categoryXp: cleanMap(day?.categoryXp),
      categoryBaseXp: cleanMap(day?.categoryBaseXp),
      clearedAt: normalizeTimestamp(day?.clearedAt),
      dayCard: normalizeDayCard(day?.dayCard),
      transactions: normalizeTransactions(day?.transactions)
    };
  }

  function loadState(storageKey = activeStorageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return freshState();
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.warn('Could not load saved Dalli data:', error);
      return freshState();
    }
  }

  function readStoredState(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STATE_VERSION) return null;
      return normalizeState(parsed);
    } catch (error) {
      console.warn('Could not read cached Dalli data:', error);
      return null;
    }
  }

  function saveState() {
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
    if (!suppressCloudSave && window.DalliCloud && typeof window.DalliCloud.queueSave === 'function') {
      window.DalliCloud.queueSave(deepClone(state));
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

  function balancedCategories(settings = state.settings) {
    return settings.categories.filter(category => category.id !== UNCATEGORIZED_ID);
  }

  function getFocusBand(categoryId, settings = state.settings) {
    if (categoryId === UNCATEGORIZED_ID) return 0;
    const category = settings.categories.find(item => item.id === categoryId);
    if (!category) return 0;

    const categories = balancedCategories(settings);
    const totalFocus = categories.reduce((sum, item) => sum + item.focus, 0) || 1;
    return Math.max(1, settings.goal * (category.focus / totalFocus));
  }

  function currentCategoryIdForTransaction(tx) {
    return state.settings.categories.some(category => category.id === tx.categoryId)
      ? tx.categoryId
      : UNCATEGORIZED_ID;
  }

  function getSummary() {
    const categoryXp = Object.fromEntries(state.settings.categories.map(category => [category.id, 0]));
    const categoryBaseXp = Object.fromEntries(state.settings.categories.map(category => [category.id, 0]));
    let totalXp = 0;
    let totalBaseXp = 0;

    state.current.transactions.forEach(tx => {
      const categoryId = currentCategoryIdForTransaction(tx);
      totalXp += tx.effectiveXp;
      totalBaseXp += tx.baseXp;
      categoryXp[categoryId] = (categoryXp[categoryId] || 0) + tx.effectiveXp;
      categoryBaseXp[categoryId] = (categoryBaseXp[categoryId] || 0) + tx.baseXp;
    });

    return {
      totalXp,
      totalBaseXp,
      categoryXp,
      categoryBaseXp,
      isVictory: totalXp >= state.settings.goal
    };
  }

  function calculateReward(action, usedBaseXp = null, settings = state.settings) {
    const baseXp = action.baseXp;
    const categoryId = action.categoryId;

    if (categoryId === UNCATEGORIZED_ID || !settings.categories.some(category => category.id === categoryId)) {
      const raw = baseXp * UNCATEGORIZED_EFFICIENCY;
      return {
        baseXp,
        effectiveXp: Math.max(1, Math.round(raw)),
        efficiency: UNCATEGORIZED_EFFICIENCY,
        raw
      };
    }

    const summary = usedBaseXp === null ? getSummary() : null;
    let cursor = usedBaseXp === null ? (summary.categoryBaseXp[categoryId] || 0) : usedBaseXp;
    const band = getFocusBand(categoryId, settings);
    let remaining = baseXp;
    let raw = 0;

    for (let tier = 0; tier < EFFICIENCY_TIERS.length && remaining > 0; tier += 1) {
      const multiplier = EFFICIENCY_TIERS[tier];
      const upper = tier < EFFICIENCY_TIERS.length - 1 ? band * (tier + 1) : Infinity;

      if (cursor >= upper) continue;

      const available = upper === Infinity ? remaining : Math.max(0, upper - cursor);
      const amount = Math.min(remaining, available);
      if (amount <= 0) continue;

      raw += amount * multiplier;
      cursor += amount;
      remaining -= amount;
    }

    const effectiveXp = Math.max(1, Math.round(raw));
    return {
      baseXp,
      effectiveXp,
      efficiency: Math.max(0.01, Math.min(1, raw / Math.max(1, baseXp))),
      raw
    };
  }

  function getCategoryEfficiency(categoryId, usedBaseXp) {
    if (categoryId === UNCATEGORIZED_ID) {
      return {
        multiplier: UNCATEGORIZED_EFFICIENCY,
        tier: 3,
        progress: 1,
        untilNext: null,
        band: 0
      };
    }

    const band = getFocusBand(categoryId);
    if (usedBaseXp < band) {
      return { multiplier: 1, tier: 0, progress: usedBaseXp / band, untilNext: band - usedBaseXp, band };
    }
    if (usedBaseXp < band * 2) {
      return { multiplier: 0.8, tier: 1, progress: (usedBaseXp - band) / band, untilNext: band * 2 - usedBaseXp, band };
    }
    if (usedBaseXp < band * 3) {
      return { multiplier: 0.6, tier: 2, progress: (usedBaseXp - band * 2) / band, untilNext: band * 3 - usedBaseXp, band };
    }
    return { multiplier: 0.4, tier: 3, progress: 1, untilNext: null, band };
  }

  function hasCompletedOnceAction(actionId) {
    return state.current.transactions.some(tx => tx.actionId === actionId);
  }

  function completedDateSet() {
    const set = new Set(state.history.filter(day => day.won).map(day => day.date));
    if (state.current.clearedAt) set.add(state.current.date);
    return set;
  }

  function getStreetCred() {
    const completed = completedDateSet();
    let count = 0;
    let cursor = localDateKey();

    for (let i = 0; i < 30; i += 1) {
      if (completed.has(cursor)) count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  function getRank(cred = getStreetCred()) {
    let rank = RANKS[0];
    RANKS.forEach(candidate => {
      if (cred >= candidate.min) rank = candidate;
    });
    const index = RANKS.indexOf(rank);
    const next = RANKS[index + 1] || null;
    const progress = next
      ? Math.max(0, Math.min(1, (cred - rank.min) / Math.max(1, next.min - rank.min)))
      : 1;
    return { ...rank, index, next, progress };
  }

  function getCurrentStreak() {
    const today = localDateKey();
    const yesterday = addDays(today, -1);

    if (state.current.clearedAt && state.current.date === today) {
      if (state.progression.streakThrough === yesterday) {
        return state.progression.archivedStreak + 1;
      }
      return 1;
    }

    if (state.progression.streakThrough === yesterday) {
      return state.progression.archivedStreak;
    }

    return 0;
  }

  function levelRequirement(level) {
    return 60 + ((level - 1) * 20);
  }

  function getLevelProgress() {
    const lifetimeXp = state.progression.lifetimeXp;
    const completedLevels = Math.max(
      0,
      Math.floor((-50 + Math.sqrt(2500 + (40 * lifetimeXp))) / 20)
    );
    const level = completedLevels + 1;
    const threshold = (10 * completedLevels * completedLevels) + (50 * completedLevels);
    const into = lifetimeXp - threshold;
    const requirement = levelRequirement(level);

    return {
      level,
      into,
      requirement,
      percent: Math.max(0, Math.min(1, into / requirement))
    };
  }

  function updateArchivedStreak(record) {
    if (!record.won) return;

    const previousDate = addDays(record.date, -1);
    if (state.progression.streakThrough === previousDate) {
      state.progression.archivedStreak += 1;
    } else if (state.progression.streakThrough !== record.date) {
      state.progression.archivedStreak = 1;
    }

    state.progression.streakThrough = record.date;
    state.progression.bestStreak = Math.max(
      state.progression.bestStreak,
      state.progression.archivedStreak
    );
  }

  function archiveCurrentDay() {
    if (!state.current.date) return;

    const summary = getSummary();
    const record = {
      date: state.current.date,
      xp: summary.totalXp,
      baseXp: summary.totalBaseXp,
      goal: state.settings.goal,
      won: summary.isVictory,
      categoryXp: summary.categoryXp,
      categoryBaseXp: summary.categoryBaseXp,
      clearedAt: state.current.clearedAt,
      dayCard: state.current.dayCard,
      transactions: deepClone(state.current.transactions)
    };

    updateArchivedStreak(record);

    state.history = state.history.filter(day => day.date !== record.date);
    state.history.unshift(record);
    state.history = state.history.slice(0, HISTORY_LIMIT).map((day, index) => (
      index < DETAILED_HISTORY_DAYS
        ? day
        : { ...day, transactions: [] }
    ));
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
    state.current = {
      date: today,
      transactions: [],
      clearedAt: null,
      dayCard: null
    };
    wasVictory = false;
    saveState();
  }

  function stringHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function deterministicPick(items, seed) {
    return items[stringHash(seed) % items.length];
  }

  function getDayPersonality(summary) {
    const active = state.settings.categories
      .filter(category => category.id !== UNCATEGORIZED_ID)
      .map(category => ({
        ...category,
        base: summary.categoryBaseXp[category.id] || 0
      }))
      .filter(category => category.base > 0)
      .sort((a, b) => b.base - a.base);

    const total = active.reduce((sum, category) => sum + category.base, 0) || 1;
    const dominant = active[0] || { id: UNCATEGORIZED_ID, name: 'Uncategorized', base: 0 };
    const share = dominant.base / total;
    const ratio = summary.totalXp / Math.max(1, state.settings.goal);

    if (ratio >= 1.5) {
      return { key: 'overkill', type: 'NEEDS INTERVENTION', dominant };
    }
    if (share >= 0.9 && active.length > 0) {
      return { key: 'one-track', type: 'ONE-TRACK MIND', dominant };
    }
    if (ratio <= 1.05) {
      return { key: 'barely', type: 'TECHNICALLY VICTORIOUS', dominant };
    }
    if (active.length >= 3 && share < 0.46) {
      return { key: 'balanced', type: 'SUSPICIOUSLY FUNCTIONAL ADULT', dominant };
    }
    if (dominant.id === 'work') {
      return { key: 'work', type: 'CORPORATE DRONE', dominant };
    }
    if (dominant.id === 'chores') {
      return { key: 'chores', type: 'DOMESTIC MENACE', dominant };
    }
    if (dominant.id === 'wellbeing') {
      return { key: 'wellbeing', type: 'WELLNESS CRIMINAL', dominant };
    }

    return { key: 'custom', type: `${dominant.name.toUpperCase().slice(0, 48)} ENTHUSIAST`, dominant };
  }

  function headlineContent(personality, summary) {
    const category = personality.dominant.name;
    const pools = {
      overkill: [
        ['LOCAL CITIZEN EXCEEDS RECOMMENDED PRODUCTIVITY; NEIGHBORS CONCERNED', 'Municipal experts advise sitting down before this becomes a personality.'],
        ['DAILY TARGET OBLITERATED; AUTHORITIES ASK WHO THIS IS FOR', 'Witnesses report the subject continued earning XP after being legally allowed to stop.'],
        ['PRODUCTIVITY LEVELS NOW VISIBLE FROM SPACE', 'Crestfallen emergency services have declined to comment.']
      ],
      'one-track': [
        [`RESIDENT DISCOVERS ${category.toUpperCase()}, REFUSES TO LOOK AWAY`, 'Experts confirm that other categories continued to exist throughout the incident.'],
        [`${category.toUpperCase()} MONOPOLIZES ENTIRE DAY IN HOSTILE TAKEOVER`, 'Diversification was reportedly discussed and immediately rejected.'],
        ['ONE-TRACK MIND ACHIEVES TECHNICAL SUCCESS', `Nearly every road today somehow led back to ${category}.`]
      ],
      barely: [
        ['DAILY TARGET CLEARED BY MARGIN TOO SMALL TO PROSECUTE', 'Officials confirm that a win remains a win, irritatingly.'],
        ['CITIZEN SLIDES ACROSS FINISH LINE; CLAIMS THIS WAS THE PLAN', 'No witnesses were willing to support that version of events.'],
        ['MINIMUM VIABLE PRODUCTIVITY DECLARED A TRIUMPH', 'The paperwork says cleared. The paperwork is legally binding.']
      ],
      balanced: [
        ['LOCAL ADULT FUNCTIONS NORMALLY; INVESTIGATION OPENED', 'A suspicious amount of different life areas received attention today.'],
        ['CITIZEN DEMONSTRATES BALANCE, ALARMING FRIENDS AND FAMILY', 'Authorities are checking whether this behavior is sustainable or merely showing off.'],
        ['MULTIPLE RESPONSIBILITIES HANDLED IN SINGLE DAY', 'Crestfallen officials call the event statistically unsettling.']
      ],
      work: [
        ['LOCAL OFFICE WORKER COMPLETES TASKS WITHOUT DIRECT SUPERVISION', 'Management immediately scheduled a meeting to determine how this happened.'],
        ['EMPLOYEE PRODUCES MEASURABLE OUTPUT; COMPANY TAKES CREDIT', 'The worker was unavailable for comment because apparently there was more work.'],
        ['WORK OCCURRED. VOLUNTARILY.', 'mo.les.tech representatives describe the incident as a promising compliance signal.']
      ],
      chores: [
        ['RESIDENT CLEANS HOME; AUTHORITIES SEEK MOTIVE', 'Several surfaces were reportedly left visibly less disgusting.'],
        ['DOMESTIC ORDER RESTORED IN LIMITED AREA', 'Experts warn that entropy remains at large.'],
        ['LAUNDRY AND RELATED ACTIVITIES SHAKE LOCAL ECONOMY', 'One chair may finally be used as a chair again.']
      ],
      wellbeing: [
        ['RESIDENT PRACTICES SELF-CARE, IMMEDIATELY BECOMES INSUFFERABLE', 'Sources confirm hydration and movement were both involved.'],
        ['LOCAL BODY RECEIVES ROUTINE MAINTENANCE', 'Owner reportedly surprised to learn warranty conditions still apply.'],
        ['WELLBEING ACTIVITY DETECTED IN CRESTFALLEN', 'Officials are monitoring the situation for signs of optimism.']
      ],
      custom: [
        [`${category.toUpperCase()} ACTIVITY SURGES ACROSS ONE HOUSEHOLD`, 'The city has formed a committee and will report back in six to eight months.'],
        [`LOCAL SPECIALIST DEVOTES SUSPICIOUS ENERGY TO ${category.toUpperCase()}`, 'No permit was found, but the XP appears valid.'],
        [`${category.toUpperCase()} SECTOR POSTS STRONG GAINS`, 'Analysts have upgraded the day from “meh” to “technically productive.”']
      ]
    };

    return deterministicPick(
      pools[personality.key] || pools.custom,
      `${state.current.date}|${personality.key}|${summary.totalXp}`
    );
  }

  function createDayCard(summary) {
    const personality = getDayPersonality(summary);
    const [headline, copy] = headlineContent(personality, summary);
    const cred = getStreetCred();
    const rank = getRank(cred);
    const streak = getCurrentStreak();

    return {
      date: state.current.date,
      type: personality.type,
      headline,
      copy,
      xp: summary.totalXp,
      rank: rank.name,
      streak
    };
  }

  function finalizeClearIfNeeded() {
    const summary = getSummary();

    if (!summary.isVictory) {
      if (state.current.clearedAt) {
        state.current.clearedAt = null;
        state.current.dayCard = null;
      }
      return false;
    }

    if (state.current.clearedAt) return false;

    state.current.clearedAt = Date.now();
    state.current.dayCard = createDayCard(summary);
    return true;
  }

  function addXp(actionId) {
    ensureToday();

    const action = state.settings.actions.find(item => item.id === actionId);
    if (!action) return;
    if (action.type === 'once' && hasCompletedOnceAction(action.id)) return;

    const category = state.settings.categories.find(item => item.id === action.categoryId)
      || uncategorizedCategory();
    const reward = calculateReward(action);

    state.current.transactions.push({
      id: makeId('tx'),
      actionId: action.id,
      actionName: action.name,
      categoryId: category.id,
      categoryName: category.name,
      baseXp: action.baseXp,
      effectiveXp: reward.effectiveXp,
      efficiency: Number(reward.efficiency.toFixed(4)),
      timestamp: Date.now()
    });

    state.progression.lifetimeXp += reward.effectiveXp;
    const justCleared = finalizeClearIfNeeded();
    saveState();
    render({ showDayCard: justCleared });
  }

  function undoTransaction(transactionId) {
    const index = state.current.transactions.findIndex(tx => tx.id === transactionId);
    if (index < 0) return;

    const [removed] = state.current.transactions.splice(index, 1);
    state.progression.lifetimeXp = Math.max(0, state.progression.lifetimeXp - removed.effectiveXp);
    finalizeClearIfNeeded();
    saveState();
    render();
  }

  function categoryColor(categoryId, index = 0) {
    if (CATEGORY_COLORS[categoryId]) return CATEGORY_COLORS[categoryId];
    const fallbacks = ['#69d5ff', '#d37cff', '#e9d96b', '#ff7daf', '#8fd56a', '#65cfc8'];
    return fallbacks[index % fallbacks.length];
  }

  function render(options = {}) {
    ensureToday();
    const summary = getSummary();

    renderHero(summary);
    renderProgression();
    renderCategories(summary);
    renderLog();
    renderHistory();

    if (summary.isVictory && !wasVictory) {
      els.victoryBanner.classList.remove('victory-pop');
      requestAnimationFrame(() => els.victoryBanner.classList.add('victory-pop'));
    }

    wasVictory = summary.isVictory;

    if (options.showDayCard && state.current.dayCard) {
      requestAnimationFrame(() => openDayCard(state.current.dayCard));
    }
  }

  function renderHero(summary) {
    els.todayLabel.textContent = formatDate(state.current.date, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    els.totalXp.textContent = summary.totalXp;
    els.goalXp.textContent = state.settings.goal;

    const progress = Math.min(1, summary.totalXp / state.settings.goal);
    const percent = Math.round(progress * 100);
    els.totalProgress.style.width = `${percent}%`;
    els.xpOrb.style.setProperty('--progress', `${progress * 360}deg`);
    els.orbPercent.textContent = `${percent}%`;

    if (summary.isVictory) {
      els.statusBadge.textContent = 'DAY CLEARED';
      els.heroMessage.textContent = 'Officially productive. Anything else today is extracurricular showing off.';
      els.victoryBanner.hidden = false;
      const card = state.current.dayCard;
      els.victorySummary.textContent = card
        ? `${card.type} · ${card.xp} XP · report filed`
        : 'Your official Crestfallen report is ready.';
    } else {
      const remaining = Math.max(0, state.settings.goal - summary.totalXp);
      els.statusBadge.textContent = 'IN PROGRESS';
      els.heroMessage.textContent = `${remaining} XP to clear the day. No category is mandatory; stubbornness merely gets less profitable.`;
      els.victoryBanner.hidden = true;
    }
  }

  function renderProgression() {
    const cred = getStreetCred();
    const rank = getRank(cred);
    const level = getLevelProgress();
    const streak = getCurrentStreak();
    const best = Math.max(state.progression.bestStreak, streak);

    els.rankName.textContent = rank.name;
    els.streetCred.textContent = `${cred} / 30`;
    els.rankProgress.style.width = `${Math.round(rank.progress * 100)}%`;
    els.rankStamp.textContent = rank.name.toUpperCase();

    if (rank.next) {
      const needed = Math.max(0, rank.next.min - cred);
      els.rankHint.textContent = `${needed} more cleared day${needed === 1 ? '' : 's'} in the rolling month to reach ${rank.next.name}.`;
    } else {
      els.rankHint.textContent = 'Top of the food chain. Please behave irresponsibly with this power.';
    }

    els.levelNumber.textContent = level.level;
    els.levelProgressText.textContent = `${level.into} / ${level.requirement} XP`;
    els.levelProgress.style.width = `${Math.round(level.percent * 100)}%`;

    els.streakCount.textContent = `${streak} day${streak === 1 ? '' : 's'}`;
    els.bestStreak.textContent = `Best: ${best}`;
  }

  function renderCategories(summary) {
    els.categoriesGrid.replaceChildren();

    const visibleCategories = state.settings.categories.filter(category => {
      if (category.id !== UNCATEGORIZED_ID) return true;
      const hasActions = state.settings.actions.some(action => action.categoryId === UNCATEGORIZED_ID);
      const hasXp = (summary.categoryBaseXp[UNCATEGORIZED_ID] || 0) > 0;
      return hasActions || hasXp;
    });

    visibleCategories.forEach((category, index) => {
      const fragment = els.categoryTemplate.content.cloneNode(true);
      const card = fragment.querySelector('.category-card');
      const icon = fragment.querySelector('.category-icon');
      const title = fragment.querySelector('.category-title');
      const subtitle = fragment.querySelector('.category-subtitle');
      const score = fragment.querySelector('.category-score');
      const efficiencyValue = fragment.querySelector('.efficiency-value');
      const fill = fragment.querySelector('.category-meter-fill');
      const next = fragment.querySelector('.efficiency-next');
      const actionsList = fragment.querySelector('.actions-list');

      const usedBase = summary.categoryBaseXp[category.id] || 0;
      const earnedXp = summary.categoryXp[category.id] || 0;
      const efficiency = getCategoryEfficiency(category.id, usedBase);
      const color = categoryColor(category.id, index);

      card.style.setProperty('--category-color', color);
      if (category.id === UNCATEGORIZED_ID) card.classList.add('is-fallback-category');

      icon.textContent = category.icon;
      title.textContent = category.name;
      score.textContent = `${earnedXp} XP`;

      if (category.id === UNCATEGORIZED_ID) {
        subtitle.textContent = 'Fallback · fixed 50% payout';
        efficiencyValue.textContent = '50%';
        fill.style.width = '100%';
        next.textContent = 'Assign these actions to a real category when convenient.';
      } else {
        subtitle.textContent = `Focus ${category.focus}× · ${Math.round(efficiency.band)} base XP full-value band`;
        efficiencyValue.textContent = `${Math.round(efficiency.multiplier * 100)}%`;
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, efficiency.progress)) * 100)}%`;
        next.textContent = efficiency.untilNext === null
          ? 'Floor reached · further actions still pay 40%'
          : `≈ ${Math.max(1, Math.ceil(efficiency.untilNext))} base XP until next drop`;
      }

      const actions = state.settings.actions.filter(action => action.categoryId === category.id);
      if (!actions.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = category.id === UNCATEGORIZED_ID
          ? 'Deleted-category actions will hide here.'
          : 'No actions yet. Add one in Settings.';
        actionsList.append(empty);
      } else {
        actions.forEach(action => {
          const reward = calculateReward(action, usedBase);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'action-button';
          button.dataset.actionId = action.id;

          const used = action.type === 'once' && hasCompletedOnceAction(action.id);
          button.disabled = used;

          const nameWrap = document.createElement('span');
          nameWrap.className = 'action-name';
          const strong = document.createElement('strong');
          strong.textContent = action.name;
          const small = document.createElement('small');

          if (used) {
            small.textContent = 'Completed today';
          } else {
            const payout = Math.round(reward.efficiency * 100);
            const typeText = action.type === 'once' ? 'Once per day' : 'Repeatable';
            small.textContent = payout < 100
              ? `${typeText} · ${payout}% payout · base ${action.baseXp}`
              : `${typeText} · full payout`;
          }

          nameWrap.append(strong, small);

          const xp = document.createElement('span');
          xp.className = 'action-xp';
          xp.textContent = `+${reward.effectiveXp}`;

          button.append(nameWrap, xp);
          button.addEventListener('click', () => addXp(action.id));
          actionsList.append(button);
        });
      }

      els.categoriesGrid.append(fragment);
    });
  }

  function renderLog() {
    els.logList.replaceChildren();
    const transactions = [...state.current.transactions].sort((a, b) => b.timestamp - a.timestamp);

    if (!transactions.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No XP yet. The municipal surveillance apparatus is bored.';
      els.logList.append(empty);
      return;
    }

    transactions.forEach(tx => {
      const row = document.createElement('div');
      row.className = 'log-row';

      const main = document.createElement('div');
      main.className = 'log-main';
      const strong = document.createElement('strong');
      strong.textContent = tx.actionName;
      const meta = document.createElement('span');
      const time = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(tx.timestamp));
      meta.textContent = `${tx.categoryName} · ${Math.round(tx.efficiency * 100)}% · ${time}`;
      main.append(strong, meta);

      const actions = document.createElement('div');
      actions.className = 'log-actions';
      const xp = document.createElement('span');
      xp.className = 'log-xp';
      xp.textContent = `+${tx.effectiveXp} XP`;
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'undo-button';
      undo.textContent = 'Undo';
      undo.addEventListener('click', () => undoTransaction(tx.id));
      actions.append(xp, undo);

      row.append(main, actions);
      els.logList.append(row);
    });
  }

  function renderHistory() {
    els.historyList.replaceChildren();

    if (!state.history.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Past case files will appear here automatically.';
      els.historyList.append(empty);
      return;
    }

    state.history.slice(0, 14).forEach(day => {
      const row = document.createElement(day.dayCard ? 'button' : 'div');
      if (row instanceof HTMLButtonElement) row.type = 'button';
      row.className = `history-row${day.dayCard ? ' history-row-button' : ''}`;

      const date = document.createElement('div');
      date.className = 'history-date';
      const strong = document.createElement('strong');
      strong.textContent = formatDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' });
      const detail = document.createElement('span');
      detail.textContent = day.won
        ? (day.dayCard?.type || 'Day cleared')
        : 'Case unresolved';
      date.append(strong, detail);

      const score = document.createElement('div');
      score.className = 'history-score';
      score.textContent = `${day.xp} / ${day.goal}`;
      const status = document.createElement('span');
      status.textContent = day.won ? 'CLEARED' : 'XP';
      if (day.won) status.className = 'win-mark';
      score.append(status);

      row.append(date, score);
      if (day.dayCard) row.addEventListener('click', () => openDayCard(day.dayCard));
      els.historyList.append(row);
    });
  }

  function openDayCard(card) {
    if (!card) return;

    els.dayCardDate.textContent = formatDate(card.date, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    els.dayCardXp.textContent = `${card.xp} XP`;
    els.dayCardType.textContent = card.type;
    els.dayCardHeadline.textContent = card.headline;
    els.dayCardCopy.textContent = card.copy;
    els.dayCardRank.textContent = card.rank;
    els.dayCardStreak.textContent = `${card.streak} day${card.streak === 1 ? '' : 's'}`;

    if (typeof els.dayCardDialog.showModal === 'function') {
      els.dayCardDialog.showModal();
    } else {
      els.dayCardDialog.setAttribute('open', '');
    }
  }

  function categoryNameExists(name, exceptId = '') {
    const normalized = name.trim().toLocaleLowerCase();
    if (normalized === 'uncategorized') return exceptId !== UNCATEGORIZED_ID;

    return settingsDraft.categories.some(category =>
      category.id !== exceptId
      && category.name.trim().toLocaleLowerCase() === normalized
    );
  }

  function openSettings() {
    settingsDraft = deepClone(state.settings);
    settingsDraft.categories = ensureUncategorizedCategory(settingsDraft.categories);
    els.goalInput.value = settingsDraft.goal;
    els.settingsMessage.textContent = '';
    renderCategoriesEditor();
    renderActionsEditor();
    populateCategorySelect();

    if (typeof els.settingsDialog.showModal === 'function') {
      els.settingsDialog.showModal();
    } else {
      els.settingsDialog.setAttribute('open', '');
    }
  }

  function previewBandText(category) {
    if (category.id === UNCATEGORIZED_ID) return 'Fixed 50% payout';
    const temporarySettings = {
      ...settingsDraft,
      goal: clampInt(els.goalInput.value, 20, 1000, settingsDraft.goal)
    };
    return `≈ ${Math.round(getFocusBand(category.id, temporarySettings))} base XP at 100%`;
  }

  function renderCategoriesEditor() {
    els.categoriesEditor.replaceChildren();

    settingsDraft.categories.forEach(category => {
      const row = document.createElement('div');
      row.className = `category-editor-row${category.id === UNCATEGORIZED_ID ? ' is-fallback' : ''}`;

      if (category.id === UNCATEGORIZED_ID) {
        const main = document.createElement('div');
        main.className = 'category-editor-main';
        const icon = document.createElement('span');
        icon.className = 'category-editor-icon';
        icon.textContent = category.icon;
        const copy = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = category.name;
        const note = document.createElement('span');
        note.textContent = 'Permanent fallback · fixed 50% payout';
        copy.append(strong, note);
        main.append(icon, copy);
        row.append(main);
        els.categoriesEditor.append(row);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'category-direct-editor';

      const nameLabel = document.createElement('label');
      nameLabel.innerHTML = '<span>Name</span>';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 40;
      nameInput.value = category.name;
      nameInput.addEventListener('input', () => {
        category.name = nameInput.value.slice(0, 80);
        renderActionsEditor();
        populateCategorySelect();
      });
      nameLabel.append(nameInput);

      const iconLabel = document.createElement('label');
      iconLabel.innerHTML = '<span>Icon</span>';
      const iconInput = document.createElement('input');
      iconInput.type = 'text';
      iconInput.maxLength = 8;
      iconInput.value = category.icon;
      iconInput.addEventListener('input', () => {
        category.icon = iconInput.value || '•';
      });
      iconLabel.append(iconInput);

      const focusLabel = document.createElement('label');
      focusLabel.innerHTML = '<span>Focus</span>';
      const focusInput = document.createElement('input');
      focusInput.type = 'number';
      focusInput.min = '0.25';
      focusInput.max = '10';
      focusInput.step = '0.25';
      focusInput.value = category.focus;
      focusInput.addEventListener('input', () => {
        category.focus = clampNumber(focusInput.value, 0.25, 10, category.focus);
        band.textContent = previewBandText(category);
      });
      focusLabel.append(focusInput);

      const band = document.createElement('div');
      band.className = 'category-band-preview';
      band.textContent = previewBandText(category);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-action';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${category.name}`);
      remove.addEventListener('click', () => {
        const moved = settingsDraft.actions.filter(action => action.categoryId === category.id).length;
        settingsDraft.actions.forEach(action => {
          if (action.categoryId === category.id) action.categoryId = UNCATEGORIZED_ID;
        });
        settingsDraft.categories = settingsDraft.categories.filter(item => item.id !== category.id);
        settingsDraft.categories = ensureUncategorizedCategory(settingsDraft.categories);
        renderCategoriesEditor();
        renderActionsEditor();
        populateCategorySelect();
        els.settingsMessage.textContent = moved
          ? `${moved} action${moved === 1 ? '' : 's'} moved to Uncategorized.`
          : 'Category removed.';
      });

      grid.append(nameLabel, iconLabel, focusLabel, band, remove);
      row.append(grid);
      els.categoriesEditor.append(row);
    });
  }

  function renderActionsEditor() {
    els.actionsEditor.replaceChildren();

    settingsDraft.actions.forEach(action => {
      const row = document.createElement('div');
      row.className = 'action-editor-row';

      const grid = document.createElement('div');
      grid.className = 'action-direct-editor';

      const nameLabel = document.createElement('label');
      nameLabel.innerHTML = '<span>Name</span>';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 40;
      nameInput.value = action.name;
      nameInput.addEventListener('input', () => {
        action.name = nameInput.value.slice(0, 100);
      });
      nameLabel.append(nameInput);

      const categoryLabel = document.createElement('label');
      categoryLabel.innerHTML = '<span>Category</span>';
      const categorySelect = document.createElement('select');
      settingsDraft.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.append(option);
      });
      categorySelect.value = action.categoryId;
      categorySelect.addEventListener('change', () => {
        action.categoryId = categorySelect.value;
      });
      categoryLabel.append(categorySelect);

      const xpLabel = document.createElement('label');
      xpLabel.innerHTML = '<span>Base XP</span>';
      const xpInput = document.createElement('input');
      xpInput.type = 'number';
      xpInput.min = '1';
      xpInput.max = '200';
      xpInput.step = '1';
      xpInput.value = action.baseXp;
      xpInput.addEventListener('input', () => {
        action.baseXp = clampInt(xpInput.value, 1, 200, action.baseXp);
      });
      xpLabel.append(xpInput);

      const typeLabel = document.createElement('label');
      typeLabel.innerHTML = '<span>Type</span>';
      const typeSelect = document.createElement('select');
      typeSelect.innerHTML = '<option value="repeatable">Repeatable</option><option value="once">Once per day</option>';
      typeSelect.value = action.type;
      typeSelect.addEventListener('change', () => {
        action.type = typeSelect.value === 'once' ? 'once' : 'repeatable';
      });
      typeLabel.append(typeSelect);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-action';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${action.name}`);
      remove.addEventListener('click', () => {
        settingsDraft.actions = settingsDraft.actions.filter(item => item.id !== action.id);
        renderActionsEditor();
        els.settingsMessage.textContent = 'Action removed. Save settings to keep the change.';
      });

      grid.append(nameLabel, categoryLabel, xpLabel, typeLabel, remove);
      row.append(grid);
      els.actionsEditor.append(row);
    });
  }

  function populateCategorySelect() {
    const previous = els.newActionCategory.value;
    els.newActionCategory.replaceChildren();

    settingsDraft.categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      els.newActionCategory.append(option);
    });

    if (settingsDraft.categories.some(category => category.id === previous)) {
      els.newActionCategory.value = previous;
    } else {
      els.newActionCategory.value = settingsDraft.categories.find(category => category.id !== UNCATEGORIZED_ID)?.id
        || UNCATEGORIZED_ID;
    }
  }

  function addCategoryFromForm() {
    const name = els.newCategoryName.value.trim();
    const icon = els.newCategoryIcon.value.trim() || '•';
    const focus = clampNumber(els.newCategoryFocus.value, 0.25, 10, 1);

    if (!name) {
      els.settingsMessage.textContent = 'Give the category a name first.';
      els.newCategoryName.focus();
      return;
    }

    if (categoryNameExists(name)) {
      els.settingsMessage.textContent = 'That category name is already in use.';
      els.newCategoryName.focus();
      return;
    }

    if (settingsDraft.categories.length >= 20) {
      els.settingsMessage.textContent = 'Dalli supports up to 20 categories including Uncategorized.';
      return;
    }

    const category = { id: makeId('category'), name, icon, focus };
    const fallbackIndex = settingsDraft.categories.findIndex(item => item.id === UNCATEGORIZED_ID);
    settingsDraft.categories.splice(fallbackIndex < 0 ? settingsDraft.categories.length : fallbackIndex, 0, category);

    els.newCategoryName.value = '';
    els.newCategoryIcon.value = '';
    els.newCategoryFocus.value = '1';

    renderCategoriesEditor();
    renderActionsEditor();
    populateCategorySelect();
    els.newActionCategory.value = category.id;
    els.settingsMessage.textContent = 'Category added. The city has updated its paperwork.';
  }

  function addActionFromForm() {
    const name = els.newActionName.value.trim();
    const categoryId = els.newActionCategory.value;
    const baseXp = clampInt(els.newActionXp.value, 1, 200, 10);
    const type = els.newActionType.value === 'once' ? 'once' : 'repeatable';

    if (!name) {
      els.settingsMessage.textContent = 'Give the action a name first.';
      els.newActionName.focus();
      return;
    }

    if (!settingsDraft.categories.some(category => category.id === categoryId)) {
      els.settingsMessage.textContent = 'Choose a valid category.';
      return;
    }

    settingsDraft.actions.push({
      id: makeId('action'),
      categoryId,
      name,
      baseXp,
      type
    });

    els.newActionName.value = '';
    els.newActionXp.value = '10';
    els.newActionType.value = 'repeatable';
    renderActionsEditor();
    els.settingsMessage.textContent = 'Action added. Save settings to make it legally binding.';
  }

  function saveSettingsFromDialog(event) {
    if (event.submitter && event.submitter.value === 'cancel') {
      settingsDraft = null;
      return;
    }

    if (!settingsDraft) return;

    const emptyCategory = settingsDraft.categories.find(
      category => category.id !== UNCATEGORIZED_ID && !category.name.trim()
    );
    if (emptyCategory) {
      event.preventDefault();
      els.settingsMessage.textContent = 'Every category needs a name.';
      return;
    }

    const duplicate = settingsDraft.categories.find((category, index, list) => (
      category.id !== UNCATEGORIZED_ID
      && list.findIndex(other => (
        other.id !== UNCATEGORIZED_ID
        && other.name.trim().toLocaleLowerCase() === category.name.trim().toLocaleLowerCase()
      )) !== index
    ));
    if (duplicate) {
      event.preventDefault();
      els.settingsMessage.textContent = 'Category names must be unique.';
      return;
    }

    settingsDraft.goal = clampInt(els.goalInput.value, 20, 1000, 100);
    settingsDraft.categories = ensureUncategorizedCategory(settingsDraft.categories);
    settingsDraft.actions = settingsDraft.actions.filter(action => action.name.trim());

    const ids = new Set(settingsDraft.categories.map(category => category.id));
    settingsDraft.actions.forEach(action => {
      if (!ids.has(action.categoryId)) action.categoryId = UNCATEGORIZED_ID;
    });

    state.settings = settingsDraft;
    settingsDraft = null;
    const justCleared = finalizeClearIfNeeded();
    saveState();
    render({ showDayCard: justCleared });
  }

  function resetGameData() {
    const confirmed = window.confirm(
      'Reset ALL Dalli game data?\n\nThis wipes categories, actions, history, Level, Street Cred and streaks. Your login/account remains.\n\nThe Crestfallen Department of Records will pretend none of this ever happened.'
    );
    if (!confirmed) return;

    state = freshState();
    state.current.date = localDateKey();
    settingsDraft = null;
    wasVictory = false;
    saveState();
    els.settingsDialog.close();
    render();
  }

  window.DalliApp = Object.freeze({
    stateVersion: STATE_VERSION,
    getState: () => deepClone(state),
    getDefaultState: () => freshState(),
    getStorageKey: () => activeStorageKey,
    readStoredState,
    replaceState,
    useStorageKey,
    guestStorageKey: STORAGE_KEY
  });

  els.settingsButton.addEventListener('click', openSettings);
  els.goalInput.addEventListener('input', renderCategoriesEditor);
  els.addCategoryButton.addEventListener('click', addCategoryFromForm);
  els.addActionButton.addEventListener('click', addActionFromForm);
  els.resetGameButton.addEventListener('click', resetGameData);
  els.settingsForm.addEventListener('submit', saveSettingsFromDialog);
  els.viewDayCardButton.addEventListener('click', () => openDayCard(state.current.dayCard));
  els.closeDayCardButton.addEventListener('click', () => els.dayCardDialog.close());

  els.dayCardDialog.addEventListener('click', event => {
    if (event.target === els.dayCardDialog) els.dayCardDialog.close();
  });

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
