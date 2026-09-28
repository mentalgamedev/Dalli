(() => {
  'use strict';

  const STATE_VERSION = 2;
  const STORAGE_KEY = 'dailyXpGame.v2';
  const HISTORY_LIMIT = 365;
  const DETAILED_HISTORY_DAYS = 90;
  const UNCATEGORIZED_ID = 'uncategorized';
  const UNCATEGORIZED_EFFICIENCY = 0.50;
  const EFFICIENCY_TIERS = [1, 0.8, 0.6, 0.4];
  const STARTER_GOAL_RATIO = 0.60;
  const GOAL_RAMP_STEPS = 8;
  const CLEARS_PER_RAMP_STEP = 2;

  const DEFAULT_ACTION_NAME_MIGRATIONS = Object.freeze({
    'wellbeing-workout-30': ['Workout — 30 min', 'Proper workout'],
    'wellbeing-walk-20': ['Walk — 20 min', 'Walk / fresh air'],
    'wellbeing-mobility-10': ['Stretch / mobility — 10 min', 'Quick movement / stretch'],
    'work-focus-25': ['Focused work — 25 min', 'Focus session'],
    'work-focus-50': ['Focused work — 50 min', 'Deep focus session'],
    'work-practice-20': ['Practice / skill — 20 min', 'Practice / skill'],
    'chores-small': ['Small chore — 5–10 min', 'Tiny chore'],
    'chores-medium': ['Cleaning — 15–30 min', 'Proper chore / cleaning']
  });

  let activeStorageKey = STORAGE_KEY;
  let suppressCloudSave = false;

  const DEFAULT_CATEGORY_COLORS = Object.freeze({
    wellbeing: '#49d89b',
    work: '#818bff',
    chores: '#ffb35f',
    uncategorized: '#8b93a4'
  });

  const CUSTOM_CATEGORY_COLORS = Object.freeze([
    '#69d5ff',
    '#d37cff',
    '#e9d96b',
    '#ff7daf',
    '#8fd56a',
    '#65cfc8'
  ]);

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
        { id: 'wellbeing', name: 'Wellbeing', icon: '♥', focus: 1, color: '#49d89b' },
        { id: 'work', name: 'Work', icon: '◆', focus: 1.5, color: '#818bff' },
        { id: 'chores', name: 'Chores', icon: '⌂', focus: 0.75, color: '#ffb35f' },
        { id: UNCATEGORIZED_ID, name: 'Uncategorized', icon: '•', focus: 0, color: '#8b93a4' }
      ],
      actions: [
        { id: 'wellbeing-workout-30', categoryId: 'wellbeing', name: 'Proper workout', baseXp: 20, type: 'repeatable', trackVisible: true },
        { id: 'wellbeing-walk-20', categoryId: 'wellbeing', name: 'Walk / fresh air', baseXp: 10, type: 'repeatable', trackVisible: true },
        { id: 'wellbeing-mobility-10', categoryId: 'wellbeing', name: 'Quick movement / stretch', baseXp: 5, type: 'repeatable', trackVisible: true },
        { id: 'wellbeing-good-meal', categoryId: 'wellbeing', name: 'Proper healthy meal', baseXp: 10, type: 'once', trackVisible: true },
        { id: 'work-focus-25', categoryId: 'work', name: 'Focus session', baseXp: 15, type: 'repeatable', trackVisible: true },
        { id: 'work-focus-50', categoryId: 'work', name: 'Deep focus session', baseXp: 30, type: 'repeatable', trackVisible: true },
        { id: 'work-practice-20', categoryId: 'work', name: 'Practice / skill', baseXp: 10, type: 'repeatable', trackVisible: true },
        { id: 'work-admin', categoryId: 'work', name: 'Annoying admin task', baseXp: 10, type: 'once', trackVisible: true },
        { id: 'chores-small', categoryId: 'chores', name: 'Tiny chore', baseXp: 5, type: 'repeatable', trackVisible: true },
        { id: 'chores-medium', categoryId: 'chores', name: 'Proper chore / cleaning', baseXp: 10, type: 'repeatable', trackVisible: true },
        { id: 'chores-laundry', categoryId: 'chores', name: 'Laundry', baseXp: 10, type: 'once', trackVisible: true },
        { id: 'chores-big', categoryId: 'chores', name: 'Big chore / deep clean', baseXp: 20, type: 'repeatable', trackVisible: true }
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
    newswireViewport: document.querySelector('#newswireViewport'),
    newswireMessage: document.querySelector('#newswireMessage'),
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
    closeSettingsButton: document.querySelector('#closeSettingsButton'),
    goalInput: document.querySelector('#goalInput'),
    goalRampPreview: document.querySelector('#goalRampPreview'),
    categoriesEditor: document.querySelector('#categoriesEditor'),
    newCategoryName: document.querySelector('#newCategoryName'),
    newCategoryIcon: document.querySelector('#newCategoryIcon'),
    newCategoryFocus: document.querySelector('#newCategoryFocus'),
    newCategoryColor: document.querySelector('#newCategoryColor'),
    addCategoryButton: document.querySelector('#addCategoryButton'),
    actionsEditor: document.querySelector('#actionsEditor'),
    newActionName: document.querySelector('#newActionName'),
    newActionCategory: document.querySelector('#newActionCategory'),
    newActionXp: document.querySelector('#newActionXp'),
    newActionType: document.querySelector('#newActionType'),
    newActionVisible: document.querySelector('#newActionVisible'),
    addActionButton: document.querySelector('#addActionButton'),
    resetGameButton: document.querySelector('#resetGameButton'),
    motionFxButton: document.querySelector('#motionFxButton'),
    motionFxStatus: document.querySelector('#motionFxStatus'),
    settingsMessage: document.querySelector('#settingsMessage')
  };

  let state = loadState();
  let settingsDraft = null;
  let wasVictory = false;
  let newswireMessages = [];
  let newswireIndex = 0;
  let newswireSignature = '';
  let newswireOffset = 0;
  let newswirePausedUntil = 0;
  let newswireLastFrame = 0;
  let newswireSpecialUntil = 0;
  let visualFrame = null;
  let dayCardTimer = null;
  let settingsSaveTimer = null;
  let settingsTriggeredClear = false;
  const categoryScrollPositions = new Map();

  const MOTION_PREF_KEY = 'molife.motionFx.v1';
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointerQuery = window.matchMedia('(pointer: fine)');
  let motionFxEnabled = false;
  let motionSensorLive = false;
  let orientationListenerAttached = false;
  let motionListenerAttached = false;
  let motionProbeTimer = null;
  let orientationSamples = 0;
  let motionSamples = 0;
  let lastOrientationSampleAt = 0;
  let lastMotionSampleAt = 0;
  let neutralGamma = null;
  let neutralBeta = null;
  let neutralAlpha = null;
  let neutralMotionRoll = null;
  let neutralMotionPitch = null;
  let targetRoll = 0;
  let targetPitch = 0;
  let targetYaw = 0;
  let smoothRoll = 0;
  let smoothPitch = 0;
  let smoothYaw = 0;

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

  function normalizeHexColor(value, fallback = '#8b93a4') {
    const text = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(text) ? text : fallback;
  }

  function fallbackCategoryColor(categoryId, index = 0) {
    if (DEFAULT_CATEGORY_COLORS[categoryId]) return DEFAULT_CATEGORY_COLORS[categoryId];
    return CUSTOM_CATEGORY_COLORS[index % CUSTOM_CATEGORY_COLORS.length];
  }

  function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex);
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16)
    };
  }

  function rgbToHsl({ r, g, b }) {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rr) h = ((gg - bb) / d) + (gg < bb ? 6 : 0);
      else if (max === gg) h = ((bb - rr) / d) + 2;
      else h = ((rr - gg) / d) + 4;
      h /= 6;
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function categoryPalette(color) {
    const source = normalizeHexColor(color);
    const hsl = rgbToHsl(hexToRgb(source));
    const chromatic = hsl.s >= 8;
    const hue = chromatic ? hsl.h : 220;
    const accentS = chromatic ? Math.min(92, Math.max(60, hsl.s)) : 12;
    const accentL = chromatic ? Math.min(72, Math.max(60, hsl.l)) : 72;
    const panelS = chromatic ? Math.min(32, Math.max(18, hsl.s * 0.34)) : 8;

    return {
      source,
      accent: `hsl(${hue.toFixed(1)} ${accentS.toFixed(1)}% ${accentL.toFixed(1)}%)`,
      panel: `hsl(${hue.toFixed(1)} ${panelS.toFixed(1)}% 11.2%)`,
      panelAlt: `hsl(${hue.toFixed(1)} ${Math.min(38, panelS + 5).toFixed(1)}% 14.2%)`,
      surface: `hsl(${hue.toFixed(1)} ${Math.min(42, panelS + 7).toFixed(1)}% 17%)`,
      border: `hsla(${hue.toFixed(1)}, ${Math.min(54, panelS + 14).toFixed(1)}%, 58%, .24)`,
      glow: `hsla(${hue.toFixed(1)}, ${accentS.toFixed(1)}%, ${accentL.toFixed(1)}%, .13)`
    };
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
    return {
      id: UNCATEGORIZED_ID,
      name: 'Uncategorized',
      icon: '•',
      focus: 0,
      color: DEFAULT_CATEGORY_COLORS.uncategorized
    };
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
        focus: clampNumber(category?.focus, 0.25, 10, 1),
        color: normalizeHexColor(category?.color, fallbackCategoryColor(id, index))
      });
    });
    next.settings.categories = ensureUncategorizedCategory(categories);

    const nonFallback = next.settings.categories.filter(category => category.id !== UNCATEGORIZED_ID);
    const isLegacyDefaultFocus = nonFallback.length === 3
      && nonFallback.every(category => ['wellbeing', 'work', 'chores'].includes(category.id))
      && nonFallback.every(category => category.focus === 1);

    if (isLegacyDefaultFocus) {
      const work = next.settings.categories.find(category => category.id === 'work');
      const chores = next.settings.categories.find(category => category.id === 'chores');
      if (work) work.focus = 1.5;
      if (chores) chores.focus = 0.75;
    }

    const categoryIds = new Set(next.settings.categories.map(category => category.id));
    const sourceActions = Array.isArray(candidate.settings?.actions)
      ? candidate.settings.actions
      : DEFAULT_STATE.settings.actions;

    next.settings.actions = sourceActions.slice(0, 500).map((action, index) => {
      const id = String(action?.id || `action-${index + 1}`).slice(0, 128);
      let name = String(action?.name || 'Unnamed action').slice(0, 100);
      const migration = DEFAULT_ACTION_NAME_MIGRATIONS[id];

      if (migration && name === migration[0]) {
        name = migration[1];
      }

      return {
        id,
        categoryId: categoryIds.has(String(action?.categoryId)) ? String(action.categoryId) : UNCATEGORIZED_ID,
        name,
        baseXp: clampInt(action?.baseXp, 1, 200, 10),
        type: action?.type === 'once' ? 'once' : 'repeatable',
        trackVisible: action?.trackVisible !== false
      };
    });

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
      console.warn('Could not load saved MoLife data:', error);
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
      console.warn('Could not read cached MoLife data:', error);
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

  function getPriorClearCount() {
    return state.history.reduce((count, day) => count + (day.won ? 1 : 0), 0);
  }

  function getDailyGoal(settings = state.settings) {
    const matureGoal = clampInt(settings.goal, 20, 1000, 100);
    const starterGoal = Math.max(
      20,
      Math.min(matureGoal, Math.round((matureGoal * STARTER_GOAL_RATIO) / 5) * 5)
    );

    if (starterGoal >= matureGoal) return matureGoal;

    const clearCount = getPriorClearCount();
    const rampStep = Math.min(
      GOAL_RAMP_STEPS,
      Math.floor(clearCount / CLEARS_PER_RAMP_STEP)
    );
    const progress = rampStep / GOAL_RAMP_STEPS;
    const ramped = starterGoal + ((matureGoal - starterGoal) * progress);

    return Math.min(
      matureGoal,
      Math.max(20, Math.round(ramped / 5) * 5)
    );
  }

  function getGoalRampInfo(settings = state.settings) {
    const matureGoal = clampInt(settings.goal, 20, 1000, 100);
    const currentGoal = getDailyGoal(settings);
    const clearCount = getPriorClearCount();
    const clearsToMature = GOAL_RAMP_STEPS * CLEARS_PER_RAMP_STEP;

    return {
      matureGoal,
      currentGoal,
      clearCount,
      clearsToMature,
      active: currentGoal < matureGoal
    };
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
    return Math.max(1, getDailyGoal(settings) * (category.focus / totalFocus));
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

    const goal = getDailyGoal();

    return {
      totalXp,
      totalBaseXp,
      categoryXp,
      categoryBaseXp,
      goal,
      isVictory: totalXp >= goal
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

  function compactHistoryPayload() {
    const softLimit = 210000;
    let encoded = JSON.stringify(state);

    for (let index = state.history.length - 1; index >= 0 && encoded.length > softLimit; index -= 1) {
      if (state.history[index].transactions?.length) {
        state.history[index].transactions = [];
        encoded = JSON.stringify(state);
      }
    }
  }

  function archiveCurrentDay() {
    if (!state.current.date) return;

    const summary = getSummary();
    const record = {
      date: state.current.date,
      xp: summary.totalXp,
      baseXp: summary.totalBaseXp,
      goal: summary.goal,
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
    compactHistoryPayload();
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
    const ratio = summary.totalXp / Math.max(1, summary.goal);

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
    render({ showDayCard: justCleared, justCleared });
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

  function categoryColor(category, index = 0) {
    if (!category) return fallbackCategoryColor('', index);
    if (category.id === UNCATEGORIZED_ID) return DEFAULT_CATEGORY_COLORS.uncategorized;
    return normalizeHexColor(category.color, fallbackCategoryColor(category.id, index));
  }

  function getDominantCategory(summary) {
    return state.settings.categories
      .filter(category => category.id !== UNCATEGORIZED_ID)
      .map(category => ({
        ...category,
        baseXp: summary.categoryBaseXp[category.id] || 0
      }))
      .sort((a, b) => b.baseXp - a.baseXp)[0] || null;
  }

  function getNewswireMessages(summary) {
    const messages = [];
    const goal = summary.goal;
    const remaining = Math.max(0, goal - summary.totalXp);
    const ratio = summary.totalXp / Math.max(1, goal);
    const cred = getStreetCred();
    const rank = getRank(cred);
    const streak = getCurrentStreak();
    const best = Math.max(state.progression.bestStreak, streak);
    const yesterdayKey = addDays(localDateKey(), -1);
    const yesterday = state.history.find(day => day.date === yesterdayKey);
    const dominant = getDominantCategory(summary);
    const hour = new Date().getHours();

    if (summary.isVictory) {
      messages.push(
        'FINE. YOU DID IT.',
        'DAILY TARGET CLEARED; NEWSROOM FORCED TO RETRACT EARLIER COMMENTS',
        'MO.LIFE CONFIRMS USER WAS, AGAINST EXPECTATIONS, PRODUCTIVE',
        `${summary.totalXp} XP RECORDED; EXCUSES DEPARTMENT CLOSED FOR THE DAY`
      );

      if (streak >= 3) {
        messages.push(`${streak}-DAY STREAK CONTINUES; SITUATION NOW TOO EXPENSIVE TO ABANDON`);
      }

      if (rank.name !== 'Nobody') {
        messages.push(`STREET CRED OFFICE RELUCTANTLY CONFIRMS ${rank.name.toUpperCase()} STATUS`);
      }
    } else if (summary.totalXp === 0) {
      messages.push(
        'BREAKING: DAILY PRODUCTIVITY REMAINS ENTIRELY THEORETICAL',
        'USER HAS OPENED MOLIFE. FURTHER ACTION UNCONFIRMED.',
        'STREET CRED OFFICIALS REPORT NO NEW EVIDENCE AT THIS TIME',
        'TRACK-O-TRON STANDING BY. IT CANNOT, LEGALLY, DO THE TASKS FOR YOU.'
      );

      if (hour >= 18) {
        messages.push('EVENING UPDATE: ZERO XP CONTINUES ITS UNPRECEDENTED RUN');
      }
    } else if (ratio < 0.25) {
      messages.push(
        `CITIZEN EARNS ${summary.totalXp} XP, IMMEDIATELY EXPECTS RECOGNITION`,
        `PRODUCTIVITY INCREASES FROM “NONE” TO “TECHNICALLY SOME”`,
        `${remaining} XP STILL MISSING; AUTHORITIES DESCRIBE PROGRESS AS ADORABLE`
      );
    } else if (ratio < 0.5) {
      messages.push(
        `DAILY TARGET NOW ${Math.round(ratio * 100)}% COMPLETE; CONFIDENCE REMAINS UNAUTHORIZED`,
        `${remaining} XP REMAIN. NEWSROOM ADVISES AGAINST PREMATURE CELEBRATION`,
        'PRODUCTIVITY DETECTED. EXPERTS CAUTION AGAINST CALLING IT A HABIT.'
      );
    } else if (ratio < 0.75) {
      messages.push(
        'DEVELOPING: FINISHING TODAY HAS BECOME AN EMBARRASSINGLY REALISTIC POSSIBILITY',
        `${remaining} XP REMAIN; LOCAL EXCUSES BEGIN LOSING CREDIBILITY`,
        `USER CROSSES HALFWAY MARK, NOW PERSONALLY RESPONSIBLE FOR WHAT HAPPENS NEXT`
      );
    } else {
      messages.push(
        `ONLY ${remaining} XP REMAIN. EXCUSES DEPARTMENT RUNNING OUT OF OPTIONS.`,
        'NEWSROOM PREPARES RELUCTANT “YOU DID IT” GRAPHIC',
        `DAILY TARGET WITHIN REACH; ABANDONING NOW WOULD REQUIRE EXPLANATION`
      );
    }

    if (goal < state.settings.goal) {
      messages.push(
        `STARTER PROTOCOL ACTIVE: TODAY'S GOAL REDUCED TO ${goal} XP. TRY NOT TO GET USED TO IT.`
      );
    }

    if (!summary.isVictory && hour >= 22) {
      messages.push('LATE BULLETIN: THE GOAL HAS NOT GONE TO BED JUST BECAUSE YOU WANT TO');
    }

    if (yesterday) {
      messages.push(
        yesterday.won
          ? 'ARCHIVES CONFIRM YESTERDAY WAS PRODUCTIVE. TODAY HAS BEEN INFORMED.'
          : 'ARCHIVES CONFIRM YESTERDAY WAS MOSTLY A CONCEPT'
      );
    }

    if (streak >= 7) {
      messages.push(`LOCAL OVERACHIEVER'S ${streak}-DAY STREAK ENTERS “THIS IS GETTING PERSONAL” TERRITORY`);
    } else if (!streak && best >= 7) {
      messages.push(`FORMER ${best}-DAY STREAK NOW PRESERVED IN MUSEUM CONDITIONS`);
    }

    if (cred === 0) {
      messages.push('STREET CRED REMAINS WITHIN LEGAL DEFINITION OF “NONE”');
    } else if (rank.next) {
      messages.push(`${rank.name.toUpperCase()} STATUS ACTIVE; ${Math.max(0, rank.next.min - cred)} MORE CLEARED DAYS TO NEXT BAD DECISION`);
    } else {
      messages.push('HEAD HONCHO STATUS CONFIRMED; POWER APPEARS TO HAVE GONE TO USER’S HEAD');
    }

    if (dominant && dominant.baseXp > 0) {
      const efficiency = getCategoryEfficiency(dominant.id, dominant.baseXp);
      if (efficiency.multiplier <= 0.6) {
        messages.push(`TRACK-O-TRON REPORTS ${dominant.name.toUpperCase()} SATURATION; OTHER PARTS OF LIFE STILL AVAILABLE`);
      } else if (summary.totalXp > 0) {
        messages.push(`${dominant.name.toUpperCase()} CURRENTLY LEADS LOCAL XP MARKETS`);
      }
    }

    const level = getLevelProgress();
    if (level.level >= 2) {
      messages.push(`LEVEL ${level.level} CITIZEN STILL RECEIVES NO ADDITIONAL SALARY OR PARKING PRIVILEGES`);
    }

    messages.push(
      'MO.LES.TECH DENIES REPORTS THAT EMPLOYEES REQUIRE SLEEP',
      'CITY COUNCIL ANNOUNCES NEW INITIATIVE TO ANNOUNCE MORE INITIATIVES'
    );

    return [...new Set(messages)];
  }

  function resetNewswirePosition(pauseMs = 650) {
    if (!els.newswireViewport || !els.newswireMessage) return;
    newswireOffset = Math.max(0, els.newswireViewport.clientWidth);
    newswirePausedUntil = performance.now() + pauseMs;
    els.newswireMessage.style.transform = `translate3d(${Math.round(newswireOffset)}px,0,0)`;
  }

  function showNewswireMessage(message, options = {}) {
    if (!els.newswireMessage || !message) return;

    els.newswireMessage.textContent = message;
    els.newswireMessage.title = message;
    resetNewswirePosition(options.pauseMs ?? 650);

    if (options.special) {
      newswireSpecialUntil = performance.now() + (options.holdMs ?? 2600);
    }
  }

  function refreshNewswire(summary, specialMessage = '') {
    const messages = getNewswireMessages(summary);
    const signature = JSON.stringify(messages);

    if (signature !== newswireSignature) {
      newswireSignature = signature;
      newswireMessages = messages;
      newswireIndex = messages.length
        ? stringHash(`${state.current.date}|${summary.totalXp}|${state.history.length}`) % messages.length
        : 0;

      if (!specialMessage && newswireMessages.length) {
        showNewswireMessage(newswireMessages[newswireIndex], { pauseMs: 450 });
      }
    }

    if (specialMessage) {
      showNewswireMessage(specialMessage, { special: true, holdMs: 3000, pauseMs: 150 });
      return;
    }

    if (!els.newswireMessage.textContent && newswireMessages.length) {
      showNewswireMessage(newswireMessages[newswireIndex]);
    }
  }

  function advanceNewswire() {
    if (!newswireMessages.length) return;
    newswireIndex = (newswireIndex + 1) % newswireMessages.length;
    showNewswireMessage(newswireMessages[newswireIndex], { pauseMs: 750 });
  }

  function normalizeAngle(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return ((numeric % 360) + 360) % 360;
  }
  function signedAngleDelta(value, origin) {
    let delta = normalizeAngle(value) - normalizeAngle(origin);
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  }


  function markMotionSensorLive(mode) {
    if (motionSensorLive) return;

    motionSensorLive = true;
    document.body.classList.add('motion-fx-enabled', 'ambient-fx-enabled');
    window.clearTimeout(motionProbeTimer);
    motionProbeTimer = null;
    updateMotionFxUi(
      mode === 'orientation'
        ? 'Active · tilt sideways to fast-forward the Newswire.'
        : 'Active · motion fallback connected; tilt sideways to fast-forward.'
    );
  }

  function handleDeviceOrientation(event) {
    if (!motionFxEnabled || reducedMotionQuery.matches) return;

    const gamma = typeof event.gamma === 'number' && Number.isFinite(event.gamma) ? event.gamma : null;
    const beta = typeof event.beta === 'number' && Number.isFinite(event.beta) ? event.beta : null;
    const alpha = typeof event.alpha === 'number' && Number.isFinite(event.alpha) ? event.alpha : null;
    const hasTilt = gamma !== null || beta !== null;

    if (!hasTilt && alpha === null) return;

    orientationSamples += 1;
    lastOrientationSampleAt = performance.now();

    if (gamma !== null && neutralGamma === null) neutralGamma = gamma;
    if (beta !== null && neutralBeta === null) neutralBeta = beta;
    if (alpha !== null && neutralAlpha === null) neutralAlpha = alpha;

    if (gamma !== null && neutralGamma !== null) {
      targetRoll = clampNumber((gamma - neutralGamma) / 22, -1, 1, 0);
    }
    if (beta !== null && neutralBeta !== null) {
      targetPitch = clampNumber((beta - neutralBeta) / 28, -1, 1, 0);
    }
    if (alpha !== null && neutralAlpha !== null) {
      const yawDelta = signedAngleDelta(alpha, neutralAlpha);
      targetYaw = normalizeAngle(yawDelta * 2.6);
    }

    markMotionSensorLive('orientation');
  }

  function handleDeviceMotion(event) {
    if (!motionFxEnabled || reducedMotionQuery.matches) return;

    const gravity = event.accelerationIncludingGravity;
    if (!gravity) return;

    const x = typeof gravity.x === 'number' && Number.isFinite(gravity.x) ? gravity.x : null;
    const y = typeof gravity.y === 'number' && Number.isFinite(gravity.y) ? gravity.y : null;
    const z = typeof gravity.z === 'number' && Number.isFinite(gravity.z) ? gravity.z : null;
    if (x === null && y === null && z === null) return;

    motionSamples += 1;
    lastMotionSampleAt = performance.now();

    // DeviceMotion is a fallback for browsers that expose gravity but not orientation.
    // Prefer orientation whenever it is arriving recently because it provides yaw too.
    const orientationIsFresh = (performance.now() - lastOrientationSampleAt) < 1500;
    if (!orientationIsFresh) {
      const gx = x ?? 0;
      const gy = y ?? 0;
      const gz = z ?? 0;
      const rollRad = Math.atan2(gx, Math.sqrt((gy * gy) + (gz * gz)));
      const pitchRad = Math.atan2(-gy, Math.sqrt((gx * gx) + (gz * gz)));

      if (neutralMotionRoll === null) neutralMotionRoll = rollRad;
      if (neutralMotionPitch === null) neutralMotionPitch = pitchRad;

      targetRoll = clampNumber((rollRad - neutralMotionRoll) / (Math.PI / 9), -1, 1, 0);
      targetPitch = clampNumber((pitchRad - neutralMotionPitch) / (Math.PI / 8), -1, 1, 0);
      targetYaw = normalizeAngle((targetRoll * 120) - (targetPitch * 65));
    }

    markMotionSensorLive(orientationIsFresh ? 'orientation' : 'motion');
  }

  function attachMotionListeners() {
    if (!orientationListenerAttached) {
      window.addEventListener('deviceorientation', handleDeviceOrientation, true);
      orientationListenerAttached = true;
    }

    if (!motionListenerAttached) {
      window.addEventListener('devicemotion', handleDeviceMotion, true);
      motionListenerAttached = true;
    }
  }

  function detachMotionListeners() {
    if (orientationListenerAttached) {
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
      orientationListenerAttached = false;
    }

    if (motionListenerAttached) {
      window.removeEventListener('devicemotion', handleDeviceMotion, true);
      motionListenerAttached = false;
    }

    window.clearTimeout(motionProbeTimer);
    motionProbeTimer = null;
  }

  function motionApiSupported() {
    return typeof window.DeviceOrientationEvent !== 'undefined'
      || typeof window.DeviceMotionEvent !== 'undefined';
  }

  function updateMotionFxUi(message = '') {
    if (!els.motionFxButton || !els.motionFxStatus) return;

    if (reducedMotionQuery.matches) {
      els.motionFxButton.disabled = true;
      els.motionFxButton.textContent = 'Motion reduced';
      els.motionFxStatus.textContent = 'Disabled because your device requests reduced motion.';
      return;
    }

    const supported = motionApiSupported();
    els.motionFxButton.disabled = !supported;

    if (!supported) {
      els.motionFxButton.textContent = 'Motion unavailable';
      els.motionFxStatus.textContent = 'This browser does not expose device motion sensors.';
      return;
    }

    els.motionFxButton.textContent = motionFxEnabled ? 'Disable Motion FX' : 'Enable Motion FX';

    if (message) {
      els.motionFxStatus.textContent = message;
    } else if (motionFxEnabled && motionSensorLive) {
      els.motionFxStatus.textContent = 'Active · tilt changes shimmer and Newswire speed.';
    } else if (motionFxEnabled) {
      els.motionFxStatus.textContent = 'Waiting for motion sensor data…';
    } else {
      els.motionFxStatus.textContent = 'Optional · orientation data stays on this device.';
    }
  }

  function disableMotionFx() {
    motionFxEnabled = false;
    motionSensorLive = false;
    orientationSamples = 0;
    motionSamples = 0;
    lastOrientationSampleAt = 0;
    lastMotionSampleAt = 0;
    neutralGamma = null;
    neutralBeta = null;
    neutralAlpha = null;
    neutralMotionRoll = null;
    neutralMotionPitch = null;
    detachMotionListeners();
    targetRoll = 0;
    targetPitch = 0;
    targetYaw = 0;
    document.body.classList.remove('motion-fx-enabled');

    if (!finePointerQuery.matches) {
      document.body.classList.remove('ambient-fx-enabled');
    }

    try {
      localStorage.setItem(MOTION_PREF_KEY, '0');
    } catch (error) {
      // Preference storage is optional.
    }
    updateMotionFxUi();
  }

  async function requestMotionPermissionIfNeeded() {
    const requests = [];

    try {
      // Invoke every permission request while the button-click user activation is still live.
      if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
        requests.push(window.DeviceOrientationEvent.requestPermission());
      }

      if (typeof window.DeviceMotionEvent?.requestPermission === 'function') {
        requests.push(window.DeviceMotionEvent.requestPermission());
      }

      if (!requests.length) return true;
      const results = await Promise.all(requests);
      return results.every(result => result === 'granted');
    } catch (error) {
      return false;
    }
  }

  function beginMotionProbe() {
    window.clearTimeout(motionProbeTimer);
    updateMotionFxUi('Waiting for motion sensor data…');

    motionProbeTimer = window.setTimeout(() => {
      if (!motionFxEnabled || motionSensorLive) return;

      const secureHint = window.isSecureContext
        ? ''
        : ' MoLife must be opened over HTTPS.';
      updateMotionFxUi(
        'No tilt data received. Check Chrome site settings → Motion sensors, then disable and re-enable Motion FX.' + secureHint
      );
    }, 3000);
  }

  async function enableMotionFx({ fromSavedPreference = false } = {}) {
    if (reducedMotionQuery.matches) {
      updateMotionFxUi();
      return;
    }

    if (!motionApiSupported()) {
      updateMotionFxUi('Device motion is not available in this browser.');
      return;
    }

    const permissionApi = typeof window.DeviceOrientationEvent?.requestPermission === 'function'
      || typeof window.DeviceMotionEvent?.requestPermission === 'function';

    if (permissionApi && fromSavedPreference) {
      updateMotionFxUi('Tap Enable Motion FX to re-authorize tilt effects on this device.');
      return;
    }

    if (permissionApi) {
      const granted = await requestMotionPermissionIfNeeded();
      if (!granted) {
        updateMotionFxUi('Motion permission was not granted.');
        return;
      }
    }

    motionFxEnabled = true;
    motionSensorLive = false;
    orientationSamples = 0;
    motionSamples = 0;
    lastOrientationSampleAt = 0;
    lastMotionSampleAt = 0;
    neutralGamma = null;
    neutralBeta = null;
    neutralAlpha = null;
    neutralMotionRoll = null;
    neutralMotionPitch = null;
    targetRoll = 0;
    targetPitch = 0;
    targetYaw = 0;
    smoothRoll = 0;
    smoothPitch = 0;
    smoothYaw = 0;
    attachMotionListeners();
    beginMotionProbe();

    try {
      localStorage.setItem(MOTION_PREF_KEY, '1');
    } catch (error) {
      // Preference storage is optional.
    }
  }

  async function toggleMotionFx() {
    if (motionFxEnabled) {
      disableMotionFx();
    } else {
      await enableMotionFx();
    }
  }

  async function nudgePortraitOrientation() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    if (!standalone || !screen.orientation?.lock) return;

    try {
      await screen.orientation.lock('portrait-primary');
    } catch (error) {
      // The manifest is the primary portrait hint; browser locking is opportunistic.
    }
  }

  function setupPointerShimmer() {
    if (reducedMotionQuery.matches || !finePointerQuery.matches) return;

    document.body.classList.add('ambient-fx-enabled');
    window.addEventListener('pointermove', event => {
      if (motionFxEnabled) return;
      const x = event.clientX / Math.max(1, window.innerWidth);
      const y = event.clientY / Math.max(1, window.innerHeight);
      targetRoll = clampNumber((x - 0.5) * 1.15, -0.65, 0.65, 0);
      targetPitch = clampNumber((y - 0.5) * 1.05, -0.55, 0.55, 0);
      targetYaw = normalizeAngle((x * 80) + (y * 35));
    }, { passive: true });
  }

  function updateAmbientFx() {
    const smoothing = 0.07;
    smoothRoll += (targetRoll - smoothRoll) * smoothing;
    smoothPitch += (targetPitch - smoothPitch) * smoothing;

    let yawDelta = targetYaw - smoothYaw;
    if (yawDelta > 180) yawDelta -= 360;
    if (yawDelta < -180) yawDelta += 360;
    smoothYaw = normalizeAngle(smoothYaw + (yawDelta * 0.045));

    const motionEnergy = Math.min(
      1,
      (Math.abs(smoothRoll) * 0.72) + (Math.abs(smoothPitch) * 0.48)
    );
    const root = document.documentElement;
    root.style.setProperty('--motion-x', `${50 + (smoothRoll * 42)}%`);
    root.style.setProperty('--motion-y', `${24 + (smoothPitch * 38)}%`);
    root.style.setProperty('--motion-x-2', `${76 - (smoothRoll * 36)}%`);
    root.style.setProperty('--motion-y-2', `${16 - (smoothPitch * 31)}%`);
    root.style.setProperty('--motion-hue', `${Math.round(smoothYaw)}deg`);
    root.style.setProperty('--motion-tilt', smoothRoll.toFixed(3));
    root.style.setProperty('--motion-energy', motionEnergy.toFixed(3));
    root.style.setProperty('--motion-shift-x', `${(smoothRoll * 4.5).toFixed(2)}vw`);
    root.style.setProperty('--motion-shift-y', `${(smoothPitch * 3.2).toFixed(2)}vh`);
    root.style.setProperty('--motion-rotate', `${(smoothRoll * 4.5).toFixed(2)}deg`);
    root.style.setProperty('--motion-scale', (1.04 + (motionEnergy * 0.07)).toFixed(3));
    root.style.setProperty('--motion-saturation', (1.25 + (motionEnergy * 0.95)).toFixed(3));
    root.style.setProperty('--motion-brightness', (1.02 + (motionEnergy * 0.12)).toFixed(3));
    root.style.setProperty('--motion-opacity', (0.52 + (motionEnergy * 0.30)).toFixed(3));
  }

  function animateVisuals(timestamp) {
    visualFrame = requestAnimationFrame(animateVisuals);

    if (document.hidden) {
      newswireLastFrame = timestamp;
      return;
    }

    updateAmbientFx();

    if (!els.newswireViewport || !els.newswireMessage || reducedMotionQuery.matches) {
      newswireLastFrame = timestamp;
      return;
    }

    if (!newswireLastFrame) newswireLastFrame = timestamp;
    const deltaSeconds = Math.min(0.05, Math.max(0, (timestamp - newswireLastFrame) / 1000));
    newswireLastFrame = timestamp;

    if (timestamp < newswireSpecialUntil || timestamp < newswirePausedUntil) {
      return;
    }

    const tiltFactor = motionFxEnabled
      ? 1 + (Math.pow(Math.abs(smoothRoll), 0.78) * 4.4)
      : 1;
    const speed = 36 * tiltFactor;

    newswireOffset -= speed * deltaSeconds;
    els.newswireMessage.style.transform = `translate3d(${Math.round(newswireOffset)}px,0,0)`;

    const messageWidth = els.newswireMessage.scrollWidth;
    if (newswireOffset + messageWidth < 0) {
      advanceNewswire();
    }
  }

  function startVisualLoop() {
    if (visualFrame) return;
    visualFrame = requestAnimationFrame(animateVisuals);
  }

  function initializeMotionFx() {
    updateMotionFxUi();
    setupPointerShimmer();

    let saved = false;
    try {
      saved = localStorage.getItem(MOTION_PREF_KEY) === '1';
    } catch (error) {
      saved = false;
    }

    if (saved) {
      enableMotionFx({ fromSavedPreference: true });
    }

    reducedMotionQuery.addEventListener?.('change', () => {
      if (reducedMotionQuery.matches) {
        disableMotionFx();
        document.body.classList.remove('ambient-fx-enabled');
      } else {
        setupPointerShimmer();
        updateMotionFxUi();
      }
    });
  }

  function updateActionDeckState(deck, list) {
    if (!deck || !list) return;

    const overflow = list.scrollHeight > list.clientHeight + 2;
    const atTop = list.scrollTop <= 2;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;

    deck.classList.toggle('is-scrollable', overflow);
    deck.classList.toggle('can-scroll-up', overflow && !atTop);
    deck.classList.toggle('can-scroll-down', overflow && !atBottom);
  }

  function render(options = {}) {
    ensureToday();
    const summary = getSummary();

    renderHero(summary);
    renderProgression();
    renderCategories(summary);
    renderLog();
    renderHistory();

    refreshNewswire(
      summary,
      options.justCleared ? '…WE HAVE RECEIVED UPDATED INFORMATION. FINE. YOU DID IT.' : ''
    );

    if (summary.isVictory && !wasVictory) {
      els.victoryBanner.classList.remove('victory-pop');
      requestAnimationFrame(() => els.victoryBanner.classList.add('victory-pop'));
    }

    wasVictory = summary.isVictory;

    if (options.showDayCard && state.current.dayCard) {
      window.clearTimeout(dayCardTimer);
      document.body.classList.remove('day-cleared-flash');
      void document.body.offsetWidth;
      document.body.classList.add('day-cleared-flash');

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      dayCardTimer = window.setTimeout(() => {
        document.body.classList.remove('day-cleared-flash');
        openDayCard(state.current.dayCard);
      }, reducedMotion ? 0 : 850);
    }
  }

  function renderHero(summary) {
    els.todayLabel.textContent = formatDate(state.current.date, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    els.totalXp.textContent = summary.totalXp;
    els.goalXp.textContent = summary.goal;

    const progress = Math.min(1, summary.totalXp / summary.goal);
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
      const remaining = Math.max(0, summary.goal - summary.totalXp);
      const ramp = getGoalRampInfo();
      els.statusBadge.textContent = 'IN PROGRESS';
      els.heroMessage.textContent = ramp.active
        ? `${remaining} XP to clear the day. Starter ramp: ${summary.goal} XP now → ${ramp.matureGoal} XP later.`
        : `${remaining} XP to clear the day. No category is mandatory; stubbornness merely gets less profitable.`;
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
    els.categoriesGrid.querySelectorAll('.category-card[data-category-id]').forEach(card => {
      const list = card.querySelector('.actions-list');
      if (list) categoryScrollPositions.set(card.dataset.categoryId, list.scrollTop);
    });

    els.categoriesGrid.replaceChildren();

    const visibleCategories = state.settings.categories.filter(category => {
      if (category.id !== UNCATEGORIZED_ID) return true;
      const hasActions = state.settings.actions.some(
        action => action.categoryId === UNCATEGORIZED_ID && action.trackVisible !== false
      );
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
      const actionDeck = fragment.querySelector('.action-deck');
      const actionsList = fragment.querySelector('.actions-list');

      const usedBase = summary.categoryBaseXp[category.id] || 0;
      const earnedXp = summary.categoryXp[category.id] || 0;
      const efficiency = getCategoryEfficiency(category.id, usedBase);
      const color = categoryColor(category, index);
      const palette = categoryPalette(color);

      card.style.setProperty('--category-color', palette.accent);
      card.style.setProperty('--category-source', palette.source);
      card.style.setProperty('--category-panel', palette.panel);
      card.style.setProperty('--category-panel-alt', palette.panelAlt);
      card.style.setProperty('--category-surface', palette.surface);
      card.style.setProperty('--category-border', palette.border);
      card.style.setProperty('--category-glow', palette.glow);
      card.dataset.categoryId = category.id;
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

      const actions = state.settings.actions.filter(
        action => action.categoryId === category.id && action.trackVisible !== false
      );
      if (!actions.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        const hasHiddenActions = state.settings.actions.some(
          action => action.categoryId === category.id && action.trackVisible === false
        );
        empty.textContent = category.id === UNCATEGORIZED_ID
          ? 'Deleted-category actions will hide here.'
          : hasHiddenActions
            ? 'No visible actions. Unhide one in Settings.'
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

      actionsList.addEventListener('scroll', () => {
        categoryScrollPositions.set(category.id, actionsList.scrollTop);
        updateActionDeckState(actionDeck, actionsList);
      }, { passive: true });

      els.categoriesGrid.append(fragment);

      requestAnimationFrame(() => {
        actionsList.scrollTop = categoryScrollPositions.get(category.id) || 0;
        updateActionDeckState(actionDeck, actionsList);
      });
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
    els.settingsMessage.textContent = 'Changes save automatically.';
    settingsTriggeredClear = false;
    if (els.newCategoryColor) {
      const customCount = settingsDraft.categories.filter(
        category => category.id !== UNCATEGORIZED_ID && !DEFAULT_CATEGORY_COLORS[category.id]
      ).length;
      els.newCategoryColor.value = CUSTOM_CATEGORY_COLORS[customCount % CUSTOM_CATEGORY_COLORS.length];
    }
    updateGoalRampPreview();
    renderCategoriesEditor();
    renderActionsEditor();
    populateCategorySelect();

    if (typeof els.settingsDialog.showModal === 'function') {
      els.settingsDialog.showModal();
    } else {
      els.settingsDialog.setAttribute('open', '');
    }
  }

  function updateGoalRampPreview() {
    if (!els.goalRampPreview || !settingsDraft) return;

    const temporarySettings = {
      ...settingsDraft,
      goal: clampInt(els.goalInput.value, 20, 1000, settingsDraft.goal)
    };
    const ramp = getGoalRampInfo(temporarySettings);

    els.goalRampPreview.textContent = ramp.active
      ? `Current target: ${ramp.currentGoal} XP · ${ramp.clearCount}/${ramp.clearsToMature} cleared days toward the full ${ramp.matureGoal} XP goal.`
      : `Current target: ${ramp.currentGoal} XP · starter ramp complete.`;
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

      const colorLabel = document.createElement('label');
      colorLabel.className = 'category-color-field';
      colorLabel.innerHTML = '<span>Color</span>';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = categoryColor(category);
      colorInput.setAttribute('aria-label', `Color for ${category.name}`);
      colorInput.addEventListener('input', () => {
        category.color = normalizeHexColor(colorInput.value, category.color);
        row.style.setProperty('--editor-category-color', category.color);
      });
      colorLabel.append(colorInput);

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

      row.style.setProperty('--editor-category-color', categoryColor(category));
      grid.append(nameLabel, iconLabel, focusLabel, colorLabel, band, remove);
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

      const visibilityLabel = document.createElement('label');
      visibilityLabel.className = 'action-visibility-field';
      const visibilityTitle = document.createElement('span');
      visibilityTitle.textContent = 'Track-o-Tron';
      const visibilityToggle = document.createElement('span');
      visibilityToggle.className = 'action-visibility-toggle';
      const visibilityInput = document.createElement('input');
      visibilityInput.type = 'checkbox';
      visibilityInput.checked = action.trackVisible !== false;
      const visibilityText = document.createElement('span');
      visibilityText.textContent = 'Show';
      visibilityToggle.append(visibilityInput, visibilityText);
      visibilityLabel.append(visibilityTitle, visibilityToggle);

      const syncVisibilityStyle = () => {
        row.classList.toggle('is-track-hidden', !visibilityInput.checked);
      };
      visibilityInput.addEventListener('change', () => {
        action.trackVisible = visibilityInput.checked;
        syncVisibilityStyle();
      });
      syncVisibilityStyle();

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

      grid.append(nameLabel, categoryLabel, xpLabel, typeLabel, visibilityLabel, remove);
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
    const color = normalizeHexColor(
      els.newCategoryColor?.value,
      CUSTOM_CATEGORY_COLORS[settingsDraft.categories.length % CUSTOM_CATEGORY_COLORS.length]
    );

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
      els.settingsMessage.textContent = 'MoLife supports up to 20 categories including Uncategorized.';
      return;
    }

    const category = { id: makeId('category'), name, icon, focus, color };
    const fallbackIndex = settingsDraft.categories.findIndex(item => item.id === UNCATEGORIZED_ID);
    settingsDraft.categories.splice(fallbackIndex < 0 ? settingsDraft.categories.length : fallbackIndex, 0, category);

    els.newCategoryName.value = '';
    els.newCategoryIcon.value = '';
    els.newCategoryFocus.value = '1';
    if (els.newCategoryColor) {
      const customCount = settingsDraft.categories.filter(
        item => item.id !== UNCATEGORIZED_ID && !DEFAULT_CATEGORY_COLORS[item.id]
      ).length;
      els.newCategoryColor.value = CUSTOM_CATEGORY_COLORS[customCount % CUSTOM_CATEGORY_COLORS.length];
    }

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
    const trackVisible = els.newActionVisible ? els.newActionVisible.checked : true;

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
      type,
      trackVisible
    });

    els.newActionName.value = '';
    els.newActionXp.value = '10';
    els.newActionType.value = 'repeatable';
    if (els.newActionVisible) els.newActionVisible.checked = true;
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
      'Reset ALL MoLife game data?\n\nThis wipes categories, actions, history, Level, Street Cred and streaks. Your login/account remains.\n\nThe Crestfallen Department of Records will pretend none of this ever happened.'
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
  els.goalInput.addEventListener('input', () => {
    updateGoalRampPreview();
    renderCategoriesEditor();
  });
  els.addCategoryButton.addEventListener('click', addCategoryFromForm);
  els.addActionButton.addEventListener('click', addActionFromForm);
  els.resetGameButton.addEventListener('click', resetGameData);
  els.motionFxButton?.addEventListener('click', toggleMotionFx);
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

  window.addEventListener('resize', () => {
    document.querySelectorAll('.action-deck').forEach(deck => {
      updateActionDeckState(deck, deck.querySelector('.actions-list'));
    });
    resetNewswirePosition(250);
  }, { passive: true });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  }

  ensureToday();
  const starterRampClear = finalizeClearIfNeeded();
  if (starterRampClear) saveState();
  render({ showDayCard: starterRampClear, justCleared: starterRampClear });
  initializeMotionFx();
  nudgePortraitOrientation();
  startVisualLoop();
})();
