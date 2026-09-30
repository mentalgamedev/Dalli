(() => {
  'use strict';

  const STATE_VERSION = 7;
  const TEMPLATE_VERSION = 1;
  const ITEM_DROP_CHANCE = 0.40;
  const ITEM_CAPACITY = 8;
  const STORAGE_KEY = 'dailyXpGame.v2';
  const HISTORY_LIMIT = 365;
  const DETAILED_HISTORY_DAYS = 90;
  const UNCATEGORIZED_ID = 'uncategorized';
  const UNCATEGORIZED_EFFICIENCY = 0.50;
  const CATEGORY_RESISTANCE = Object.freeze([1, 0.65, 0.40, 0.25]);
  const DEFAULT_FOCUS_FACTOR = 1.5;
  const DEFAULT_RESISTANCE_BUILDUP = 0.75;
  const REQUIRED_COUNT_MAX = 1000;
  const VICTORY_XP = 20;
  const COMBO_MIN_MULTIPLIER = 1.05;
  const COMBO_MAX_MULTIPLIER = 3;
  const COMBO_DEFAULT_MULTIPLIER = 1.25;
  const COMBO_MAX_STEPS = 8;


  const ITEM_DEFINITIONS = Object.freeze([
    { id: 'molight-pro', name: 'MoLight Pro', baseDamage: 10, weight: 34, flavor: 'Professional-grade illumination for amateur-grade problems. Warranty void in darkness.' },
    { id: 'cosmic-laser-gun', name: 'Cosmic Laser Gun', baseDamage: 20, weight: 24, flavor: 'Concentrated cosmic light in a convenient handheld format. Safety procedures unavailable.' },
    { id: 'flash-tube', name: 'Flash Tube', baseDamage: 25, weight: 17, flavor: 'Ridiculously super-charged. Produces enough light to briefly make poor decisions visible.' },
    { id: 'light-rabbit-launcher', name: 'Light Rabbit Launcher', baseDamage: 30, weight: 11, flavor: 'Deploys a highly luminous rabbit-shaped countermeasure at deeply irresponsible velocity.' },
    { id: 'sunflower-beam', name: 'Sunflower Beam', baseDamage: 35, weight: 7, flavor: 'Weaponized photosynthesis. Apparently the plants have had enough.' },
    { id: 'light-sword', name: 'Light Sword', baseDamage: 40, weight: 6, flavor: 'A blade made mostly of light and questionable confidence. Very bad news for anything lurking in corners.' },
    { id: 'rite-of-illumination', name: 'Rite Of Illumination', baseDamage: 999, weight: 1, special: true, flavor: 'Phat Ed describes it as “basically a lamp.” Further questions were discouraged.' }
  ]);

  const ITEM_CONDITIONS = Object.freeze([
    { id: 'questionable', name: 'Questionable', multiplier: 0.5, weight: 50 },
    { id: 'standard', name: 'Standard', multiplier: 1, weight: 30 },
    { id: 'pimped', name: 'Pimped', multiplier: 1.5, weight: 15 },
    { id: 'over-engineered', name: 'Over-engineered', multiplier: 2, weight: 5 }
  ]);

  const V4_WEAPON_TO_ITEM = Object.freeze({
    'snub-nosed': 'molight-pro',
    'sawed-off': 'cosmic-laser-gun',
    'tommy-gun': 'flash-tube',
    'grenade-launcher': 'light-rabbit-launcher',
    'bazooka': 'sunflower-beam',
    'flamethrower': 'light-sword',
    'golden-gun': 'rite-of-illumination'
  });

  const V4_CONDITION_TO_ITEM_CONDITION = Object.freeze({
    rusty: 'questionable',
    clean: 'standard',
    pimped: 'pimped',
    'over-engineered': 'over-engineered'
  });


  // Public, spoiler-safe Crestfallen flavor only.
  // These references may establish public people, places, businesses and rumors,
  // but must not reveal hidden relationships, plot events or supernatural answers.
  const CRESTFALLEN_NEWS_ITEMS = Object.freeze([
    { id: 'mogreen-smart-day', tags: ['generic'], weight: 8, text: 'LESTER MOGREEN CAMPAIGN PROMISES A SMARTER CRESTFALLEN; EXISTING CRESTFALLEN REQUESTS CLARIFICATION' },
    { id: 'mogreen-photo-op', tags: ['generic'], weight: 7, text: 'LESTER MOGREEN COMPLETES ANOTHER SUCCESSFUL PHOTO OP; PHOTOGRAPHER REPORTEDLY EXHAUSTED' },
    { id: 'mogreen-efficiency', tags: ['work'], weight: 10, text: 'MOGREEN CAMPAIGN PRAISES LOCAL PRODUCTIVITY; DENIES HAVING MEASURED IT WITHOUT PERMISSION' },
    { id: 'mogreen-overkill', tags: ['overkill'], weight: 10, text: 'LESTER MOGREEN CALLS TODAY’S OVERKILL “A BOLD PUBLIC-PRIVATE INITIATIVE”' },
    { id: 'mogreen-victory', tags: ['victory'], weight: 8, text: 'MOGREEN CAMPAIGN CONGRATULATES VICTORIOUS CITIZEN; CREDIT ALLOCATION MEETING ALREADY SCHEDULED' },
    { id: 'mogreen-contraband', tags: ['item'], weight: 7, text: 'MOGREEN CAMPAIGN DESCRIBES PAWNSHOP-ASSISTED SELF-IMPROVEMENT AS “LEGACY INFRASTRUCTURE”' },

    { id: 'moles-sleep', tags: ['generic', 'work'], weight: 10, text: 'MO.LES.TECH DENIES REPORTS THAT EMPLOYEES REQUIRE SLEEP' },
    { id: 'moles-smart-bench', tags: ['generic'], weight: 8, text: 'MO.LES.TECH SMART BENCH UPDATE NOW REQUIRES BENCH TO RESTART' },
    { id: 'moles-lamp', tags: ['generic'], weight: 7, text: 'NEW MO.LES.TECH STREETLIGHT SUCCESSFULLY IDENTIFIES NIGHTTIME IN 73% OF TESTS' },
    { id: 'moles-work', tags: ['work'], weight: 10, text: 'MO.LES.TECH REPORTS PRODUCTIVITY SURGE; HUMAN FACTOR LISTED UNDER KNOWN ISSUES' },
    { id: 'moles-combo', tags: ['combo'], weight: 8, text: 'MO.LES.TECH ANALYTICS FLAG ORDERED ACTION SEQUENCE AS “POSSIBLY INTENTIONAL”' },
    { id: 'moles-overkill', tags: ['overkill'], weight: 9, text: 'MO.LES.TECH SAFETY MODEL CLASSIFIES OVERKILL AS “WITHIN DEMO PARAMETERS”' },

    { id: 'phat-ed-questionable', tags: ['item', 'loot'], weight: 12, text: 'PHAT ED’S PAWNSHOP REMINDS CUSTOMERS THAT “QUESTIONABLE” IS A CONDITION, NOT A WARRANTY CATEGORY' },
    { id: 'phat-ed-light-sword', tags: ['item'], weight: 10, text: 'PHAT ED’S PAWNSHOP DECLINES COMMENT ON LIGHT-SWORD-ADJACENT INVENTORY' },
    { id: 'phat-ed-receipt', tags: ['item'], weight: 10, text: 'PHAT ED’S PAWNSHOP: NO RECEIPT, NO REFUND, NO MEMORY OF THIS CONVERSATION' },
    { id: 'phat-ed-crate', tags: ['loot'], weight: 12, text: 'UNMARKED CRATE APPEARS NEAR PHAT ED’S PAWNSHOP; ED CALLS TIMING “PURELY ATMOSPHERIC”' },
    { id: 'phat-ed-rite', tags: ['rite'], weight: 10, text: 'PHAT ED DENIES EVER STOCKING A RITE OF ILLUMINATION; BACK ROOM LIGHTS IMMEDIATELY GO OUT' },
    { id: 'phat-ed-standard', tags: ['item'], weight: 7, text: 'LOCAL PAWNSHOP INDUSTRY DISPUTES CLAIM THAT “STANDARD” MEANS “SAFE”' },

    { id: 'library-printer', tags: ['generic'], weight: 8, text: 'CRESTFALLEN LIBRARY PRINTER ACCEPTS DOCUMENT ON FIRST TRY; INVESTIGATION OPENED' },
    { id: 'library-overdue', tags: ['generic'], weight: 7, text: 'CRESTFALLEN LIBRARY WAIVES LATE FEE AFTER BOOK RETURNED BEFORE CIVILIZATION ENDS' },
    { id: 'library-work', tags: ['work'], weight: 9, text: 'CRESTFALLEN LIBRARY QUIET FLOOR OUTPERFORMS THREE OPEN-PLAN OFFICES IN INFORMAL STUDY' },
    { id: 'library-victory', tags: ['victory'], weight: 7, text: 'CRESTFALLEN LIBRARY FILES TODAY’S VICTORY UNDER “UNLIKELY BUT DOCUMENTED”' },
    { id: 'library-late', tags: ['late'], weight: 8, text: 'LATE-NIGHT LIBRARY BOOK DROP RECEIVES ITEM LABELLED ONLY “0 1 0 1”; STAFF UNIMPRESSED' },

    { id: 'bathhouse-maintenance', tags: ['generic'], weight: 7, text: 'OLD MUNICIPAL BATHHOUSE MAINTENANCE DELAYED AGAIN; CITY CITES “UNCOOPERATIVE ARCHITECTURE”' },
    { id: 'bathhouse-late', tags: ['late', 'mystery'], weight: 10, text: 'LIGHTS REPORTED INSIDE OLD MUNICIPAL BATHHOUSE AFTER HOURS; ELECTRICITY ACCOUNT DISAGREES' },
    { id: 'bathhouse-binary', tags: ['mystery'], weight: 10, text: 'CITY WORKERS REPORT RHYTHMIC BINARY CHANTING BENEATH MUNICIPAL PROPERTY; IT DEPARTMENT DENIES INVOLVEMENT' },
    { id: 'bathhouse-blueprint', tags: ['mystery'], weight: 8, text: 'OLD MUNICIPAL BATHHOUSE BLUEPRINTS DISCOVER EXTRA ROOM; SECOND SET OF BLUEPRINTS DISAGREES' },

    { id: 'binary-drain', tags: ['mystery'], weight: 9, text: 'RESIDENTS REPORT STORM DRAINS HUMMING IN ZEROES AND ONES; CITY ADVISES NOT HUMMING BACK' },
    { id: 'binary-utility', tags: ['mystery'], weight: 8, text: 'UTILITY CREW FINDS REPEATING 0-1 MARKINGS UNDER CRESTFALLEN; OFFICIAL TERM IS NOW “OLD WIRING”' },
    { id: 'binary-night', tags: ['late', 'mystery'], weight: 9, text: 'MIDNIGHT NOISE COMPLAINT DESCRIBES “COUNTING, BUT ONLY TWO NUMBERS”; CASE FORWARDED TO NOBODY' },
    { id: 'binary-council', tags: ['mystery'], weight: 7, text: 'CITY COUNCIL DENIES KNOWLEDGE OF UNDERGROUND BINARY RITUALS BEFORE REPORTER FINISHES QUESTION' },

    { id: 'city-combo', tags: ['combo'], weight: 8, text: 'CRESTFALLEN TRAFFIC OFFICE APPROVES COMBO SEQUENCE PROVIDED STEPS OCCUR IN THE CORRECT ORDER' },
    { id: 'city-streak', tags: ['streak'], weight: 8, text: 'LOCAL WIN STREAK NOW LONG ENOUGH TO REQUIRE ITS OWN MUNICIPAL FORM' },
    { id: 'city-victory', tags: ['victory'], weight: 8, text: 'CITY HALL CONFIRMS DARK DOPPELGÄNGER DEFEAT; CEREMONIAL RIBBON ALREADY MISSING' },
    { id: 'city-no-damage', tags: ['idle'], weight: 8, text: 'CRESTFALLEN EMERGENCY SERVICES REPORT NO ACTIVITY; DARK DOPPELGÄNGER SEEN LOOKING COMFORTABLE' },
    { id: 'city-low-hp', tags: ['wounded'], weight: 8, text: 'LOCAL BOOKMAKERS SUSPEND ODDS AS DARK DOPPELGÄNGER ENTERS VISIBLY UNCOMFORTABLE TERRITORY' },
    { id: 'tenacious-paperwork', tags: ['tenacious'], weight: 12, text: 'LOCAL DARKNESS REFUSES TO REMAIN DEAD; OUTSTANDING DAILY REQUIREMENTS CITED' },
    { id: 'tenacious-one-hp', tags: ['tenacious'], weight: 12, text: 'DARK DOPPELGÄNGER RETURNS TO ONE HP; ADMINISTRATIVE IMMORTALITY SUSPECTED' }
  ]);

  const CRESTFALLEN_DAILY_REFERENCES = Object.freeze({
    item: [
      ['PAWNSHOP INDUSTRY DISTANCES ITSELF FROM DAILY INCIDENT', 'Phat Ed’s Pawnshop issued a statement consisting primarily of “no receipt, no comment.”'],
      ['QUESTIONABLE ITEM SOLVES PROBLEM; CREATES SEVERAL NEW ONES', 'Crestfallen officials confirmed the thing worked and immediately regretted confirming anything.']
    ],
    work: [
      ['LOCAL PRODUCTIVITY INCIDENT DRAWS CORPORATE ATTENTION', 'mo.les.tech called the results promising. The Mogreen campaign called them inevitable.'],
      ['WORK OUTPUT EXCEEDS RECOMMENDED CIVIC DOSAGE', 'A Lester Mogreen spokesperson praised the numbers before asking where they came from.']
    ],
    overkill: [
      ['CITY REQUESTS EXPLANATION FOR EXCESSIVE DAMAGE', 'mo.les.tech classified the overkill as statistically interesting and legally someone else’s problem.'],
      ['DARK DOPPELGÄNGER DEFEATED; PAWNSHOP WINDOWS RATTLE', 'Phat Ed’s Pawnshop denies any connection to the remaining damage.']
    ],
    barely: [
      ['CRESTFALLEN LIBRARY CONFIRMS ZERO HP STILL COUNTS AS ZERO', 'The finding has been filed under “technically correct,” where it may never be seen again.']
    ],
    combo: [
      ['ORDERED ACTIONS TRIGGER MUNICIPAL SUSPICION', 'City analysts agree the sequence looked coordinated, which is unusual enough to document.']
    ]
  });

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
      focusCategoryId: 'work',
      focusFactor: DEFAULT_FOCUS_FACTOR,
      resistanceBuildup: DEFAULT_RESISTANCE_BUILDUP,
      categories: [
        { id: 'wellbeing', name: 'Wellbeing', icon: '♥', color: '#49d89b' },
        { id: 'work', name: 'Work', icon: '◆', color: '#818bff' },
        { id: 'chores', name: 'Chores', icon: '⌂', color: '#ffb35f' },
        { id: UNCATEGORIZED_ID, name: 'Uncategorized', icon: '•', color: '#8b93a4' }
      ],
      actions: [
        { id: 'wellbeing-workout-30', categoryId: 'wellbeing', name: 'Proper workout', baseDamage: 20, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'wellbeing-walk-20', categoryId: 'wellbeing', name: 'Walk / fresh air', baseDamage: 10, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'wellbeing-mobility-10', categoryId: 'wellbeing', name: 'Quick movement / stretch', baseDamage: 5, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'wellbeing-good-meal', categoryId: 'wellbeing', name: 'Proper healthy meal', baseDamage: 10, type: 'once', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'work-focus-25', categoryId: 'work', name: 'Focus session', baseDamage: 15, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'work-focus-50', categoryId: 'work', name: 'Deep focus session', baseDamage: 30, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'work-practice-20', categoryId: 'work', name: 'Practice / skill', baseDamage: 10, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'work-admin', categoryId: 'work', name: 'Annoying admin task', baseDamage: 10, type: 'once', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'chores-small', categoryId: 'chores', name: 'Tiny chore', baseDamage: 5, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'chores-medium', categoryId: 'chores', name: 'Proper chore / cleaning', baseDamage: 10, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'chores-laundry', categoryId: 'chores', name: 'Laundry', baseDamage: 10, type: 'once', trackVisible: true, requiredForVictory: false, requiredCount: 1 },
        { id: 'chores-big', categoryId: 'chores', name: 'Big chore / deep clean', baseDamage: 20, type: 'repeatable', trackVisible: true, requiredForVictory: false, requiredCount: 1 }
      ],
      combos: []
    },
    progression: {
      victoryXp: 0,
      bestStreak: 0,
      archivedStreak: 0,
      streakThrough: ''
    },
    inventory: {
      items: []
    },
    current: {
      date: '',
      maxHp: 0,
      transactions: [],
      comboProgress: {},
      requiredActions: [],
      defeatedAt: null,
      victoryXpAwarded: 0,
      loot: {
        rolled: false,
        available: false,
        claimed: false,
        pendingItem: null
      },
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
    arsenalPanel: document.querySelector('#arsenalPanel'),
    arsenalList: document.querySelector('#arsenalList'),
    arsenalCount: document.querySelector('#arsenalCount'),
    arsenalStatus: document.querySelector('#arsenalStatus'),
    lootDrop: document.querySelector('#lootDrop'),
    lootCrateButton: document.querySelector('#lootCrateButton'),
    lootDropMessage: document.querySelector('#lootDropMessage'),
    statusBadge: document.querySelector('#statusBadge'),
    tenaciousBadge: document.querySelector('#tenaciousBadge'),
    tenaciousStatus: document.querySelector('#tenaciousStatus'),
    heroMessage: document.querySelector('#heroMessage'),
    fightCard: document.querySelector('#fightCard'),
    healthPercent: document.querySelector('#healthPercent'),
    healthTrail: document.querySelector('#healthTrail'),
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

    attackReportDialog: document.querySelector('#attackReportDialog'),
    attackReportCard: document.querySelector('#attackReportCard'),
    attackReportStatus: document.querySelector('#attackReportStatus'),
    attackReportAction: document.querySelector('#attackReportAction'),
    attackReportCategory: document.querySelector('#attackReportCategory'),
    attackReportDamage: document.querySelector('#attackReportDamage'),
    attackReportBaseDamage: document.querySelector('#attackReportBaseDamage'),
    attackReportEfficiency: document.querySelector('#attackReportEfficiency'),
    attackReportHp: document.querySelector('#attackReportHp'),
    attackReportComboRow: document.querySelector('#attackReportComboRow'),
    attackReportCombo: document.querySelector('#attackReportCombo'),
    attackReportRequiredRow: document.querySelector('#attackReportRequiredRow'),
    attackReportRequired: document.querySelector('#attackReportRequired'),
    attackReportMessage: document.querySelector('#attackReportMessage'),
    closeAttackReportButton: document.querySelector('#closeAttackReportButton'),

    settingsButton: document.querySelector('#settingsButton'),
    settingsDialog: document.querySelector('#settingsDialog'),
    settingsForm: document.querySelector('#settingsForm'),
    closeSettingsButton: document.querySelector('#closeSettingsButton'),
    goalInput: document.querySelector('#goalInput'),
    goalPreview: document.querySelector('#goalPreview'),
    focusFactorInput: document.querySelector('#focusFactorInput'),
    resistanceBuildupInput: document.querySelector('#resistanceBuildupInput'),
    categoriesEditor: document.querySelector('#categoriesEditor'),
    newCategoryName: document.querySelector('#newCategoryName'),
    newCategoryIcon: document.querySelector('#newCategoryIcon'),
    newCategoryColor: document.querySelector('#newCategoryColor'),
    addCategoryButton: document.querySelector('#addCategoryButton'),
    actionsEditor: document.querySelector('#actionsEditor'),
    actionSortSelect: document.querySelector('#actionSortSelect'),
    newActionName: document.querySelector('#newActionName'),
    newActionCategory: document.querySelector('#newActionCategory'),
    newActionDamage: document.querySelector('#newActionDamage'),
    newActionType: document.querySelector('#newActionType'),
    newActionRequired: document.querySelector('#newActionRequired'),
    newActionRequiredCount: document.querySelector('#newActionRequiredCount'),
    newActionVisible: document.querySelector('#newActionVisible'),
    addActionButton: document.querySelector('#addActionButton'),
    combosEditor: document.querySelector('#combosEditor'),
    newComboName: document.querySelector('#newComboName'),
    newComboMultiplier: document.querySelector('#newComboMultiplier'),
    addComboButton: document.querySelector('#addComboButton'),
    templateName: document.querySelector('#templateName'),
    exportTemplateButton: document.querySelector('#exportTemplateButton'),
    importTemplateButton: document.querySelector('#importTemplateButton'),
    importTemplateInput: document.querySelector('#importTemplateInput'),
    templateStatus: document.querySelector('#templateStatus'),
    resetGameButton: document.querySelector('#resetGameButton'),
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
  let pendingVictoryReport = false;
  let settingsSaveTimer = null;
  let settingsBackgroundScrollY = 0;
  let actionDrag = null;
  const categoryScrollPositions = new Map();

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

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
      color: DEFAULT_CATEGORY_COLORS.uncategorized
    };
  }

  function ensureUncategorizedCategory(categories) {
    const cleaned = categories.filter(category => category.id !== UNCATEGORIZED_ID);
    cleaned.push(uncategorizedCategory());
    return cleaned;
  }



  function emptyLootState() {
    return {
      rolled: false,
      available: false,
      claimed: false,
      pendingItem: null
    };
  }

  function itemDefinition(itemId) {
    return ITEM_DEFINITIONS.find(item => item.id === itemId) || null;
  }

  function itemCondition(conditionId) {
    return ITEM_CONDITIONS.find(condition => condition.id === conditionId) || null;
  }

  function itemDisplayName(item) {
    const definition = itemDefinition(item?.itemId);
    if (!definition) return 'Unknown Pawnshop Item';
    if (definition.special) return definition.name;
    const condition = itemCondition(item?.conditionId);
    return condition ? `${condition.name} ${definition.name}` : definition.name;
  }

  function randomUnit() {
    if (globalThis.crypto?.getRandomValues) {
      const value = new Uint32Array(1);
      globalThis.crypto.getRandomValues(value);
      return value[0] / 0x100000000;
    }
    return Math.random();
  }

  function weightedRandom(items) {
    const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
    if (total <= 0) return items[0] || null;
    let cursor = randomUnit() * total;
    for (const item of items) {
      cursor -= Math.max(0, Number(item.weight) || 0);
      if (cursor < 0) return item;
    }
    return items[items.length - 1] || null;
  }

  function rollPawnshopItem() {
    const definition = weightedRandom(ITEM_DEFINITIONS);
    if (!definition) return null;

    const condition = definition.special ? null : weightedRandom(ITEM_CONDITIONS);
    const multiplier = definition.special ? 1 : (condition?.multiplier || 1);
    const damage = definition.special
      ? definition.baseDamage
      : Math.max(1, Math.round(definition.baseDamage * multiplier));

    return {
      id: makeId('item'),
      itemId: definition.id,
      conditionId: condition?.id || null,
      multiplier,
      damage,
      acquiredDate: state.current.date || localDateKey(),
      acquiredAt: Date.now()
    };
  }

  function normalizePawnshopItem(value) {
    if (!value || typeof value !== 'object') return null;
    const definition = itemDefinition(String(value.itemId || ''));
    if (!definition) return null;

    let conditionId = null;
    let multiplier = 1;
    if (!definition.special) {
      const condition = itemCondition(String(value.conditionId || ''));
      if (!condition) return null;
      conditionId = condition.id;
      multiplier = condition.multiplier;
    }

    const expectedDamage = definition.special
      ? definition.baseDamage
      : Math.max(1, Math.round(definition.baseDamage * multiplier));

    return {
      id: String(value.id || makeId('item')).slice(0, 128),
      itemId: definition.id,
      conditionId,
      multiplier,
      damage: expectedDamage,
      acquiredDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.acquiredDate || ''))
        ? String(value.acquiredDate)
        : localDateKey(),
      acquiredAt: normalizeTimestamp(value.acquiredAt) || Date.now()
    };
  }

  function migrateV4WeaponItem(value) {
    if (!value || typeof value !== 'object') return null;
    const itemId = V4_WEAPON_TO_ITEM[String(value.weaponId || '')];
    const definition = itemDefinition(itemId || '');
    if (!definition) return null;

    let conditionId = null;
    let multiplier = 1;
    if (!definition.special) {
      conditionId = V4_CONDITION_TO_ITEM_CONDITION[String(value.conditionId || '')] || '';
      const condition = itemCondition(conditionId);
      if (!condition) return null;
      multiplier = condition.multiplier;
    }

    return {
      id: String(value.id || makeId('item')).slice(0, 128),
      itemId: definition.id,
      conditionId,
      multiplier,
      damage: definition.special
        ? definition.baseDamage
        : Math.max(1, Math.round(definition.baseDamage * multiplier)),
      acquiredDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.acquiredDate || ''))
        ? String(value.acquiredDate)
        : localDateKey(),
      acquiredAt: normalizeTimestamp(value.acquiredAt) || Date.now()
    };
  }

  function migrateV4Transaction(tx) {
    if (tx?.type !== 'weapon') return deepClone(tx);
    const itemId = V4_WEAPON_TO_ITEM[String(tx.weaponId || '')];
    const definition = itemDefinition(itemId || '');
    if (!definition) return null;

    let conditionId = null;
    let conditionName = null;
    let multiplier = 1;
    if (!definition.special) {
      conditionId = V4_CONDITION_TO_ITEM_CONDITION[String(tx.conditionId || '')] || '';
      const condition = itemCondition(conditionId);
      if (!condition) return null;
      conditionName = condition.name;
      multiplier = condition.multiplier;
    }

    return {
      type: 'item',
      id: String(tx.id || makeId('item-tx')).slice(0, 128),
      itemInstanceId: String(tx.weaponItemId || '').slice(0, 128),
      itemId: definition.id,
      itemName: definition.name,
      conditionId,
      conditionName,
      multiplier,
      damage: definition.special
        ? clampInt(tx.damage, definition.baseDamage, 1000, definition.baseDamage)
        : Math.max(1, Math.round(definition.baseDamage * multiplier)),
      timestamp: normalizeTimestamp(tx.timestamp) || Date.now()
    };
  }

  function normalizeLootState(value) {
    const pendingItem = normalizePawnshopItem(value?.pendingItem);
    const claimed = Boolean(value?.claimed && pendingItem);
    const available = Boolean(value?.available && pendingItem && !claimed);
    return {
      rolled: Boolean(value?.rolled || pendingItem),
      available,
      claimed,
      pendingItem
    };
  }

  function requiredActionsForNextFight(settings = state.settings) {
    return settings.actions
      .filter(action => action.requiredForVictory)
      .map(action => ({
        actionId: action.id,
        requiredCount: action.type === 'repeatable'
          ? clampInt(action.requiredCount, 1, REQUIRED_COUNT_MAX, 1)
          : 1
      }));
  }

  function legacyEnemyHp(candidate) {
    return clampInt(candidate?.settings?.goal, 20, 1000, 100);
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


  function migrateV3State(candidate) {
    const migrated = deepClone(candidate);
    migrated.version = 4;
    migrated.armory = { weapons: [] };
    migrated.current = {
      ...(migrated.current || {}),
      loot: {
        rolled: false,
        available: false,
        claimed: false,
        pendingWeapon: null
      }
    };
    return migrated;
  }

  function migrateV4State(candidate) {
    const migrated = deepClone(candidate);
    migrated.version = 5;
    migrated.settings = {
      ...(migrated.settings || {}),
      actions: (Array.isArray(migrated.settings?.actions) ? migrated.settings.actions : []).map(action => ({
        ...action,
        requiredForVictory: false
      }))
    };
    migrated.inventory = {
      items: (Array.isArray(candidate.armory?.weapons) ? candidate.armory.weapons : [])
        .map(migrateV4WeaponItem)
        .filter(Boolean)
    };
    delete migrated.armory;

    const pendingItem = migrateV4WeaponItem(candidate.current?.loot?.pendingWeapon);
    migrated.current = {
      ...(migrated.current || {}),
      transactions: (Array.isArray(candidate.current?.transactions) ? candidate.current.transactions : [])
        .map(migrateV4Transaction)
        .filter(Boolean),
      requiredActionIds: [],
      loot: {
        rolled: Boolean(candidate.current?.loot?.rolled || pendingItem),
        available: Boolean(candidate.current?.loot?.available && pendingItem && !candidate.current?.loot?.claimed),
        claimed: Boolean(candidate.current?.loot?.claimed && pendingItem),
        pendingItem
      }
    };

    migrated.history = (Array.isArray(candidate.history) ? candidate.history : []).map(day => ({
      ...day,
      transactions: (Array.isArray(day?.transactions) ? day.transactions : [])
        .map(migrateV4Transaction)
        .filter(Boolean)
    }));
    return migrated;
  }

  function migrateV5State(candidate) {
    const migrated = deepClone(candidate);
    migrated.version = STATE_VERSION;
    migrated.settings = {
      ...(migrated.settings || {}),
      actions: (Array.isArray(migrated.settings?.actions) ? migrated.settings.actions : []).map(action => ({
        ...action,
        requiredCount: 1
      }))
    };

    const requiredIds = Array.isArray(candidate.current?.requiredActionIds)
      ? candidate.current.requiredActionIds
      : [];
    migrated.current = {
      ...(migrated.current || {}),
      requiredActions: requiredIds.map(actionId => ({
        actionId: String(actionId),
        requiredCount: 1
      }))
    };
    delete migrated.current.requiredActionIds;
    return migrated;
  }


  function migrateV6State(candidate) {
    const migrated = deepClone(candidate);
    const categories = Array.isArray(candidate.settings?.categories) ? candidate.settings.categories : [];
    const regular = categories.filter(category => category?.id !== UNCATEGORIZED_ID);
    const focusedLegacy = regular
      .map(category => ({
        id: String(category?.id || ''),
        focus: clampNumber(category?.focus, 0.25, 10, 1)
      }))
      .filter(category => category.id && category.focus > 1)
      .sort((a, b) => b.focus - a.focus)[0] || null;

    migrated.version = STATE_VERSION;
    migrated.settings = {
      ...(migrated.settings || {}),
      focusCategoryId: focusedLegacy?.id || null,
      focusFactor: focusedLegacy?.focus || DEFAULT_FOCUS_FACTOR,
      resistanceBuildup: DEFAULT_RESISTANCE_BUILDUP,
      categories: categories.map(category => {
        const next = { ...category };
        delete next.focus;
        return next;
      })
    };
    return migrated;
  }


  function normalizeState(candidate) {
    if (candidate?.version === 2) candidate = migrateV2State(candidate);
    if (candidate?.version === 3) candidate = migrateV3State(candidate);
    if (candidate?.version === 4) candidate = migrateV4State(candidate);
    if (candidate?.version === 5) candidate = migrateV5State(candidate);
    if (candidate?.version === 6) candidate = migrateV6State(candidate);
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
        color: normalizeHexColor(category?.color, fallbackCategoryColor(id, index))
      });
    });
    next.settings.categories = ensureUncategorizedCategory(categories);

    const categoryIds = new Set(next.settings.categories.map(category => category.id));
    const regularCategoryIds = new Set(
      next.settings.categories
        .filter(category => category.id !== UNCATEGORIZED_ID)
        .map(category => category.id)
    );

    const legacyFocused = sourceCategories
      .map(category => ({
        id: String(category?.id || ''),
        focus: clampNumber(category?.focus, 0.25, 10, 1)
      }))
      .filter(category => regularCategoryIds.has(category.id) && category.focus > 1)
      .sort((a, b) => b.focus - a.focus)[0] || null;

    const requestedFocusCategoryId = candidate.settings?.focusCategoryId;
    next.settings.focusCategoryId = regularCategoryIds.has(String(requestedFocusCategoryId))
      ? String(requestedFocusCategoryId)
      : (legacyFocused?.id || null);
    next.settings.focusFactor = clampNumber(
      candidate.settings?.focusFactor,
      1,
      10,
      legacyFocused?.focus || DEFAULT_FOCUS_FACTOR
    );
    next.settings.resistanceBuildup = clampNumber(
      candidate.settings?.resistanceBuildup,
      0,
      2,
      DEFAULT_RESISTANCE_BUILDUP
    );
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
        requiredForVictory: Boolean(action?.requiredForVictory),
        requiredCount: action?.type === 'once'
          ? 1
          : clampInt(action?.requiredCount, 1, REQUIRED_COUNT_MAX, 1),
        trackVisible: action?.requiredForVictory ? true : action?.trackVisible !== false
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


    const itemInstanceIds = new Set();
    next.inventory.items = (Array.isArray(candidate.inventory?.items) ? candidate.inventory.items : [])
      .slice(0, 500)
      .map(normalizePawnshopItem)
      .filter(Boolean)
      .filter(item => {
        if (itemInstanceIds.has(item.id)) return false;
        itemInstanceIds.add(item.id);
        return true;
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
      ? clampInt(candidate.current?.maxHp, 20, 1000, getEnemyHp(next.settings))
      : 0;
    next.current.transactions = normalizeTransactions(candidate.current?.transactions);
    const currentActionIds = new Set(next.settings.actions.map(action => action.id));
    const rawRequiredActions = Array.isArray(candidate.current?.requiredActions)
      ? candidate.current.requiredActions
      : [];
    const seenRequiredIds = new Set();
    next.current.requiredActions = rawRequiredActions
      .map(value => ({
        actionId: String(value?.actionId || ''),
        requiredCount: clampInt(value?.requiredCount, 1, REQUIRED_COUNT_MAX, 1)
      }))
      .filter(required => {
        if (!currentActionIds.has(required.actionId) || seenRequiredIds.has(required.actionId)) return false;
        seenRequiredIds.add(required.actionId);
        return true;
      });
    next.current.defeatedAt = normalizeTimestamp(candidate.current?.defeatedAt);
    next.current.victoryXpAwarded = next.current.defeatedAt
      ? clampInt(candidate.current?.victoryXpAwarded, 0, VICTORY_XP, VICTORY_XP)
      : 0;
    next.current.loot = normalizeLootState(candidate.current?.loot);
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
      const type = tx?.type === 'combo'
        ? 'combo'
        : tx?.type === 'item'
          ? 'item'
          : 'action';

      if (type === 'combo') {
        return {
          type,
          id: String(tx?.id || makeId('combo-tx')).slice(0, 128),
          comboId: String(tx?.comboId || '').slice(0, 128),
          comboName: String(tx?.comboName || 'Combo').slice(0, 80),
          multiplier: clampNumber(tx?.multiplier, COMBO_MIN_MULTIPLIER, COMBO_MAX_MULTIPLIER, COMBO_DEFAULT_MULTIPLIER),
          damage: clampInt(tx?.damage, 1, 100000, 1),
          sourceTransactionIds: (Array.isArray(tx?.sourceTransactionIds) ? tx.sourceTransactionIds : [])
            .map(id => String(id).slice(0, 128))
            .slice(0, COMBO_MAX_STEPS),
          timestamp: normalizeTimestamp(tx?.timestamp) || Date.now()
        };
      }

      if (type === 'item') {
        const definition = itemDefinition(String(tx?.itemId || ''));
        if (!definition) return null;
        const condition = definition.special ? null : itemCondition(String(tx?.conditionId || ''));
        if (!definition.special && !condition) return null;
        return {
          type,
          id: String(tx?.id || makeId('item-tx')).slice(0, 128),
          itemInstanceId: String(tx?.itemInstanceId || '').slice(0, 128),
          itemId: definition.id,
          itemName: definition.name,
          conditionId: condition?.id || null,
          conditionName: condition?.name || null,
          multiplier: definition.special ? 1 : condition.multiplier,
          damage: definition.special
            ? clampInt(tx?.damage, definition.baseDamage, 1000, definition.baseDamage)
            : Math.max(1, Math.round(definition.baseDamage * condition.multiplier)),
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
        damage: clampInt(tx?.damage, 1, 800, 1),
        efficiency: clampNumber(tx?.efficiency, 0.01, 4, 1),
        timestamp: normalizeTimestamp(tx?.timestamp) || Date.now()
      };
    }).filter(Boolean);
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
      if (!parsed || ![2, 3, 4, 5, 6, STATE_VERSION].includes(parsed.version)) return null;
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


  function getEnemyHp(settings = state.settings) {
    return clampInt(settings.fullEnemyHp, 20, 1000, 100);
  }

  function categoryResistanceForCount(actionCount, settings = state.settings) {
    const index = Math.min(CATEGORY_RESISTANCE.length - 1, Math.max(0, clampInt(actionCount, 0, 100000, 0)));
    const base = CATEGORY_RESISTANCE[index];
    const buildup = clampNumber(settings.resistanceBuildup, 0, 2, DEFAULT_RESISTANCE_BUILDUP);
    return Math.pow(base, buildup);
  }

  function getCategoryEfficiency(categoryId, actionCount = 0, settings = state.settings) {
    if (categoryId === UNCATEGORIZED_ID) {
      return { focused: false, focus: 0, resistance: 1, multiplier: UNCATEGORIZED_EFFICIENCY, tier: 0, nextResistance: null };
    }
    const category = settings.categories.find(item => item.id === categoryId);
    if (!category) return { focused: false, focus: 1, resistance: 1, multiplier: 1, tier: 0, nextResistance: null };

    const focused = settings.focusCategoryId === categoryId;
    const focus = focused
      ? clampNumber(settings.focusFactor, 1, 10, DEFAULT_FOCUS_FACTOR)
      : 1;
    const count = Math.max(0, clampInt(actionCount, 0, 100000, 0));
    const tier = Math.min(CATEGORY_RESISTANCE.length - 1, count);
    const resistance = categoryResistanceForCount(count, settings);
    const nextResistance = count + 1 < CATEGORY_RESISTANCE.length
      ? categoryResistanceForCount(count + 1, settings)
      : null;
    return { focused, focus, resistance, multiplier: resistance / focus, tier, nextResistance };
  }

  function toggleFocusedCategory(categoryId) {
    if (categoryId === UNCATEGORIZED_ID) return;
    if (!state.settings.categories.some(category => category.id === categoryId)) return;

    state.settings.focusCategoryId = state.settings.focusCategoryId === categoryId ? null : categoryId;
    saveState();
    render();
  }

  function currentCategoryIdForTransaction(tx) {
    return state.settings.categories.some(category => category.id === tx.categoryId)
      ? tx.categoryId
      : UNCATEGORIZED_ID;
  }

  function getSummary() {
    const categoryDamage = Object.fromEntries(state.settings.categories.map(category => [category.id, 0]));
    const categoryBaseDamage = Object.fromEntries(state.settings.categories.map(category => [category.id, 0]));
    const categoryActionCount = Object.fromEntries(state.settings.categories.map(category => [category.id, 0]));
    const maxHp = Math.max(20, state.current.maxHp || getEnemyHp());
    const requiredActions = (Array.isArray(state.current.requiredActions) ? state.current.requiredActions : [])
      .filter(required => state.settings.actions.some(action => action.id === required.actionId));
    const actionCompletionCounts = new Map();
    let totalDamage = 0, totalBaseDamage = 0, comboDamage = 0, combosLanded = 0, itemDamage = 0, itemsUsed = 0;
    let itemBypassVictory = false;

    state.current.transactions.forEach(tx => {
      totalDamage += tx.damage;
      if (tx.type === 'combo') { comboDamage += tx.damage; combosLanded += 1; return; }
      if (tx.type === 'item') {
        itemDamage += tx.damage; itemsUsed += 1;
        if (totalDamage >= maxHp) itemBypassVictory = true;
        return;
      }

      actionCompletionCounts.set(tx.actionId, (actionCompletionCounts.get(tx.actionId) || 0) + 1);
      const categoryId = currentCategoryIdForTransaction(tx);
      totalBaseDamage += tx.baseDamage;
      categoryDamage[categoryId] = (categoryDamage[categoryId] || 0) + tx.damage;
      categoryBaseDamage[categoryId] = (categoryBaseDamage[categoryId] || 0) + tx.baseDamage;
      categoryActionCount[categoryId] = (categoryActionCount[categoryId] || 0) + 1;
    });

    const requiredProgress = {};
    let requiredTotal = 0, requiredCompleted = 0, requiredRemainingCount = 0;
    requiredActions.forEach(required => {
      const requiredCount = clampInt(required.requiredCount, 1, REQUIRED_COUNT_MAX, 1);
      const completedCount = Math.min(requiredCount, actionCompletionCounts.get(required.actionId) || 0);
      const remainingCount = Math.max(0, requiredCount - completedCount);
      requiredProgress[required.actionId] = { requiredCount, completedCount, remainingCount };
      requiredTotal += requiredCount;
      requiredCompleted += completedCount;
      requiredRemainingCount += remainingCount;
    });

    const requiredRemainingIds = requiredActions
      .filter(required => (requiredProgress[required.actionId]?.remainingCount || 0) > 0)
      .map(required => required.actionId);
    const normalVictory = totalDamage >= maxHp && requiredRemainingCount === 0;
    const isVictory = normalVictory || itemBypassVictory;
    const isTenacious = !isVictory && requiredRemainingCount > 0;
    const tenaciousHolding = isTenacious && totalDamage >= maxHp;
    const currentHp = isVictory ? 0 : tenaciousHolding ? 1 : Math.max(0, maxHp - totalDamage);
    const overkill = isVictory ? Math.max(0, totalDamage - maxHp) : 0;

    return {
      totalDamage, totalBaseDamage, comboDamage, combosLanded, itemDamage, itemsUsed,
      categoryDamage, categoryBaseDamage, categoryActionCount,
      maxHp, currentHp, overkill, requiredTotal, requiredCompleted, requiredProgress,
      requiredRemainingIds, requiredRemainingCount, isTenacious, tenaciousHolding,
      itemBypassVictory, isVictory
    };
  }

  function calculateDamage(action, priorActionCount = null, settings = state.settings) {
    const baseDamage = action.baseDamage;
    const categoryId = action.categoryId;
    const summary = priorActionCount === null ? getSummary() : null;
    const actionCount = priorActionCount === null
      ? (summary.categoryActionCount[categoryId] || 0)
      : Math.max(0, clampInt(priorActionCount, 0, 100000, 0));
    const efficiency = getCategoryEfficiency(categoryId, actionCount, settings);
    const raw = baseDamage * efficiency.multiplier;
    return {
      baseDamage,
      damage: Math.max(1, Math.round(raw)),
      efficiency: efficiency.multiplier,
      focus: efficiency.focus,
      resistance: efficiency.resistance,
      raw
    };
  }

  function hasCompletedOnceAction(actionId) {
    return state.current.transactions.some(tx => tx.type === 'action' && tx.actionId === actionId);
  }

  function isOnceLimitedToday(action) {
    if (action.type !== 'once') return false;
    const currentRequirement = (state.current.requiredActions || [])
      .find(required => required.actionId === action.id);
    return !currentRequirement || currentRequirement.requiredCount <= 1;
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


  function rollVictoryLootIfNeeded() {
    if (state.current.loot?.rolled) {
      if (state.current.loot.pendingItem && !state.current.loot.claimed) {
        state.current.loot.available = true;
      }
      return;
    }

    state.current.loot = emptyLootState();
    state.current.loot.rolled = true;

    if (state.inventory.items.length >= ITEM_CAPACITY) return;
    if (randomUnit() >= ITEM_DROP_CHANCE) return;

    const pendingItem = rollPawnshopItem();
    if (!pendingItem) return;
    state.current.loot.available = true;
    state.current.loot.pendingItem = pendingItem;
  }

  function revokeCurrentVictoryLoot() {
    const loot = state.current.loot || emptyLootState();
    if (loot.claimed && loot.pendingItem?.id) {
      state.inventory.items = state.inventory.items.filter(
        item => item.id !== loot.pendingItem.id
      );
    }

    state.current.loot = {
      rolled: Boolean(loot.rolled),
      available: false,
      claimed: false,
      pendingItem: loot.pendingItem ? deepClone(loot.pendingItem) : null
    };
  }

  function stashPendingVictoryLoot() {
    const loot = state.current.loot;
    if (!loot?.available || loot.claimed || !loot.pendingItem) return null;

    if (!state.inventory.items.some(item => item.id === loot.pendingItem.id)) {
      // Existing rewards are never discarded, even if a migrated save is already over capacity.
      state.inventory.items.push(deepClone(loot.pendingItem));
    }

    loot.available = false;
    loot.claimed = true;
    return loot.pendingItem;
  }

  function claimVictoryLoot() {
    const summary = getSummary();
    if (!summary.isVictory) return;

    const claimed = stashPendingVictoryLoot();
    if (!claimed) return;

    saveState();
    render({ lootClaimed: claimed });
  }

  function usePawnshopItem(itemInstanceId) {
    ensureToday();
    const summary = getSummary();
    if (summary.isVictory) return;

    const index = state.inventory.items.findIndex(item => item.id === itemInstanceId);
    if (index < 0) return;

    const item = state.inventory.items[index];
    const definition = itemDefinition(item.itemId);
    if (!definition) return;

    const actualDamage = definition.special
      ? Math.max(item.damage, summary.currentHp)
      : item.damage;
    const wasTenacious = summary.isTenacious;

    state.inventory.items.splice(index, 1);

    const condition = definition.special ? null : itemCondition(item.conditionId);
    const tx = {
      type: 'item',
      id: makeId('item-tx'),
      itemInstanceId: item.id,
      itemId: definition.id,
      itemName: definition.name,
      conditionId: condition?.id || null,
      conditionName: condition?.name || null,
      multiplier: item.multiplier,
      damage: actualDamage,
      timestamp: Date.now()
    };

    state.current.transactions.push(tx);
    const justDefeated = finalizeVictoryIfNeeded();
    const after = getSummary();
    saveState();
    render({
      showDayCard: justDefeated,
      justDefeated,
      hitDamage: tx.damage,
      hitName: itemDisplayName(item),
      itemEvent: tx,
      itemBypassedTenacity: wasTenacious && after.isVictory
    });
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
    const victoryXp = state.progression.victoryXp;
    const completedLevels = Math.max(
      0,
      Math.floor((-50 + Math.sqrt(2500 + (40 * victoryXp))) / 20)
    );
    const level = completedLevels + 1;
    const threshold = (10 * completedLevels * completedLevels) + (50 * completedLevels);
    const into = victoryXp - threshold;
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

    if (state.current.defeatedAt && state.current.loot?.available) {
      stashPendingVictoryLoot();
    }

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
        requiredActions: requiredActionsForNextFight(),
        defeatedAt: null,
        victoryXpAwarded: 0,
        loot: emptyLootState(),
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
      requiredActions: requiredActionsForNextFight(),
      defeatedAt: null,
      victoryXpAwarded: 0,
      loot: emptyLootState(),
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


  function deterministicWeightedSample(items, count, seed) {
    return items
      .map(item => {
        const hash = stringHash(`${seed}|${item.id}`);
        const unit = Math.max(1 / 0x100000000, hash / 0xffffffff);
        const weight = Math.max(0.01, Number(item.weight) || 1);
        return { item, score: -Math.log(unit) / weight };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.max(0, count))
      .map(entry => entry.item);
  }

  function crestfallenNewswireTags(summary, dominant, hour) {
    const tags = new Set(['generic']);

    if (summary.isVictory) tags.add('victory');
    if (summary.itemsUsed > 0) tags.add('item');
    if (summary.combosLanded > 0) tags.add('combo');
    if (summary.overkill > 0) tags.add('overkill');
    if (summary.totalDamage === 0) tags.add('idle');
    if (!summary.isVictory && summary.currentHp <= summary.maxHp * 0.35) tags.add('wounded');
    if (summary.isTenacious) tags.add('tenacious');
    if (state.current.loot?.available || state.current.loot?.claimed) tags.add('loot');
    if (state.current.loot?.pendingItem?.itemId === 'rite-of-illumination') tags.add('rite');
    if (getCurrentStreak() >= 3) tags.add('streak');
    if (dominant?.id === 'work') tags.add('work');
    if (hour >= 21) tags.add('late');

    // A few spoiler-safe opening-premise oddities are always eligible at low frequency.
    tags.add('mystery');
    return tags;
  }

  function getCrestfallenReferenceMessages(summary, dominant, hour) {
    const tags = crestfallenNewswireTags(summary, dominant, hour);
    const candidates = CRESTFALLEN_NEWS_ITEMS.filter(item => (
      item.tags.some(tag => tags.has(tag))
    ));

    return deterministicWeightedSample(
      candidates,
      3,
      `${state.current.date}|${summary.totalDamage}|${summary.itemsUsed}|${summary.combosLanded}|${hour >= 21 ? 'late' : 'day'}`
    ).map(item => item.text);
  }

  function maybeCrestfallenDailyReference(personality, summary, basePair) {
    const pool = CRESTFALLEN_DAILY_REFERENCES[personality.key];
    if (!pool?.length) return basePair;

    // One in four deterministic reports gets an explicit Crestfallen-world crossover.
    const gate = stringHash(`${state.current.date}|crestfallen-daily|${personality.key}`) % 4;
    if (gate !== 0) return basePair;

    return deterministicPick(
      pool,
      `${state.current.date}|crestfallen-daily-pick|${summary.totalDamage}|${summary.itemsUsed}`
    );
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

    if (summary.itemsUsed > 0) {
      return { key: 'item', type: 'PAWNSHOP ASSISTED', dominant };
    }
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
      item: [
        ['PAWNSHOP MERCHANDISE RESOLVES INTERNAL DISPUTE', `${summary.itemsUsed} questionable item${summary.itemsUsed === 1 ? '' : 's'} used. Officials confirm this still counts as personal development.`],
        ['CITIZEN SKIPS PERSONAL GROWTH, REACHES FOR PHAT ED’S STOCK', 'The Dark Doppelgänger was unavailable for comment after a brief illumination-related incident.'],
        ['QUESTIONABLE PROCUREMENT ENDS DAILY HOSTILITIES', 'Authorities stress that the item was earned through previous good behavior, which somehow makes this worse.']
      ],
      overkill: [
        ['DARK SELF DEFEATED; USER CONTINUES HITTING IT FOR ADMINISTRATIVE REASONS', `${summary.overkill} points of overkill were recorded. Authorities insist this was probably unnecessary.`],
        ['INTERNAL HOSTILITY ENDS IN DISPROPORTIONATE RESPONSE', 'Crestfallen observers describe the damage total as “legally a bit much.”'],
        ['DARK DOPPELGÄNGER FILES COMPLAINT AFTER FIGHT ALREADY OVER', 'mo.les.tech confirms there is currently no appeals process for hostile internal entities.']
      ],
      combo: [
        ['COMBO ACTIVITY LINKED TO COLLAPSE OF LOCAL DARKNESS', `${summary.combosLanded} combo attacks landed before the paperwork could intervene.`],
        ['ORDERED BEHAVIOR PRODUCES ALARMING RESULTS', 'Investigators say several unrelated responsible decisions may have been coordinated.'],
        ['DARK DOPPELGÄNGER CLAIMS ACTION SEQUENCE WAS “CHEAP”', 'Officials reviewed the footage and awarded the damage anyway.']
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
        ['BALANCED ASSAULT LEAVES DARK DOPPELGÄNGER WITH NOWHERE TO HIDE', 'No single category received enough attention to claim full credit.']
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

    const basePair = deterministicPick(
      pools[personality.key] || pools.custom,
      `${state.current.date}|${personality.key}|${summary.totalDamage}|${summary.combosLanded}`
    );
    return maybeCrestfallenDailyReference(personality, summary, basePair);
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
      revokeCurrentVictoryLoot();
      return false;
    }

    const justDefeated = !state.current.defeatedAt;
    if (justDefeated) {
      state.current.defeatedAt = Date.now();
      rollVictoryLootIfNeeded();
    }

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
    if (isOnceLimitedToday(action) && hasCompletedOnceAction(action.id)) return;

    const beforeSummary = getSummary();
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
    const afterSummary = getSummary();
    const tenaciousResisted = !beforeSummary.tenaciousHolding && afterSummary.tenaciousHolding;
    const attackReport = {
      transactionId: actionTx.id,
      actionName: actionTx.actionName,
      categoryName: actionTx.categoryName,
      baseDamage: actionTx.baseDamage,
      damage: actionTx.damage,
      efficiency: actionTx.efficiency,
      currentHp: afterSummary.currentHp,
      maxHp: afterSummary.maxHp,
      comboName: comboEvent?.comboName || '',
      comboDamage: comboEvent?.damage || 0,
      requiredRemainingCount: afterSummary.requiredRemainingCount,
      tenaciousHolding: afterSummary.tenaciousHolding,
      isTenacious: afterSummary.isTenacious,
      isVictory: afterSummary.isVictory,
      justDefeated,
      overkill: afterSummary.overkill
    };

    saveState();
    render({
      showDayCard: justDefeated,
      justDefeated,
      hitDamage: actionTx.damage,
      hitName: actionTx.actionName,
      comboEvent,
      tenaciousResisted,
      attackReport
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
        'DARK DOPPELGÄNGER DEFEATED; MOLIFE RELUCTANTLY AUTHORIZES 20 XP',
        `${summary.totalDamage} DAMAGE RECORDED; HOSTILE INTERNAL ENTITY NO LONGER OPERATIONAL`,
        summary.overkill > 0
          ? `${summary.overkill} POINTS OF OVERKILL RECORDED; AUTHORITIES DECLINE TO INVESTIGATE`
          : 'DARK DOPPELGÄNGER REACHES EXACTLY ZERO HP; ACCOUNTANTS DESCRIBE RESULT AS DISTURBINGLY TIDY'
      );

      if (summary.combosLanded > 0) {
        messages.push(`${summary.combosLanded} COMBO ATTACK${summary.combosLanded === 1 ? '' : 'S'} LANDED; INTERNAL DARKNESS ALLEGES COLLUSION`);
      }
      if (summary.itemsUsed > 0) {
        messages.push(`${summary.itemsUsed} PAWNSHOP ITEM${summary.itemsUsed === 1 ? '' : 'S'} USED; PERSONAL GROWTH AUTHORITIES LOOK THE OTHER WAY`);
      }
      if (streak >= 3) {
        messages.push(`${streak}-DAY VICTORY STREAK CONTINUES; SITUATION NOW TOO EXPENSIVE TO ABANDON`);
      }
      if (rank.name !== 'Nobody') {
        messages.push(`STREET CRED OFFICE RELUCTANTLY CONFIRMS ${rank.name.toUpperCase()} STATUS`);
      }
      if (state.current.loot?.available) {
        messages.push('UNMARKED CRATE DISCOVERED AFTER HOSTILITIES; CONTENTS RATTLE WHEN SHAKEN');
      } else if (state.current.loot?.claimed && state.current.loot.pendingItem) {
        messages.push(`PHAT ED’S PAWNSHOP CONFIRMS ACQUISITION OF ${itemDisplayName(state.current.loot.pendingItem).toUpperCase()}`);
      }
    } else if (summary.tenaciousHolding) {
      messages.push(
        `DARK DOPPELGÄNGER BACK AT 1 HP; ${summary.requiredRemainingCount} REQUIRED MOVE${summary.requiredRemainingCount === 1 ? '' : 'S'} STILL OUTSTANDING`,
        'LOCAL DARKNESS REFUSES TO REMAIN DEAD; PAPERWORK CITED',
        'TENACIOUS STATUS CONFIRMED; PHAT ED REPORTEDLY HAS ALTERNATIVES'
      );
    } else if (summary.totalDamage === 0) {
      messages.push(
        'DARK DOPPELGÄNGER ENTERS DAY AT FULL HEALTH; CONFIDENCE DESCRIBED AS PREMATURE',
        'USER HAS OPENED MOLIFE. HOSTILITIES HAVE NOT YET COMMENCED.',
        'TRACK-O-TRON STANDING BY. IT CANNOT, LEGALLY, DO THE TASKS FOR YOU.',
        `HOSTILE INTERNAL ENTITY CURRENTLY REPORTS ${summary.maxHp} / ${summary.maxHp} HP`
      );
      if (hour >= 18) messages.push('EVENING UPDATE: DARK DOPPELGÄNGER REMAINS EMBARRASSINGLY UNINJURED');
    } else if (damageRatio < 0.25) {
      messages.push(
        `LOCAL ACTIONS INFLICT ${summary.totalDamage} DAMAGE; USER IMMEDIATELY EXPECTS RECOGNITION`,
        `DARK DOPPELGÄNGER STILL HAS ${remaining} HP; AUTHORITIES DESCRIBE PROGRESS AS ADORABLE`
      );
    } else if (damageRatio < 0.5) {
      messages.push(
        `DARK DOPPELGÄNGER DOWN TO ${remaining} HP; CONFIDENCE REMAINS UNAUTHORIZED`,
        'DAMAGE DETECTED. EXPERTS CAUTION AGAINST CALLING IT A HABIT.'
      );
    } else if (damageRatio < 0.75) {
      messages.push(
        'DEVELOPING: DEFEATING YOURSELF HAS BECOME AN EMBARRASSINGLY REALISTIC POSSIBILITY',
        `DARK DOPPELGÄNGER AT ${remaining} HP; LOCAL EXCUSES BEGIN LOSING CREDIBILITY`
      );
    } else {
      messages.push(
        `DARK DOPPELGÄNGER DOWN TO ${remaining} HP; EXCUSES DEPARTMENT REQUESTS EMERGENCY FUNDING`,
        'NEWSROOM PREPARES RELUCTANT “VICTORY” GRAPHIC'
      );
    }

    if (!summary.isVictory && hour >= 22) {
      messages.push('LATE BULLETIN: DARK DOPPELGÄNGER HAS NOT GONE TO BED JUST BECAUSE YOU WANT TO');
    }

    if (yesterday) {
      messages.push(
        yesterday.won
          ? 'ARCHIVES CONFIRM YESTERDAY’S DARK DOPPELGÄNGER WAS DEFEATED. TODAY’S HAS BEEN INFORMED.'
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
      const efficiency = getCategoryEfficiency(dominant.id, summary.categoryActionCount[dominant.id] || 0);
      if (efficiency.multiplier <= 0.6) {
        messages.push(`TRACK-O-TRON REPORTS ${dominant.name.toUpperCase()} SATURATION; DARK DOPPELGÄNGER HAS DEVELOPED RESISTANCE`);
      } else {
        messages.push(`${dominant.name.toUpperCase()} CURRENTLY LEADS LOCAL DAMAGE MARKETS`);
      }
    }

    const level = getLevelProgress();
    if (level.level >= 2) {
      messages.push(`LEVEL ${level.level} CITIZEN STILL RECEIVES NO ADDITIONAL SALARY OR PARKING PRIVILEGES`);
    }

    messages.push('CITY COUNCIL ANNOUNCES NEW INITIATIVE TO ANNOUNCE MORE INITIATIVES');

    messages.push(...getCrestfallenReferenceMessages(summary, dominant, hour));

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
        ? stringHash(`${state.current.date}|${summary.totalDamage}|${state.history.length}`) % messages.length
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

  async function nudgePortraitOrientation() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (!standalone || !screen.orientation?.lock) return;
    try { await screen.orientation.lock('portrait-primary'); } catch (error) {}
  }

  function animateVisuals(timestamp) {
    visualFrame = requestAnimationFrame(animateVisuals);
    if (document.hidden) { newswireLastFrame = timestamp; return; }
    if (!els.newswireViewport || !els.newswireMessage || reducedMotionQuery.matches) {
      newswireLastFrame = timestamp; return;
    }
    if (!newswireLastFrame) newswireLastFrame = timestamp;
    const deltaSeconds = Math.min(0.05, Math.max(0, (timestamp - newswireLastFrame) / 1000));
    newswireLastFrame = timestamp;
    if (timestamp < newswireSpecialUntil || timestamp < newswirePausedUntil) return;

    newswireOffset -= 36 * deltaSeconds;
    els.newswireMessage.style.transform = `translate3d(${Math.round(newswireOffset)}px,0,0)`;
    if (newswireOffset + els.newswireMessage.scrollWidth < 0) advanceNewswire();
  }

  function startVisualLoop() {
    if (visualFrame) return;
    visualFrame = requestAnimationFrame(animateVisuals);
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
    renderPawnshop(summary, options.lootClaimed?.id || '');
    renderCategories(summary);
    renderCombos();
    renderLog();
    renderHistory();

    let specialMessage = '';
    if (options.lootClaimed) {
      specialMessage = `PHAT ED ITEM ACQUIRED: ${itemDisplayName(options.lootClaimed).toUpperCase()} · ${options.lootClaimed.damage} DMG`;
    } else if (options.itemBypassedTenacity) {
      specialMessage = `TENACITY BROKEN; ${options.hitName.toUpperCase()} ENDS DAILY HOSTILITIES`;
    } else if (options.itemEvent) {
      specialMessage = `${options.hitName.toUpperCase()} USED; ${options.itemEvent.damage} DAMAGE RECORDED`;
    } else if (options.tenaciousResisted) {
      specialMessage = 'DARK DOPPELGÄNGER RETURNS TO 1 HP; TENACIOUS PROTOCOL REMAINS ACTIVE';
    } else if (options.comboEvent) {
      specialMessage = `${options.comboEvent.comboName.toUpperCase()} COMBO LANDS; LOCAL DARKNESS TAKES ADDITIONAL ${options.comboEvent.damage} DAMAGE`;
    } else if (options.justDefeated) {
      specialMessage = '…WE HAVE RECEIVED UPDATED INFORMATION. DARK DOPPELGÄNGER IS DOWN. VICTORY +20 XP.';
    } else if (options.hitDamage && options.hitName) {
      specialMessage = `${options.hitName.toUpperCase()} INFLICTS ${options.hitDamage} DAMAGE ON HOSTILE INTERNAL ENTITY`;
    }
    refreshNewswire(summary, specialMessage);

    if (summary.isVictory && !wasVictory) {
      els.victoryBanner.classList.remove('victory-pop');
      requestAnimationFrame(() => els.victoryBanner.classList.add('victory-pop'));
    }

    if (options.hitDamage) {
      showFightFeedback(options.hitDamage, options.comboEvent, options.tenaciousResisted);
    }

    if (options.attackReport) {
      openAttackReport(options.attackReport);
    }

    wasVictory = summary.isVictory;

    if (options.showDayCard && state.current.dayCard) {
      if (options.attackReport) {
        pendingVictoryReport = true;
      } else {
        queueVictoryDayCard();
      }
    }
  }

  function queueVictoryDayCard() {
    if (!state.current.dayCard) return;
    pendingVictoryReport = false;
    window.clearTimeout(dayCardTimer);
    document.body.classList.remove('day-cleared-flash');
    void document.body.offsetWidth;
    document.body.classList.add('day-cleared-flash');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    dayCardTimer = window.setTimeout(() => {
      document.body.classList.remove('day-cleared-flash');
      openDayCard(state.current.dayCard, { celebrate: true });
    }, reducedMotion ? 0 : 850);
  }

  function attackReportFlavor(report) {
    const baseLines = [
      () => `${report.actionName} made contact. A nearby excuse was seen leaving Crestfallen without forwarding information.`,
      () => `The attack was filed as “routine ${report.categoryName} activity” until investigators noticed ${report.damage} points of darkness missing.`,
      () => `Witnesses describe ${report.actionName} as “surprisingly violent for something from a productivity app.”`,
      () => `MoLife telemetry confirms ${report.actionName} connected with the hostile internal entity. The entity has requested less telemetry.`,
      () => `The Department of Internal Hostilities has approved ${report.actionName} retroactively and denied doing so.`,
      () => `Impact confirmed. Dark Doppelgänger attempted to absorb the hit emotionally; accounting still recorded ${report.damage} DMG.`,
      () => `${report.categoryName} activity entered the scene and immediately made the situation less metaphorical.`,
      () => `No weapon was recovered. Investigators are currently treating ${report.actionName} as the weapon.`
    ];
    const base = deterministicPick(
      baseLines,
      `${state.current.date}|${report.transactionId}|attack-report`
    )();

    const combo = report.comboDamage > 0
      ? ` ${report.comboName} then added ${report.comboDamage} bonus DMG, which investigators are calling “needlessly coordinated.”`
      : '';

    let status;
    if (report.tenaciousHolding) {
      status = ` Target reached lethal damage. The Required Actions Office overruled medical staff and restored it to 1 HP; ${report.requiredRemainingCount} required move${report.requiredRemainingCount === 1 ? '' : 's'} remain.`;
    } else if (report.isVictory) {
      status = report.overkill > 0
        ? ` Hostile internal entity has ceased operations with ${report.overkill} points of unnecessary additional paperwork.`
        : ' Hostile internal entity has ceased operations. Victory paperwork is being generated against its wishes.';
    } else if (report.requiredRemainingCount > 0) {
      status = ` Darkness remains operational under the Tenacious clause: ${report.requiredRemainingCount} required move${report.requiredRemainingCount === 1 ? '' : 's'} still outstanding.`;
    } else if (report.currentHp <= Math.max(1, Math.floor(report.maxHp * 0.25))) {
      status = ` Target remains active at ${report.currentHp} HP and is now officially described as “administratively concerned.”`;
    } else {
      status = ` Target remains active at ${report.currentHp} HP. Further hostilities are authorized.`;
    }

    return `${base}${combo}${status}`;
  }

  function openAttackReport(report) {
    if (!els.attackReportDialog || !report) return;

    const efficiencyPercent = Math.round(report.efficiency * 100);
    const healthRatio = report.currentHp / Math.max(1, report.maxHp);
    const status = report.isVictory
      ? 'HOSTILE DOWN'
      : report.tenaciousHolding
        ? 'TENACIOUS HOLD'
        : healthRatio <= 0.25
          ? 'TARGET CRITICAL'
          : healthRatio <= 0.60
            ? 'TARGET WOUNDED'
            : 'TARGET ACTIVE';

    els.attackReportDialog.classList.toggle('is-victory', report.isVictory);
    els.attackReportDialog.classList.toggle('is-tenacious', report.tenaciousHolding);
    els.attackReportCard?.classList.remove('attack-report-enter');
    els.attackReportStatus.textContent = status;
    els.attackReportAction.textContent = report.actionName;
    els.attackReportCategory.textContent = `${report.categoryName.toUpperCase()} DIVISION`;
    els.attackReportDamage.textContent = `-${report.damage} HP`;
    els.attackReportBaseDamage.textContent = `${report.baseDamage} DMG`;
    els.attackReportEfficiency.textContent = `${efficiencyPercent}%`;
    els.attackReportHp.textContent = `${report.currentHp} / ${report.maxHp}`;

    els.attackReportComboRow.hidden = report.comboDamage <= 0;
    els.attackReportCombo.textContent = report.comboDamage > 0
      ? `${report.comboName} · +${report.comboDamage} DMG`
      : '';

    els.attackReportRequiredRow.hidden = report.requiredRemainingCount <= 0;
    els.attackReportRequired.textContent = report.requiredRemainingCount > 0
      ? `${report.requiredRemainingCount} required move${report.requiredRemainingCount === 1 ? '' : 's'} remain`
      : '';

    els.attackReportMessage.textContent = attackReportFlavor(report);
    els.closeAttackReportButton.textContent = report.justDefeated
      ? 'File victory report'
      : 'Continue hostilities';

    if (typeof els.attackReportDialog.showModal === 'function') {
      els.attackReportDialog.showModal();
    } else {
      els.attackReportDialog.setAttribute('open', '');
    }

    requestAnimationFrame(() => els.attackReportCard?.classList.add('attack-report-enter'));
  }

  function closeAttackReport() {
    if (!els.attackReportDialog?.open) return;
    if (typeof els.attackReportDialog.close === 'function') {
      els.attackReportDialog.close();
    } else {
      els.attackReportDialog.removeAttribute('open');
      if (pendingVictoryReport && state.current.dayCard) queueVictoryDayCard();
    }
  }

  function showFightFeedback(hitDamage, comboEvent = null, tenaciousResisted = false) {
    if (!els.fightFeedback) return;
    els.fightFeedback.textContent = tenaciousResisted
      ? `-${hitDamage} HP · TENACIOUS → 1 HP`
      : comboEvent
        ? `-${hitDamage} HP · COMBO +${comboEvent.damage} DMG`
        : `-${hitDamage} HP`;
    els.fightFeedback.classList.remove('fight-feedback-pop', 'is-combo', 'is-tenacious');
    els.fightCard?.classList.remove('fight-hit');
    void els.fightFeedback.offsetWidth;
    if (comboEvent) els.fightFeedback.classList.add('is-combo');
    if (tenaciousResisted) els.fightFeedback.classList.add('is-tenacious');
    els.fightFeedback.classList.add('fight-feedback-pop');
    els.fightCard?.classList.add('fight-hit');
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
    const healthWidth = `${healthPercent}%`;

    els.totalProgress.style.width = healthWidth;
    els.healthTrail.style.width = healthWidth;
    els.healthPercent.textContent = `${healthPercent}%`;

    const healthState = summary.isVictory
      ? 'down'
      : healthRatio <= 0.25
        ? 'critical'
        : healthRatio <= 0.60
          ? 'wounded'
          : 'active';
    els.fightCard.dataset.health = healthState;
    els.fightCard.classList.toggle('is-tenacious', summary.isTenacious);

    if (els.tenaciousBadge) {
      els.tenaciousBadge.hidden = !summary.isTenacious;
      els.tenaciousBadge.textContent = 'TENACIOUS';
    }
    if (els.tenaciousStatus) {
      els.tenaciousStatus.hidden = !summary.isTenacious;
      els.tenaciousStatus.textContent = summary.isTenacious
        ? `TENACIOUS · ${summary.requiredRemainingCount} REQUIRED MOVE${summary.requiredRemainingCount === 1 ? '' : 'S'} REMAIN`
        : '';
    }

    if (!els.fightCard.classList.contains('is-hud-live')) {
      requestAnimationFrame(() => els.fightCard.classList.add('is-hud-live'));
    }

    if (summary.isVictory) {
      els.statusBadge.textContent = 'HOSTILE DOWN';
      els.heroMessage.textContent = summary.overkill > 0
        ? `Fight over. ${summary.overkill} overkill logged for the record. No extra Victory XP.`
        : 'Fight over. Take the win. Anything else today is optional.';
      els.victoryBanner.hidden = false;
      els.victorySummary.textContent = `VICTORY +${VICTORY_XP} XP · ${summary.totalDamage} DMG${summary.overkill ? ` · ${summary.overkill} overkill` : ''}`;
    } else {
      els.statusBadge.textContent = healthRatio <= 0.25
        ? 'HOSTILE CRITICAL'
        : healthRatio <= 0.60
          ? 'HOSTILE WOUNDED'
          : 'HOSTILE ACTIVE';

      if (summary.tenaciousHolding) {
        els.heroMessage.textContent = `Lethal damage reached, but ${summary.requiredRemainingCount} required move${summary.requiredRemainingCount === 1 ? '' : 's'} remain. Complete them or use a lethal Pawnshop item.`;
      } else if (summary.isTenacious) {
        els.heroMessage.textContent = summary.totalDamage === 0
          ? `${summary.requiredRemainingCount} required move${summary.requiredRemainingCount === 1 ? '' : 's'} must be completed before normal damage can finish the fight.`
          : `${summary.currentHp} HP left · ${summary.requiredRemainingCount} required move${summary.requiredRemainingCount === 1 ? '' : 's'} still outstanding.`;
      } else {
        els.heroMessage.textContent = summary.totalDamage === 0
          ? 'Target standing. Make your moves and end the fight.'
          : `${summary.currentHp} HP left. Do enough to put Dark Doppelgänger down; the rest of the day is yours.`;
      }
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
      els.rankHint.textContent = `${needed} more daily victor${needed === 1 ? 'y' : 'ies'} on the 30-day rap sheet to reach ${rank.next.name}.`;
    } else {
      els.rankHint.textContent = 'Rap sheet maxed. Further daily wins are strictly for personal reasons.';
    }

    els.levelNumber.textContent = level.level;
    els.levelProgressText.textContent = `${level.into} / ${level.requirement} Victory XP`;
    els.levelProgress.style.width = `${Math.round(level.percent * 100)}%`;

    els.streakCount.textContent = `${streak} day${streak === 1 ? '' : 's'}`;
    els.bestStreak.textContent = `Best: ${best}`;
  }



  function victoryCrateFlavor() {
    return deterministicPick([
      'Suspicious package detected. Contents probably legal somewhere.',
      'Unmarked crate recovered. Phat Ed’s Pawnshop denies recognizing the handwriting.',
      'Pawnshop delivery received. Receipt field contains only a shrug.',
      'Mystery crate located after hostilities. Phat Ed requests everyone stop looking at him.',
      'Questionable anti-darkness item detected. Warranty status: spiritually complicated.'
    ], `${state.current.date}|crate-flavor`);
  }

  function renderPawnshop(summary, newlyClaimedId = '') {
    if (!els.arsenalPanel || !els.arsenalList) return;

    const inventory = state.inventory.items;
    const capacityText = inventory.length > ITEM_CAPACITY
      ? `${inventory.length} / ${ITEM_CAPACITY} ITEMS · OVER CAPACITY`
      : `${inventory.length} / ${ITEM_CAPACITY} ITEMS`;
    els.arsenalCount.textContent = capacityText;

    const loot = state.current.loot || emptyLootState();
    els.lootDrop.hidden = !loot.available;

    if (loot.available && loot.pendingItem) {
      els.lootDropMessage.textContent = victoryCrateFlavor();
      els.lootCrateButton.disabled = false;
      els.lootCrateButton.setAttribute('aria-label', 'Open mystery Pawnshop crate');
    } else if (summary.isVictory && loot.claimed && loot.pendingItem) {
      els.lootDropMessage.textContent = `Acquired: ${itemDisplayName(loot.pendingItem)} · ${loot.pendingItem.damage} DMG`;
    } else if (summary.isVictory && loot.rolled && !loot.pendingItem && inventory.length >= ITEM_CAPACITY) {
      els.lootDropMessage.textContent = 'Pawnshop storage full. No mystery crate issued today.';
    } else if (summary.isVictory && loot.rolled) {
      els.lootDropMessage.textContent = 'No Pawnshop item today. Phat Ed appears unmoved.';
    } else {
      els.lootDropMessage.textContent = 'Each victory has a 40% chance to attract one questionable item while you have room.';
    }

    els.arsenalStatus.textContent = summary.isVictory
      ? 'Target down · save the good stuff for a worse day.'
      : inventory.length >= ITEM_CAPACITY
        ? 'Storage full · use something before Phat Ed “finds” another item.'
        : inventory.length
          ? 'Items are consumed when used. A lethal item can punch through Tenacious.'
          : 'Empty. Win fights for a chance to acquire questionable merchandise.';

    els.arsenalList.replaceChildren();

    if (!inventory.length) {
      const empty = document.createElement('div');
      empty.className = 'arsenal-empty';
      empty.textContent = 'NO QUESTIONABLE MERCHANDISE ON FILE';
      els.arsenalList.append(empty);
      return;
    }

    [...inventory]
      .sort((a, b) => b.damage - a.damage || b.acquiredAt - a.acquiredAt)
      .forEach(item => {
        const definition = itemDefinition(item.itemId);
        if (!definition) return;

        const card = document.createElement('article');
        card.className = `weapon-card item-card condition-${item.conditionId || 'rite'}${definition.special ? ' is-rite' : ''}${item.id === newlyClaimedId ? ' is-new' : ''}${summary.isVictory ? ' is-locked' : ''}`;
        card.tabIndex = 0;
        card.dataset.itemInstanceId = item.id;
        card.setAttribute('aria-label', `${itemDisplayName(item)}, ${item.damage} damage. Inspect item details.`);

        const condition = document.createElement('span');
        condition.className = 'weapon-condition';
        condition.textContent = definition.special
          ? 'LEGENDARY'
          : (itemCondition(item.conditionId)?.name || 'Unknown').toUpperCase();

        const name = document.createElement('strong');
        name.className = 'weapon-name';
        name.textContent = definition.name;

        const damage = document.createElement('span');
        damage.className = 'weapon-damage';
        damage.textContent = `${item.damage} DMG`;

        const description = document.createElement('p');
        description.className = 'item-description';
        description.textContent = definition.flavor;

        const use = document.createElement('button');
        use.type = 'button';
        use.className = 'weapon-fire item-use';
        use.disabled = summary.isVictory;
        use.textContent = summary.isVictory ? 'SAVE ITEM' : 'USE ITEM';
        use.addEventListener('click', event => {
          event.stopPropagation();
          usePawnshopItem(item.id);
        });

        const toggleInspect = () => {
          card.classList.toggle('is-inspected');
        };
        card.addEventListener('click', event => {
          if (event.target.closest('button')) return;
          toggleInspect();
        });
        card.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          toggleInspect();
        });

        card.append(condition, name, damage, description, use);
        els.arsenalList.append(card);
      });
  }

  function renderCategories(summary) {
    els.categoriesGrid.querySelectorAll('.category-card[data-category-id]').forEach(card => {
      const list = card.querySelector('.actions-list');
      if (list) categoryScrollPositions.set(card.dataset.categoryId, list.scrollTop);
    });
    els.categoriesGrid.replaceChildren();

    const visibleCategories = state.settings.categories.filter(category => {
      if (category.id !== UNCATEGORIZED_ID) return true;
      const hasActions = state.settings.actions.some(action => action.categoryId === UNCATEGORIZED_ID && action.trackVisible !== false);
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
      const focusToggle = fragment.querySelector('.category-focus-toggle');
      const efficiencyValue = fragment.querySelector('.efficiency-value');
      const fill = fragment.querySelector('.category-meter-fill');
      const next = fragment.querySelector('.efficiency-next');
      const actionDeck = fragment.querySelector('.action-deck');
      const actionsList = fragment.querySelector('.actions-list');

      const dealtDamage = summary.categoryDamage[category.id] || 0;
      const actionCount = summary.categoryActionCount[category.id] || 0;
      const efficiency = getCategoryEfficiency(category.id, actionCount);
      applyCategoryPaletteVars(card, category, index);
      card.dataset.categoryId = category.id;
      if (category.id === UNCATEGORIZED_ID) card.classList.add('is-fallback-category');
      card.classList.toggle('is-focused-category', efficiency.focused);

      icon.textContent = category.icon;
      title.textContent = category.name;
      score.textContent = `${dealtDamage} DMG`;

      if (category.id === UNCATEGORIZED_ID) {
        focusToggle.hidden = true;
        subtitle.textContent = 'Fallback · fixed 50% damage';
        efficiencyValue.textContent = '50%';
        fill.style.width = '100%';
        next.textContent = 'Assign these actions to a real category when convenient.';
      } else {
        const overallPercent = Math.round(efficiency.multiplier * 100);
        const resistancePercent = Math.round(efficiency.resistance * 100);
        const focusFactor = clampNumber(state.settings.focusFactor, 1, 10, DEFAULT_FOCUS_FACTOR);
        focusToggle.hidden = false;
        focusToggle.classList.toggle('is-active', efficiency.focused);
        focusToggle.setAttribute('aria-pressed', efficiency.focused ? 'true' : 'false');
        focusToggle.textContent = efficiency.focused ? 'FOCUSED' : 'FOCUS';
        focusToggle.title = efficiency.focused
          ? 'Remove Focus from this category'
          : `Focus ${category.name}; only one category can be focused`;
        focusToggle.addEventListener('click', () => toggleFocusedCategory(category.id));

        subtitle.textContent = efficiency.focused
          ? `Focused · ${focusFactor.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}× workload`
          : 'Standard priority';
        efficiencyValue.textContent = `${overallPercent}%`;
        fill.style.width = `${resistancePercent}%`;
        next.textContent = efficiency.nextResistance === null
          ? `Resistance floor reached · category stays at ${resistancePercent}%${efficiency.focused ? ' before Focus' : ''}`
          : `Category resistance ${resistancePercent}% · next action drops to ${Math.round(efficiency.nextResistance * 100)}%${efficiency.focused ? ' before Focus' : ''}`;
      }

      const originalOrder = new Map(state.settings.actions.map((action, actionIndex) => [action.id, actionIndex]));
      const requirementRank = action => {
        const progress = summary.requiredProgress[action.id];
        if (!progress) return 2;
        return progress.remainingCount > 0 ? 0 : 1;
      };
      const actions = state.settings.actions
        .filter(action => action.categoryId === category.id && action.trackVisible !== false)
        .sort((a, b) => requirementRank(a) - requirementRank(b)
          || (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0));

      if (!actions.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        const hasHiddenActions = state.settings.actions.some(action => action.categoryId === category.id && action.trackVisible === false);
        empty.textContent = category.id === UNCATEGORIZED_ID
          ? 'Deleted-category actions will hide here.'
          : hasHiddenActions ? 'No visible attacks. Unhide one in Settings.' : 'No actions yet. Add one in Settings.';
        actionsList.append(empty);
      } else {
        actions.forEach(action => {
          const reward = calculateDamage(action, actionCount);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'action-button';
          button.dataset.actionId = action.id;

          const completedToday = hasCompletedOnceAction(action.id);
          const used = isOnceLimitedToday(action) && completedToday;
          const requiredProgress = summary.requiredProgress[action.id] || null;
          const requiredToday = Boolean(requiredProgress);
          const requiredNextFight = Boolean(action.requiredForVictory) && !requiredToday;
          const requiredComplete = requiredToday && requiredProgress.remainingCount === 0;
          button.disabled = used;
          button.classList.toggle('is-required', requiredToday);
          button.classList.toggle('is-required-complete', requiredComplete);
          button.classList.toggle('is-required-next', requiredNextFight);

          const nameWrap = document.createElement('span');
          nameWrap.className = 'action-name';
          const strong = document.createElement('strong');
          strong.textContent = action.name;
          const requiredBadge = document.createElement('span');
          requiredBadge.className = 'required-action-badge';
          if (requiredToday) {
            requiredBadge.textContent = requiredProgress.requiredCount > 1
              ? `REQUIRED · ${requiredProgress.completedCount} / ${requiredProgress.requiredCount}${requiredComplete ? ' ✓' : ''}`
              : (requiredComplete ? 'REQUIRED ✓' : 'REQUIRED');
          } else if (requiredNextFight) {
            requiredBadge.textContent = action.type === 'repeatable' && action.requiredCount > 1
              ? `REQUIRED NEXT FIGHT · ×${action.requiredCount}`
              : 'REQUIRED NEXT FIGHT';
          }
          const small = document.createElement('small');
          if (used) {
            small.textContent = 'Completed today';
          } else {
            const payout = Math.round(reward.efficiency * 100);
            const typeText = action.type === 'once' && !isOnceLimitedToday(action)
              ? 'Repeatable for today’s requirement'
              : action.type === 'once'
                ? 'Once per day'
                : 'Repeatable';
            small.textContent = payout === 100 ? `${typeText} · full base damage` : `${typeText} · ${payout}% of base damage`;
          }

          nameWrap.append(strong);
          if (requiredToday || requiredNextFight) nameWrap.append(requiredBadge);
          nameWrap.append(small);

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
      row.className = `log-row${tx.type === 'combo' ? ' combo-log-row' : tx.type === 'item' ? ' weapon-log-row item-log-row' : ''}`;

      const main = document.createElement('div');
      main.className = 'log-main';
      const strong = document.createElement('strong');
      strong.textContent = tx.type === 'combo'
        ? `COMBO · ${tx.comboName}`
        : tx.type === 'item'
          ? `ITEM · ${tx.conditionName ? `${tx.conditionName} ` : ''}${tx.itemName}`
          : tx.actionName;
      const meta = document.createElement('span');
      const time = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(tx.timestamp));
      meta.textContent = tx.type === 'combo'
        ? `×${tx.multiplier.toFixed(2)} · ${tx.sourceTransactionIds.length} matched actions · ${time}`
        : tx.type === 'item'
          ? `Phat Ed’s Pawnshop · consumed · ${time}`
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
        ? (day.dayCard?.type || 'Dark Doppelgänger defeated')
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

  function openDayCard(card, { celebrate = false } = {}) {
    if (!card) return;

    els.dayCardDialog.classList.toggle('is-victory-reveal', celebrate);

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


  function lockSettingsBackgroundScroll() {
    if (document.body.classList.contains('settings-open')) return;
    settingsBackgroundScrollY = window.scrollY;
    document.body.style.top = `-${settingsBackgroundScrollY}px`;
    document.body.classList.add('settings-open');
  }

  function unlockSettingsBackgroundScroll() {
    if (!document.body.classList.contains('settings-open')) return;
    document.body.classList.remove('settings-open');
    document.body.style.top = '';
    window.scrollTo(0, settingsBackgroundScrollY);
  }


  function openSettings() {
    settingsDraft = deepClone(state.settings);
    settingsDraft.categories = ensureUncategorizedCategory(settingsDraft.categories);
    settingsDraft.combos = Array.isArray(settingsDraft.combos) ? settingsDraft.combos : [];
    els.goalInput.value = settingsDraft.fullEnemyHp;
    els.focusFactorInput.value = clampNumber(settingsDraft.focusFactor, 1, 10, DEFAULT_FOCUS_FACTOR);
    els.resistanceBuildupInput.value = clampNumber(settingsDraft.resistanceBuildup, 0, 2, DEFAULT_RESISTANCE_BUILDUP);
    els.settingsMessage.textContent = 'Changes save automatically. Enemy HP and Required-for-victory changes apply to the next daily fight.';
    if (els.newCategoryColor) {
      const customCount = settingsDraft.categories.filter(
        category => category.id !== UNCATEGORIZED_ID && !DEFAULT_CATEGORY_COLORS[category.id]
      ).length;
      els.newCategoryColor.value = CUSTOM_CATEGORY_COLORS[customCount % CUSTOM_CATEGORY_COLORS.length];
    }
    updateGoalPreview();
    renderCategoriesEditor();
    renderActionsEditor();
    renderCombosEditor();
    populateCategorySelect();

    if (typeof els.settingsDialog.showModal === 'function') {
      els.settingsDialog.showModal();
    } else {
      els.settingsDialog.setAttribute('open', '');
    }
    lockSettingsBackgroundScroll();
  }

  function updateGoalPreview() {
    if (!els.goalPreview || !settingsDraft) return;
    const nextHp = clampInt(els.goalInput.value, 20, 1000, settingsDraft.fullEnemyHp);
    els.goalPreview.textContent = `Every new fight starts at ${nextHp} HP. Today's ${state.current.maxHp} HP is already locked.`;
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
        note.textContent = 'Permanent fallback · fixed 50% damage';
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
        if (settingsDraft.focusCategoryId === category.id) settingsDraft.focusCategoryId = null;
        renderCategoriesEditor();
        renderActionsEditor();
        populateCategorySelect();
        els.settingsMessage.textContent = moved
          ? `${moved} action${moved === 1 ? '' : 's'} moved to Uncategorized.`
          : 'Category removed.';
        commitSettingsDraft();
      });

      row.style.setProperty('--editor-category-color', categoryColor(category));
      grid.append(nameLabel, iconLabel, colorLabel, remove);
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

    const {
      row,
      pointerId,
      move,
      end,
      cancel,
      escape,
      blur
    } = actionDrag;

    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', end, true);
    document.removeEventListener('pointercancel', cancel, true);
    document.removeEventListener('keydown', escape, true);
    window.removeEventListener('blur', blur);

    row.classList.remove('is-dragging');
    document.body.classList.remove('is-reordering-actions');
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
    if (!settingsDraft || actionDrag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();

    const pointerId = event.pointerId;

    const move = moveEvent => {
      if (!actionDrag || moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();

      const siblings = [...els.actionsEditor.querySelectorAll('.action-editor-row[data-action-id]')]
        .filter(candidate => candidate !== row);

      const before = siblings.find(candidate => {
        const rect = candidate.getBoundingClientRect();
        return moveEvent.clientY < rect.top + (rect.height / 2);
      });

      if (before) {
        before.before(row);
      } else {
        els.actionsEditor.append(row);
      }

      const dialogRect = els.settingsDialog.getBoundingClientRect();
      const edge = Math.min(96, Math.max(56, dialogRect.height * 0.12));
      let scrollDelta = 0;

      if (moveEvent.clientY < dialogRect.top + edge) {
        const pressure = 1 - Math.max(0, moveEvent.clientY - dialogRect.top) / edge;
        scrollDelta = -Math.ceil(6 + (18 * pressure));
      } else if (moveEvent.clientY > dialogRect.bottom - edge) {
        const pressure = 1 - Math.max(0, dialogRect.bottom - moveEvent.clientY) / edge;
        scrollDelta = Math.ceil(6 + (18 * pressure));
      }

      if (scrollDelta) {
        els.settingsDialog.scrollBy({ top: scrollDelta, behavior: 'auto' });
      }
    };

    const end = endEvent => {
      if (!actionDrag || endEvent.pointerId !== pointerId) return;
      finishActionDrag();
    };

    const cancel = cancelEvent => {
      if (!actionDrag || cancelEvent.pointerId !== pointerId) return;
      finishActionDrag({ cancelled: true });
    };

    const escape = keyEvent => {
      if (keyEvent.key !== 'Escape' || !actionDrag) return;
      keyEvent.preventDefault();
      finishActionDrag({ cancelled: true });
    };

    const blur = () => {
      if (actionDrag) finishActionDrag({ cancelled: true });
    };

    actionDrag = {
      row,
      handle,
      pointerId,
      move,
      end,
      cancel,
      escape,
      blur
    };

    row.classList.add('is-dragging');
    document.body.classList.add('is-reordering-actions');

    document.addEventListener('pointermove', move, { capture: true, passive: false });
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
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
    } else if (mode === 'damage') {
      indexed.sort((a, b) => (
        b.action.baseDamage - a.action.baseDamage
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
    renderCombosEditor();
    commitSettingsDraft({ announce: false });
    if (els.actionSortSelect) els.actionSortSelect.value = '';

    const labels = { category: 'category', damage: 'damage', name: 'name' };
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
      nameInput.type = 'text'; nameInput.maxLength = 40; nameInput.value = action.name;
      nameInput.addEventListener('input', () => { action.name = nameInput.value.slice(0, 100); renderCombosEditor(); });
      nameLabel.append(nameInput);

      const categoryLabel = document.createElement('label');
      categoryLabel.innerHTML = '<span>Category</span>';
      const categorySelect = document.createElement('select');
      settingsDraft.categories.forEach(categoryItem => {
        const option = document.createElement('option'); option.value = categoryItem.id; option.textContent = categoryItem.name; categorySelect.append(option);
      });
      categorySelect.value = action.categoryId;
      categorySelect.addEventListener('change', () => {
        action.categoryId = categorySelect.value;
        const nextIndex = settingsDraft.categories.findIndex(categoryItem => categoryItem.id === action.categoryId);
        applyCategoryPaletteVars(row, settingsDraft.categories[nextIndex] || uncategorizedCategory(), Math.max(0, nextIndex));
      });
      categoryLabel.append(categorySelect);

      const damageLabel = document.createElement('label');
      damageLabel.innerHTML = '<span>Base Damage</span>';
      const damageInput = document.createElement('input');
      damageInput.type = 'number'; damageInput.min = '1'; damageInput.max = '200'; damageInput.step = '1'; damageInput.value = action.baseDamage;
      damageInput.addEventListener('input', () => { action.baseDamage = clampInt(damageInput.value, 1, 200, action.baseDamage); });
      damageLabel.append(damageInput);

      const typeLabel = document.createElement('label');
      typeLabel.innerHTML = '<span>Type</span>';
      const typeSelect = document.createElement('select');
      typeSelect.innerHTML = '<option value="repeatable">Repeatable</option><option value="once">Once per day</option>';
      typeSelect.value = action.type;
      typeLabel.append(typeSelect);

      const requiredLabel = document.createElement('label');
      requiredLabel.className = 'action-required-field';
      const requiredTitle = document.createElement('span'); requiredTitle.textContent = 'Victory rule';
      const requiredToggle = document.createElement('span'); requiredToggle.className = 'action-visibility-toggle action-required-toggle';
      const requiredInput = document.createElement('input'); requiredInput.type = 'checkbox'; requiredInput.checked = Boolean(action.requiredForVictory);
      const requiredText = document.createElement('span'); requiredText.textContent = 'Required';
      requiredToggle.append(requiredInput, requiredText); requiredLabel.append(requiredTitle, requiredToggle);

      const requiredCountLabel = document.createElement('label');
      requiredCountLabel.className = 'action-required-count-field';
      requiredCountLabel.innerHTML = '<span>Required repetitions</span>';
      const requiredCountInput = document.createElement('input');
      requiredCountInput.type = 'number'; requiredCountInput.min = '1'; requiredCountInput.max = String(REQUIRED_COUNT_MAX); requiredCountInput.step = '1'; requiredCountInput.inputMode = 'numeric';
      requiredCountInput.value = action.type === 'once' ? '1' : String(clampInt(action.requiredCount, 1, REQUIRED_COUNT_MAX, 1));
      requiredCountLabel.append(requiredCountInput);

      const visibilityLabel = document.createElement('label');
      visibilityLabel.className = 'action-visibility-field';
      const visibilityTitle = document.createElement('span'); visibilityTitle.textContent = 'Track-o-Tron';
      const visibilityToggle = document.createElement('span'); visibilityToggle.className = 'action-visibility-toggle';
      const visibilityInput = document.createElement('input'); visibilityInput.type = 'checkbox'; visibilityInput.checked = action.trackVisible !== false;
      const visibilityText = document.createElement('span'); visibilityText.textContent = 'Show';
      visibilityToggle.append(visibilityInput, visibilityText); visibilityLabel.append(visibilityTitle, visibilityToggle);

      const requiredToday = (state.current.requiredActions || []).some(required => required.actionId === action.id);
      const syncRequiredControls = () => {
        const isRepeatable = typeSelect.value === 'repeatable';
        if (!isRepeatable) { action.requiredCount = 1; requiredCountInput.value = '1'; }
        requiredCountInput.disabled = !requiredInput.checked || !isRepeatable;
      };
      const syncVisibilityStyle = () => {
        const mustStayVisible = requiredInput.checked || requiredToday;
        if (mustStayVisible) { visibilityInput.checked = true; action.trackVisible = true; }
        visibilityInput.disabled = mustStayVisible;
        row.classList.toggle('is-track-hidden', !visibilityInput.checked);
        row.classList.toggle('is-required-action', requiredInput.checked || requiredToday);
        syncRequiredControls();
      };

      typeSelect.addEventListener('change', () => { action.type = typeSelect.value === 'once' ? 'once' : 'repeatable'; syncRequiredControls(); });
      requiredInput.addEventListener('change', () => { action.requiredForVictory = requiredInput.checked; syncVisibilityStyle(); });
      requiredCountInput.addEventListener('input', () => {
        if (typeSelect.value === 'repeatable') action.requiredCount = clampInt(requiredCountInput.value, 1, REQUIRED_COUNT_MAX, action.requiredCount || 1);
      });
      visibilityInput.addEventListener('change', () => { action.trackVisible = visibilityInput.checked; syncVisibilityStyle(); });
      syncVisibilityStyle();

      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'delete-action'; remove.textContent = '×'; remove.setAttribute('aria-label', `Delete ${action.name}`);
      remove.addEventListener('click', () => {
        settingsDraft.actions = settingsDraft.actions.filter(item => item.id !== action.id);
        settingsDraft.combos.forEach(combo => {
          combo.actionIds = combo.actionIds.filter(actionId => actionId !== action.id);
          if (combo.actionIds.length < 2) combo.enabled = false;
        });
        const duplicateCombosDisabled = disableDuplicateEnabledCombos(settingsDraft.combos);
        renderActionsEditor(); renderCombosEditor(); populateCategorySelect();
        els.settingsMessage.textContent = duplicateCombosDisabled
          ? 'Action removed. Affected combos were updated; a duplicate sequence was disabled.'
          : 'Action removed. Affected combo steps were updated.';
        commitSettingsDraft();
      });

      grid.append(nameLabel, categoryLabel, damageLabel, typeLabel, requiredLabel, requiredCountLabel, visibilityLabel, remove);
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

    const category = { id: makeId('category'), name, icon, color };
    const fallbackIndex = settingsDraft.categories.findIndex(item => item.id === UNCATEGORIZED_ID);
    settingsDraft.categories.splice(fallbackIndex < 0 ? settingsDraft.categories.length : fallbackIndex, 0, category);

    els.newCategoryName.value = '';
    els.newCategoryIcon.value = '';
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


  function syncNewActionRequirementControls() {
    if (!els.newActionRequiredCount || !els.newActionType || !els.newActionRequired) return;
    const repeatable = els.newActionType.value === 'repeatable';
    if (!repeatable) els.newActionRequiredCount.value = '1';
    els.newActionRequiredCount.disabled = !repeatable || !els.newActionRequired.checked;
  }


  function addActionFromForm() {
    const name = els.newActionName.value.trim();
    const categoryId = els.newActionCategory.value;
    const baseDamage = clampInt(els.newActionDamage.value, 1, 200, 10);
    const type = els.newActionType.value === 'once' ? 'once' : 'repeatable';
    const requiredForVictory = Boolean(els.newActionRequired?.checked);
    const requiredCount = type === 'repeatable' ? clampInt(els.newActionRequiredCount?.value, 1, REQUIRED_COUNT_MAX, 1) : 1;
    const trackVisible = requiredForVictory ? true : (els.newActionVisible ? els.newActionVisible.checked : true);

    if (!name) { els.settingsMessage.textContent = 'Give the action a name first.'; els.newActionName.focus(); return; }
    if (!settingsDraft.categories.some(category => category.id === categoryId)) { els.settingsMessage.textContent = 'Choose a valid category.'; return; }

    settingsDraft.actions.push({ id: makeId('action'), categoryId, name, baseDamage, type, requiredForVictory, requiredCount, trackVisible });
    els.newActionName.value = ''; els.newActionDamage.value = '10'; els.newActionType.value = 'repeatable';
    if (els.newActionRequired) els.newActionRequired.checked = false;
    if (els.newActionRequiredCount) els.newActionRequiredCount.value = '1';
    if (els.newActionVisible) els.newActionVisible.checked = true;
    syncNewActionRequirementControls();
    renderActionsEditor(); renderCombosEditor();
    els.settingsMessage.textContent = 'Action added. Dark Doppelgänger has been notified.';
    commitSettingsDraft();
  }

  function comboFingerprint(actionIds) {
    return actionIds.join('\u001f');
  }

  function disableDuplicateEnabledCombos(combos) {
    const seen = new Set();
    let disabled = 0;
    combos.forEach(combo => {
      if (!combo.enabled || combo.actionIds.length < 2) return;
      const fingerprint = comboFingerprint(combo.actionIds);
      if (seen.has(fingerprint)) {
        combo.enabled = false;
        disabled += 1;
      } else {
        seen.add(fingerprint);
      }
    });
    return disabled;
  }

  function comboChanged(a, b) {
    if (!a || !b) return true;
    return a.name !== b.name
      || Number(a.multiplier) !== Number(b.multiplier)
      || Boolean(a.enabled) !== Boolean(b.enabled)
      || comboFingerprint(a.actionIds || []) !== comboFingerprint(b.actionIds || []);
  }

  function actionOption(action, selectedId) {
    const option = document.createElement('option');
    option.value = action.id;
    option.textContent = action.name;
    option.selected = action.id === selectedId;
    return option;
  }

  function renderCombosEditor() {
    if (!els.combosEditor) return;
    els.combosEditor.replaceChildren();

    if (!settingsDraft.combos.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state combo-editor-empty';
      empty.textContent = 'No combos yet. Coordinated self-improvement remains legally unproven.';
      els.combosEditor.append(empty);
      return;
    }

    settingsDraft.combos.forEach(combo => {
      const card = document.createElement('div');
      card.className = 'combo-editor-card combo-direct-editor';
      card.dataset.comboId = combo.id;

      const head = document.createElement('div');
      head.className = 'combo-editor-head';

      const nameLabel = document.createElement('label');
      nameLabel.className = 'combo-name-field';
      nameLabel.innerHTML = '<span>Name</span>';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 80;
      nameInput.value = combo.name;
      nameInput.addEventListener('input', () => {
        combo.name = nameInput.value.slice(0, 80);
      });
      nameLabel.append(nameInput);

      const multiplierLabel = document.createElement('label');
      multiplierLabel.innerHTML = '<span>Multiplier</span>';
      const multiplierInput = document.createElement('input');
      multiplierInput.type = 'number';
      multiplierInput.min = String(COMBO_MIN_MULTIPLIER);
      multiplierInput.max = String(COMBO_MAX_MULTIPLIER);
      multiplierInput.step = '0.05';
      multiplierInput.inputMode = 'decimal';
      multiplierInput.value = Number(combo.multiplier).toFixed(2);
      multiplierInput.addEventListener('input', () => {
        combo.multiplier = clampNumber(
          multiplierInput.value,
          COMBO_MIN_MULTIPLIER,
          COMBO_MAX_MULTIPLIER,
          combo.multiplier
        );
      });
      multiplierLabel.append(multiplierInput);

      const enabledLabel = document.createElement('label');
      enabledLabel.className = 'combo-enabled-field';
      const enabledTitle = document.createElement('span');
      enabledTitle.textContent = 'Enabled';
      const enabledToggle = document.createElement('span');
      enabledToggle.className = 'checkbox-row';
      const enabledInput = document.createElement('input');
      enabledInput.type = 'checkbox';
      enabledInput.checked = combo.enabled !== false;
      const enabledText = document.createElement('span');
      enabledText.textContent = enabledInput.checked ? 'On' : 'Off';
      enabledInput.addEventListener('change', () => {
        combo.enabled = enabledInput.checked && combo.actionIds.length >= 2;
        enabledInput.checked = combo.enabled;
        enabledText.textContent = combo.enabled ? 'On' : 'Off';
      });
      enabledToggle.append(enabledInput, enabledText);
      enabledLabel.append(enabledTitle, enabledToggle);

      const removeCombo = document.createElement('button');
      removeCombo.type = 'button';
      removeCombo.className = 'delete-action combo-delete';
      removeCombo.textContent = '×';
      removeCombo.setAttribute('aria-label', `Delete combo ${combo.name}`);
      removeCombo.addEventListener('click', () => {
        settingsDraft.combos = settingsDraft.combos.filter(item => item.id !== combo.id);
        renderCombosEditor();
        els.settingsMessage.textContent = 'Combo removed.';
        commitSettingsDraft();
      });

      head.append(nameLabel, multiplierLabel, enabledLabel, removeCombo);
      card.append(head);

      const sequence = document.createElement('div');
      sequence.className = 'combo-sequence-editor';

      combo.actionIds.forEach((actionId, stepIndex) => {
        const step = document.createElement('div');
        step.className = 'combo-step-editor';

        const number = document.createElement('span');
        number.className = 'combo-step-number';
        number.textContent = String(stepIndex + 1);

        const select = document.createElement('select');
        select.setAttribute('aria-label', `Step ${stepIndex + 1} action`);
        settingsDraft.actions.forEach(action => select.append(actionOption(action, actionId)));
        select.value = actionId;
        select.addEventListener('change', () => {
          combo.actionIds[stepIndex] = select.value;
          renderCombosEditor();
          els.settingsMessage.textContent = 'Combo sequence updated. Today’s progress for it was reset.';
          commitSettingsDraft();
        });

        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'combo-step-button';
        up.textContent = '↑';
        up.title = 'Move step up';
        up.disabled = stepIndex === 0;
        up.addEventListener('click', () => {
          [combo.actionIds[stepIndex - 1], combo.actionIds[stepIndex]] = [
            combo.actionIds[stepIndex],
            combo.actionIds[stepIndex - 1]
          ];
          renderCombosEditor();
          commitSettingsDraft();
        });

        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'combo-step-button';
        down.textContent = '↓';
        down.title = 'Move step down';
        down.disabled = stepIndex === combo.actionIds.length - 1;
        down.addEventListener('click', () => {
          [combo.actionIds[stepIndex + 1], combo.actionIds[stepIndex]] = [
            combo.actionIds[stepIndex],
            combo.actionIds[stepIndex + 1]
          ];
          renderCombosEditor();
          commitSettingsDraft();
        });

        const removeStep = document.createElement('button');
        removeStep.type = 'button';
        removeStep.className = 'combo-step-button is-delete';
        removeStep.textContent = '×';
        removeStep.title = 'Remove step';
        removeStep.addEventListener('click', () => {
          combo.actionIds.splice(stepIndex, 1);
          if (combo.actionIds.length < 2) combo.enabled = false;
          renderCombosEditor();
          els.settingsMessage.textContent = combo.actionIds.length < 2
            ? 'Combo disabled: it needs at least 2 actions.'
            : 'Combo step removed. Today’s progress for it was reset.';
          commitSettingsDraft();
        });

        step.append(number, select, up, down, removeStep);
        sequence.append(step);
      });

      card.append(sequence);

      const footer = document.createElement('div');
      footer.className = 'combo-editor-footer';

      const addStep = document.createElement('button');
      addStep.type = 'button';
      addStep.className = 'secondary-button combo-add-step';
      addStep.textContent = '+ Add step';
      addStep.disabled = settingsDraft.actions.length === 0 || combo.actionIds.length >= COMBO_MAX_STEPS;
      addStep.addEventListener('click', () => {
        if (!settingsDraft.actions.length || combo.actionIds.length >= COMBO_MAX_STEPS) return;
        combo.actionIds.push(settingsDraft.actions[0].id);
        renderCombosEditor();
        els.settingsMessage.textContent = 'Combo step added. Today’s progress for it was reset.';
        commitSettingsDraft();
      });

      const status = document.createElement('span');
      status.className = 'combo-editor-status';
      if (combo.actionIds.length < 2) {
        status.classList.add('is-warning');
        status.textContent = 'Needs at least 2 actions · disabled';
      } else {
        status.textContent = `${combo.actionIds.length}/${COMBO_MAX_STEPS} steps · ordered, non-strict`;
      }

      footer.append(addStep, status);
      card.append(footer);
      els.combosEditor.append(card);
    });
  }

  function addComboFromForm() {
    if (!settingsDraft.actions.length) {
      els.settingsMessage.textContent = 'Add at least one action before creating a combo.';
      return;
    }

    const name = els.newComboName.value.trim();
    if (!name) {
      els.settingsMessage.textContent = 'Give the combo a name first.';
      els.newComboName.focus();
      return;
    }

    const multiplier = clampNumber(
      els.newComboMultiplier.value,
      COMBO_MIN_MULTIPLIER,
      COMBO_MAX_MULTIPLIER,
      COMBO_DEFAULT_MULTIPLIER
    );
    const actionIds = settingsDraft.actions.length >= 2
      ? [settingsDraft.actions[0].id, settingsDraft.actions[1].id]
      : [settingsDraft.actions[0].id, settingsDraft.actions[0].id];

    const fingerprint = comboFingerprint(actionIds);
    const starterSequenceIsDuplicate = settingsDraft.combos.some(
      combo => combo.enabled && comboFingerprint(combo.actionIds) === fingerprint
    );

    settingsDraft.combos.push({
      id: makeId('combo'),
      name: name.slice(0, 80),
      multiplier,
      enabled: !starterSequenceIsDuplicate,
      actionIds
    });

    els.newComboName.value = '';
    els.newComboMultiplier.value = COMBO_DEFAULT_MULTIPLIER.toFixed(2);
    renderCombosEditor();
    els.settingsMessage.textContent = starterSequenceIsDuplicate
      ? 'Combo created disabled because its starter sequence duplicates an enabled combo. Edit its sequence, then enable it.'
      : 'Combo created. Configure its ordered sequence below.';
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
    const requiredTodayIds = new Set((state.current.requiredActions || []).map(required => required.actionId));
    const actions = settingsDraft.actions.map(action => {
      const requiredForVictory = Boolean(action.requiredForVictory);
      const type = action.type === 'once' ? 'once' : 'repeatable';
      return {
        ...action,
        name: String(action.name || '').trim(),
        categoryId: categoryIds.has(action.categoryId) ? action.categoryId : UNCATEGORIZED_ID,
        baseDamage: clampInt(action.baseDamage, 1, 200, 10),
        type,
        requiredForVictory,
        requiredCount: type === 'repeatable' ? clampInt(action.requiredCount, 1, REQUIRED_COUNT_MAX, 1) : 1,
        trackVisible: requiredForVictory || requiredTodayIds.has(action.id) ? true : action.trackVisible !== false
      };
    });

    if (actions.some(action => !action.name)) {
      return { ok: false, message: 'Every action needs a name.' };
    }

    const actionIds = new Set(actions.map(action => action.id));
    const enabledSequences = new Set();
    const combos = settingsDraft.combos.map((combo, index) => {
      const sequence = (Array.isArray(combo.actionIds) ? combo.actionIds : [])
        .slice(0, COMBO_MAX_STEPS)
        .map(String)
        .filter(actionId => actionIds.has(actionId));
      const enabled = combo.enabled !== false && sequence.length >= 2;
      return {
        id: String(combo.id || `combo-${index + 1}`).slice(0, 128),
        name: String(combo.name || '').trim().slice(0, 80),
        multiplier: Number(clampNumber(
          combo.multiplier,
          COMBO_MIN_MULTIPLIER,
          COMBO_MAX_MULTIPLIER,
          COMBO_DEFAULT_MULTIPLIER
        ).toFixed(2)),
        enabled,
        actionIds: sequence
      };
    });

    if (combos.some(combo => !combo.name)) {
      return { ok: false, message: 'Every combo needs a name.' };
    }

    for (const combo of combos) {
      if (!combo.enabled) continue;
      const fingerprint = comboFingerprint(combo.actionIds);
      if (enabledSequences.has(fingerprint)) {
        return { ok: false, message: 'Two enabled combos cannot use the exact same action sequence.' };
      }
      enabledSequences.add(fingerprint);
    }

    return {
      ok: true,
      settings: {
        fullEnemyHp: clampInt(els.goalInput.value, 20, 1000, settingsDraft.fullEnemyHp || 100),
        focusCategoryId: categories.some(category =>
          category.id !== UNCATEGORIZED_ID && category.id === settingsDraft.focusCategoryId
        ) ? settingsDraft.focusCategoryId : null,
        focusFactor: Number(clampNumber(
          els.focusFactorInput.value,
          1,
          10,
          settingsDraft.focusFactor || DEFAULT_FOCUS_FACTOR
        ).toFixed(2)),
        resistanceBuildup: Number(clampNumber(
          els.resistanceBuildupInput.value,
          0,
          2,
          settingsDraft.resistanceBuildup ?? DEFAULT_RESISTANCE_BUILDUP
        ).toFixed(2)),
        categories,
        actions,
        combos
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

    const previousCombos = new Map(state.settings.combos.map(combo => [combo.id, combo]));
    state.settings = result.settings;

    const nextActionIds = new Set(state.settings.actions.map(action => action.id));
    state.current.requiredActions = (state.current.requiredActions || [])
      .filter(required => nextActionIds.has(required.actionId));

    const nextComboIds = new Set(state.settings.combos.map(combo => combo.id));
    Object.keys(state.current.comboProgress).forEach(comboId => {
      const nextCombo = state.settings.combos.find(combo => combo.id === comboId);
      const previousCombo = previousCombos.get(comboId);
      if (!nextComboIds.has(comboId) || comboChanged(previousCombo, nextCombo)) {
        delete state.current.comboProgress[comboId];
      }
    });

    state.settings.combos.forEach(combo => {
      const previousCombo = previousCombos.get(combo.id);
      if (comboChanged(previousCombo, combo)) {
        state.current.comboProgress[combo.id] = { index: 0, sourceTransactionIds: [] };
      }
    });

    finalizeVictoryIfNeeded();
    saveState();
    render();

    if (announce) {
      els.settingsMessage.textContent = 'Saved automatically.';
    }

    return true;
  }


  function settingsTemplatePayload(settings, name = '') {
    return {
      kind: 'molife-settings-template',
      version: TEMPLATE_VERSION,
      name: String(name || '').trim().slice(0, 60),
      exportedAt: new Date().toISOString(),
      settings: deepClone(settings)
    };
  }

  function filenameSlug(value) {
    return String(value || '')
      .trim()
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function normalizeImportedTemplate(payload) {
    if (!payload || typeof payload !== 'object'
      || payload.kind !== 'molife-settings-template'
      || payload.version !== TEMPLATE_VERSION
      || !payload.settings || typeof payload.settings !== 'object') {
      throw new Error('This is not a compatible MoLife settings template.');
    }

    const raw = payload.settings;
    if (!Array.isArray(raw.categories) || !Array.isArray(raw.actions) || !Array.isArray(raw.combos)) {
      throw new Error('Template is missing categories, actions or combos.');
    }

    const candidate = freshState();
    candidate.settings = deepClone(raw);
    return normalizeState(candidate).settings;
  }

  function exportSettingsTemplate() {
    let settings = state.settings;

    if (settingsDraft) {
      const result = buildSettingsFromDraft();
      if (!result.ok) {
        els.settingsMessage.textContent = result.message;
        return;
      }
      settings = result.settings;
    }

    const templateName = els.templateName?.value.trim() || '';
    const payload = settingsTemplatePayload(settings, templateName);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    const slug = filenameSlug(templateName) || localDateKey();
    link.download = `molife-template-${slug}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);

    if (els.templateStatus) {
      els.templateStatus.textContent = 'Template exported. Progress, history and Phat Ed’s Pawnshop inventory were intentionally excluded.';
    }
  }

  async function importSettingsTemplateFile(file) {
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      const importedSettings = normalizeImportedTemplate(payload);
      const importedName = typeof payload.name === 'string' ? payload.name.slice(0, 60) : '';

      const confirmed = window.confirm(
        'Switch to this MoLife settings template?\n\nThis replaces difficulty, focused-category tuning, resistance buildup, categories/colors, actions, ordering, Required-for-victory flags and combos. Your fight history, Level, Street Cred, streak, today’s recorded damage and Pawnshop items stay untouched.'
      );
      if (!confirmed) return;

      settingsDraft = deepClone(importedSettings);
      state.settings = deepClone(importedSettings);
      state.current.comboProgress = {};
      const importedActionIds = new Set(state.settings.actions.map(action => action.id));
      state.current.requiredActions = (state.current.requiredActions || [])
        .filter(required => importedActionIds.has(required.actionId));
      finalizeVictoryIfNeeded();
      saveState();

      els.goalInput.value = settingsDraft.fullEnemyHp;
      els.focusFactorInput.value = settingsDraft.focusFactor;
      els.resistanceBuildupInput.value = settingsDraft.resistanceBuildup;
      if (els.templateName) els.templateName.value = importedName;
      updateGoalPreview();
      renderCategoriesEditor();
      renderActionsEditor();
      renderCombosEditor();
      populateCategorySelect();
      render();

      els.settingsMessage.textContent = 'Template imported and activated.';
      if (els.templateStatus) {
        els.templateStatus.textContent = `${importedName ? importedName + ' · ' : ''}${settingsDraft.categories.length - 1} categories · ${settingsDraft.actions.length} actions · ${settingsDraft.combos.length} combos`;
      }
    } catch (error) {
      console.warn('Could not import MoLife template:', error);
      const message = error instanceof Error ? error.message : 'Could not read that template.';
      els.settingsMessage.textContent = message;
      if (els.templateStatus) els.templateStatus.textContent = message;
    } finally {
      els.importTemplateInput.value = '';
    }
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

    settingsDraft = null;
    els.settingsDialog.close();
  }

  function resetGameData() {
    const confirmed = window.confirm(
      'Reset ALL MoLife game data?\n\nThis wipes categories, actions, combos, Pawnshop items, history, Level, Street Cred and streaks. Your login/account remains.\n\nThe Crestfallen Department of Records will pretend none of this ever happened.'
    );
    if (!confirmed) return;

    state = freshState();
    state.current = {
      date: localDateKey(),
      maxHp: getEnemyHp(),
      transactions: [],
      comboProgress: {},
      requiredActions: requiredActionsForNextFight(),
      defeatedAt: null,
      victoryXpAwarded: 0,
      loot: emptyLootState(),
      dayCard: null
    };
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
    updateGoalPreview();
    renderCategoriesEditor();
  });

  els.settingsDialog.addEventListener('input', event => {
    if (!settingsDraft) return;
    const target = event.target;
    const editsExistingSetting = target === els.goalInput
      || target === els.focusFactorInput
      || target === els.resistanceBuildupInput
      || target.closest?.('.category-direct-editor, .action-direct-editor, .combo-direct-editor');

    if (editsExistingSetting) {
      scheduleSettingsSave(target.type === 'color' ? 0 : 260);
    }
  });

  els.settingsDialog.addEventListener('change', event => {
    if (!settingsDraft) return;
    const target = event.target;
    if (target === els.goalInput
      || target === els.focusFactorInput
      || target === els.resistanceBuildupInput
      || target.closest?.('.category-direct-editor, .action-direct-editor, .combo-direct-editor')) {
      scheduleSettingsSave(0);
    }
  });

  els.settingsDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeSettings();
  });

  els.settingsDialog.addEventListener('close', unlockSettingsBackgroundScroll);

  els.settingsForm.addEventListener('submit', event => {
    event.preventDefault();
    if (settingsDraft) commitSettingsDraft();
  });

  els.actionSortSelect?.addEventListener('change', () => {
    const mode = els.actionSortSelect.value;
    if (mode) sortActions(mode);
  });

  els.addCategoryButton.addEventListener('click', addCategoryFromForm);
  els.newActionType?.addEventListener('change', syncNewActionRequirementControls);
  els.newActionRequired?.addEventListener('change', syncNewActionRequirementControls);
  els.addActionButton.addEventListener('click', addActionFromForm);
  els.addComboButton?.addEventListener('click', addComboFromForm);
  els.lootCrateButton?.addEventListener('click', claimVictoryLoot);
  els.exportTemplateButton?.addEventListener('click', exportSettingsTemplate);
  els.importTemplateButton?.addEventListener('click', () => els.importTemplateInput?.click());
  els.importTemplateInput?.addEventListener('change', () => {
    importSettingsTemplateFile(els.importTemplateInput.files?.[0]);
  });
  els.resetGameButton.addEventListener('click', resetGameData);
  els.viewDayCardButton.addEventListener('click', () => openDayCard(state.current.dayCard));
  els.closeDayCardButton.addEventListener('click', () => els.dayCardDialog.close());
  els.closeAttackReportButton?.addEventListener('click', closeAttackReport);

  els.dayCardDialog.addEventListener('click', event => {
    if (event.target === els.dayCardDialog) els.dayCardDialog.close();
  });

  els.attackReportDialog?.addEventListener('click', event => {
    if (event.target === els.attackReportDialog) closeAttackReport();
  });

  els.attackReportDialog?.addEventListener('close', () => {
    if (pendingVictoryReport && state.current.dayCard) {
      queueVictoryDayCard();
    }
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
  const migratedVictory = finalizeVictoryIfNeeded();
  if (migratedVictory) saveState();
  render({ showDayCard: migratedVictory, justDefeated: migratedVictory });
  syncNewActionRequirementControls();
  nudgePortraitOrientation();
  startVisualLoop();
})();
