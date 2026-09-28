(() => {
  'use strict';

  const STATE_VERSION = 3;
  const STORAGE_KEY = 'dailyXpGame.v2';
  const HISTORY_LIMIT = 365;
  const DETAILED_HISTORY_DAYS = 90;
  const UNCATEGORIZED_ID = 'uncategorized';
  const UNCATEGORIZED_EFFICIENCY = 0.50;
  const EFFICIENCY_TIERS = [1, 0.8, 0.6, 0.4];
  const STARTER_HP_RATIO = 0.60;
  const HP_RAMP_STEPS = 8;
  const VICTORIES_PER_RAMP_STEP = 2;
  const VICTORY_XP = 20;
  const COMBO_MIN_MULTIPLIER = 1.05;
  const COMBO_MAX_MULTIPLIER = 3;
  const COMBO_DEFAULT_MULTIPLIER = 1.25;
  const COMBO_MAX_STEPS = 8;

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
      fullEnemyHp: 100,
      categories: [
        { id: 'wellbeing', name: 'Wellbeing', icon: '♥', focus: 1, color: '#49d89b' },
        { id: 'work', name: 'Work', icon: '◆', focus: 1.5, color: '#818bff' },
        { id: 'chores', name: 'Chores', icon: '⌂', focus: 0.75, color: '#ffb35f' },
        { id: UNCATEGORIZED_ID, name: 'Uncategorized', icon: '•', focus: 0, color: '#8b93a4' }
      ],
      actions: [
        { id: 'wellbeing-workout-30', categoryId: 'wellbeing', name: 'Proper workout', baseDamage: 20, type: 'repeatable', trackVisible: true },
        { id: 'wellbeing-walk-20', categoryId: 'wellbeing', name: 'Walk / fresh air', baseDamage: 10, type: 'repeatable', trackVisible: true },
        { id: 'wellbeing-mobility-10', categoryId: 'wellbeing', name: 'Quick movement / stretch', baseDamage: 5, type: 'repeatable', trackVisible: true },
        { id: 'wellbeing-good-meal', categoryId: 'wellbeing', name: 'Proper healthy meal', baseDamage: 10, type: 'once', trackVisible: true },
        { id: 'work-focus-25', categoryId: 'work', name: 'Focus session', baseDamage: 15, type: 'repeatable', trackVisible: true },
        { id: 'work-focus-50', categoryId: 'work', name: 'Deep focus session', baseDamage: 30, type: 'repeatable', trackVisible: true },
        { id: 'work-practice-20', categoryId: 'work', name: 'Practice / skill', baseDamage: 10, type: 'repeatable', trackVisible: true },
        { id: 'work-admin', categoryId: 'work', name: 'Annoying admin task', baseDamage: 10, type: 'once', trackVisible: true },
        { id: 'chores-small', categoryId: 'chores', name: 'Tiny chore', baseDamage: 5, type: 'repeatable', trackVisible: true },
        { id: 'chores-medium', categoryId: 'chores', name: 'Proper chore / cleaning', baseDamage: 10, type: 'repeatable', trackVisible: true },
        { id: 'chores-laundry', categoryId: 'chores', name: 'Laundry', baseDamage: 10, type: 'once', trackVisible: true },
        { id: 'chores-big', categoryId: 'chores', name: 'Big chore / deep clean', baseDamage: 20, type: 'repeatable', trackVisible: true }
      ],
      combos: []
    },
    progression: {
      victoryXp: 0,
      bestStreak: 0,
      archivedStreak: 0,
      streakThrough: ''
    },
    current: {
      date: '',
      maxHp: 0,
      transactions: [],
      comboProgress: {},
      defeatedAt: null,
      victoryXpAwarded: 0,
      dayCard: null
    },
    history: []
  };

  const els = {
    todayLabel: document.querySelector('#todayLabel'),
    newswireViewport: document.querySelector('#newswireViewport'),
    newswireMessage: document.querySelector('#newswireMessage'),
    enemyHp: document.querySelector('#enemyHp'),
    enemyMaxHp: document.querySelector('#enemyMaxHp'),
    totalDamage: document.querySelector('#totalDamage'),
    overkillValue: document.querySelector('#overkillValue'),
    fightFeedback: document.querySelector('#fightFeedback'),
    combosPanel: document.querySelector('#combosPanel'),
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
    dayCardEnemyHp: document.querySelector('#dayCardEnemyHp'),
    dayCardDamage: document.querySelector('#dayCardDamage'),
    dayCardOverkill: document.querySelector('#dayCardOverkill'),
    dayCardCombos: document.querySelector('#dayCardCombos'),
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
    actionSortSelect: document.querySelector('#actionSortSelect'),
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
  let actionDrag = null;
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


  function legacyEnemyHp(candidate) {
    const fullEnemyHp = clampInt(candidate?.settings?.goal, 20, 1000, 100);
    const starterHp = Math.max(
      20,
      Math.min(fullEnemyHp, Math.round((fullEnemyHp * STARTER_HP_RATIO) / 5) * 5)
    );
    if (starterHp >= fullEnemyHp) return fullEnemyHp;

    const clearCount = Array.isArray(candidate?.history)
      ? candidate.history.reduce((count, day) => count + (day?.won ? 1 : 0), 0)
      : 0;
    const rampStep = Math.min(
      HP_RAMP_STEPS,
      Math.floor(clearCount / VICTORIES_PER_RAMP_STEP)
    );
    const progress = rampStep / HP_RAMP_STEPS;
    return Math.min(
      fullEnemyHp,
      Math.max(20, Math.round((starterHp + ((fullEnemyHp - starterHp) * progress)) / 5) * 5)
    );
  }

  function migrateLegacyTransaction(tx) {
    return {
      type: 'action',
      id: String(tx?.id || makeId('tx')).slice(0, 128),
      actionId: String(tx?.actionId || '').slice(0, 128),
      actionName: String(tx?.actionName || 'Action').slice(0, 100),
      categoryId: /^[A-Za-z0-9_-]{1,64}$/.test(String(tx?.categoryId || ''))
        ? String(tx.categoryId)
        : UNCATEGORIZED_ID,
      categoryName: String(tx?.categoryName || 'Uncategorized').slice(0, 80),
      baseDamage: clampInt(tx?.baseXp, 1, 200, 1),
      damage: clampInt(tx?.effectiveXp, 1, 200, 1),
      efficiency: clampNumber(tx?.efficiency, 0.01, 1, 1),
      timestamp: normalizeTimestamp(tx?.timestamp) || Date.now()
    };
  }

  function migrateLegacyDayCard(card, maxHp, damage, won) {
    if (!card || typeof card !== 'object') return null;
    return {
      date: String(card.date || '').slice(0, 10),
      type: String(card.type || (won ? 'VICTORY REPORT' : 'DAILY REPORT')).slice(0, 80),
      headline: String(card.headline || (won ? 'DARK SELF DEFEATED' : 'FIGHT INCOMPLETE')).slice(0, 220),
      copy: String(card.copy || '').slice(0, 500),
      victoryXp: won ? VICTORY_XP : 0,
      enemyHp: clampInt(maxHp, 20, 1000, 100),
      damage: clampInt(damage, 0, 100000, 0),
      overkill: Math.max(0, clampInt(damage, 0, 100000, 0) - clampInt(maxHp, 20, 1000, 100)),
      combos: 0,
      rank: String(card.rank || 'Nobody').slice(0, 40),
      streak: clampInt(card.streak, 0, 1000000, 0)
    };
  }

  function migrateV2State(candidate) {
    const maxHp = candidate?.current?.date ? legacyEnemyHp(candidate) : 0;
    const currentDamage = Array.isArray(candidate?.current?.transactions)
      ? candidate.current.transactions.reduce((sum, tx) => sum + clampInt(tx?.effectiveXp, 0, 200, 0), 0)
      : 0;
    const currentWon = Boolean(candidate?.current?.clearedAt);
    const historicalVictories = Array.isArray(candidate?.history)
      ? candidate.history.reduce((count, day) => count + (day?.won ? 1 : 0), 0)
      : 0;

    return {
      version: STATE_VERSION,
      settings: {
        fullEnemyHp: clampInt(candidate?.settings?.goal, 20, 1000, 100),
        categories: deepClone(Array.isArray(candidate?.settings?.categories)
          ? candidate.settings.categories
          : DEFAULT_STATE.settings.categories),
        actions: (Array.isArray(candidate?.settings?.actions)
          ? candidate.settings.actions
          : DEFAULT_STATE.settings.actions
        ).map(action => ({
          id: action?.id,
          categoryId: action?.categoryId,
          name: action?.name,
          baseDamage: action?.baseXp,
          type: action?.type,
          trackVisible: action?.trackVisible
        })),
        combos: []
      },
      progression: {
        victoryXp: VICTORY_XP * (historicalVictories + (currentWon ? 1 : 0)),
        bestStreak: candidate?.progression?.bestStreak,
        archivedStreak: candidate?.progression?.archivedStreak,
        streakThrough: candidate?.progression?.streakThrough
      },
      current: {
        date: candidate?.current?.date || '',
        maxHp,
        transactions: Array.isArray(candidate?.current?.transactions)
          ? candidate.current.transactions.map(migrateLegacyTransaction)
          : [],
        comboProgress: {},
        defeatedAt: normalizeTimestamp(candidate?.current?.clearedAt),
        victoryXpAwarded: currentWon ? VICTORY_XP : 0,
        dayCard: migrateLegacyDayCard(candidate?.current?.dayCard, maxHp || 100, currentDamage, currentWon)
      },
      history: Array.isArray(candidate?.history)
        ? candidate.history.map(day => {
          const dayMaxHp = clampInt(day?.goal, 20, 1000, 100);
          const damage = clampInt(day?.xp, 0, 100000, 0);
          return {
            date: day?.date,
            damage,
            baseDamage: clampInt(day?.baseXp, 0, 100000, 0),
            maxHp: dayMaxHp,
            won: Boolean(day?.won),
            categoryDamage: day?.categoryXp,
            categoryBaseDamage: day?.categoryBaseXp,
            defeatedAt: normalizeTimestamp(day?.clearedAt),
            victoryXp: day?.won ? VICTORY_XP : 0,
            combosLanded: 0,
            overkill: Math.max(0, damage - dayMaxHp),
            dayCard: migrateLegacyDayCard(day?.dayCard, dayMaxHp, damage, Boolean(day?.won)),
            transactions: Array.isArray(day?.transactions)
              ? day.transactions.map(migrateLegacyTransaction)
              : []
          };
        })
        : []
    };
  }

  function normalizeState(candidate) {
    if (candidate?.version === 2) candidate = migrateV2State(candidate);
    if (!candidate || candidate.version !== STATE_VERSION) return freshState();

    const next = freshState();
    next.settings.fullEnemyHp = clampInt(candidate.settings?.fullEnemyHp, 20, 1000, 100);

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

    const categoryIds = new Set(next.settings.categories.map(category => category.id));
    const sourceActions = Array.isArray(candidate.settings?.actions)
      ? candidate.settings.actions
      : DEFAULT_STATE.settings.actions;
    const actionIds = new Set();
    next.settings.actions = sourceActions.slice(0, 500).map((action, index) => {
      let id = String(action?.id || `action-${index + 1}`).slice(0, 128);
      if (!id || actionIds.has(id)) id = makeId('action');
      actionIds.add(id);
      let name = String(action?.name || 'Unnamed action').slice(0, 100);
      const migration = DEFAULT_ACTION_NAME_MIGRATIONS[id];
      if (migration && name === migration[0]) name = migration[1];
      return {
        id,
        categoryId: categoryIds.has(String(action?.categoryId)) ? String(action.categoryId) : UNCATEGORIZED_ID,
        name,
        baseDamage: clampInt(action?.baseDamage, 1, 200, 10),
        type: action?.type === 'once' ? 'once' : 'repeatable',
        trackVisible: action?.trackVisible !== false
      };
    });

    const normalizedActionIds = new Set(next.settings.actions.map(action => action.id));
    const comboIds = new Set();
    const enabledSequences = new Set();
    next.settings.combos = (Array.isArray(candidate.settings?.combos) ? candidate.settings.combos : [])
      .slice(0, 100)
      .map((combo, index) => {
        let id = String(combo?.id || `combo-${index + 1}`).slice(0, 128);
        if (!id || comboIds.has(id)) id = makeId('combo');
        comboIds.add(id);
        const actionIds = (Array.isArray(combo?.actionIds) ? combo.actionIds : [])
          .slice(0, COMBO_MAX_STEPS)
          .map(value => String(value))
          .filter(actionId => normalizedActionIds.has(actionId));
        let enabled = combo?.enabled !== false && actionIds.length >= 2;
        const fingerprint = actionIds.join('\u001f');
        if (enabled && enabledSequences.has(fingerprint)) enabled = false;
        if (enabled) enabledSequences.add(fingerprint);
        return {
          id,
          name: String(combo?.name || `Combo ${index + 1}`).slice(0, 80),
          multiplier: clampNumber(combo?.multiplier, COMBO_MIN_MULTIPLIER, COMBO_MAX_MULTIPLIER, COMBO_DEFAULT_MULTIPLIER),
          enabled,
          actionIds
        };
      });

    next.progression.victoryXp = clampInt(candidate.progression?.victoryXp, 0, 1000000000, 0);
    next.progression.bestStreak = clampInt(candidate.progression?.bestStreak, 0, 1000000, 0);
    next.progression.archivedStreak = clampInt(candidate.progression?.archivedStreak, 0, 1000000, 0);
    next.progression.streakThrough = /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.progression?.streakThrough || ''))
      ? String(candidate.progression.streakThrough)
      : '';

    next.history = Array.isArray(candidate.history)
      ? candidate.history.slice(0, HISTORY_LIMIT).map(normalizeHistoryDay).filter(Boolean)
      : [];
    next.current.date = /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.current?.date || ''))
      ? String(candidate.current.date)
      : '';
    next.current.maxHp = next.current.date
      ? clampInt(candidate.current?.maxHp, 20, 1000, enemyHpForClearCount(next.settings, next.history.filter(day => day.won).length))
      : 0;
    next.current.transactions = normalizeTransactions(candidate.current?.transactions);
    next.current.defeatedAt = normalizeTimestamp(candidate.current?.defeatedAt);
    next.current.victoryXpAwarded = next.current.defeatedAt
      ? clampInt(candidate.current?.victoryXpAwarded, 0, VICTORY_XP, VICTORY_XP)
      : 0;
    next.current.dayCard = normalizeDayCard(candidate.current?.dayCard);

    const comboIdSet = new Set(next.settings.combos.map(combo => combo.id));
    const transactionIds = new Set(next.current.transactions.filter(tx => tx.type === 'action').map(tx => tx.id));
    const rawProgress = candidate.current?.comboProgress;
    next.current.comboProgress = {};
    if (rawProgress && typeof rawProgress === 'object') {
      Object.entries(rawProgress).forEach(([comboId, progress]) => {
        if (!comboIdSet.has(comboId)) return;
        const combo = next.settings.combos.find(item => item.id === comboId);
        const sources = (Array.isArray(progress?.sourceTransactionIds) ? progress.sourceTransactionIds : [])
          .map(String)
          .filter(id => transactionIds.has(id))
          .slice(0, Math.max(0, combo.actionIds.length - 1));
        const index = Math.min(sources.length, clampInt(progress?.index, 0, Math.max(0, combo.actionIds.length - 1), sources.length));
        next.current.comboProgress[comboId] = { index, sourceTransactionIds: sources.slice(0, index) };
      });
    }
    return next;
  }

  function normalizeTimestamp(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  function normalizeTransactions(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 3000).map(tx => {
      const type = tx?.type === 'combo' ? 'combo' : 'action';
      if (type === 'combo') {
        return {
          type,
          id: String(tx?.id || makeId('combo-tx')).slice(0, 128),
          comboId: String(tx?.comboId || '').slice(0, 128),
          comboName: String(tx?.comboName || 'Combo').slice(0, 80),
          multiplier: clampNumber(tx?.multiplier, COMBO_MIN_MULTIPLIER, COMBO_MAX_MULTIPLIER, COMBO_DEFAULT_MULTIPLIER),
          damage: clampInt(tx?.damage, 1, 100000, 1),
          sourceTransactionIds: (Array.isArray(tx?.sourceTransactionIds) ? tx.sourceTransactionIds : []).map(id => String(id).slice(0, 128)).slice(0, COMBO_MAX_STEPS),
          timestamp: normalizeTimestamp(tx?.timestamp) || Date.now()
        };
      }
      return {
        type,
        id: String(tx?.id || makeId('tx')).slice(0, 128),
        actionId: String(tx?.actionId || '').slice(0, 128),
        actionName: String(tx?.actionName || 'Action').slice(0, 100),
        categoryId: /^[A-Za-z0-9_-]{1,64}$/.test(String(tx?.categoryId || '')) ? String(tx.categoryId) : UNCATEGORIZED_ID,
        categoryName: String(tx?.categoryName || 'Uncategorized').slice(0, 80),
        baseDamage: clampInt(tx?.baseDamage, 1, 200, 1),
        damage: clampInt(tx?.damage, 1, 200, 1),
        efficiency: clampNumber(tx?.efficiency, 0.01, 1, 1),
        timestamp: normalizeTimestamp(tx?.timestamp) || Date.now()
      };
    });
  }

  function normalizeDayCard(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      date: String(value.date || '').slice(0, 10),
      type: String(value.type || 'VICTORY REPORT').slice(0, 80),
      headline: String(value.headline || 'DARK SELF DEFEATED').slice(0, 220),
      copy: String(value.copy || '').slice(0, 500),
      victoryXp: clampInt(value.victoryXp, 0, VICTORY_XP, 0),
      enemyHp: clampInt(value.enemyHp, 20, 1000, 100),
      damage: clampInt(value.damage, 0, 100000, 0),
      overkill: clampInt(value.overkill, 0, 100000, 0),
      combos: clampInt(value.combos, 0, 10000, 0),
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
        if (/^[A-Za-z0-9_-]{1,64}$/.test(key)) result[key] = clampInt(amount, 0, 100000, 0);
      });
      return result;
    };
    const maxHp = clampInt(day?.maxHp, 20, 1000, 100);
    const damage = clampInt(day?.damage, 0, 100000, 0);
    return {
      date,
      damage,
      baseDamage: clampInt(day?.baseDamage, 0, 100000, 0),
      maxHp,
      won: Boolean(day?.won),
      categoryDamage: cleanMap(day?.categoryDamage),
      categoryBaseDamage: cleanMap(day?.categoryBaseDamage),
      defeatedAt: normalizeTimestamp(day?.defeatedAt),
      victoryXp: clampInt(day?.victoryXp, 0, VICTORY_XP, day?.won ? VICTORY_XP : 0),
      combosLanded: clampInt(day?.combosLanded, 0, 10000, 0),
      overkill: clampInt(day?.overkill, 0, 100000, Math.max(0, damage - maxHp)),
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
      if (!parsed || ![2, STATE_VERSION].includes(parsed.version)) return null;
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


  function getPriorVictoryCount() {
    return state.history.reduce((count, day) => count + (day.won ? 1 : 0), 0);
  }

  function enemyHpForClearCount(settings, victoryCount) {
    const fullEnemyHp = clampInt(settings.fullEnemyHp, 20, 1000, 100);
    const starterHp = Math.max(
      20,
      Math.min(fullEnemyHp, Math.round((fullEnemyHp * STARTER_HP_RATIO) / 5) * 5)
    );
    if (starterHp >= fullEnemyHp) return fullEnemyHp;

    const rampStep = Math.min(
      HP_RAMP_STEPS,
      Math.floor(Math.max(0, victoryCount) / VICTORIES_PER_RAMP_STEP)
    );
    const progress = rampStep / HP_RAMP_STEPS;
    return Math.min(
      fullEnemyHp,
      Math.max(20, Math.round((starterHp + ((fullEnemyHp - starterHp) * progress)) / 5) * 5)
    );
  }

  function getEnemyHp(settings = state.settings) {
    return enemyHpForClearCount(settings, getPriorVictoryCount());
  }

  function getHpRampInfo(settings = state.settings) {
    const fullEnemyHp = clampInt(settings.fullEnemyHp, 20, 1000, 100);
    const nextFightHp = getEnemyHp(settings);
    const victoryCount = getPriorVictoryCount();
    const victoriesToMature = HP_RAMP_STEPS * VICTORIES_PER_RAMP_STEP;
    return {
      fullEnemyHp,
      nextFightHp,
      victoryCount,
      victoriesToMature,
      active: nextFightHp < fullEnemyHp
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
    const hpReference = settings === state.settings && state.current.maxHp
      ? state.current.maxHp
      : getEnemyHp(settings);
    return Math.max(1, hpReference * (category.focus / totalFocus));
  }

  function currentCategoryIdForTransaction(tx) {
    return state.settings.categories.some(category => category.id === tx.categoryId)
      ? tx.categoryId
      : UNCATEGORIZED_ID;
  }

  function getSummary() {
    const categoryDamage = Object.fromEntries(state.settings.categories.map(category => [category.id, 0]));
    const categoryBaseDamage = Object.fromEntries(state.settings.categories.map(category => [category.id, 0]));
    let totalDamage = 0;
    let totalBaseDamage = 0;
    let comboDamage = 0;
    let combosLanded = 0;

    state.current.transactions.forEach(tx => {
      totalDamage += tx.damage;
      if (tx.type === 'combo') {
        comboDamage += tx.damage;
        combosLanded += 1;
        return;
      }

      const categoryId = currentCategoryIdForTransaction(tx);
      totalBaseDamage += tx.baseDamage;
      categoryDamage[categoryId] = (categoryDamage[categoryId] || 0) + tx.damage;
      categoryBaseDamage[categoryId] = (categoryBaseDamage[categoryId] || 0) + tx.baseDamage;
    });

    const maxHp = Math.max(20, state.current.maxHp || getEnemyHp());
    const currentHp = Math.max(0, maxHp - totalDamage);
    const overkill = Math.max(0, totalDamage - maxHp);

    return {
      totalDamage,
      totalBaseDamage,
      comboDamage,
      combosLanded,
      categoryDamage,
      categoryBaseDamage,
      maxHp,
      currentHp,
      overkill,
      isVictory: totalDamage >= maxHp
    };
  }

  function calculateDamage(action, usedBaseDamage = null, settings = state.settings) {
    const baseDamage = action.baseDamage;
    const categoryId = action.categoryId;

    if (categoryId === UNCATEGORIZED_ID || !settings.categories.some(category => category.id === categoryId)) {
      const raw = baseDamage * UNCATEGORIZED_EFFICIENCY;
      return {
        baseDamage,
        damage: Math.max(1, Math.round(raw)),
        efficiency: UNCATEGORIZED_EFFICIENCY,
        raw
      };
    }

    const summary = usedBaseDamage === null ? getSummary() : null;
    let cursor = usedBaseDamage === null ? (summary.categoryBaseDamage[categoryId] || 0) : usedBaseDamage;
    const band = getFocusBand(categoryId, settings);
    let remaining = baseDamage;
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

    const damage = Math.max(1, Math.round(raw));
    return {
      baseDamage,
      damage,
      efficiency: Math.max(0.01, Math.min(1, raw / Math.max(1, baseDamage))),
      raw
    };
  }

  function getCategoryEfficiency(categoryId, usedBaseDamage) {
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
    if (usedBaseDamage < band) {
      return { multiplier: 1, tier: 0, progress: usedBaseDamage / band, untilNext: band - usedBaseDamage, band };
    }
    if (usedBaseDamage < band * 2) {
      return { multiplier: 0.8, tier: 1, progress: (usedBaseDamage - band) / band, untilNext: band * 2 - usedBaseDamage, band };
    }
    if (usedBaseDamage < band * 3) {
      return { multiplier: 0.6, tier: 2, progress: (usedBaseDamage - band * 2) / band, untilNext: band * 3 - usedBaseDamage, band };
    }
    return { multiplier: 0.4, tier: 3, progress: 1, untilNext: null, band };
  }

  function hasCompletedOnceAction(actionId) {
    return state.current.transactions.some(tx => tx.type === 'action' && tx.actionId === actionId);
  }

  function comboProgress(comboId) {
    return state.current.comboProgress[comboId] || { index: 0, sourceTransactionIds: [] };
  }

  function processCombosForAction(actionTx) {
    const completions = [];
    const actionTransactions = new Map(
      state.current.transactions
        .filter(tx => tx.type === 'action')
        .map(tx => [tx.id, tx])
    );

    state.settings.combos.forEach(combo => {
      if (!combo.enabled || combo.actionIds.length < 2) {
        delete state.current.comboProgress[combo.id];
        return;
      }

      const progress = comboProgress(combo.id);
      const expectedActionId = combo.actionIds[progress.index] || combo.actionIds[0];
      if (actionTx.actionId !== expectedActionId) return;

      const sourceTransactionIds = [...progress.sourceTransactionIds, actionTx.id];
      const nextIndex = progress.index + 1;

      if (nextIndex < combo.actionIds.length) {
        state.current.comboProgress[combo.id] = {
          index: nextIndex,
          sourceTransactionIds
        };
        return;
      }

      const sequenceDamage = sourceTransactionIds.reduce(
        (sum, id) => sum + (actionTransactions.get(id)?.damage || 0),
        0
      );
      const bonusDamage = Math.max(1, Math.round(sequenceDamage * (combo.multiplier - 1)));
      completions.push({ combo, sourceTransactionIds, sequenceDamage, bonusDamage });
      state.current.comboProgress[combo.id] = { index: 0, sourceTransactionIds: [] };
    });

    if (!completions.length) return null;

    completions.sort((a, b) => b.bonusDamage - a.bonusDamage || b.combo.multiplier - a.combo.multiplier);
    const winner = completions[0];
    const event = {
      type: 'combo',
      id: makeId('combo-tx'),
      comboId: winner.combo.id,
      comboName: winner.combo.name,
      multiplier: Number(winner.combo.multiplier.toFixed(2)),
      damage: winner.bonusDamage,
      sourceTransactionIds: winner.sourceTransactionIds,
      timestamp: Date.now() + 1
    };
    state.current.transactions.push(event);
    return event;
  }

  function completedDateSet() {
    const set = new Set(state.history.filter(day => day.won).map(day => day.date));
    if (state.current.defeatedAt) set.add(state.current.date);
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

    if (state.current.defeatedAt && state.current.date === today) {
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
    const lifetimeXp = state.progression.victoryXp;
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
      damage: summary.totalDamage,
      baseDamage: summary.totalBaseDamage,
      maxHp: summary.maxHp,
      won: summary.isVictory,
      categoryDamage: summary.categoryDamage,
      categoryBaseDamage: summary.categoryBaseDamage,
      defeatedAt: state.current.defeatedAt,
      victoryXp: state.current.victoryXpAwarded,
      combosLanded: summary.combosLanded,
      overkill: summary.overkill,
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
      state.current = {
        date: today,
        maxHp: getEnemyHp(),
        transactions: [],
        comboProgress: {},
        defeatedAt: null,
        victoryXpAwarded: 0,
        dayCard: null
      };
      saveState();
      return;
    }

    if (state.current.date === today) return;

    archiveCurrentDay();
    state.current = {
      date: today,
      maxHp: getEnemyHp(),
      transactions: [],
      comboProgress: {},
      defeatedAt: null,
      victoryXpAwarded: 0,
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
        base: summary.categoryBaseDamage[category.id] || 0
      }))
      .filter(category => category.base > 0)
      .sort((a, b) => b.base - a.base);

    const total = active.reduce((sum, category) => sum + category.base, 0) || 1;
    const dominant = active[0] || { id: UNCATEGORIZED_ID, name: 'Uncategorized', base: 0 };
    const share = dominant.base / total;

    if (summary.overkill >= Math.max(10, summary.maxHp * 0.5)) {
      return { key: 'overkill', type: 'EXCESSIVE FORCE', dominant };
    }
    if (summary.combosLanded >= 2) {
      return { key: 'combo', type: 'COMBO OFFENDER', dominant };
    }
    if (share >= 0.9 && active.length > 0) {
      return { key: 'one-track', type: 'ONE-TRACK ASSAILANT', dominant };
    }
    if (summary.overkill <= Math.max(2, Math.round(summary.maxHp * 0.05))) {
      return { key: 'barely', type: 'TECHNICALLY VICTORIOUS', dominant };
    }
    if (active.length >= 3 && share < 0.46) {
      return { key: 'balanced', type: 'MULTI-VECTOR THREAT', dominant };
    }
    if (dominant.id === 'work') return { key: 'work', type: 'CORPORATE COMBATANT', dominant };
    if (dominant.id === 'chores') return { key: 'chores', type: 'DOMESTIC MENACE', dominant };
    if (dominant.id === 'wellbeing') return { key: 'wellbeing', type: 'WELLNESS ENFORCER', dominant };
    return { key: 'custom', type: `${dominant.name.toUpperCase().slice(0, 48)} SPECIALIST`, dominant };
  }

  function headlineContent(personality, summary) {
    const category = personality.dominant.name;
    const pools = {
      overkill: [
        ['DARK SELF DEFEATED; USER CONTINUES HITTING IT FOR ADMINISTRATIVE REASONS', `${summary.overkill} points of overkill were recorded. Authorities insist this was probably unnecessary.`],
        ['INTERNAL HOSTILITY ENDS IN DISPROPORTIONATE RESPONSE', 'Crestfallen observers describe the damage total as “legally a bit much.”'],
        ['DARK YOU FILES COMPLAINT AFTER FIGHT ALREADY OVER', 'mo.les.tech confirms there is currently no appeals process for hostile internal entities.']
      ],
      combo: [
        ['COMBO ACTIVITY LINKED TO COLLAPSE OF LOCAL DARKNESS', `${summary.combosLanded} combo attacks landed before the paperwork could intervene.`],
        ['ORDERED BEHAVIOR PRODUCES ALARMING RESULTS', 'Investigators say several unrelated responsible decisions may have been coordinated.'],
        ['DARK YOU CLAIMS ACTION SEQUENCE WAS “CHEAP”', 'Officials reviewed the footage and awarded the damage anyway.']
      ],
      'one-track': [
        [`${category.toUpperCase()} USED REPEATEDLY IN SUSTAINED ASSAULT`, 'Experts confirm other life categories remained available throughout the incident.'],
        ['ONE-TRACK STRATEGY SOMEHOW WORKS', `Nearly every road today led through ${category}, with progressively less efficient results.`],
        [`${category.toUpperCase()} MONOPOLIZES DAILY OFFENSIVE`, 'Diversification was reportedly discussed and immediately ignored.']
      ],
      barely: [
        ['DARK SELF DEFEATED BY MARGIN TOO SMALL TO PROSECUTE', 'Officials confirm that zero remaining HP is still zero remaining HP.'],
        ['CITIZEN WINS FIGHT; FORENSIC TEAM REQUESTS MAGNIFYING GLASS', 'The final margin was narrow enough to qualify as paperwork.'],
        ['MINIMUM VIABLE VIOLENCE DECLARED A VICTORY', 'The enemy is down. The method will not be entered into textbooks.']
      ],
      balanced: [
        ['DARK SELF ATTACKED FROM SUSPICIOUS NUMBER OF LIFE AREAS', 'Investigators found damage from several categories and no obvious single motive.'],
        ['MULTIPLE RESPONSIBILITIES COOPERATE IN INTERNAL TAKEDOWN', 'Crestfallen officials call cross-category coordination statistically unsettling.'],
        ['BALANCED ASSAULT LEAVES DARK YOU WITH NOWHERE TO HIDE', 'No single category received enough attention to claim full credit.']
      ],
      work: [
        ['WORK-RELATED DAMAGE FORCES DARK SELF INTO LIQUIDATION', 'Management has already scheduled a meeting to claim responsibility.'],
        ['PRODUCTIVITY USED AS BLUNT INSTRUMENT', 'mo.les.tech representatives describe the incident as a promising compliance signal.'],
        ['LOCAL OFFICE WORKER WEAPONIZES FOCUS', 'The hostile internal entity was unavailable for comment because apparently there was more work.']
      ],
      chores: [
        ['DOMESTIC TASKS USED IN SUCCESSFUL INTERNAL ASSAULT', 'Several surfaces and one dark self were reportedly left in worse condition than before.'],
        ['LAUNDRY-ADJACENT ACTIVITY SHAKES LOCAL DARKNESS', 'One chair may finally be used as a chair again.'],
        ['HOUSEHOLD ORDER RESTORED; INTERNAL ENTITY NOT SO LUCKY', 'Entropy remains at large despite one confirmed casualty.']
      ],
      wellbeing: [
        ['SELF-CARE SOMEHOW COUNTS AS ATTACK DAMAGE', 'Legal scholars are reviewing whether this creates a conflict of interest.'],
        ['LOCAL BODY RECEIVES MAINTENANCE; DARK SELF RECEIVES CONSEQUENCES', 'Hydration and movement were both mentioned in the incident report.'],
        ['WELLBEING ACTIVITY PROVES HOSTILE TO INTERNAL DARKNESS', 'Officials are monitoring the situation for signs of optimism.']
      ],
      custom: [
        [`${category.toUpperCase()} DAMAGE SURGES ACROSS ONE HOUSEHOLD`, 'The city has formed a committee and will report back in six to eight months.'],
        [`LOCAL SPECIALIST WEAPONIZES ${category.toUpperCase()}`, 'No permit was found, but the damage appears valid.'],
        [`${category.toUpperCase()} SECTOR CLAIMS CREDIT FOR DARK SELF DEFEAT`, 'Analysts have upgraded the day from “ongoing” to “victorious.”']
      ]
    };

    return deterministicPick(
      pools[personality.key] || pools.custom,
      `${state.current.date}|${personality.key}|${summary.totalDamage}|${summary.combosLanded}`
    );
  }

  function createDayCard(summary) {
    const personality = getDayPersonality(summary);
    const [headline, copy] = headlineContent(personality, summary);
    const rank = getRank(getStreetCred());
    const streak = getCurrentStreak();

    return {
      date: state.current.date,
      type: personality.type,
      headline,
      copy,
      victoryXp: state.current.victoryXpAwarded,
      enemyHp: summary.maxHp,
      damage: summary.totalDamage,
      overkill: summary.overkill,
      combos: summary.combosLanded,
      rank: rank.name,
      streak
    };
  }

  function finalizeVictoryIfNeeded() {
    const summary = getSummary();

    if (!summary.isVictory) {
      if (state.current.victoryXpAwarded > 0) {
        state.progression.victoryXp = Math.max(
          0,
          state.progression.victoryXp - state.current.victoryXpAwarded
        );
      }
      state.current.defeatedAt = null;
      state.current.victoryXpAwarded = 0;
      state.current.dayCard = null;
      return false;
    }

    const justDefeated = !state.current.defeatedAt;
    if (justDefeated) state.current.defeatedAt = Date.now();

    if (state.current.victoryXpAwarded !== VICTORY_XP) {
      const delta = VICTORY_XP - state.current.victoryXpAwarded;
      state.progression.victoryXp = Math.max(0, state.progression.victoryXp + delta);
      state.current.victoryXpAwarded = VICTORY_XP;
    }

    state.current.dayCard = createDayCard(summary);
    return justDefeated;
  }

  function addDamage(actionId) {
    ensureToday();

    const action = state.settings.actions.find(item => item.id === actionId);
    if (!action) return;
    if (action.type === 'once' && hasCompletedOnceAction(action.id)) return;

    const category = state.settings.categories.find(item => item.id === action.categoryId)
      || uncategorizedCategory();
    const reward = calculateDamage(action);

    const actionTx = {
      type: 'action',
      id: makeId('tx'),
      actionId: action.id,
      actionName: action.name,
      categoryId: category.id,
      categoryName: category.name,
      baseDamage: action.baseDamage,
      damage: reward.damage,
      efficiency: Number(reward.efficiency.toFixed(4)),
      timestamp: Date.now()
    };
    state.current.transactions.push(actionTx);

    const comboEvent = processCombosForAction(actionTx);
    const justDefeated = finalizeVictoryIfNeeded();
    saveState();
    render({
      showDayCard: justDefeated,
      justDefeated,
      hitDamage: actionTx.damage,
      hitName: actionTx.actionName,
      comboEvent
    });
  }

  function undoTransaction(transactionId) {
    const target = state.current.transactions.find(tx => tx.id === transactionId && tx.type === 'action');
    if (!target) return;

    state.current.transactions = state.current.transactions.filter(tx => (
      tx.id !== transactionId
      && !(tx.type === 'combo' && tx.sourceTransactionIds.includes(transactionId))
    ));

    Object.entries(state.current.comboProgress).forEach(([comboId, progress]) => {
      if (progress.sourceTransactionIds.includes(transactionId)) {
        state.current.comboProgress[comboId] = { index: 0, sourceTransactionIds: [] };
      }
    });

    finalizeVictoryIfNeeded();
    saveState();
    render();
  }

  function categoryColor(category, index = 0) {
    if (!category) return fallbackCategoryColor('', index);
    if (category.id === UNCATEGORIZED_ID) return DEFAULT_CATEGORY_COLORS.uncategorized;
    return normalizeHexColor(category.color, fallbackCategoryColor(category.id, index));
  }

  function applyCategoryPaletteVars(element, category, index = 0) {
    if (!element) return;
    const palette = categoryPalette(categoryColor(category, index));
    element.style.setProperty('--category-color', palette.accent);
    element.style.setProperty('--category-source', palette.source);
    element.style.setProperty('--category-panel', palette.panel);
    element.style.setProperty('--category-panel-alt', palette.panelAlt);
    element.style.setProperty('--category-surface', palette.surface);
    element.style.setProperty('--category-border', palette.border);
    element.style.setProperty('--category-glow', palette.glow);
  }



  function getDominantCategory(summary) {
    return state.settings.categories
      .filter(category => category.id !== UNCATEGORIZED_ID)
      .map(category => ({
        ...category,
        baseDamage: summary.categoryBaseDamage[category.id] || 0
      }))
      .sort((a, b) => b.baseDamage - a.baseDamage)[0] || null;
  }

  function getNewswireMessages(summary) {
    const messages = [];
    const remaining = summary.currentHp;
    const damageRatio = summary.totalDamage / Math.max(1, summary.maxHp);
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
        'DARK YOU DEFEATED; MOLIFE RELUCTANTLY AUTHORIZES 20 XP',
        `${summary.totalDamage} DAMAGE RECORDED; HOSTILE INTERNAL ENTITY NO LONGER OPERATIONAL`,
        summary.overkill > 0
          ? `${summary.overkill} POINTS OF OVERKILL RECORDED; AUTHORITIES DECLINE TO INVESTIGATE`
          : 'DARK YOU REACHES EXACTLY ZERO HP; ACCOUNTANTS DESCRIBE RESULT AS DISTURBINGLY TIDY'
      );

      if (summary.combosLanded > 0) {
        messages.push(`${summary.combosLanded} COMBO ATTACK${summary.combosLanded === 1 ? '' : 'S'} LANDED; INTERNAL DARKNESS ALLEGES COLLUSION`);
      }
      if (streak >= 3) {
        messages.push(`${streak}-DAY VICTORY STREAK CONTINUES; SITUATION NOW TOO EXPENSIVE TO ABANDON`);
      }
      if (rank.name !== 'Nobody') {
        messages.push(`STREET CRED OFFICE RELUCTANTLY CONFIRMS ${rank.name.toUpperCase()} STATUS`);
      }
    } else if (summary.totalDamage === 0) {
      messages.push(
        'DARK YOU ENTERS DAY AT FULL HEALTH; CONFIDENCE DESCRIBED AS PREMATURE',
        'USER HAS OPENED MOLIFE. HOSTILITIES HAVE NOT YET COMMENCED.',
        'TRACK-O-TRON STANDING BY. IT CANNOT, LEGALLY, DO THE TASKS FOR YOU.',
        `HOSTILE INTERNAL ENTITY CURRENTLY REPORTS ${summary.maxHp} / ${summary.maxHp} HP`
      );
      if (hour >= 18) messages.push('EVENING UPDATE: DARK YOU REMAINS EMBARRASSINGLY UNINJURED');
    } else if (damageRatio < 0.25) {
      messages.push(
        `LOCAL ACTIONS INFLICT ${summary.totalDamage} DAMAGE; USER IMMEDIATELY EXPECTS RECOGNITION`,
        `DARK YOU STILL HAS ${remaining} HP; AUTHORITIES DESCRIBE PROGRESS AS ADORABLE`
      );
    } else if (damageRatio < 0.5) {
      messages.push(
        `DARK YOU DOWN TO ${remaining} HP; CONFIDENCE REMAINS UNAUTHORIZED`,
        'DAMAGE DETECTED. EXPERTS CAUTION AGAINST CALLING IT A HABIT.'
      );
    } else if (damageRatio < 0.75) {
      messages.push(
        'DEVELOPING: DEFEATING YOURSELF HAS BECOME AN EMBARRASSINGLY REALISTIC POSSIBILITY',
        `DARK YOU AT ${remaining} HP; LOCAL EXCUSES BEGIN LOSING CREDIBILITY`
      );
    } else {
      messages.push(
        `DARK YOU DOWN TO ${remaining} HP; EXCUSES DEPARTMENT REQUESTS EMERGENCY FUNDING`,
        'NEWSROOM PREPARES RELUCTANT “VICTORY” GRAPHIC'
      );
    }

    const ramp = getHpRampInfo();
    if (state.current.maxHp < state.settings.fullEnemyHp) {
      messages.push(
        `STARTER PROTOCOL ACTIVE: TODAY'S DARK YOU SPAWNED WITH ${state.current.maxHp} HP. FULL STRENGTH IS ${ramp.fullEnemyHp} HP.`
      );
    }

    if (!summary.isVictory && hour >= 22) {
      messages.push('LATE BULLETIN: DARK YOU HAS NOT GONE TO BED JUST BECAUSE YOU WANT TO');
    }

    if (yesterday) {
      messages.push(
        yesterday.won
          ? 'ARCHIVES CONFIRM YESTERDAY’S DARK YOU WAS DEFEATED. TODAY’S HAS BEEN INFORMED.'
          : 'ARCHIVES CONFIRM YESTERDAY’S FIGHT REMAINS OFFICIALLY UNRESOLVED'
      );
    }

    if (streak >= 7) {
      messages.push(`LOCAL OVERACHIEVER'S ${streak}-DAY VICTORY STREAK ENTERS “THIS IS GETTING PERSONAL” TERRITORY`);
    } else if (!streak && best >= 7) {
      messages.push(`FORMER ${best}-DAY STREAK NOW PRESERVED IN MUSEUM CONDITIONS`);
    }

    if (cred === 0) {
      messages.push('STREET CRED REMAINS WITHIN LEGAL DEFINITION OF “NONE”');
    } else if (rank.next) {
      messages.push(`${rank.name.toUpperCase()} STATUS ACTIVE; ${Math.max(0, rank.next.min - cred)} MORE VICTORIES TO NEXT BAD DECISION`);
    } else {
      messages.push('HEAD HONCHO STATUS CONFIRMED; POWER APPEARS TO HAVE GONE TO USER’S HEAD');
    }

    if (dominant && dominant.baseDamage > 0) {
      const efficiency = getCategoryEfficiency(dominant.id, dominant.baseDamage);
      if (efficiency.multiplier <= 0.6) {
        messages.push(`TRACK-O-TRON REPORTS ${dominant.name.toUpperCase()} SATURATION; DARK YOU HAS DEVELOPED RESISTANCE`);
      } else {
        messages.push(`${dominant.name.toUpperCase()} CURRENTLY LEADS LOCAL DAMAGE MARKETS`);
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
    renderCombos();
    renderLog();
    renderHistory();

    let specialMessage = '';
    if (options.comboEvent) {
      specialMessage = `${options.comboEvent.comboName.toUpperCase()} COMBO LANDS; LOCAL DARKNESS TAKES ADDITIONAL ${options.comboEvent.damage} DAMAGE`;
    } else if (options.justDefeated) {
      specialMessage = '…WE HAVE RECEIVED UPDATED INFORMATION. DARK YOU IS DOWN. VICTORY +20 XP.';
    } else if (options.hitDamage && options.hitName) {
      specialMessage = `${options.hitName.toUpperCase()} INFLICTS ${options.hitDamage} DAMAGE ON HOSTILE INTERNAL ENTITY`;
    }
    refreshNewswire(summary, specialMessage);

    if (summary.isVictory && !wasVictory) {
      els.victoryBanner.classList.remove('victory-pop');
      requestAnimationFrame(() => els.victoryBanner.classList.add('victory-pop'));
    }

    if (options.hitDamage) {
      showFightFeedback(options.hitDamage, options.comboEvent);
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

  function showFightFeedback(hitDamage, comboEvent = null) {
    if (!els.fightFeedback) return;
    els.fightFeedback.textContent = comboEvent
      ? `-${hitDamage} HP · COMBO +${comboEvent.damage} DMG`
      : `-${hitDamage} HP`;
    els.fightFeedback.classList.remove('fight-feedback-pop', 'is-combo');
    void els.fightFeedback.offsetWidth;
    if (comboEvent) els.fightFeedback.classList.add('is-combo');
    els.fightFeedback.classList.add('fight-feedback-pop');
  }

  function renderHero(summary) {
    els.todayLabel.textContent = formatDate(state.current.date, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    els.enemyHp.textContent = summary.currentHp;
    els.enemyMaxHp.textContent = summary.maxHp;
    els.totalDamage.textContent = summary.totalDamage;
    els.overkillValue.textContent = summary.overkill;

    const healthRatio = Math.max(0, Math.min(1, summary.currentHp / Math.max(1, summary.maxHp)));
    const healthPercent = Math.round(healthRatio * 100);
    els.totalProgress.style.width = `${healthPercent}%`;
    els.xpOrb.style.setProperty('--progress', `${healthRatio * 360}deg`);
    els.orbPercent.textContent = summary.isVictory ? '0%' : `${healthPercent}%`;

    if (summary.isVictory) {
      els.statusBadge.textContent = 'DEFEATED';
      els.heroMessage.textContent = summary.overkill > 0
        ? `Dark You is down. ${summary.overkill} overkill recorded. Further actions still count as damage, not additional XP.`
        : 'Dark You is down. Victory XP secured. Further actions still count as damage, not additional XP.';
      els.victoryBanner.hidden = false;
      els.victorySummary.textContent = `VICTORY +${VICTORY_XP} XP · ${summary.totalDamage} DMG${summary.overkill ? ` · ${summary.overkill} overkill` : ''}`;
    } else {
      const ramp = getHpRampInfo();
      els.statusBadge.textContent = 'FIGHT IN PROGRESS';
      els.heroMessage.textContent = ramp.active
        ? `${summary.currentHp} HP remaining. Today's enemy spawned at ${summary.maxHp} HP; full strength eventually reaches ${ramp.fullEnemyHp} HP.`
        : `${summary.currentHp} HP remaining. Repeating one category makes Dark You increasingly resistant to it.`;
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
      els.rankHint.textContent = `${needed} more victor${needed === 1 ? 'y' : 'ies'} in the rolling month to reach ${rank.next.name}.`;
    } else {
      els.rankHint.textContent = 'Top of the food chain. Please behave irresponsibly with this power.';
    }

    els.levelNumber.textContent = level.level;
    els.levelProgressText.textContent = `${level.into} / ${level.requirement} Victory XP`;
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
      const hasDamage = (summary.categoryBaseDamage[UNCATEGORIZED_ID] || 0) > 0;
      return hasActions || hasDamage;
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

      const usedBase = summary.categoryBaseDamage[category.id] || 0;
      const dealtDamage = summary.categoryDamage[category.id] || 0;
      const efficiency = getCategoryEfficiency(category.id, usedBase);
      applyCategoryPaletteVars(card, category, index);
      card.dataset.categoryId = category.id;
      if (category.id === UNCATEGORIZED_ID) card.classList.add('is-fallback-category');

      icon.textContent = category.icon;
      title.textContent = category.name;
      score.textContent = `${dealtDamage} DMG`;

      if (category.id === UNCATEGORIZED_ID) {
        subtitle.textContent = 'Fallback · fixed 50% damage';
        efficiencyValue.textContent = '50%';
        fill.style.width = '100%';
        next.textContent = 'Assign these actions to a real category when convenient.';
      } else {
        subtitle.textContent = `Focus ${category.focus}× · ${Math.round(efficiency.band)} base DMG full-damage band`;
        efficiencyValue.textContent = `${Math.round(efficiency.multiplier * 100)}%`;
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, efficiency.progress)) * 100)}%`;
        next.textContent = efficiency.untilNext === null
          ? 'Resistance floor reached · further actions still deal 40%'
          : `≈ ${Math.max(1, Math.ceil(efficiency.untilNext))} base DMG until next resistance tier`;
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
            ? 'No visible attacks. Unhide one in Settings.'
            : 'No actions yet. Add one in Settings.';
        actionsList.append(empty);
      } else {
        actions.forEach(action => {
          const reward = calculateDamage(action, usedBase);
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
              ? `${typeText} · ${payout}% damage · base ${action.baseDamage}`
              : `${typeText} · full damage`;
          }

          nameWrap.append(strong, small);

          const damage = document.createElement('span');
          damage.className = 'action-xp';
          damage.textContent = `+${reward.damage} DMG`;

          button.append(nameWrap, damage);
          button.addEventListener('click', () => addDamage(action.id));
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

  function renderCombos() {
    if (!els.combosPanel) return;
    els.combosPanel.replaceChildren();

    const combos = state.settings.combos;
    els.combosPanel.hidden = combos.length === 0;
    if (!combos.length) return;

    const head = document.createElement('div');
    head.className = 'combos-panel-head';
    const copy = document.createElement('div');
    copy.innerHTML = '<div class="eyebrow">CHAIN ATTACKS</div><h2>Combos</h2>';
    const note = document.createElement('div');
    note.className = 'balance-note';
    note.textContent = 'Unrelated actions do not break a sequence';
    head.append(copy, note);
    els.combosPanel.append(head);

    const grid = document.createElement('div');
    grid.className = 'combo-grid';

    combos.forEach(combo => {
      const card = document.createElement('article');
      card.className = `combo-card${combo.enabled ? '' : ' is-disabled'}`;
      const title = document.createElement('div');
      title.className = 'combo-card-title';
      const strong = document.createElement('strong');
      strong.textContent = combo.name;
      const multiplier = document.createElement('span');
      multiplier.textContent = `×${combo.multiplier.toFixed(2)}`;
      title.append(strong, multiplier);
      card.append(title);

      if (combo.actionIds.length < 2) {
        const warning = document.createElement('div');
        warning.className = 'combo-warning';
        warning.textContent = 'Needs at least 2 actions · disabled';
        card.append(warning);
      } else {
        const progress = comboProgress(combo.id);
        const steps = document.createElement('div');
        steps.className = 'combo-steps';
        combo.actionIds.forEach((actionId, index) => {
          const action = state.settings.actions.find(item => item.id === actionId);
          const row = document.createElement('div');
          row.className = 'combo-step';
          const mark = document.createElement('span');
          mark.className = 'combo-step-mark';
          mark.textContent = !combo.enabled ? '○' : index < progress.index ? '✓' : index === progress.index ? '●' : '○';
          const name = document.createElement('span');
          name.textContent = action?.name || 'Missing action';
          row.append(mark, name);
          steps.append(row);
        });
        card.append(steps);
      }

      grid.append(card);
    });

    els.combosPanel.append(grid);
  }

  function renderLog() {
    els.logList.replaceChildren();
    const transactions = [...state.current.transactions].sort((a, b) => b.timestamp - a.timestamp);

    if (!transactions.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No damage yet. The hostile internal entity appears smug.';
      els.logList.append(empty);
      return;
    }

    transactions.forEach(tx => {
      const row = document.createElement('div');
      row.className = `log-row${tx.type === 'combo' ? ' combo-log-row' : ''}`;

      const main = document.createElement('div');
      main.className = 'log-main';
      const strong = document.createElement('strong');
      strong.textContent = tx.type === 'combo' ? `COMBO · ${tx.comboName}` : tx.actionName;
      const meta = document.createElement('span');
      const time = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(tx.timestamp));
      meta.textContent = tx.type === 'combo'
        ? `×${tx.multiplier.toFixed(2)} · ${tx.sourceTransactionIds.length} matched actions · ${time}`
        : `${tx.categoryName} · ${Math.round(tx.efficiency * 100)}% · ${time}`;
      main.append(strong, meta);

      const actions = document.createElement('div');
      actions.className = 'log-actions';
      const damage = document.createElement('span');
      damage.className = 'log-xp';
      damage.textContent = `+${tx.damage} DMG`;
      actions.append(damage);

      if (tx.type === 'action') {
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.className = 'undo-button';
        undo.textContent = 'Undo';
        undo.addEventListener('click', () => undoTransaction(tx.id));
        actions.append(undo);
      }

      row.append(main, actions);
      els.logList.append(row);
    });
  }

  function renderHistory() {
    els.historyList.replaceChildren();

    if (!state.history.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Past fight records will appear here automatically.';
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
        ? (day.dayCard?.type || 'Dark You defeated')
        : 'Fight unresolved';
      date.append(strong, detail);

      const score = document.createElement('div');
      score.className = 'history-score';
      score.textContent = `${day.damage} / ${day.maxHp}`;
      const status = document.createElement('span');
      status.textContent = day.won ? 'VICTORY' : 'DMG';
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
    els.dayCardXp.textContent = `VICTORY +${card.victoryXp} XP`;
    els.dayCardEnemyHp.textContent = card.enemyHp;
    els.dayCardDamage.textContent = card.damage;
    els.dayCardOverkill.textContent = card.overkill;
    els.dayCardCombos.textContent = card.combos;
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
        renderActionsEditor();
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
        commitSettingsDraft();
      });

      row.style.setProperty('--editor-category-color', categoryColor(category));
      grid.append(nameLabel, iconLabel, focusLabel, colorLabel, band, remove);
      row.append(grid);
      els.categoriesEditor.append(row);
    });
  }

  function syncActionOrderFromEditor() {
    if (!settingsDraft) return;

    const byId = new Map(settingsDraft.actions.map(action => [action.id, action]));
    const ordered = [...els.actionsEditor.querySelectorAll('.action-editor-row[data-action-id]')]
      .map(row => byId.get(row.dataset.actionId))
      .filter(Boolean);

    if (ordered.length === settingsDraft.actions.length) {
      settingsDraft.actions = ordered;
    }
  }

  function finishActionDrag({ cancelled = false } = {}) {
    if (!actionDrag) return;

    const { row, handle, pointerId } = actionDrag;
    row.classList.remove('is-dragging');
    document.body.classList.remove('is-reordering-actions');

    try {
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    } catch (error) {
      // Capture may already have been released by the browser.
    }

    actionDrag = null;

    if (cancelled) {
      renderActionsEditor();
      return;
    }

    syncActionOrderFromEditor();
    commitSettingsDraft({ announce: false });
    els.settingsMessage.textContent = 'Action order updated.';
  }

  function beginActionDrag(event, row, handle) {
    if (!settingsDraft || event.button > 0) return;

    event.preventDefault();
    actionDrag = {
      row,
      handle,
      pointerId: event.pointerId
    };

    row.classList.add('is-dragging');
    document.body.classList.add('is-reordering-actions');
    handle.setPointerCapture?.(event.pointerId);

    const move = moveEvent => {
      if (!actionDrag || moveEvent.pointerId !== actionDrag.pointerId) return;
      moveEvent.preventDefault();

      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest('.action-editor-row[data-action-id]');

      if (target && target !== row && target.parentElement === els.actionsEditor) {
        const rect = target.getBoundingClientRect();
        if (moveEvent.clientY < rect.top + (rect.height / 2)) {
          target.before(row);
        } else {
          target.after(row);
        }
      }

      const dialogRect = els.settingsDialog.getBoundingClientRect();
      if (moveEvent.clientY < dialogRect.top + 72) {
        els.settingsDialog.scrollBy({ top: -14, behavior: 'auto' });
      } else if (moveEvent.clientY > dialogRect.bottom - 72) {
        els.settingsDialog.scrollBy({ top: 14, behavior: 'auto' });
      }
    };

    const end = endEvent => {
      if (!actionDrag || endEvent.pointerId !== actionDrag.pointerId) return;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', cancel);
      finishActionDrag();
    };

    const cancel = cancelEvent => {
      if (!actionDrag || cancelEvent.pointerId !== actionDrag.pointerId) return;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', cancel);
      finishActionDrag({ cancelled: true });
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', cancel);
  }

  function sortActions(mode) {
    if (!settingsDraft || !mode) return;

    const categoryOrder = new Map(
      settingsDraft.categories.map((category, index) => [category.id, index])
    );

    const indexed = settingsDraft.actions.map((action, index) => ({ action, index }));

    if (mode === 'category') {
      indexed.sort((a, b) => (
        (categoryOrder.get(a.action.categoryId) ?? 999)
        - (categoryOrder.get(b.action.categoryId) ?? 999)
        || a.index - b.index
      ));
    } else if (mode === 'xp') {
      indexed.sort((a, b) => (
        b.action.baseXp - a.action.baseXp
        || a.action.name.localeCompare(b.action.name, undefined, { sensitivity: 'base' })
        || a.index - b.index
      ));
    } else if (mode === 'name') {
      indexed.sort((a, b) => (
        a.action.name.localeCompare(b.action.name, undefined, { sensitivity: 'base' })
        || a.index - b.index
      ));
    } else {
      return;
    }

    settingsDraft.actions = indexed.map(item => item.action);
    renderActionsEditor();
    commitSettingsDraft({ announce: false });
    if (els.actionSortSelect) els.actionSortSelect.value = '';

    const labels = {
      category: 'category',
      xp: 'XP',
      name: 'name'
    };
    els.settingsMessage.textContent = `Actions sorted by ${labels[mode]}.`;
  }

  function renderActionsEditor() {
    els.actionsEditor.replaceChildren();

    settingsDraft.actions.forEach(action => {
      const row = document.createElement('div');
      row.className = 'action-editor-row';
      row.dataset.actionId = action.id;

      const categoryIndex = settingsDraft.categories.findIndex(category => category.id === action.categoryId);
      const category = settingsDraft.categories[categoryIndex] || uncategorizedCategory();
      applyCategoryPaletteVars(row, category, Math.max(0, categoryIndex));

      const dragHandle = document.createElement('button');
      dragHandle.type = 'button';
      dragHandle.className = 'action-drag-handle';
      dragHandle.textContent = '⋮⋮';
      dragHandle.title = 'Drag to reorder';
      dragHandle.setAttribute('aria-label', `Drag ${action.name} to reorder`);
      dragHandle.addEventListener('pointerdown', event => beginActionDrag(event, row, dragHandle));

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
        const nextIndex = settingsDraft.categories.findIndex(category => category.id === action.categoryId);
        const nextCategory = settingsDraft.categories[nextIndex] || uncategorizedCategory();
        applyCategoryPaletteVars(row, nextCategory, Math.max(0, nextIndex));
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
        els.settingsMessage.textContent = 'Action removed.';
        commitSettingsDraft();
      });

      grid.append(nameLabel, categoryLabel, xpLabel, typeLabel, visibilityLabel, remove);
      row.append(dragHandle, grid);
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
    commitSettingsDraft();
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
    els.settingsMessage.textContent = 'Action added. The paperwork filed itself.';
    commitSettingsDraft();
  }

  function buildSettingsFromDraft() {
    if (!settingsDraft) {
      return { ok: false, message: 'Settings are not open.' };
    }

    const categories = ensureUncategorizedCategory(
      settingsDraft.categories.map(category => ({
        ...category,
        name: String(category.name || '').trim(),
        icon: String(category.icon || '•').trim() || '•',
        focus: category.id === UNCATEGORIZED_ID
          ? 0
          : clampNumber(category.focus, 0.25, 10, 1),
        color: category.id === UNCATEGORIZED_ID
          ? DEFAULT_CATEGORY_COLORS.uncategorized
          : normalizeHexColor(category.color, fallbackCategoryColor(category.id))
      }))
    );

    const regularCategories = categories.filter(category => category.id !== UNCATEGORIZED_ID);
    if (regularCategories.some(category => !category.name)) {
      return { ok: false, message: 'Every category needs a name.' };
    }

    const seenNames = new Set();
    for (const category of regularCategories) {
      const key = category.name.toLocaleLowerCase();
      if (key === 'uncategorized' || seenNames.has(key)) {
        return { ok: false, message: 'Category names must be unique.' };
      }
      seenNames.add(key);
    }

    const categoryIds = new Set(categories.map(category => category.id));
    const actions = settingsDraft.actions.map(action => ({
      ...action,
      name: String(action.name || '').trim(),
      categoryId: categoryIds.has(action.categoryId) ? action.categoryId : UNCATEGORIZED_ID,
      baseXp: clampInt(action.baseXp, 1, 200, 10),
      type: action.type === 'once' ? 'once' : 'repeatable',
      trackVisible: action.trackVisible !== false
    }));

    if (actions.some(action => !action.name)) {
      return { ok: false, message: 'Every action needs a name.' };
    }

    return {
      ok: true,
      settings: {
        goal: clampInt(els.goalInput.value, 20, 1000, settingsDraft.goal || 100),
        categories,
        actions
      }
    };
  }

  function commitSettingsDraft({ announce = true } = {}) {
    window.clearTimeout(settingsSaveTimer);
    settingsSaveTimer = null;

    const result = buildSettingsFromDraft();
    if (!result.ok) {
      els.settingsMessage.textContent = result.message;
      return false;
    }

    state.settings = result.settings;
    const justCleared = finalizeClearIfNeeded();
    if (justCleared) settingsTriggeredClear = true;

    saveState();
    render({ justCleared });

    if (announce) {
      els.settingsMessage.textContent = 'Saved automatically.';
    }

    return true;
  }

  function scheduleSettingsSave(delay = 260) {
    window.clearTimeout(settingsSaveTimer);
    settingsSaveTimer = window.setTimeout(() => {
      if (settingsDraft) commitSettingsDraft();
    }, delay);
  }

  function closeSettings() {
    if (!settingsDraft) {
      els.settingsDialog.close();
      return;
    }

    if (!commitSettingsDraft({ announce: false })) {
      return;
    }

    const showDayCard = settingsTriggeredClear && Boolean(state.current.dayCard);
    settingsDraft = null;
    settingsTriggeredClear = false;
    els.settingsDialog.close();

    if (showDayCard) {
      requestAnimationFrame(() => render({ showDayCard: true, justCleared: true }));
    }
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
  els.closeSettingsButton?.addEventListener('click', closeSettings);

  els.goalInput.addEventListener('input', () => {
    updateGoalRampPreview();
    renderCategoriesEditor();
  });

  els.settingsDialog.addEventListener('input', event => {
    if (!settingsDraft) return;
    const target = event.target;
    const editsExistingSetting = target === els.goalInput
      || target.closest?.('.category-direct-editor, .action-direct-editor');

    if (editsExistingSetting) {
      scheduleSettingsSave(target.type === 'color' ? 0 : 260);
    }
  });

  els.settingsDialog.addEventListener('change', event => {
    if (!settingsDraft) return;
    const target = event.target;
    if (target === els.goalInput || target.closest?.('.category-direct-editor, .action-direct-editor')) {
      scheduleSettingsSave(0);
    }
  });

  els.settingsDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeSettings();
  });

  els.settingsForm.addEventListener('submit', event => {
    event.preventDefault();
    if (settingsDraft) commitSettingsDraft();
  });

  els.actionSortSelect?.addEventListener('change', () => {
    const mode = els.actionSortSelect.value;
    if (mode) sortActions(mode);
  });

  els.addCategoryButton.addEventListener('click', addCategoryFromForm);
  els.addActionButton.addEventListener('click', addActionFromForm);
  els.resetGameButton.addEventListener('click', resetGameData);
  els.motionFxButton?.addEventListener('click', toggleMotionFx);
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
