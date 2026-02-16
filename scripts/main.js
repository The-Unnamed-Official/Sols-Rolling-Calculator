// Reference frequently accessed UI elements at module load
let feedContainer = document.getElementById('simulation-feed');
let luckField = document.getElementById('luck-total');
const pageBody = document.body;
const reduceMotionToggleButton = document.getElementById('reduceMotionToggle');
const versionInfoButton = document.getElementById('versionInfoButton');
const clickSoundEffectElement = document.getElementById('clickSoundFx');
const qbearMeowSoundEffectElement = document.getElementById('qbearMeowSoundFx');
const fortePixelatedSecretState = {
    clickCount: 0,
    threshold: 13
};
const cachedVideoElements = Array.from(document.querySelectorAll('video'));
const LATEST_UPDATE_LABEL_SUFFIX = ' (Latest Update)';
let simulationActive = false;
let cancelRollRequested = false;
let lastSimulationSummary = null;
let shareFeedbackTimerId = null;
let imageShareModeRequester = null;
const versionChangelogOverlayState = {
    escapeHandler: null,
    lastFocusedElement: null
};

const audioOverlayState = {
    lastFocusedElement: null
};

const auraFilterOverlayState = {
    lastFocusedElement: null
};

const auraDetailFilterOverlayState = {
    lastFocusedElement: null
};

const qualityPreferencesOverlayState = {
    lastFocusedElement: null
};

const CHANGELOG_VERSION_STORAGE_KEY = 'solsRollingCalculator:lastSeenChangelogVersion';
const BACKGROUND_ROLLING_STORAGE_KEY = 'solsRollingCalculator:backgroundRollingPreference';
const AUDIO_SETTINGS_STORAGE_KEY = 'solsRollingCalculator:audioSettings';
const AURA_FILTERS_STORAGE_KEY = 'solsRollingCalculator:auraFilters';
const VISUAL_SETTINGS_STORAGE_KEY = 'solsRollingCalculator:visualSettings';
const AURA_TIER_FILTERS_STORAGE_KEY = 'solsRollingCalculator:auraTierFilters';
let reduceMotionPreferenceOverride = null;
const backgroundRollingPreference = {
    allowed: false,
    suppressPrompt: false
};

const QUALITY_PREFERENCE_KEYS = Object.freeze([
    'removeParticles',
    'disableButtonAnimations',
    'disableRollAndSigilAnimations',
    'reduceGlitchEffects',
    'removeGlitchEffects'
]);

function ensureQualityPreferences() {
    if (!appState || !appState.qualityPreferences || typeof appState.qualityPreferences !== 'object') {
        appState.qualityPreferences = {};
    }

    QUALITY_PREFERENCE_KEYS.forEach(key => {
        if (typeof appState.qualityPreferences[key] !== 'boolean') {
            appState.qualityPreferences[key] = false;
        }
    });
}

function applyLatestUpdateBadgeToChangelogTabs(tabs) {
    if (!Array.isArray(tabs) || !tabs.length) {
        return;
    }

    let badgeAssigned = false;

    tabs.forEach(tab => {
        if (!tab) {
            return;
        }

        const baseLabel = tab.dataset.baseLabel
            || tab.textContent.replace(/\s*\(Latest Update\)\s*$/i, '').trim();
        tab.dataset.baseLabel = baseLabel;

        if (!badgeAssigned) {
            tab.textContent = `${baseLabel}${LATEST_UPDATE_LABEL_SUFFIX}`;
            badgeAssigned = true;
        } else {
            tab.textContent = baseLabel;
        }
    });
}

function getCurrentChangelogVersionId() {
    if (!versionInfoButton) {
        return null;
    }

    const explicitId = versionInfoButton.getAttribute('data-version-id');
    if (explicitId) {
        return explicitId;
    }

    const label = versionInfoButton.textContent;
    return label ? label.trim() : null;
}

function maybeShowChangelogOnFirstVisit() {
    const versionId = getCurrentChangelogVersionId();
    if (!versionId) {
        return;
    }

    let storage;
    try {
        storage = window.localStorage;
    } catch (error) {
        storage = null;
    }

    if (!storage) {
        return;
    }

    const storedVersionId = storage.getItem(CHANGELOG_VERSION_STORAGE_KEY);
    if (storedVersionId === versionId) {
        return;
    }

    showVersionChangelogOverlay();

    try {
        storage.setItem(CHANGELOG_VERSION_STORAGE_KEY, versionId);
    } catch (error) {
        // Ignore storage write failures so the overlay logic can continue normally.
    }
}

function hydrateBackgroundRollingPreference() {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        const raw = window.localStorage.getItem(BACKGROUND_ROLLING_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            backgroundRollingPreference.allowed = Boolean(parsed.allowed);
            backgroundRollingPreference.suppressPrompt = Boolean(parsed.suppressPrompt);
        }
    } catch (error) {
        // Ignore malformed storage so the defaults remain intact.
    }
}

function persistBackgroundRollingPreference() {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(
            BACKGROUND_ROLLING_STORAGE_KEY,
            JSON.stringify(backgroundRollingPreference)
        );
    } catch (error) {
        // Ignore write failures to avoid interrupting UI flow.
    }
}

function hydrateAudioSettings() {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        const raw = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }

        if (Number.isFinite(parsed.musicVolume)) {
            appState.audio.musicVolume = clamp01(parsed.musicVolume);
        }
        if (Number.isFinite(parsed.cutsceneVolume)) {
            appState.audio.cutsceneVolume = clamp01(parsed.cutsceneVolume);
        }
        if (Number.isFinite(parsed.obtainVolume)) {
            appState.audio.obtainVolume = clamp01(parsed.obtainVolume);
        }
        if (Number.isFinite(parsed.uiVolume)) {
            appState.audio.uiVolume = clamp01(parsed.uiVolume);
        }
        if (Number.isFinite(parsed.uiLastVolume)) {
            appState.audio.uiLastVolume = clamp01(parsed.uiLastVolume);
        }
        if (Number.isFinite(parsed.obtainLastVolume)) {
            appState.audio.obtainLastVolume = clamp01(parsed.obtainLastVolume);
        }
        if (typeof parsed.masterMuted === 'boolean') {
            appState.audio.masterMuted = parsed.masterMuted;
        }

        appState.audio.ui = (appState.audio.uiVolume ?? 0) > 0;
        appState.audio.obtain = (appState.audio.obtainVolume ?? 0) > 0;
        appState.audio.roll = (appState.audio.obtainVolume ?? 0) > 0
            || (appState.audio.musicVolume ?? 0) > 0
            || (appState.audio.cutsceneVolume ?? 0) > 0;
    } catch (error) {
        // Ignore storage errors so the app can continue with defaults.
    }
}

function hydrateAuraFilters() {
    if (typeof window === 'undefined' || !appState) {
        return;
    }

    try {
        const raw = window.localStorage.getItem(AURA_FILTERS_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        if (!appState.auraFilters || typeof appState.auraFilters !== 'object') {
            appState.auraFilters = {};
        }
        Object.entries(parsed).forEach(([auraName, value]) => {
            if (typeof auraName === 'string') {
                appState.auraFilters[auraName] = Boolean(value);
            }
        });
    } catch (error) {
        // Ignore malformed storage so defaults remain intact.
    }
}

function hydrateAuraTierFilters() {
    if (typeof window === 'undefined' || !appState) {
        return;
    }

    try {
        const raw = window.localStorage.getItem(AURA_TIER_FILTERS_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        if (!appState.auraTierFilters || typeof appState.auraTierFilters !== 'object') {
            appState.auraTierFilters = {};
        }
        Object.entries(parsed).forEach(([tierKey, value]) => {
            if (typeof tierKey === 'string') {
                appState.auraTierFilters[tierKey] = Boolean(value);
            }
        });
    } catch (error) {
        // Ignore malformed storage so defaults remain intact.
    }
}

function hydrateVisualSettings() {
    if (typeof window === 'undefined' || !appState) {
        return;
    }

    try {
        const raw = window.localStorage.getItem(VISUAL_SETTINGS_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        if (typeof parsed.glitch === 'boolean') {
            appState.glitch = parsed.glitch;
        }
        if (typeof parsed.cinematic === 'boolean') {
            appState.cinematic = parsed.cinematic;
        }
        if (typeof parsed.reduceMotion === 'boolean') {
            appState.reduceMotion = parsed.reduceMotion;
            reduceMotionPreferenceOverride = parsed.reduceMotion;
        }

        ensureQualityPreferences();
        const storedQualityPreferences = parsed.qualityPreferences;
        if (storedQualityPreferences && typeof storedQualityPreferences === 'object') {
            QUALITY_PREFERENCE_KEYS.forEach(key => {
                if (typeof storedQualityPreferences[key] === 'boolean') {
                    appState.qualityPreferences[key] = storedQualityPreferences[key];
                }
            });
        }
    } catch (error) {
        // Ignore malformed storage so defaults remain intact.
    }
}

function persistAuraFilters() {
    if (typeof window === 'undefined' || !appState || !appState.auraFilters) {
        return;
    }

    try {
        window.localStorage.setItem(
            AURA_FILTERS_STORAGE_KEY,
            JSON.stringify(appState.auraFilters)
        );
    } catch (error) {
        // Ignore storage errors so the UI remains responsive.
    }
}

function persistAuraTierFilters() {
    if (typeof window === 'undefined' || !appState || !appState.auraTierFilters) {
        return;
    }

    try {
        window.localStorage.setItem(
            AURA_TIER_FILTERS_STORAGE_KEY,
            JSON.stringify(appState.auraTierFilters)
        );
    } catch (error) {
        // Ignore storage errors so the UI remains responsive.
    }
}

function persistAudioSettings() {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(
            AUDIO_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                musicVolume: appState.audio.musicVolume,
                cutsceneVolume: appState.audio.cutsceneVolume,
                obtainVolume: appState.audio.obtainVolume,
                uiVolume: appState.audio.uiVolume,
                uiLastVolume: appState.audio.uiLastVolume,
                obtainLastVolume: appState.audio.obtainLastVolume,
                masterMuted: appState.audio.masterMuted
            })
        );
    } catch (error) {
        // Ignore write failures to avoid interrupting audio controls.
    }
}

function persistVisualSettings() {
    if (typeof window === 'undefined' || !appState) {
        return;
    }

    try {
        window.localStorage.setItem(
            VISUAL_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                glitch: appState.glitch,
                cinematic: appState.cinematic,
                reduceMotion: appState.reduceMotion,
                qualityPreferences: appState.qualityPreferences
            })
        );
    } catch (error) {
        // Ignore storage errors so the UI remains responsive.
    }
}

function setBackgroundRollingEnabled(enabled, { persistPreference = true } = {}) {
    if (typeof appState === 'object') {
        appState.backgroundRolling = Boolean(enabled);
    }

    backgroundRollingPreference.allowed = Boolean(enabled);

    const button = document.getElementById('backgroundRollingButton');
    if (button) {
        button.textContent = `Allow background rolling: ${enabled ? 'On' : 'Off'}`;
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    if (persistPreference) {
        persistBackgroundRollingPreference();
    }
}

function showBackgroundRollingOverlay() {
    const overlay = document.getElementById('backgroundRollingOverlay');
    if (!overlay) {
        return;
    }

    revealOverlay(overlay);

    const applyButton = document.getElementById('backgroundRollingApply');
    if (applyButton && typeof applyButton.focus === 'function') {
        try {
            applyButton.focus({ preventScroll: true });
        } catch (error) {
            applyButton.focus();
        }
    }
}

function hideBackgroundRollingOverlay() {
    const overlay = document.getElementById('backgroundRollingOverlay');
    if (!overlay) {
        return;
    }

    concealOverlay(overlay);
}


const selectWidgetRegistry = new Map();

const BIOME_PRIMARY_SELECT_ID = 'biome-primary-dropdown';
const BIOME_OTHER_SELECT_ID = 'biome-other-dropdown';
const BIOME_TIME_SELECT_ID = 'biome-time-dropdown';
const DAY_RESTRICTED_BIOMES = new Set(['pumpkinMoon', 'graveyard']);
const CYBERSPACE_ILLUSIONARY_WARNING_STORAGE_KEY = 'solsRollingCalculator:hideCyberspaceIllusionaryWarning';
let lastPrimaryBiomeSelection = null;
const DEV_BIOME_IDS = new Set(['anotherRealm', 'edict', 'mastermind', 'unknown']);
let devBiomesEnabled = false;

const ROE_NATIVE_BIOMES = Object.freeze([
    'windy',
    'snowy',
    'rainy',
    'sandstorm',
    'starfall',
    'hell',
    'heaven',
    'corruption',
    'null'
]);

const RUNE_CONFIGURATION = Object.freeze({
    windyRune: Object.freeze({
        canonicalBiome: 'windy',
        themeBiome: 'windy',
        activeBiomes: Object.freeze(['windy']),
        breakthroughBiomes: Object.freeze(['windy']),
        icon: 'files/windyRuneIcon.png'
    }),
    snowyRune: Object.freeze({
        canonicalBiome: 'snowy',
        themeBiome: 'snowy',
        activeBiomes: Object.freeze(['snowy']),
        breakthroughBiomes: Object.freeze(['snowy']),
        icon: 'files/snowyRuneIcon.png'
    }),
    rainyRune: Object.freeze({
        canonicalBiome: 'rainy',
        themeBiome: 'rainy',
        activeBiomes: Object.freeze(['rainy']),
        breakthroughBiomes: Object.freeze(['rainy']),
        icon: 'files/rainyRuneIcon.png'
    }),
    sandstormRune: Object.freeze({
        canonicalBiome: 'sandstorm',
        themeBiome: 'sandstorm',
        activeBiomes: Object.freeze(['sandstorm']),
        breakthroughBiomes: Object.freeze(['sandstorm']),
        icon: 'files/sandstormRuneIcon.png'
    }),
    starfallRune: Object.freeze({
        canonicalBiome: 'starfall',
        themeBiome: 'starfall',
        activeBiomes: Object.freeze(['starfall']),
        breakthroughBiomes: Object.freeze(['starfall']),
        icon: 'files/starfallRuneIcon.png'
    }),
    hellRune: Object.freeze({
        canonicalBiome: 'hell',
        themeBiome: 'hell',
        activeBiomes: Object.freeze(['hell']),
        breakthroughBiomes: Object.freeze(['hell']),
        icon: 'files/hellRuneIcon.png'
    }),
    heavenRune: Object.freeze({
        canonicalBiome: 'heaven',
        themeBiome: 'heaven',
        activeBiomes: Object.freeze(['heaven']),
        breakthroughBiomes: Object.freeze(['heaven']),
        icon: 'files/heavenRuneIcon.png'
    }),
    corruptionRune: Object.freeze({
        canonicalBiome: 'corruption',
        themeBiome: 'corruption',
        activeBiomes: Object.freeze(['corruption']),
        breakthroughBiomes: Object.freeze(['corruption']),
        icon: 'files/corruptionRuneIcon.png'
    }),
    nullRune: Object.freeze({
        canonicalBiome: 'null',
        themeBiome: 'null',
        activeBiomes: Object.freeze(['null', 'limbo-null']),
        breakthroughBiomes: Object.freeze(['null', 'limbo-null']),
        icon: 'files/nullRuneIcon.png'
    }),
    eclipseRune: Object.freeze({
        canonicalBiome: 'night',
        themeBiome: 'night',
        activeBiomes: Object.freeze(['day', 'night']),
        breakthroughBiomes: Object.freeze(['day', 'night']),
        icon: 'files/eclipseRuneIcon.png'
    }),
    roe: Object.freeze({
        canonicalBiome: 'roe',
        themeBiome: 'roe',
        activeBiomes: ROE_NATIVE_BIOMES,
        breakthroughBiomes: ROE_NATIVE_BIOMES,
        icon: 'files/roeRuneIcon.png',
        glitchLike: true,
        exclusivityBiome: 'glitch'
    })
});

function resolveRuneConfiguration(value) {
    if (!value) {
        return null;
    }
    return Object.prototype.hasOwnProperty.call(RUNE_CONFIGURATION, value)
        ? RUNE_CONFIGURATION[value]
        : null;
}




function applyChannelVolumeToElements(channel) {
    if (typeof document === 'undefined') return;

    let category = 'obtain';
    if (channel === 'ui') {
        category = 'ui';
    } else if (channel === 'cutscene') {
        category = 'cutscene';
    } else if (channel === 'music') {
        category = 'music';
    }
    const selector = `[data-audio-channel="${channel}"]`;
    document.querySelectorAll(selector).forEach(element => {
        applyMediaGain(element, { category });
    });

    if (channel === 'music') {
        const bgMusic = document.getElementById('ambientMusic');
        synchronizeBackgroundRouting(bgMusic);
    }
}

function showAudioSettingsOverlay() {
    const overlay = document.getElementById('audioSettingsOverlay');
    if (!overlay) return;

    audioOverlayState.lastFocusedElement = document.activeElement;
    revealOverlay(overlay);

    const firstInput = overlay.querySelector('.audio-slider__input');
    if (firstInput && typeof firstInput.focus === 'function') {
        try {
            firstInput.focus({ preventScroll: true });
        } catch (error) {
            firstInput.focus();
        }
    }
}

function hideAudioSettingsOverlay() {
    const overlay = document.getElementById('audioSettingsOverlay');
    if (!overlay) return;

    concealOverlay(overlay, {
        onHidden: () => {
            const last = audioOverlayState.lastFocusedElement;
            if (last && typeof last.focus === 'function') {
                last.focus({ preventScroll: true });
            }
            audioOverlayState.lastFocusedElement = null;
        }
    });
}

function showAuraFilterOverlay() {
    const overlay = document.getElementById('auraFilterOverlay');
    if (!overlay) return;

    auraFilterOverlayState.lastFocusedElement = document.activeElement;
    syncAuraTierFilterButtons();
    revealOverlay(overlay);

    const firstButton = overlay.querySelector('.filter-tier-toggle');
    if (firstButton && typeof firstButton.focus === 'function') {
        try {
            firstButton.focus({ preventScroll: true });
        } catch (error) {
            firstButton.focus();
        }
    }
}

function hideAuraFilterOverlay() {
    const overlay = document.getElementById('auraFilterOverlay');
    if (!overlay) return;

    concealOverlay(overlay, {
        onHidden: () => {
            const last = auraFilterOverlayState.lastFocusedElement;
            if (last && typeof last.focus === 'function') {
                last.focus({ preventScroll: true });
            }
            auraFilterOverlayState.lastFocusedElement = null;
        }
    });
}

function showAuraDetailFilterOverlay() {
    const overlay = document.getElementById('auraDetailFilterOverlay');
    if (!overlay) return;

    auraDetailFilterOverlayState.lastFocusedElement = document.activeElement;
    populateAuraFilterList();
    syncAuraFilterButtons();
    revealOverlay(overlay);

    const firstButton = overlay.querySelector('.filter-aura-toggle');
    if (firstButton && typeof firstButton.focus === 'function') {
        try {
            firstButton.focus({ preventScroll: true });
        } catch (error) {
            firstButton.focus();
        }
    }
}

function hideAuraDetailFilterOverlay() {
    const overlay = document.getElementById('auraDetailFilterOverlay');
    if (!overlay) return;

    concealOverlay(overlay, {
        onHidden: () => {
            const last = auraDetailFilterOverlayState.lastFocusedElement;
            if (last && typeof last.focus === 'function') {
                last.focus({ preventScroll: true });
            }
            auraDetailFilterOverlayState.lastFocusedElement = null;
        }
    });
}

function syncAuraTierFilterButtons() {
    const overlay = document.getElementById('auraFilterOverlay');
    if (!overlay || !appState || !appState.auraTierFilters) {
        return;
    }

    overlay.querySelectorAll('.filter-tier-toggle').forEach(button => {
        const tierKey = button.dataset.tierKey;
        if (!tierKey) {
            return;
        }
        const label = button.dataset.tierLabel || button.textContent.trim();
        const enabled = Boolean(appState.auraTierFilters[tierKey]);
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        button.textContent = `${label}: ${enabled ? 'On' : 'Off'}`;
    });
}

function syncAuraFilterButtons() {
    const overlay = document.getElementById('auraDetailFilterOverlay');
    if (!overlay || !appState || !appState.auraFilters) {
        return;
    }

    overlay.querySelectorAll('.filter-aura-toggle').forEach(button => {
        const auraName = button.dataset.auraName;
        if (!auraName) {
            return;
        }
        const enabled = Boolean(appState.auraFilters[auraName]);
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        renderAuraFilterButtonLabel(button, auraName, enabled);
    });
}

function renderAuraFilterButtonLabel(button, auraName, enabled) {
    if (!button || !auraName) {
        return;
    }
    const aura = Array.isArray(AURA_REGISTRY)
        ? AURA_REGISTRY.find(entry => entry.name === auraName)
        : null;
    const isEventAura = aura ? Boolean(getAuraEventId(aura)) : false;
    const specialClass = aura ? resolveAuraStyleClass(aura, null) : '';
    const rarityClass = aura && !isEventAura && !shouldSuppressRarityClassForSpecialStyle(specialClass)
        ? resolveBaseRarityClass(aura)
        : '';
    const nameClasses = [rarityClass, specialClass].filter(Boolean).join(' ');
    const nameSpan = document.createElement('span');
    if (aura && auraName.startsWith('Breakthrough')) {
        nameSpan.innerHTML = formatAuraNameMarkup(aura);
    } else {
        nameSpan.textContent = auraName;
    }
    if (nameClasses) {
        nameSpan.className = nameClasses;
    }

    button.textContent = '';
    button.append('Skip ');
    button.append(nameSpan);
    button.append(`: ${enabled ? 'On' : 'Off'}`);
}

function populateAuraFilterList() {
    const list = document.querySelector('[data-aura-filter-list]');
    if (!list || !Array.isArray(AURA_REGISTRY)) {
        return;
    }
    if (list.dataset.populated === 'true') {
        return;
    }

    list.textContent = '';
    const sortedAuras = [...AURA_REGISTRY].sort((a, b) => {
        if (a.chance !== b.chance) {
            return a.chance - b.chance;
        }
        return a.name.localeCompare(b.name);
    });

    const reorderSequence = [MONARCH_AURA_NAME, DUNE_AURA_LABEL, MEMORY_AURA_LABEL, OBLIVION_AURA_LABEL];
    const auraByName = new Map(sortedAuras.map(aura => [aura.name, aura]));
    const filteredAuras = sortedAuras.filter(aura => !reorderSequence.includes(aura.name));
    const monarchIndex = sortedAuras.findIndex(aura => aura.name === MONARCH_AURA_NAME);
    const insertionIndex = monarchIndex >= 0
        ? sortedAuras.slice(0, monarchIndex + 1).filter(aura => !reorderSequence.includes(aura.name)).length
        : 0;
    const orderedAuras = reorderSequence.map(name => auraByName.get(name)).filter(Boolean);
    const displayAuras = monarchIndex >= 0
        ? [
            ...filteredAuras.slice(0, insertionIndex),
            ...orderedAuras,
            ...filteredAuras.slice(insertionIndex)
        ]
        : [...filteredAuras, ...orderedAuras];

    displayAuras.forEach(aura => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'interface-toggle filter-tier-toggle filter-aura-toggle';
        button.dataset.auraName = aura.name;
        button.setAttribute('aria-pressed', 'false');
        renderAuraFilterButtonLabel(button, aura.name, false);
        button.addEventListener('click', () => {
            if (!appState || !appState.auraFilters) {
                return;
            }
            appState.auraFilters[aura.name] = !appState.auraFilters[aura.name];
            syncAuraFilterButtons();
            persistAuraFilters();
        });
        list.appendChild(button);
    });

    list.dataset.populated = 'true';
}

function initializeAuraTierFilterPanel() {
    const overlay = document.getElementById('auraFilterOverlay');
    const openButton = document.getElementById('filterAuraTiersButton');
    const closeButton = document.getElementById('auraFilterClose');
    if (!overlay || !openButton) return;

    const filterMenu = document.getElementById('filterMenu');
    const filterMenuToggle = document.getElementById('filterMenuToggle');

    overlay.addEventListener('click', event => {
        if (event.target === overlay) {
            hideAuraFilterOverlay();
        }
    });

    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            hideAuraFilterOverlay();
        }
    });

    if (closeButton) {
        closeButton.addEventListener('click', () => hideAuraFilterOverlay());
    }

    overlay.querySelectorAll('.filter-tier-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const tierKey = button.dataset.tierKey;
            if (!tierKey || !appState || !appState.auraTierFilters) {
                return;
            }
            appState.auraTierFilters[tierKey] = !appState.auraTierFilters[tierKey];
            syncAuraTierFilterButtons();
            persistAuraTierFilters();
        });
    });

    openButton.addEventListener('click', event => {
        event.preventDefault();
        if (filterMenu) {
            filterMenu.classList.remove('options-menu--open');
        }
        if (filterMenuToggle) {
            filterMenuToggle.setAttribute('aria-expanded', 'false');
        }
        showAuraFilterOverlay();
    });

    syncAuraTierFilterButtons();
}

function initializeAuraDetailFilterPanel() {
    const overlay = document.getElementById('auraDetailFilterOverlay');
    const openButton = document.getElementById('filterAurasButton');
    const closeButton = document.getElementById('auraDetailFilterClose');
    const resetButton = document.getElementById('auraDetailFilterReset');
    if (!overlay || !openButton) return;

    const filterMenu = document.getElementById('filterMenu');
    const filterMenuToggle = document.getElementById('filterMenuToggle');

    overlay.addEventListener('click', event => {
        if (event.target === overlay) {
            hideAuraDetailFilterOverlay();
        }
    });

    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            hideAuraDetailFilterOverlay();
        }
    });

    if (closeButton) {
        closeButton.addEventListener('click', () => hideAuraDetailFilterOverlay());
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (!appState || !appState.auraFilters) {
                return;
            }
            Object.keys(appState.auraFilters).forEach(name => {
                appState.auraFilters[name] = false;
            });
            syncAuraFilterButtons();
            persistAuraFilters();
        });
    }

    openButton.addEventListener('click', event => {
        event.preventDefault();
        if (filterMenu) {
            filterMenu.classList.remove('options-menu--open');
        }
        if (filterMenuToggle) {
            filterMenuToggle.setAttribute('aria-expanded', 'false');
        }
        showAuraDetailFilterOverlay();
    });

    populateAuraFilterList();
    syncAuraFilterButtons();
}

function initializeOptionsMenu(menuId, toggleId, panelId) {
    const menu = document.getElementById(menuId);
    const toggleButton = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    if (!menu || !toggleButton || !panel) {
        return;
    }

    const closeMenu = () => {
        menu.classList.remove('options-menu--open');
        toggleButton.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
        menu.classList.add('options-menu--open');
        toggleButton.setAttribute('aria-expanded', 'true');
    };

    toggleButton.addEventListener('click', event => {
        event.stopPropagation();
        if (menu.classList.contains('options-menu--open')) {
            closeMenu();
        } else {
            openMenu();
            if (event.detail === 0) {
                const firstItem = panel.querySelector('button');
                if (firstItem) {
                    firstItem.focus({ preventScroll: true });
                }
            }
        }
    });

    document.addEventListener('click', event => {
        if (!menu.contains(event.target)) {
            closeMenu();
        }
    });

    menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeMenu();
            toggleButton.focus({ preventScroll: true });
        }
    });

    menu.addEventListener('focusout', event => {
        const nextFocus = event.relatedTarget;
        if (nextFocus instanceof Node && !menu.contains(nextFocus)) {
            closeMenu();
        }
    });

    closeMenu();
}

function updateAudioSliderLabel(channel, percentValue) {
    const overlay = document.getElementById('audioSettingsOverlay');
    if (!overlay) return;

    const label = overlay.querySelector(`.audio-slider__value[data-audio-value="${channel}"]`);
    if (label) {
        label.textContent = `${Math.round(percentValue)}%`;
    }

    const input = overlay.querySelector(`.audio-slider__input[data-audio-channel="${channel}"]`);
    if (input) {
        const clamped = clamp01(percentValue / 100);
        input.style.setProperty('--audio-slider-progress', `${Math.round(clamped * 100)}%`);
    }

    const icon = overlay.querySelector(`.audio-slider__icon[data-audio-icon="${channel}"] i`);
    if (icon) {
        const clampedValue = clamp01(percentValue / 100);
        let iconClass = 'fa-volume-high';
        if (clampedValue === 0) {
            iconClass = 'fa-volume-xmark';
        } else if (clampedValue <= 0.33) {
            iconClass = 'fa-volume-off';
        } else if (clampedValue <= 0.66) {
            iconClass = 'fa-volume-low';
        }
        icon.className = `fa-solid ${iconClass}`;
    }
}

function updateUiToggleStatus() {
    const uiToggle = document.getElementById('audioUiToggle');
    if (uiToggle) {
        uiToggle.checked = appState.audio.ui;
    }
}

function setChannelVolume(channel, normalized, { persist = true } = {}) {
    const value = clamp01(normalized);
    if (channel === 'ui') {
        appState.audio.uiVolume = value;
        if (value > 0) {
            appState.audio.uiLastVolume = value;
        }
        appState.audio.ui = value > 0;
        updateUiToggleStatus();
    } else if (channel === 'cutscene') {
        appState.audio.cutsceneVolume = value;
    } else if (channel === 'music') {
        appState.audio.musicVolume = value;
    } else {
        appState.audio.obtainVolume = value;
        if (value > 0) {
            appState.audio.obtainLastVolume = value;
        }
        appState.audio.obtain = value > 0;
    }

    const rollingActive = (appState.audio.obtainVolume ?? 0) > 0
        || (appState.audio.musicVolume ?? 0) > 0
        || (appState.audio.cutsceneVolume ?? 0) > 0;
    appState.audio.roll = rollingActive;

    updateAudioSliderLabel(channel, value * 100);
    applyChannelVolumeToElements(channel);

    if (channel === 'music' || channel === 'cutscene' || channel === 'obtain') {
        resumeAudioEngine();
        const selector = `[data-audio-channel="${channel}"]`;
        document.querySelectorAll(selector).forEach(element => {
            element.muted = false;
            if (typeof element.removeAttribute === 'function') {
                element.removeAttribute('muted');
            }
        });
    }

    if (channel === 'ui') {
        resumeAudioEngine();
        document.querySelectorAll('[data-audio-channel="ui"]').forEach(element => {
            element.muted = false;
            if (typeof element.removeAttribute === 'function') {
                element.removeAttribute('muted');
            }
        });
    }

    if (persist) {
        persistAudioSettings();
    }
}

function initializeAudioSettingsPanel() {
    const overlay = document.getElementById('audioSettingsOverlay');
    const openButton = document.getElementById('audioSettingsButton');
    if (!overlay || !openButton) return;

    const inputs = Array.from(overlay.querySelectorAll('.audio-slider__input'));
    inputs.forEach(input => {
        const channel = input.dataset.audioChannel || 'obtain';
        let defaultValue = appState.audio.obtainVolume;
        if (channel === 'ui') {
            defaultValue = appState.audio.uiVolume;
        } else if (channel === 'cutscene') {
            defaultValue = appState.audio.cutsceneVolume;
        } else if (channel === 'music') {
            defaultValue = appState.audio.musicVolume;
        }
        const percent = Math.round(clamp01(defaultValue) * 100);
        input.value = percent;
        setChannelVolume(channel, percent / 100);

        input.addEventListener('input', () => {
            const normalized = clamp01(Number.parseFloat(input.value) / 100);
            setChannelVolume(channel, normalized);
        });
    });

    overlay.addEventListener('click', event => {
        if (event.target === overlay) {
            hideAudioSettingsOverlay();
        }
    });

    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            hideAudioSettingsOverlay();
        }
    });

    const uiToggle = document.getElementById('audioUiToggle');
    if (uiToggle) {
        uiToggle.checked = appState.audio.ui;

        uiToggle.addEventListener('change', () => {
            toggleInterfaceAudio();
        });
    }

    openButton.addEventListener('click', event => {
        event.preventDefault();
        showAudioSettingsOverlay();
    });

    setChannelVolume('obtain', appState.audio.obtainVolume);
    setChannelVolume('ui', appState.audio.uiVolume);
}

function initializeRollTriggerFloating() {
    const cta = document.querySelector('.control-section--cta');
    const controlsSurface = document.querySelector('.surface--controls');
    if (!cta || !controlsSurface) return;

    let ticking = false;

    const updateMetrics = () => {
        const controlsRect = controlsSurface.getBoundingClientRect();
        const ctaRect = cta.getBoundingClientRect();
        const topOffset = Number.parseFloat(getComputedStyle(cta).top) || 0;
        const shouldFloat = controlsRect.bottom <= (ctaRect.height + topOffset);

        cta.style.setProperty('--roll-cta-width', `${controlsRect.width}px`);
        cta.style.setProperty('--roll-cta-left', `${controlsRect.left}px`);
        cta.classList.toggle('control-section--cta--floating', shouldFloat);
    };

    const requestSync = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            updateMetrics();
            ticking = false;
        });
    };

    window.addEventListener('scroll', requestSync, { passive: true });
    window.addEventListener('resize', requestSync, { passive: true });

    requestSync();
}

function beginSimulationExperience() {
    const overlay = document.getElementById('introOverlay');
    const startButton = document.getElementById('startExperienceButton');
    const bgMusic = document.getElementById('ambientMusic');

    if (startButton && typeof startButton.blur === 'function') {
        startButton.blur();
    }

    resumeAudioEngine();
    if (bgMusic) {
        primeBackgroundMusic(bgMusic);
        startBackgroundMusic(bgMusic);
    }

    startSnowEffect();

    if (overlay) {
        overlay.setAttribute('hidden', '');
        overlay.setAttribute('aria-hidden', 'true');
    }
}

function initializeIntroOverlay() {
    const overlay = document.getElementById('introOverlay');
    const startButton = document.getElementById('startExperienceButton');
    if (!overlay || !startButton) {
        return;
    }

    startButton.addEventListener('click', () => {
        beginSimulationExperience();
    });
}

const cutsceneWarningManager = (() => {
    const storageKey = 'solsCutsceneWarningDismissed';
    let suppressed = null;

    const getOverlay = () => document.getElementById('cutsceneWarningOverlay');

    function readSuppressedPreference() {
        if (suppressed !== null) {
            return suppressed;
        }
        if (typeof window === 'undefined') {
            suppressed = false;
            return suppressed;
        }
        try {
            const stored = window.localStorage.getItem(storageKey);
            suppressed = stored === 'true';
        } catch (error) {
            suppressed = false;
        }
        return suppressed;
    }

    function focusPrimaryAction() {
        const confirmButton = document.getElementById('cutsceneWarningConfirm');
        if (!confirmButton || typeof confirmButton.focus !== 'function') {
            return;
        }
        try {
            confirmButton.focus({ preventScroll: true });
        } catch (error) {
            confirmButton.focus();
        }
    }

    return {
        isSuppressed() {
            return readSuppressedPreference();
        },
        show() {
            if (readSuppressedPreference()) {
                return false;
            }
            const overlay = getOverlay();
            if (!overlay) {
                return false;
            }
            if (!overlay.hasAttribute('hidden')) {
                return true;
            }
            revealOverlay(overlay);
            focusPrimaryAction();
            return true;
        },
        hide() {
            const overlay = getOverlay();
            if (!overlay) {
                return;
            }
            concealOverlay(overlay);
        },
        suppress() {
            suppressed = true;
            if (typeof window === 'undefined') {
                return;
            }
            try {
                window.localStorage.setItem(storageKey, 'true');
            } catch (error) {
                // Ignore storage errors
            }
        }
    };
})();

const rotationPromptManager = (() => {
    let pendingAction = null;

    const getOverlay = () => document.getElementById('rotationPromptOverlay');

    function isPortraitOrientation() {
        if (typeof window === 'undefined') {
            return false;
        }
        if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) {
            return true;
        }
        return window.innerHeight > window.innerWidth;
    }

    function isMobileOrTablet() {
        if (typeof navigator !== 'undefined') {
            const ua = navigator.userAgent || navigator.vendor || '';
            if (/android|iphone|ipad|ipod|iemobile|mobile/i.test(ua)) {
                return true;
            }
            if (/tablet|kindle|silk|playbook|nexus 7|nexus 9/i.test(ua)) {
                return true;
            }
        }
        if (typeof window !== 'undefined') {
            const width = Math.min(window.innerWidth || 0, window.outerWidth || window.innerWidth || 0);
            return width > 0 && width <= 1100;
        }
        return false;
    }

    function detectFormFactor() {
        if (typeof window === 'undefined') {
            return null;
        }
        const width = Math.min(window.innerWidth || 0, window.outerWidth || window.innerWidth || 0);
        if (width && width <= 768) {
            return 'phone';
        }
        if (width && width <= 1100) {
            return 'tablet';
        }
        return null;
    }

    function focusPrimaryAction() {
        const confirmButton = document.getElementById('rotationPromptConfirm');
        if (!confirmButton || typeof confirmButton.focus !== 'function') {
            return;
        }
        try {
            confirmButton.focus({ preventScroll: true });
        } catch (error) {
            confirmButton.focus();
        }
    }

    function prepareOverlay(overlay) {
        if (!overlay) {
            return;
        }
        const formFactor = detectFormFactor();
        const prompt = overlay.querySelector('.rotation-prompt');
        if (!prompt) {
            return;
        }
        if (formFactor) {
            prompt.setAttribute('data-form-factor', formFactor);
        } else {
            prompt.removeAttribute('data-form-factor');
        }
    }

    function shouldPrompt() {
        if (!appState.cinematic) {
            return false;
        }
        if (cutsceneWarningManager.isSuppressed()) {
            return false;
        }
        return isPortraitOrientation() && isMobileOrTablet();
    }

    return {
        shouldPrompt,
        prompt(action) {
            pendingAction = typeof action === 'function' ? action : null;

            if (!shouldPrompt()) {
                if (pendingAction) {
                    const next = pendingAction;
                    pendingAction = null;
                    next();
                }
                return false;
            }

            const overlay = getOverlay();
            if (!overlay) {
                if (pendingAction) {
                    const next = pendingAction;
                    pendingAction = null;
                    next();
                }
                return false;
            }

            prepareOverlay(overlay);
            revealOverlay(overlay);
            focusPrimaryAction();
            return true;
        },
        confirm() {
            const overlay = getOverlay();
            const action = pendingAction;
            pendingAction = null;
            concealOverlay(overlay);
            if (typeof action === 'function') {
                action();
            }
        },
        dismiss() {
            cutsceneWarningManager.suppress();
            this.confirm();
        },
        hide() {
            pendingAction = null;
            concealOverlay(getOverlay());
        },
        hasPendingAction() {
            return typeof pendingAction === 'function';
        }
    };
})();

const cyberspaceIllusionaryWarningManager = (() => {
    let suppressed = null;

    const getOverlay = () => document.getElementById('cyberspaceIllusionaryOverlay');

    function readSuppressedPreference() {
        if (suppressed !== null) {
            return suppressed;
        }

        if (typeof window === 'undefined') {
            suppressed = false;
            return suppressed;
        }

        try {
            suppressed = window.localStorage.getItem(CYBERSPACE_ILLUSIONARY_WARNING_STORAGE_KEY) === 'true';
        } catch (error) {
            suppressed = false;
        }

        return suppressed;
    }

    function focusPrimaryAction() {
        const confirmButton = document.getElementById('cyberspaceIllusionaryConfirm');
        if (!confirmButton || typeof confirmButton.focus !== 'function') {
            return;
        }

        try {
            confirmButton.focus({ preventScroll: true });
        } catch (error) {
            confirmButton.focus();
        }
    }

    return {
        isSuppressed() {
            return readSuppressedPreference();
        },
        show() {
            if (readSuppressedPreference()) {
                return false;
            }

            const overlay = getOverlay();
            if (!overlay) {
                return false;
            }

            if (!overlay.hasAttribute('hidden')) {
                return true;
            }

            revealOverlay(overlay);
            focusPrimaryAction();
            return true;
        },
        hide() {
            concealOverlay(getOverlay());
        },
        suppress() {
            suppressed = true;
            if (typeof window !== 'undefined') {
                try {
                    window.localStorage.setItem(CYBERSPACE_ILLUSIONARY_WARNING_STORAGE_KEY, 'true');
                } catch (error) {
                    // Ignore storage issues so the overlay can still be hidden.
                }
            }
            this.hide();
        },
        isVisible() {
            const overlay = getOverlay();
            return Boolean(overlay && !overlay.hasAttribute('hidden'));
        }
    };
})();

const glitchUiState = {
    loopTimeoutId: null,
    activeTimeoutId: null,
    distortionNode: null,
    waveShaper: null,
    gainNode: null,
    sourceNode: null,
    isUiGlitching: false,
    audioPipelineMode: null
};

let glitchPresentationEnabled = false;

function getAudioContextHandle() {
    if (typeof window === 'undefined') return null;
    if (!appState.audio.context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        appState.audio.context = new AudioContextClass();
    }
    return appState.audio.context;
}

function resumeAudioEngine() {
    const context = getAudioContextHandle();
    if (context && context.state === 'suspended') {
        context.resume().catch(() => {});
    }
    return context;
}

function normalizeMediaSource(element) {
    if (!element) return null;
    const rawSrc = element.getAttribute('src') || element.currentSrc;
    if (!rawSrc) return null;
    try {
        return new URL(rawSrc, window.location.href).href;
    } catch (error) {
        return rawSrc;
    }
}

function canUseMediaElementSource(element) {
    if (!element || typeof window === 'undefined') return false;
    const { location } = window;
    if (!location) return false;
    if (location.protocol === 'file:') {
        return false;
    }
    const sourceUrl = normalizeMediaSource(element);
    if (!sourceUrl) return false;
    try {
        const parsed = new URL(sourceUrl);
        if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') {
            return true;
        }
        if (parsed.origin === location.origin) {
            return true;
        }
        const crossOrigin = element.getAttribute('crossorigin') ?? element.crossOrigin;
        return crossOrigin === 'anonymous';
    } catch (error) {
        return false;
    }
}

function getChannelVolumeMultiplier(category = 'obtain') {
    if (appState.audio.masterMuted) return 0;
    if (category === 'ui') return clamp01(appState.audio.uiVolume ?? 1);
    if (category === 'cutscene') return clamp01(appState.audio.cutsceneVolume ?? 1);
    if (category === 'music') return clamp01(appState.audio.musicVolume ?? 1);
    return clamp01(appState.audio.obtainVolume ?? 1);
}

function resolveBaseGain(element, fallback = 1) {
    const dataset = element?.dataset || {};
    const gainValueRaw = dataset.gain ?? dataset.boost ?? dataset.volume;
    const gainValue = Number.parseFloat(gainValueRaw);
    if (Number.isFinite(gainValue) && gainValue > 0) {
        return gainValue;
    }
    if (element && typeof element.volume === 'number' && element.volume > 0) {
        return element.volume;
    }
    return fallback;
}

function applyMediaGain(element, { category = 'obtain', fallbackGain } = {}) {
    if (!element) return;

    const baseGain = resolveBaseGain(element, fallbackGain ?? 1);
    const channelMultiplier = getChannelVolumeMultiplier(category);
    const resolvedGain = baseGain * channelMultiplier;

    const shouldMute = resolvedGain <= 0;
    if (shouldMute) {
        element.muted = true;
    } else {
        element.muted = false;
        if (typeof element.removeAttribute === 'function') {
            element.removeAttribute('muted');
        }
    }

    const channelEnabled = isSoundChannelActive(category);
    const context = channelEnabled && canUseMediaElementSource(element) ? resumeAudioEngine() : null;
    if (context) {
        try {
            let entry = appState.audio.gainMap.get(element);
            if (!entry) {
                const source = context.createMediaElementSource(element);
                const gainNode = context.createGain();
                source.connect(gainNode).connect(context.destination);
                entry = { gainNode };
                appState.audio.gainMap.set(element, entry);
            }
            entry.gainNode.gain.value = resolvedGain;
            return;
        } catch (error) {
            console.warn('Unable to configure media element gain', error);
        }
    }

    element.volume = clamp01(resolvedGain);
}

function isSoundChannelActive(category) {
    if (appState.audio.masterMuted) return false;
    const channelVolume = getChannelVolumeMultiplier(category);
    if (channelVolume <= 0) return false;
    if (category === 'ui') return appState.audio.ui;
    if (category === 'cutscene') return appState.audio.roll;
    return appState.audio.roll;
}

function playSoundEffect(audioElement, category = 'rolling') {
    if (!audioElement) return;

    const resolvePlaybackGain = () => {
        if (!isSoundChannelActive(category)) return 0;
        if (category !== 'ui' && appState.videoPlaying) return 0;
        const baseGain = resolveBaseGain(audioElement, category === 'ui' ? 0.3 : 1);
        const channelMultiplier = getChannelVolumeMultiplier(category);
        return baseGain * channelMultiplier;
    };

    const initialGain = resolvePlaybackGain();
    if (initialGain <= 0) return;

    const spawnFallbackPlayer = (currentGain) => {
        if (currentGain <= 0) {
            return;
        }

        const sourceUrl = normalizeMediaSource(audioElement);
        if (!sourceUrl) {
            audioElement.currentTime = 0;
            audioElement.volume = clamp01(currentGain);
            audioElement.muted = false;
            if (typeof audioElement.removeAttribute === 'function') {
                audioElement.removeAttribute('muted');
            }
            audioElement.play().catch(() => {});
            return;
        }

        const fallbackPlayer = audioElement.cloneNode(true);
        fallbackPlayer.removeAttribute('id');
        fallbackPlayer.src = sourceUrl;
        fallbackPlayer.currentTime = 0;
        fallbackPlayer.muted = false;
        fallbackPlayer.loop = false;
        fallbackPlayer.playsInline = true;
        fallbackPlayer.autoplay = false;
        fallbackPlayer.volume = clamp01(currentGain);

        const cleanup = () => {
            fallbackPlayer.pause();
            fallbackPlayer.removeAttribute('src');
            fallbackPlayer.load();
            appState.audio.fallbackPlayers.delete(fallbackPlayer);
            if (fallbackPlayer.parentNode) {
                fallbackPlayer.parentNode.removeChild(fallbackPlayer);
            }
        };

        fallbackPlayer.addEventListener('ended', cleanup, { once: true });
        fallbackPlayer.addEventListener('error', cleanup, { once: true });

        fallbackPlayer.style.display = 'none';
        const attachmentTarget = document.body || document.documentElement;
        if (attachmentTarget) {
            attachmentTarget.appendChild(fallbackPlayer);
        }

        appState.audio.fallbackPlayers.add(fallbackPlayer);
        fallbackPlayer.play().catch(() => {
            cleanup();
        });
    };

    const context = resumeAudioEngine();
    if (!context) {
        if (audioElement.readyState >= 2) {
            spawnFallbackPlayer(initialGain);
        }
        return;
    }

    const sourceKey = normalizeMediaSource(audioElement);
    if (!sourceKey) {
        spawnFallbackPlayer(initialGain);
        return;
    }

    const fetchAudioBuffer = async () => {
        if (appState.audio.bufferCache.has(sourceKey)) {
            return appState.audio.bufferCache.get(sourceKey);
        }
        if (appState.audio.bufferPromises.has(sourceKey)) {
            return appState.audio.bufferPromises.get(sourceKey);
        }
        const task = fetch(sourceKey)
            .then(response => response.arrayBuffer())
            .then(buffer => context.decodeAudioData(buffer))
            .then(decoded => {
                appState.audio.bufferCache.set(sourceKey, decoded);
                appState.audio.bufferPromises.delete(sourceKey);
                return decoded;
            })
            .catch(error => {
                appState.audio.bufferPromises.delete(sourceKey);
                console.warn('Failed to buffer audio', error);
                return null;
            });
        appState.audio.bufferPromises.set(sourceKey, task);
        return task;
    };

    fetchAudioBuffer().then(buffer => {
        const currentGain = resolvePlaybackGain();
        if (currentGain <= 0) {
            return;
        }

        if (!buffer) {
            spawnFallbackPlayer(currentGain);
            return;
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        const gainNode = context.createGain();
        gainNode.gain.value = currentGain;
        source.connect(gainNode).connect(context.destination);
        source.start(0);
    });
}

function computeBackgroundMusicBase(bgMusic) {
    if (!bgMusic) return 0.18;
    const dataset = bgMusic.dataset || {};
    const rawValue = dataset.volume ?? dataset.gain ?? dataset.boost;
    const parsed = Number.parseFloat(rawValue);
    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(parsed, 1);
    }
    return 0.18;
}

function computeEffectiveBackgroundVolume(bgMusic) {
    const base = computeBackgroundMusicBase(bgMusic);
    return clamp01(base * getChannelVolumeMultiplier('music'));
}

function synchronizeBackgroundRouting(bgMusic) {
    if (!bgMusic) {
        return { baseVolume: 0.18, chain: null };
    }

    const baseVolume = computeEffectiveBackgroundVolume(bgMusic);
    const chain = ensureGlitchAudioChain(bgMusic);

    if (chain && chain.gainNode) {
        chain.baseGain = baseVolume;
        const context = chain.context;
        if (context && typeof chain.gainNode.gain.setTargetAtTime === 'function') {
            chain.gainNode.gain.setTargetAtTime(baseVolume, context.currentTime, 0.01);
        } else {
            chain.gainNode.gain.value = baseVolume;
        }
        bgMusic.volume = 1;
    } else {
        bgMusic.volume = baseVolume;
    }

    return { baseVolume, chain };
}

function primeBackgroundMusic(bgMusic) {
    if (!bgMusic) return;

    synchronizeBackgroundRouting(bgMusic);
    try {
        bgMusic.muted = false;
        if (typeof bgMusic.removeAttribute === 'function') {
            bgMusic.removeAttribute('muted');
        }
    } catch (error) {
        console.warn('Unable to unmute background music element', error);
    }
}

function startBackgroundMusic(bgMusic) {
    if (!bgMusic) return;

    const playPromise = bgMusic.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
            if (!appState.audio.roll) return;
            try {
                bgMusic.muted = false;
                if (typeof bgMusic.removeAttribute === 'function') {
                    bgMusic.removeAttribute('muted');
                }
            } catch (error) {
                console.warn('Unable to clear muted attribute for retry', error);
            }
            const retryPromise = bgMusic.play();
            if (retryPromise && typeof retryPromise.catch === 'function') {
                retryPromise.catch(() => {});
            }
        });
        return;
    }
}

function updateMasterMuteToggleButton() {
    const masterMuteToggle = document.getElementById('masterMuteToggle');
    if (!masterMuteToggle) return;
    masterMuteToggle.textContent = appState.audio.masterMuted ? 'Unmute' : 'Mute';
    masterMuteToggle.setAttribute('aria-pressed', appState.audio.masterMuted ? 'true' : 'false');
}

function setMasterMuteState(isMuted, { force = false, persist = true } = {}) {
    if (appState.audio.masterMuted === isMuted && !force) {
        updateMasterMuteToggleButton();
        return;
    }

    appState.audio.masterMuted = isMuted;
    updateMasterMuteToggleButton();

    ['music', 'obtain', 'cutscene', 'ui'].forEach(channel => applyChannelVolumeToElements(channel));

    if (!isMuted) {
        resumeAudioEngine();
    }

    if (persist) {
        persistAudioSettings();
    }
}

function toggleMasterMute() {
    setMasterMuteState(!appState.audio.masterMuted);
}

function toggleRollingAudio() {
    appState.audio.roll = !appState.audio.roll;
    const bgMusic = document.getElementById('ambientMusic');
    const soundToggle = document.getElementById('rollAudioToggle');
    if (bgMusic && !bgMusic.getAttribute('data-current-src')) {
        bgMusic.setAttribute('data-current-src', bgMusic.src);
    }

    if (appState.audio.roll) {
        resumeAudioEngine();
        playSoundEffect(clickSoundEffectElement, 'ui');
        if (bgMusic) {
            primeBackgroundMusic(bgMusic);
            if (glitchPresentationEnabled) {
                updateGlitchAudioControls(shouldUseGlitchBaseEffect());
            }
            startBackgroundMusic(bgMusic);
        }
        applyChannelVolumeToElements('music');
        applyChannelVolumeToElements('obtain');
    } else if (bgMusic) {
        bgMusic.muted = true;
        if (typeof bgMusic.setAttribute === 'function') {
            bgMusic.setAttribute('muted', '');
        }
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }

    if (soundToggle) {
        soundToggle.textContent = appState.audio.roll ? 'Audio: On' : 'Audio: Off';
        soundToggle.setAttribute('aria-pressed', appState.audio.roll);
    }
}

function toggleInterfaceAudio() {
    const enableUi = !appState.audio.ui;
    const restoredVolume = appState.audio.uiLastVolume > 0 ? appState.audio.uiLastVolume : DEFAULT_AUDIO_LEVEL;
    setChannelVolume('ui', enableUi ? restoredVolume : 0);
    resumeAudioEngine();

    const uiSoundToggle = document.getElementById('uiAudioToggle');
    if (uiSoundToggle) {
        uiSoundToggle.textContent = appState.audio.ui ? 'UI Sound: On' : 'UI Sound: Off';
        uiSoundToggle.setAttribute('aria-pressed', appState.audio.ui);
    }

    if (appState.audio.ui) {
        playSoundEffect(clickSoundEffectElement, 'ui');
    }
}

function toggleCinematicMode() {
    const wasCinematic = appState.cinematic;
    appState.cinematic = !appState.cinematic;

    const cutsceneToggle = document.getElementById('cinematicToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = appState.cinematic ? 'Cutscenes (Fullscreen recommended): On' : 'Cutscenes (Fullscreen recommended): Off';
        cutsceneToggle.setAttribute('aria-pressed', appState.cinematic ? 'true' : 'false');
    }

    const clickSound = clickSoundEffectElement;
    if (clickSound) {
        playSoundEffect(clickSound, 'ui');
    }

    if (appState.cinematic) {
        if (!cutsceneWarningManager.isSuppressed()) {
            cutsceneWarningManager.show();
        } else if (!wasCinematic) {
            cutsceneWarningManager.hide();
        }
    }

    if (!appState.cinematic) {
        cutsceneWarningManager.hide();
        const skipButton = document.getElementById('skip-cinematic-button');
        if (skipButton && skipButton.style.display !== 'none') {
            skipButton.click();
        }
    }

    persistVisualSettings();
}

function isGlitchBiomeSelected() {
    const selection = collectBiomeSelectionState();
    if (!selection) {
        return false;
    }

    const { canonicalBiome, themeBiome, primaryBiome, timeBiome } = selection;

    if (canonicalBiome === 'glitch' || themeBiome === 'glitch') {
        return true;
    }

    if (primaryBiome === 'glitch' || timeBiome === 'glitch') {
        return true;
    }

    return false;
}

function updateGlitchPresentation() {
    ensureQualityPreferences();
    const glitchBiomeActive = isGlitchBiomeSelected();
    const removeGlitchEffects = appState.qualityPreferences.removeGlitchEffects;
    const enableGlitch = appState.glitch && glitchBiomeActive && !appState.reduceMotion;
    applyGlitchVisuals(enableGlitch, { forceTheme: glitchBiomeActive });
}

function toggleGlitchEffects() {
    appState.glitch = !appState.glitch;
    const glitchToggle = document.getElementById('glitchEffectsToggle');
    if (glitchToggle) {
        glitchToggle.textContent = appState.glitch ? 'Glitch Effects: On' : 'Glitch Effects: Off';
        glitchToggle.setAttribute('aria-pressed', appState.glitch ? 'true' : 'false');
    }

    playSoundEffect(clickSoundEffectElement, 'ui');
    updateGlitchPresentation();
    persistVisualSettings();
}

function applyReducedMotionState(enabled) {
    if (pageBody) {
        pageBody.classList.toggle('reduce-motion', enabled);
    }

    if (reduceMotionToggleButton) {
        reduceMotionToggleButton.textContent = enabled ? 'Reduce Animations: On' : 'Reduce Animations: Off';
        reduceMotionToggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    cachedVideoElements.forEach(video => {
        if (!video) {
            return;
        }
        if (enabled) {
            if (!video.paused) {
                video.dataset.resumeOnMotion = 'true';
                try {
                    video.pause();
                } catch (error) {
                    console.warn('Unable to pause video for reduced motion preference', error);
                }
            }
        } else if (video.dataset.resumeOnMotion === 'true') {
            delete video.dataset.resumeOnMotion;
            if (typeof video.play === 'function') {
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            }
        }
    });

    updateGlitchPresentation();

    if (enabled) {
        resetLuckPresetAnimations();
    }

    syncLuckVisualEffects(currentLuck);
    syncSnowEffect();
}

function toggleReducedMotion() {
    appState.reduceMotion = !appState.reduceMotion;
    reduceMotionPreferenceOverride = appState.reduceMotion;
    applyReducedMotionState(appState.reduceMotion);
    playSoundEffect(clickSoundEffectElement, 'ui');
    persistVisualSettings();
}

function applyQualityPreferencesState() {
    ensureQualityPreferences();

    if (pageBody) {
        pageBody.classList.toggle('quality-no-particles', appState.qualityPreferences.removeParticles);
        pageBody.classList.toggle('quality-no-button-animations', appState.qualityPreferences.disableButtonAnimations);
        pageBody.classList.toggle('quality-no-roll-sigil-animations', appState.qualityPreferences.disableRollAndSigilAnimations);
        pageBody.classList.toggle('quality-reduced-glitch', appState.qualityPreferences.reduceGlitchEffects);
        pageBody.classList.toggle('quality-no-glitch', appState.qualityPreferences.removeGlitchEffects);
    }

    if (appState.qualityPreferences.removeGlitchEffects) {
        appState.qualityPreferences.reduceGlitchEffects = false;
    }

    syncQualityPreferenceButtons();
    syncSnowEffect();
    updateGlitchPresentation();
}

function syncQualityPreferenceButtons() {
    const menu = document.getElementById('qualityPreferencesMenu');
    if (!menu) {
        return;
    }

    ensureQualityPreferences();

    menu.querySelectorAll('[data-quality-option]').forEach(button => {
        const key = button.dataset.qualityOption;
        if (!key || !Object.prototype.hasOwnProperty.call(appState.qualityPreferences, key)) {
            return;
        }

        const enabled = Boolean(appState.qualityPreferences[key]);
        button.setAttribute('aria-checked', enabled ? 'true' : 'false');
        button.classList.toggle('quality-settings__item--active', enabled);
    });
}

function initializeQualityPreferencesMenu() {
    const trigger = document.getElementById('qualityPreferencesToggle');
    const menu = document.getElementById('qualityPreferencesMenu');
    const overlay = document.getElementById('qualityPreferencesOverlay');
    const closeButton = document.getElementById('qualityPreferencesClose');
    if (!trigger || !menu || !overlay) {
        return;
    }

    ensureQualityPreferences();

    const closeMenu = () => {
        if (overlay.hasAttribute('hidden') || overlay.hasAttribute('data-closing')) {
            trigger.setAttribute('aria-expanded', 'false');
            return;
        }

        concealOverlay(overlay, {
            onHidden: () => {
                trigger.setAttribute('aria-expanded', 'false');
                const last = qualityPreferencesOverlayState.lastFocusedElement;
                qualityPreferencesOverlayState.lastFocusedElement = null;
                if (last && typeof last.focus === 'function') {
                    last.focus({ preventScroll: true });
                }
            }
        });
    };

    const openMenu = () => {
        qualityPreferencesOverlayState.lastFocusedElement = document.activeElement;
        revealOverlay(overlay);
        trigger.setAttribute('aria-expanded', 'true');
        const firstButton = menu.querySelector('[data-quality-option]');
        if (firstButton && typeof firstButton.focus === 'function') {
            firstButton.focus({ preventScroll: true });
        }
    };

    trigger.addEventListener('click', () => {
        const isOpen = trigger.getAttribute('aria-expanded') === 'true';
        if (isOpen) {
            closeMenu();
            return;
        }
        openMenu();
    });

    menu.addEventListener('click', event => {
        const button = event.target instanceof Element ? event.target.closest('[data-quality-option]') : null;
        if (!button) {
            return;
        }

        const key = button.dataset.qualityOption;
        if (!key || !Object.prototype.hasOwnProperty.call(appState.qualityPreferences, key)) {
            return;
        }

        if (key === 'removeGlitchEffects') {
            const nextValue = !appState.qualityPreferences.removeGlitchEffects;
            appState.qualityPreferences.removeGlitchEffects = nextValue;
            if (nextValue) {
                appState.qualityPreferences.reduceGlitchEffects = false;
            }
        } else if (key === 'reduceGlitchEffects') {
            const nextValue = !appState.qualityPreferences.reduceGlitchEffects;
            appState.qualityPreferences.reduceGlitchEffects = nextValue;
            if (nextValue) {
                appState.qualityPreferences.removeGlitchEffects = false;
            }
        } else {
            appState.qualityPreferences[key] = !appState.qualityPreferences[key];
        }

        applyQualityPreferencesState();
        playSoundEffect(clickSoundEffectElement, 'ui');
        persistVisualSettings();
    });

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            closeMenu();
        });
    }

    overlay.addEventListener('click', event => {
        if (event.target === overlay) {
            closeMenu();
        }
    });

    menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeMenu();
            trigger.focus({ preventScroll: true });
        }
    });

    closeMenu();
    syncQualityPreferenceButtons();
}

const CHANGELOG_TIMEZONE_OFFSETS = Object.freeze({
    UTC: 0,
    GMT: 0,
    CET: 60,
    CEST: 120,
    EET: 120,
    EEST: 180,
    EST: -300,
    EDT: -240,
    CST: -360,
    CDT: -300,
    MST: -420,
    MDT: -360,
    PST: -480,
    PDT: -420,
    JST: 540,
    KST: 540,
    IST: 330,
    AEST: 600,
    AEDT: 660
});

function formatChangelogLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const rawHour = date.getHours();
    const period = rawHour >= 12 ? 'PM' : 'AM';
    const hour = rawHour % 12 || 12;
    return `${year}/${month}/${day} ${hour}:${minutes} ${period}`;
}

function localizeChangelogUpdateTimes() {
    const nodes = Array.from(document.querySelectorAll('.changelog-modal__meta'));
    if (!nodes.length) {
        return;
    }

    const pattern = /^Updated\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s+([A-Za-z]{2,5})$/i;

    nodes.forEach(node => {
        const value = node.textContent.trim();
        const parsed = pattern.exec(value);
        if (!parsed) {
            return;
        }

        const [, y, m, d, h, min, meridiem, timezone] = parsed;
        const normalizedTz = timezone.toUpperCase();
        if (!Object.prototype.hasOwnProperty.call(CHANGELOG_TIMEZONE_OFFSETS, normalizedTz)) {
            return;
        }

        let hour24 = Number.parseInt(h, 10) % 12;
        if (meridiem.toUpperCase() === 'PM') {
            hour24 += 12;
        }

        const utcMilliseconds = Date.UTC(
            Number.parseInt(y, 10),
            Number.parseInt(m, 10) - 1,
            Number.parseInt(d, 10),
            hour24,
            Number.parseInt(min, 10)
        ) - (CHANGELOG_TIMEZONE_OFFSETS[normalizedTz] * 60 * 1000);

        const localDate = new Date(utcMilliseconds);
        node.textContent = `Updated ${formatChangelogLocalDate(localDate)}`;
    });
}

const reduceMotionMediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

if (reduceMotionMediaQuery) {
    appState.reduceMotion = reduceMotionMediaQuery.matches;
    reduceMotionMediaQuery.addEventListener('change', event => {
        if (reduceMotionPreferenceOverride !== null) {
            return;
        }
        appState.reduceMotion = event.matches;
        applyReducedMotionState(appState.reduceMotion);
        persistVisualSettings();
    });
}

const snowEffectState = {
    requested: false,
    mode: 'none'
};

function createParticleNode(mode) {
    const particle = document.createElement('span');
    particle.className = mode === 'snow' ? 'snow-particle' : 'heart-particle';

    const size = randomDecimalBetween(mode === 'snow' ? 0.8 : 1.35, mode === 'snow' ? 1.7 : 2.1);
    const opacity = randomDecimalBetween(mode === 'snow' ? 0.5 : 0.44, mode === 'snow' ? 0.92 : 0.88);
    const drift = randomDecimalBetween(-32, 32);
    const duration = randomDecimalBetween(mode === 'snow' ? 9 : 8, mode === 'snow' ? 17 : 16);
    const delay = randomDecimalBetween(0, 20);
    const x = randomDecimalBetween(0, 100);
    const swayDistance = randomDecimalBetween(8, 24);
    const swayDuration = randomDecimalBetween(3.8, 7.4);
    const popHeight = randomDecimalBetween(42, 142);
    const glow = randomDecimalBetween(mode === 'snow' ? 0.24 : 0.42, mode === 'snow' ? 0.6 : 0.8);

    particle.style.setProperty('--size', size.toFixed(2));
    particle.style.setProperty('--opacity', opacity.toFixed(2));
    particle.style.setProperty('--drift', `${drift.toFixed(2)}px`);
    particle.style.setProperty('--float-duration', `${duration.toFixed(2)}s`);
    particle.style.setProperty('--float-delay', `${delay.toFixed(2)}s`);
    particle.style.setProperty('--x', `${x.toFixed(2)}%`);
    particle.style.setProperty('--sway-distance', `${swayDistance.toFixed(2)}px`);
    particle.style.setProperty('--sway-duration', `${swayDuration.toFixed(2)}s`);
    particle.style.setProperty('--pop-height', `${popHeight.toFixed(2)}vh`);
    particle.style.setProperty('--glow-strength', glow.toFixed(2));

    const sway = document.createElement('span');
    sway.className = mode === 'snow' ? 'snow-particle__sway' : 'heart-particle__sway';

    const icon = document.createElement('i');
    icon.className = mode === 'snow'
        ? 'fa-solid fa-snowflake snow-particle__icon'
        : 'fa-solid fa-heart heart-particle__icon';
    icon.setAttribute('aria-hidden', 'true');

    sway.appendChild(icon);
    particle.appendChild(sway);
    return particle;
}

function clearSnowField() {
    const container = document.getElementById('snowField');
    if (!container) return;

    container.dataset.active = 'false';
    if (container.childElementCount > 0) {
        container.replaceChildren();
    }
}

function renderSnowField() {
    const container = document.getElementById('snowField');
    const mode = snowEffectState.mode;
    if (!container || mode === 'none' || appState.reduceMotion || appState.qualityPreferences?.removeParticles) return;

    let viewportWidth = 1280;
    let viewportHeight = 720;
    if (typeof window !== 'undefined') {
        viewportWidth = window.innerWidth || viewportWidth;
        viewportHeight = window.innerHeight || viewportHeight;
    }

    const baseDensity = Math.floor((viewportWidth * viewportHeight) / 26000);
    const particleTotal = Math.min(132, Math.max(44, baseDensity));

    container.dataset.active = 'true';
    container.replaceChildren();

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < particleTotal; i++) {
        fragment.appendChild(createParticleNode(mode));
    }

    container.appendChild(fragment);
}

function syncSnowEffect() {
    if (!snowEffectState.requested || snowEffectState.mode === 'none' || appState.reduceMotion || appState.qualityPreferences?.removeParticles) {
        clearSnowField();
        return;
    }

    renderSnowField();
}

function startSnowEffect() {
    snowEffectState.requested = true;
    syncSnowEffect();
}

if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        if (snowEffectState.requested && !appState.reduceMotion && !appState.qualityPreferences?.removeParticles) {
            renderSnowField();
        }
    });
}

const biomeAssets = {
    normal: { image: 'files/normalBiomeImage.png', music: 'files/normalBiomeMusic.mp3' },
    roe: { image: 'files/normalBiomeImage.png', music: 'files/normalBiomeMusic.mp3' },
    day: { image: 'files/dayBiomeImage.jpg', music: 'files/dayBiomeMusic.mp3' },
    night: { image: 'files/nightBiomeImage.jpg', music: 'files/nightBiomeMusic.mp3' },
    rainy: { image: 'files/rainyBiomeImage.jpg', music: 'files/rainyBiomeMusic.mp3' },
    windy: { image: 'files/windyBiomeImage.jpg', music: 'files/windyBiomeMusic.mp3' },
    snowy: { image: 'files/snowyBiomeImage.jpg', music: 'files/winterBiomeMusic.mp3' },
    aurora: { image: 'files/auroraBiomeImage.jpg', music: 'files/auroraBiomeMusic.mp3' },
    sandstorm: { image: 'files/sandstormBiomeImage.jpg', music: 'files/sandstormBiomeMusic.mp3' },
    hell: { image: 'files/hellBiomeImage.jpg', music: 'files/hellBiomeMusic.mp3' },
    starfall: { image: 'files/starfallBiomeImage.jpg', music: 'files/starfallBiomeMusic.mp3' },
    heaven: { image: 'files/heavenBiomeImage.png', music: 'files/heavenBiomeMusic.mp3' },
    corruption: { image: 'files/corruptionBiomeImage.jpg', music: 'files/corruptionBiomeMusic.mp3' },
    null: { image: 'files/nullBiomeImage.jpg', music: 'files/nullBiomeMusic.mp3' },
    dreamspace: { image: 'files/dreamspaceBiomeImage.jpg', music: 'files/dreamspaceBiomeMusic.mp3' },
    glitch: { image: 'files/glitchBiomeImage.webm', music: 'files/glitchBiomeMusic.mp3' },
    cyberspace: { image: 'files/cyberspaceBiomeImage.jpg', music: 'files/cyberspaceBiomeMusic.mp3' },
    anotherRealm: { image: 'files/anotherRealmBiomeImage.jpg', music: 'files/anotherRealmBiomeMusic.mp3' },
    mastermind: { image: 'files/mastermindBiomeImage.png', music: 'files/mastermindBiomeMusic.mp3' },
    edict: { image: 'files/wordBiomeImage.png', music: 'files/wordBiomeMusic.mp3' },
    unknown: { image: 'files/unknownBiomeImage.png', music: 'files/unknownBiomeMusic.mp3' },
    graveyard: { image: 'files/graveyardBiomeImage.jpg', music: 'files/graveyardBiomeMusic.mp3' },
    pumpkinMoon: { image: 'files/pumpkinMoonBiomeImage.jpg', music: 'files/pumpkinMoonBiomeMusic.mp3' },
    bloodRain: { image: 'files/bloodRainBiomeImage.jpg', music: 'files/bloodRainBiomeMusic.mp3' },
    limbo: { image: 'files/limboImage.jpg', music: 'files/limboMusic.mp3' },
    blazing: { image: 'files/blazingBiomeImage.jpg', music: 'files/blazingBiomeMusic.mp3' }
};

function resolveBiomeAssetKey(biome, selectionState = null) {
    const selection = selectionState || collectBiomeSelectionState();
    const themeCandidate = selection && selection.themeBiome ? selection.themeBiome : biome;
    if (Object.prototype.hasOwnProperty.call(biomeAssets, themeCandidate)) {
        return themeCandidate;
    }
    if (Object.prototype.hasOwnProperty.call(biomeAssets, biome)) {
        return biome;
    }
    return 'normal';
}

function shouldUseGlitchBaseEffect() {
    return glitchPresentationEnabled
        && glitchUiState.isUiGlitching
        && !appState.qualityPreferences?.removeGlitchEffects;
}

function resetGlitchRuinTimer() {
    if (glitchUiState.loopTimeoutId !== null) {
        window.clearTimeout(glitchUiState.loopTimeoutId);
        glitchUiState.loopTimeoutId = null;
    }
}

function resetGlitchWarbleTimer() {
    if (glitchUiState.activeTimeoutId !== null) {
        window.clearTimeout(glitchUiState.activeTimeoutId);
        glitchUiState.activeTimeoutId = null;
    }
}

function scheduleGlitchWarbleCycle(bgMusic, chain) {
    if (!bgMusic || !chain || !chain.context) return;

    resetGlitchWarbleTimer();

    const baseGain = chain.baseGain ?? computeEffectiveBackgroundVolume(bgMusic);
    const context = chain.context;
    const reducedGlitch = Boolean(appState.qualityPreferences?.reduceGlitchEffects);
    const duration = reducedGlitch ? randomDecimalBetween(0.26, 0.62) : randomDecimalBetween(0.18, 0.45);
    const wobble = reducedGlitch ? randomDecimalBetween(0.03, 0.08) : randomDecimalBetween(0.08, 0.18);
    const target = Math.max(0, baseGain - wobble);

    if (typeof chain.gainNode.gain.setValueAtTime === 'function') {
        chain.gainNode.gain.setValueAtTime(baseGain, context.currentTime);
        chain.gainNode.gain.linearRampToValueAtTime(target, context.currentTime + duration);
        chain.gainNode.gain.linearRampToValueAtTime(baseGain, context.currentTime + duration + 0.12);
    } else {
        chain.gainNode.gain.value = baseGain;
    }

    glitchUiState.activeTimeoutId = window.setTimeout(() => {
        glitchUiState.activeTimeoutId = null;
        scheduleGlitchWarbleCycle(bgMusic, chain);
    }, Math.floor(reducedGlitch ? randomDecimalBetween(1200, 2100) : randomDecimalBetween(650, 1080)));
}

const GLITCH_BURST_TRIGGER_CHANCE = 0.99;

function computeGlitchRestDelay() {
    if (appState.qualityPreferences?.reduceGlitchEffects) {
        return Math.floor(randomDecimalBetween(12000, 22000));
    }
    return Math.floor(randomDecimalBetween(5000, 11000));
}

function computeGlitchBurstDuration() {
    if (appState.qualityPreferences?.reduceGlitchEffects) {
        return Math.floor(randomDecimalBetween(900, 1500));
    }
    return Math.floor(randomDecimalBetween(2400, 3400));
}

function createDistortionCurve(amount = 0) {
    const k = Number(amount) || 50;
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; ++i) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

function ensureGlitchAudioChain(audioElement) {
    if (!audioElement) return null;

    const context = resumeAudioEngine();
    if (!context) {
        applyMediaGain(audioElement, { category: 'music' });
        return null;
    }

    if (!canUseMediaElementSource(audioElement)) {
        applyMediaGain(audioElement, { category: 'music' });
        return null;
    }

    if (glitchUiState.sourceNode && glitchUiState.sourceNode.mediaElement !== audioElement) {
        glitchUiState.sourceNode.disconnect();
        glitchUiState.sourceNode = null;
    }

    if (!glitchUiState.sourceNode) {
        glitchUiState.sourceNode = context.createMediaElementSource(audioElement);
        glitchUiState.audioPipelineMode = null;
    }

    if (!glitchUiState.waveShaper) {
        glitchUiState.waveShaper = context.createWaveShaper();
        glitchUiState.waveShaper.curve = createDistortionCurve(120);
        glitchUiState.waveShaper.oversample = '4x';
    }

    if (!glitchUiState.distortionNode) {
        glitchUiState.distortionNode = context.createBiquadFilter();
        glitchUiState.distortionNode.type = 'highpass';
        glitchUiState.distortionNode.frequency.value = 240;
    }

    if (!glitchUiState.gainNode) {
        glitchUiState.gainNode = context.createGain();
        glitchUiState.gainNode.gain.value = computeEffectiveBackgroundVolume(audioElement);
    }

    const desiredPipeline = shouldUseGlitchBaseEffect() ? 'glitch' : 'clean';

    if (glitchUiState.audioPipelineMode !== desiredPipeline) {
        if (glitchUiState.sourceNode) {
            try { glitchUiState.sourceNode.disconnect(); } catch (error) {}
        }
        if (glitchUiState.waveShaper) {
            try { glitchUiState.waveShaper.disconnect(); } catch (error) {}
        }
        if (glitchUiState.distortionNode) {
            try { glitchUiState.distortionNode.disconnect(); } catch (error) {}
        }
        if (glitchUiState.gainNode) {
            try { glitchUiState.gainNode.disconnect(); } catch (error) {}
        }

        if (desiredPipeline === 'glitch') {
            glitchUiState.sourceNode
                .connect(glitchUiState.waveShaper)
                .connect(glitchUiState.distortionNode)
                .connect(glitchUiState.gainNode)
                .connect(context.destination);
        } else {
            glitchUiState.sourceNode
                .connect(glitchUiState.gainNode)
                .connect(context.destination);
        }

        glitchUiState.audioPipelineMode = desiredPipeline;
    }

    return {
        context,
        baseGain: glitchUiState.gainNode.gain.value,
        gainNode: glitchUiState.gainNode
    };
}

function updateGlitchAudioControls(enabled) {
    const bgMusic = document.getElementById('ambientMusic');
    if (!bgMusic) return;

    const { chain } = synchronizeBackgroundRouting(bgMusic);
    if (!chain) {
        if (!enabled) {
            resetGlitchWarbleTimer();
        }
        return;
    }

    if (enabled) {
        scheduleGlitchWarbleCycle(bgMusic, chain);
    } else {
        resetGlitchWarbleTimer();
        const baseVolume = chain.baseGain ?? computeEffectiveBackgroundVolume(bgMusic);
        if (typeof chain.gainNode.gain.setTargetAtTime === 'function') {
            chain.gainNode.gain.setTargetAtTime(baseVolume, chain.context.currentTime, 0.1);
        } else {
            chain.gainNode.gain.value = baseVolume;
        }
    }
}

function triggerGlitchBurst() {
    const body = document.body;
    if (!body) return;

    body.classList.add('is-glitching');
    glitchUiState.isUiGlitching = true;
    updateGlitchAudioControls(true);
}

function completeGlitchBurst() {
    const body = document.body;
    if (!body) return;

    body.classList.remove('is-glitching');
    glitchUiState.isUiGlitching = false;
    updateGlitchAudioControls(false);
}

function queueGlitchBurstCycle(delay) {
    resetGlitchRuinTimer();
    if (typeof window === 'undefined') return;

    glitchUiState.loopTimeoutId = window.setTimeout(() => {
        glitchUiState.loopTimeoutId = null;
        if (!glitchPresentationEnabled) return;

        if (drawEntropy() < GLITCH_BURST_TRIGGER_CHANCE) {
            executeGlitchBurstSequence();
        } else {
            const nextDelay = computeGlitchRestDelay();
            queueGlitchBurstCycle(nextDelay);
        }
    }, delay);
}

function executeGlitchBurstSequence() {
    if (!glitchPresentationEnabled || typeof window === 'undefined') return;

    triggerGlitchBurst();

    const activeDuration = computeGlitchBurstDuration();

    glitchUiState.activeTimeoutId = window.setTimeout(() => {
        glitchUiState.activeTimeoutId = null;
        completeGlitchBurst();
        const nextDelay = computeGlitchRestDelay();
        queueGlitchBurstCycle(nextDelay);
    }, activeDuration);
}

function startGlitchLoop(forceImmediate = false) {
    if (!glitchPresentationEnabled || typeof window === 'undefined') return;
    if (forceImmediate) {
        executeGlitchBurstSequence();
        return;
    }
    const initialDelay = computeGlitchRestDelay();
    queueGlitchBurstCycle(initialDelay);
}

function isGlitchLoopScheduled() {
    return glitchUiState.loopTimeoutId !== null;
}

function stopGlitchLoop(options = {}) {
    const body = document.body;
    const root = document.documentElement;
    if (glitchUiState.loopTimeoutId !== null) {
        window.clearTimeout(glitchUiState.loopTimeoutId);
        glitchUiState.loopTimeoutId = null;
    }
    if (glitchUiState.activeTimeoutId !== null) {
        window.clearTimeout(glitchUiState.activeTimeoutId);
        glitchUiState.activeTimeoutId = null;
    }
    glitchUiState.isUiGlitching = false;
    if (!body || !root) return;

    const clearClasses = () => {
        body.classList.remove('is-glitching');
        root.classList.remove('is-glitching');
    };

    if (options.forceClear) {
        clearClasses();
        updateGlitchAudioControls(false);
        return;
    }

    window.setTimeout(() => {
        clearClasses();
        updateGlitchAudioControls(false);
    }, 150);
}

function applyGlitchVisuals(enabled, options = {}) {
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;

    const { forceTheme = false } = options;

    if (enabled) {
        body.classList.add('biome--glitch');
        root.classList.add('biome--glitch');
        if (!glitchPresentationEnabled) {
            glitchPresentationEnabled = true;
            startGlitchLoop();
        } else if (!isGlitchLoopScheduled()) {
            startGlitchLoop();
        }
        updateGlitchAudioControls(shouldUseGlitchBaseEffect());
    } else {
        if (glitchPresentationEnabled) {
            glitchPresentationEnabled = false;
            stopGlitchLoop({ forceClear: !forceTheme });
        }
        if (forceTheme) {
            body.classList.add('biome--glitch');
            root.classList.add('biome--glitch');
        } else {
            body.classList.remove('biome--glitch');
            root.classList.remove('biome--glitch');
        }
        glitchUiState.isUiGlitching = false;
        updateGlitchAudioControls(false);
    }
}

function applyBiomeTheme(biome, selectionState = null) {
    const selection = selectionState || collectBiomeSelectionState();
    const assetKey = resolveBiomeAssetKey(biome, selection);
    const assets = biomeAssets[assetKey] || biomeAssets.normal;
    const isVideoAsset = assets && typeof assets.image === 'string' && /\.(webm|mp4|ogv|ogg)$/i.test(assets.image);

    const root = document.documentElement;

    if (root && assets) {
        root.style.setProperty('--biome-background', isVideoAsset ? 'none' : `url("${assets.image}")`);
    }

    const backdrop = document.querySelector('.interface-backdrop');
    if (backdrop) {
        const backdropVideo = backdrop.querySelector('.interface-backdrop__video');
        if (isVideoAsset && backdropVideo) {
            backdrop.classList.add('interface-backdrop--video-active');
            backdrop.style.backgroundImage = 'none';

            const currentVideoSrc = backdropVideo.getAttribute('data-current-src');
            if (currentVideoSrc !== assets.image) {
                backdropVideo.pause();
                backdropVideo.removeAttribute('src');
                backdropVideo.load();
                backdropVideo.src = assets.image;
                backdropVideo.load();
                backdropVideo.setAttribute('data-current-src', assets.image);
            }

            const playPromise = backdropVideo.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
            }
        } else if (assets) {
            backdrop.classList.remove('interface-backdrop--video-active');
            backdrop.style.backgroundImage = `url("${assets.image}")`;
            if (backdropVideo) {
                backdropVideo.pause();
                if (backdropVideo.readyState > 0) {
                    try {
                        backdropVideo.currentTime = 0;
                    } catch (error) {
                        console.warn('Unable to reset glitch backdrop video time', error);
                    }
                }
                backdropVideo.removeAttribute('src');
                backdropVideo.load();
                backdropVideo.removeAttribute('data-current-src');
            }
        }
    }

    const bgMusic = document.getElementById('ambientMusic');
    if (bgMusic && assets) {
        const currentSrc = bgMusic.getAttribute('data-current-src');
        const shouldUpdateMusic = currentSrc !== assets.music;
        if (shouldUpdateMusic) {
            bgMusic.pause();
            bgMusic.currentTime = 0;
            bgMusic.src = assets.music;
            bgMusic.setAttribute('data-current-src', assets.music);
            bgMusic.load();
        }

        if (appState.audio.roll) {
            primeBackgroundMusic(bgMusic);
            if (glitchPresentationEnabled) {
                updateGlitchAudioControls(shouldUseGlitchBaseEffect());
            }
        }

        if (appState.audio.roll && (shouldUpdateMusic || bgMusic.paused)) {
            startBackgroundMusic(bgMusic);
        }
    }
}

let baseLuck = 1;
let currentLuck = 1;
let lastVipMultiplier = 1;
let lastXyzMultiplier = 1;
let lastSorryMultiplier = 1;
let lastXcMultiplier = 1;
let lastAxisMultiplier = 1;
let lastDaveMultiplier = 1;
let lastDorcelessnessMultiplier = 1;
let suppressYgBlessingAlert = false;

const EVENT_LUCK_TOGGLE_IDS = Object.freeze([
    'xyz-luck-toggle',
    'sorry-luck-toggle',
    'xc-luck-toggle',
    'axis-luck-toggle',
    'dorcelessness-luck-toggle'
]);

const EXCLUSIVE_EVENT_TOGGLE_IDS = Object.freeze([
    'xyz-luck-toggle',
    'xc-luck-toggle',
    'axis-luck-toggle',
    'dorcelessness-luck-toggle'
]);

const YG_BLESSING_BLOCKING_EVENT_IDS = Object.freeze([
    'xyz-luck-toggle',
    'sorry-luck-toggle',
    'xc-luck-toggle',
    'axis-luck-toggle'
]);

const YG_BLESSING_EVENT_BLOCK_MESSAGE = "YG blessing has not been obtainable while these events have been occurring in Sol's RNG (yet).";
let eventToggleSyncInProgress = false;

function isAnyToggleActive(toggleIds) {
    if (!Array.isArray(toggleIds)) {
        return false;
    }
    return toggleIds.some(id => {
        const toggle = document.getElementById(id);
        return Boolean(toggle && toggle.checked);
    });
}

function setToggleChecked(toggle, checked, { dispatchChange } = {}) {
    if (!toggle || toggle.checked === checked) {
        return;
    }
    toggle.checked = checked;
    if (dispatchChange) {
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function disableYgBlessing({ silent = false } = {}) {
    const ygToggle = document.getElementById('yg-blessing-toggle');
    if (!ygToggle || !ygToggle.checked) {
        return;
    }
    if (silent) {
        suppressYgBlessingAlert = true;
    }
    setToggleChecked(ygToggle, false, { dispatchChange: true });
    if (silent) {
        suppressYgBlessingAlert = false;
    }
}

function enforceExclusiveEventToggles(activeToggle) {
    if (eventToggleSyncInProgress || !activeToggle || !activeToggle.checked) {
        return;
    }
    if (!EXCLUSIVE_EVENT_TOGGLE_IDS.includes(activeToggle.id)) {
        return;
    }
    eventToggleSyncInProgress = true;
    EXCLUSIVE_EVENT_TOGGLE_IDS.forEach(id => {
        if (id === activeToggle.id) {
            return;
        }
        const toggle = document.getElementById(id);
        if (toggle && toggle.checked) {
            setToggleChecked(toggle, false, { dispatchChange: true });
        }
    });
    eventToggleSyncInProgress = false;
}

const MILLION_LUCK_PRESET = 1000000;

const LUCK_SELECTION_SOURCE = Object.freeze({
    CUSTOM: 'custom',
    STANDARD_PRESET: 'standard-preset',
    DEVICE_PRESET: 'device-preset',
    MANUAL: 'manual'
});

let currentLuckSelectionSource = LUCK_SELECTION_SOURCE.CUSTOM;

function setLuckSelectionSource(source) {
    if (typeof source !== 'string') {
        return;
    }

    const allowedSources = Object.values(LUCK_SELECTION_SOURCE);
    if (allowedSources.includes(source)) {
        currentLuckSelectionSource = source;
    }
}

function getLuckSelectionSource() {
    return currentLuckSelectionSource || LUCK_SELECTION_SOURCE.CUSTOM;
}

function syncLuckVisualEffects(luckValue) {
    if (!pageBody) {
        return;
    }

    pageBody.classList.remove('luck-effect--million');
}

function resetLuckPresetAnimations() {
    const animationClasses = ['luck-preset-button--pop', 'luck-preset-button--mega-pop'];
    const targets = [
        document.getElementById('luck-preset-one-million'),
        document.getElementById('luck-preset-ten-million')
    ];

    targets.forEach(button => {
        if (!button) {
            return;
        }
        animationClasses.forEach(className => button.classList.remove(className));
    });
}

function applyLuckValue(value, options = {}) {
    const normalizedOptions = { ...options };

    if (normalizedOptions.luckSource) {
        setLuckSelectionSource(normalizedOptions.luckSource);
    }

    if (normalizedOptions.luckSource === LUCK_SELECTION_SOURCE.STANDARD_PRESET) {
        if (!('activateOblivionPreset' in normalizedOptions)) {
            normalizedOptions.activateOblivionPreset = false;
        }
        if (!('activateDunePreset' in normalizedOptions)) {
            normalizedOptions.activateDunePreset = false;
        }
    }

    if (normalizedOptions.activateOblivionPreset === true) {
        normalizedOptions.activateDunePreset = false;
    }
    if (normalizedOptions.activateDunePreset === true) {
        normalizedOptions.activateOblivionPreset = false;
    }
    const luckInput = document.getElementById('luck-total');
    const targetLuck = Math.max(0, value);

    baseLuck = targetLuck;
    currentLuck = targetLuck;
    lastVipMultiplier = 1;
    lastXyzMultiplier = 1;
    lastSorryMultiplier = 1;
    lastXcMultiplier = 1;
    lastAxisMultiplier = 1;
    lastDaveMultiplier = 1;
    lastDorcelessnessMultiplier = 1;
    document.getElementById('vip-dropdown').value = '1';
    document.getElementById('xyz-luck-toggle').checked = false;
    document.getElementById('sorry-luck-toggle').checked = false;
    document.getElementById('xc-luck-toggle').checked = false;
    document.getElementById('axis-luck-toggle').checked = false;
    document.getElementById('dorcelessness-luck-toggle').checked = false;
    document.getElementById('yg-blessing-toggle').checked = false;
    refreshCustomSelect('vip-dropdown');
    if (document.getElementById('dave-luck-dropdown')) {
        document.getElementById('dave-luck-dropdown').value = '1';
        refreshCustomSelect('dave-luck-dropdown');
    }

    if (luckInput) {
        setNumericInputValue(luckInput, targetLuck, { format: true, min: 0 });
    }

    syncLuckVisualEffects(targetLuck);

    if (typeof applyOblivionPresetOptions === 'function') {
        applyOblivionPresetOptions(normalizedOptions);
    }
    if (typeof applyDunePresetOptions === 'function') {
        applyDunePresetOptions(normalizedOptions);
    }
}

function getActiveLuckMultipliers() {
    const controls = {
        biome: document.getElementById('biome-dropdown'),
        vip: document.getElementById('vip-dropdown'),
        xyz: document.getElementById('xyz-luck-toggle'),
        sorry: document.getElementById('sorry-luck-toggle'),
        xc: document.getElementById('xc-luck-toggle'),
        axis: document.getElementById('axis-luck-toggle'),
        dorcelessness: document.getElementById('dorcelessness-luck-toggle'),
        dave: document.getElementById('dave-luck-dropdown')
    };

    const biomeValue = controls.biome ? controls.biome.value : 'normal';
    const isLimboBiome = biomeValue === 'limbo';

    return {
        vip: parseFloat(controls.vip ? controls.vip.value : '1') || 1,
        xyz: controls.xyz && controls.xyz.checked ? 2 : 1,
        sorry: controls.sorry && controls.sorry.checked ? 1.2 : 1,
        xc: controls.xc && controls.xc.checked ? 2 : 1,
        axis: controls.axis && controls.axis.checked ? 2 : 1,
        dorcelessness: controls.dorcelessness && controls.dorcelessness.checked ? 2 : 1,
        dave: isLimboBiome && controls.dave ? parseFloat(controls.dave.value) || 1 : 1
    };
}

function applyLuckDelta(presetValue, options = {}) {
    const numericPresetValue = Number(presetValue);
    if (!Number.isFinite(numericPresetValue) || numericPresetValue === 0) {
        return;
    }

    const normalizedOptions = { ...options };
    if (normalizedOptions.luckSource) {
        setLuckSelectionSource(normalizedOptions.luckSource);
    }

    const luckInput = document.getElementById('luck-total');
    const existingLuck = luckInput ? getNumericInputValue(luckInput, { min: 0 }) : currentLuck;
    const startingLuck = Number.isFinite(existingLuck) ? existingLuck : currentLuck;
    const targetLuck = Math.max(0, startingLuck + numericPresetValue);

    const multipliers = getActiveLuckMultipliers();
    const multiplierTotal = multipliers.vip * multipliers.xyz * multipliers.sorry * multipliers.xc * multipliers.axis * multipliers.dorcelessness * multipliers.dave;
    baseLuck = multiplierTotal > 0 ? targetLuck / multiplierTotal : targetLuck;
    currentLuck = targetLuck;
    lastVipMultiplier = multipliers.vip;
    lastXyzMultiplier = multipliers.xyz;
    lastSorryMultiplier = multipliers.sorry;
    lastXcMultiplier = multipliers.xc;
    lastAxisMultiplier = multipliers.axis;
    lastDaveMultiplier = multipliers.dave;
    lastDorcelessnessMultiplier = multipliers.dorcelessness;

    if (luckInput) {
        setNumericInputValue(luckInput, targetLuck, { format: true, min: 0 });
    }

    syncLuckVisualEffects(targetLuck);

    if (typeof applyOblivionPresetOptions === 'function') {
        applyOblivionPresetOptions(normalizedOptions);
    }
    if (typeof applyDunePresetOptions === 'function') {
        applyDunePresetOptions(normalizedOptions);
    }
}

function buildLuckAdjustmentOptions(button, action, fallbackSource) {
    const options = {};
    if (fallbackSource) {
        options.luckSource = fallbackSource;
    }

    if (button && button.id === 'luck-preset-oblivion') {
        if (action === 'add') {
            options.activateOblivionPreset = true;
            options.activateDunePreset = false;
        } else if (action === 'subtract') {
            options.activateOblivionPreset = false;
        }
    }

    if (button && button.id === 'luck-preset-dune') {
        if (action === 'add') {
            options.activateDunePreset = true;
            options.activateOblivionPreset = false;
        } else if (action === 'subtract') {
            options.activateDunePreset = false;
        }
    }

    return options;
}

function createLuckPresetAdjustmentButtons(button, presetValue, fallbackSource) {
    const wrapper = document.createElement('div');
    wrapper.className = 'preset-button__actions';
    const formattedValue = Number(presetValue).toLocaleString('en-US');

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'preset-button__action preset-button__action--add';
    addButton.textContent = '+';
    addButton.setAttribute('aria-label', `Add ${formattedValue} luck`);
    addButton.addEventListener('click', event => {
        event.stopPropagation();
        applyLuckDelta(presetValue, buildLuckAdjustmentOptions(button, 'add', fallbackSource));
    });

    const subtractButton = document.createElement('button');
    subtractButton.type = 'button';
    subtractButton.className = 'preset-button__action preset-button__action--subtract';
    subtractButton.textContent = '-';
    subtractButton.setAttribute('aria-label', `Remove ${formattedValue} luck`);
    subtractButton.addEventListener('click', event => {
        event.stopPropagation();
        applyLuckDelta(-presetValue, buildLuckAdjustmentOptions(button, 'subtract', fallbackSource));
    });

    wrapper.appendChild(addButton);
    wrapper.appendChild(subtractButton);

    return wrapper;
}

function setupLuckPresetAdjustmentButtons() {
    const panels = [
        { id: 'luck-preset-panel', source: LUCK_SELECTION_SOURCE.STANDARD_PRESET },
        { id: 'device-buff-preset-panel', source: LUCK_SELECTION_SOURCE.DEVICE_PRESET }
    ];

    panels.forEach(({ id, source }) => {
        const panel = document.getElementById(id);
        if (!panel) {
            return;
        }

        const presetButtons = panel.querySelectorAll('button[data-luck-value]');
        presetButtons.forEach(button => {
            const presetValue = Number(button.dataset.luckValue);
            if (!Number.isFinite(presetValue) || button.closest('.preset-button')) {
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'preset-button';
            wrapper.style.display = button.style.display;
            if (button.dataset.limboOnly) {
                wrapper.dataset.limboOnly = button.dataset.limboOnly;
            }
            button.style.display = '';

            const parent = button.parentNode;
            if (!parent) {
                return;
            }

            parent.insertBefore(wrapper, button);
            wrapper.appendChild(button);

            const adjustments = createLuckPresetAdjustmentButtons(button, presetValue, source);
            wrapper.appendChild(adjustments);
        });
    });
}

function applyRollPreset(value) {
    const rollField = document.getElementById('roll-total');
    if (!rollField) {
        return;
    }

    setNumericInputValue(rollField, value, { format: true, min: 1, max: 1000000000000 });
    playSoundEffect(clickSoundEffectElement, 'ui');
}

// Applies a high-level device/buff preset by translating a multiplier into
// a concrete luck total while leaving seasonal toggles unchanged.
function applyDeviceBuffPreset(multiplier) {
    const numericMultiplier = Number(multiplier);
    if (!Number.isFinite(numericMultiplier) || numericMultiplier <= 0) {
        return;
    }

    const targetLuck = Math.max(1, numericMultiplier);
    applyLuckValue(targetLuck, { luckSource: LUCK_SELECTION_SOURCE.DEVICE_PRESET });
}

function recomputeLuckValue() {
    const controls = {
        biome: document.getElementById('biome-dropdown'),
        vip: document.getElementById('vip-dropdown'),
        xyz: document.getElementById('xyz-luck-toggle'),
        sorry: document.getElementById('sorry-luck-toggle'),
        xc: document.getElementById('xc-luck-toggle'),
        axis: document.getElementById('axis-luck-toggle'),
        dorcelessness: document.getElementById('dorcelessness-luck-toggle'),
        dave: document.getElementById('dave-luck-dropdown'),
        luckInput: document.getElementById('luck-total')
    };

    const biomeValue = controls.biome ? controls.biome.value : 'normal';
    const isLimboBiome = biomeValue === 'limbo';

    const multipliers = {
        vip: parseFloat(controls.vip ? controls.vip.value : '1') || 1,
        xyz: controls.xyz && controls.xyz.checked ? 2 : 1,
        sorry: controls.sorry && controls.sorry.checked ? 1.2 : 1,
        xc: controls.xc && controls.xc.checked ? 2 : 1,
        axis: controls.axis && controls.axis.checked ? 2 : 1,
        dorcelessness: controls.dorcelessness && controls.dorcelessness.checked ? 2 : 1,
        dave: isLimboBiome && controls.dave ? parseFloat(controls.dave.value) || 1 : 1
    };

    const luckField = controls.luckInput;
    const rawLuckValue = luckField ? (luckField.dataset.rawValue ?? '') : '';
    const enteredLuck = rawLuckValue ? Number.parseFloat(rawLuckValue) : NaN;
    if (luckField && rawLuckValue && Number.isFinite(enteredLuck) && enteredLuck !== currentLuck) {
        const normalizedLuck = Math.max(0, enteredLuck);
        baseLuck = normalizedLuck;
        currentLuck = normalizedLuck;
        setLuckSelectionSource(LUCK_SELECTION_SOURCE.MANUAL);
        lastVipMultiplier = 1;
        lastXyzMultiplier = 1;
        lastSorryMultiplier = 1;
        lastXcMultiplier = 1;
        lastAxisMultiplier = 1;
        lastDaveMultiplier = 1;
        lastDorcelessnessMultiplier = 1;
        if (controls.vip) {
            controls.vip.value = '1';
            refreshCustomSelect('vip-dropdown');
        }
        if (controls.xyz) {
            controls.xyz.checked = false;
        }
        if (controls.sorry) {
            controls.sorry.checked = false;
        }
        if (controls.xc) {
            controls.xc.checked = false;
        }
        if (controls.axis) {
            controls.axis.checked = false;
        }
        if (controls.dorcelessness) {
            controls.dorcelessness.checked = false;
        }
        if (controls.dave) {
            controls.dave.value = '1';
            refreshCustomSelect('dave-luck-dropdown');
        }
        const shouldFormat = document.activeElement !== luckField;
        setNumericInputValue(luckField, baseLuck, { format: shouldFormat, min: 0 });
        syncLuckVisualEffects(baseLuck);
        if (typeof applyOblivionPresetOptions === 'function') {
            applyOblivionPresetOptions({ activateOblivionPreset: false });
        }
        if (typeof applyDunePresetOptions === 'function') {
            applyDunePresetOptions({ activateDunePreset: false });
        }
        return;
    }

    currentLuck = baseLuck * multipliers.vip * multipliers.xyz * multipliers.sorry * multipliers.xc * multipliers.axis * multipliers.dorcelessness * multipliers.dave;
    lastVipMultiplier = multipliers.vip;
    lastXyzMultiplier = multipliers.xyz;
    lastSorryMultiplier = multipliers.sorry;
    lastXcMultiplier = multipliers.xc;
    lastAxisMultiplier = multipliers.axis;
    lastDaveMultiplier = multipliers.dave;
    lastDorcelessnessMultiplier = multipliers.dorcelessness;
    if (luckField) {
        const shouldFormat = document.activeElement !== luckField;
        setNumericInputValue(luckField, currentLuck, { format: shouldFormat, min: 0 });
    }

    syncLuckVisualEffects(currentLuck);
}

function resetLuckFields() {
    const luckInput = document.getElementById('luck-total');
    if (luckInput) {
        const shouldFormat = document.activeElement !== luckInput;
        setNumericInputValue(luckInput, 1, { format: shouldFormat, min: 0 });
    }
    playSoundEffect(clickSoundEffectElement, 'ui');
    recomputeLuckValue();
    if (typeof applyOblivionPresetOptions === 'function') {
        applyOblivionPresetOptions({ activateOblivionPreset: false });
    }
    if (typeof applyDunePresetOptions === 'function') {
        applyDunePresetOptions({ activateDunePreset: false });
    }
}

function resetRollCount() {
    const rollField = document.getElementById('roll-total');
    if (rollField) {
        const shouldFormat = document.activeElement !== rollField;
        setNumericInputValue(rollField, 1, { format: shouldFormat, min: 1, max: 1000000000000 });
    }
    playSoundEffect(clickSoundEffectElement, 'ui');
}

function setGlitchPreset() {
    setPrimaryBiomeSelection('glitch');
    setOtherBiomeSelection('none');
    setTimeBiomeSelection('none');
    playSoundEffect(clickSoundEffectElement, 'ui');
    updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
}

function setDreamspacePreset() {
    setPrimaryBiomeSelection('dreamspace');
    setOtherBiomeSelection('none');
    setTimeBiomeSelection('none');
    playSoundEffect(clickSoundEffectElement, 'ui');
    updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
}

function setLimboPreset() {
    setPrimaryBiomeSelection('limbo');
    setOtherBiomeSelection('none');
    setTimeBiomeSelection('none');
    playSoundEffect(clickSoundEffectElement, 'ui');
    updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
}

function setRoePreset() {
    setOtherBiomeSelection('roe');
    setPrimaryBiomeSelection('normal');
    setTimeBiomeSelection('none');
    playSoundEffect(clickSoundEffectElement, 'ui');
    updateBiomeControlConstraints({ source: BIOME_OTHER_SELECT_ID });
}

function setCyberspacePreset() {
    setPrimaryBiomeSelection('cyberspace');
    setOtherBiomeSelection('none');
    setTimeBiomeSelection('none');
    playSoundEffect(clickSoundEffectElement, 'ui');
    updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID });
}

function resetBiomeChoice() {
    setPrimaryBiomeSelection('normal');
    setOtherBiomeSelection('none');
    setTimeBiomeSelection('none');
    playSoundEffect(clickSoundEffectElement, 'ui');
    updateBiomeControlConstraints({ source: null });
}

function initializeBiomeInterface() {
    const selectionState = collectBiomeSelectionState();
    const biome = selectionState.canonicalBiome;
    const daveLuckContainer = document.getElementById('dave-luck-wrapper');
    const xyzLuckContainer = document.getElementById('xyz-luck-wrapper');
    const sorryLuckContainer = document.getElementById('sorry-luck-wrapper');
    const xcLuckContainer = document.getElementById('xc-luck-wrapper');
    const axisLuckContainer = document.getElementById('axis-luck-wrapper');
    const dorcelessnessLuckContainer = document.getElementById('dorcelessness-luck-wrapper');
    const ygBlessingContainer = document.getElementById('yg-blessing-wrapper');
    const luckPresets = document.getElementById('luck-preset-panel');
    if (biome === 'limbo') {
        if (daveLuckContainer) daveLuckContainer.style.display = '';
        if (xyzLuckContainer) xyzLuckContainer.style.display = '';
        if (sorryLuckContainer) sorryLuckContainer.style.display = '';
        if (xcLuckContainer) xcLuckContainer.style.display = '';
        if (axisLuckContainer) axisLuckContainer.style.display = '';
        if (dorcelessnessLuckContainer) dorcelessnessLuckContainer.style.display = '';
        if (ygBlessingContainer) ygBlessingContainer.style.display = '';
    } else {
        if (daveLuckContainer) daveLuckContainer.style.display = 'none';
        if (xyzLuckContainer) xyzLuckContainer.style.display = '';
        if (sorryLuckContainer) sorryLuckContainer.style.display = '';
        if (xcLuckContainer) xcLuckContainer.style.display = '';
        if (axisLuckContainer) axisLuckContainer.style.display = '';
        if (dorcelessnessLuckContainer) dorcelessnessLuckContainer.style.display = '';
        if (ygBlessingContainer) ygBlessingContainer.style.display = '';
    }

    if (luckPresets) {
        const isLimbo = biome === 'limbo'
            || selectionState.activeBiomes.includes('limbo')
            || selectionState.breakthroughBiomes.includes('limbo');
        Array.from(luckPresets.children).forEach(element => {
            const requiresLimbo = element.dataset.limboOnly === 'true';
            const shouldShow = requiresLimbo ? isLimbo : !isLimbo;

            element.style.display = shouldShow ? '' : 'none';
        });
    }
    applyBiomeTheme(biome, selectionState);
    updateGlitchPresentation();
    recomputeLuckValue();
    refreshCustomSelect('biome-dropdown');
    updateBiomeControlConstraints();
}

const FIRST_PERSON_CUTSCENES = new Set(['illusionary-cutscene']);

function playAuraVideo(videoId, options = {}) {
    const manageAmbient = options.manageAmbient !== false;
    return new Promise(resolve => {
        if (!appState.cinematic) {
            resolve();
            return;
        }

        let overlay = document.getElementById('cinematic-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'cinematic-overlay';
            overlay.className = 'cinematic-overlay';
            document.body.appendChild(overlay);
        }

        let skipButton = document.getElementById('skip-cinematic-button');
        if (!skipButton) {
            skipButton = document.createElement('div');
            skipButton.id = 'skip-cinematic-button';
            skipButton.className = 'skip-cinematic-button';
            skipButton.textContent = 'Skip cutscene';
            document.body.appendChild(skipButton);
        }

        const video = document.getElementById(videoId);
        if (!video) {
            resolve();
            return;
        }

        if (appState.audio.roll) {
            applyMediaGain(video, { category: 'cutscene' });
        }

        appState.videoPlaying = true;
        const bgMusic = manageAmbient ? document.getElementById('ambientMusic') : null;
        const wasPlaying = !!(bgMusic && !bgMusic.paused);
        if (bgMusic && wasPlaying) {
            bgMusic.pause();
        }

        const isFirstPerson = FIRST_PERSON_CUTSCENES.has(videoId);
        overlay.classList.toggle('cinematic-overlay--first-person', isFirstPerson);
        if (document.body) {
            document.body.classList.toggle('first-person-cutscene-active', isFirstPerson);
        }

        overlay.style.display = 'flex';
        video.style.display = 'block';
        skipButton.style.display = 'block';
        if (!appState.scrollLock && document.body) {
            const body = document.body;
            const previousOverflow = body.style.overflow;
            const previousPadding = body.style.paddingRight;
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            body.style.overflow = 'hidden';
            if (scrollbarWidth > 0) {
                body.style.paddingRight = `${scrollbarWidth}px`;
            }
            appState.scrollLock = {
                overflow: previousOverflow,
                paddingRight: previousPadding
            };
        }
        video.currentTime = 0;
        video.muted = !appState.audio.roll;

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            appState.videoPlaying = false;
            video.pause();
            video.currentTime = 0;
            video.style.display = 'none';
            overlay.style.display = 'none';
            overlay.classList.remove('cinematic-overlay--first-person');
            if (document.body) {
                document.body.classList.remove('first-person-cutscene-active');
            }
            skipButton.style.display = 'none';
            if (appState.scrollLock && document.body) {
                const body = document.body;
                body.style.overflow = appState.scrollLock.overflow;
                body.style.paddingRight = appState.scrollLock.paddingRight;
                appState.scrollLock = null;
            }
            if (bgMusic && wasPlaying && appState.audio.roll) {
                bgMusic.play().catch(() => {});
            }
            video.onended = null;
            video.onerror = null;
            skipButton.onclick = null;
            resolve();
        };

        skipButton.onclick = () => {
            cleanup();
        };

        video.onended = () => {
            cleanup();
        };

        video.onerror = () => {
            cleanup();
        };

        video.load();
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => cleanup());
        }
    });
}

function getFullscreenElement() {
    if (typeof document === 'undefined') return null;
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.mozFullScreenElement
        || document.msFullscreenElement
        || null;
}

async function requestFullscreen(element) {
    if (!element) return false;
    const method = element.requestFullscreen
        || element.webkitRequestFullscreen
        || element.mozRequestFullScreen
        || element.msRequestFullscreen;
    if (!method) return false;
    try {
        const result = method.call(element);
        if (result && typeof result.then === 'function') {
            await result;
        }
        return true;
    } catch (error) {
        return false;
    }
}

async function exitFullscreen() {
    if (typeof document === 'undefined') return false;
    if (!getFullscreenElement()) return false;
    const method = document.exitFullscreen
        || document.webkitExitFullscreen
        || document.mozCancelFullScreen
        || document.msExitFullscreen;
    if (!method) return false;
    try {
        const result = method.call(document);
        if (result && typeof result.then === 'function') {
            await result;
        }
        return true;
    } catch (error) {
        return false;
    }
}

async function playAuraSequence(queue) {
    if (!Array.isArray(queue) || queue.length === 0) return;

    const documentElement = typeof document !== 'undefined' ? document.documentElement : null;
    const wasFullscreen = !!getFullscreenElement();
    let enteredFullscreen = false;

    const ambientMusic = typeof document !== 'undefined' ? document.getElementById('ambientMusic') : null;
    const shouldResumeAmbient = !!(ambientMusic && !ambientMusic.paused);
    if (ambientMusic && shouldResumeAmbient) {
        ambientMusic.pause();
    }

    if (!wasFullscreen && documentElement && document.fullscreenEnabled !== false) {
        enteredFullscreen = await requestFullscreen(documentElement);
    }

    try {
        for (const videoId of queue) {
            if (!appState.cinematic) break;
            await playAuraVideo(videoId, { manageAmbient: false });
        }
    } finally {
        if (ambientMusic && shouldResumeAmbient && appState.audio.roll) {
            ambientMusic.play().catch(() => {});
        }
        if (!wasFullscreen && enteredFullscreen) {
            await exitFullscreen();
        }
    }
}

function resolveRarityClass(aura, biome) {
    if (!aura) return '';
    const auraName = aura.name || '';
    if (auraName.startsWith('Pixelation')) return 'rarity-tier-transcendent';
    if (auraName.startsWith('Illusionary')) return 'rarity-tier-challenged';
    if (auraName === 'Fault') return 'rarity-tier-challenged';
    if (['Oblivion', 'Memory', 'Neferkhaf'].some(name => auraName.startsWith(name))) {
        return 'rarity-tier-challenged';
    }
    if (aura.disableRarityClass) return '';
    const hasLimboNative = auraMatchesAnyBiome(aura, ['limbo', 'limbo-null']);
    if (hasLimboNative && biome === 'limbo') return 'rarity-tier-limbo';
    const cyberspaceNative = auraMatchesAnyBiome(aura, ['cyberspace']);
    const hasNativeBiomes = aura && aura.nativeBiomes;
    if (
        hasNativeBiomes
        && !aura.nativeBiomes.has('limbo-null')
        && (!cyberspaceNative || biome === 'cyberspace')
    ) {
        return 'rarity-tier-challenged';
    }
    const chance = aura.chance;
    if (chance >= 999999999) return 'rarity-tier-transcendent';
    if (chance >= 99999999) return 'rarity-tier-glorious';
    if (chance >= 9999999) return 'rarity-tier-exalted';
    if (chance >= 999999) return 'rarity-tier-mythic';
    if (chance >= 99999) return 'rarity-tier-legendary';
    if (chance >= 9999) return 'rarity-tier-unique';
    if (chance >= 999) return 'rarity-tier-epic';
    return 'rarity-tier-basic';
}

function resolveBaseRarityClass(aura) {
    if (!aura) return '';
    const auraName = aura.name || '';
    if (auraName.startsWith('Pixelation')) return 'rarity-tier-transcendent';
    if (auraName.startsWith('Illusionary')) return 'rarity-tier-challenged';
    if (auraName === 'Fault') return 'rarity-tier-challenged';
    if (['Oblivion', 'Memory', 'Neferkhaf'].some(name => auraName.startsWith(name))) {
        return 'rarity-tier-challenged';
    }
    if (aura.disableRarityClass) return '';
    const chance = aura.chance;
    if (chance >= 999999999) return 'rarity-tier-transcendent';
    if (chance >= 99999999) return 'rarity-tier-glorious';
    if (chance >= 9999999) return 'rarity-tier-exalted';
    if (chance >= 999999) return 'rarity-tier-mythic';
    if (chance >= 99999) return 'rarity-tier-legendary';
    if (chance >= 9999) return 'rarity-tier-unique';
    if (chance >= 999) return 'rarity-tier-epic';
    return 'rarity-tier-basic';
}

function shouldUseNativeOverrideTier(aura, biome) {
    if (!aura || aura.disableRarityClass || aura.disableNativeOverrideTier) return false;
    const hasLimboNative = auraMatchesAnyBiome(aura, ['limbo', 'limbo-null']);
    if (hasLimboNative && biome === 'limbo') return false;
    const cyberspaceNative = auraMatchesAnyBiome(aura, ['cyberspace']);
    const hasNativeBiomes = aura && aura.nativeBiomes;
    return Boolean(
        hasNativeBiomes
        && !aura.nativeBiomes.has('limbo-null')
        && (!cyberspaceNative || biome === 'cyberspace')
    );
}

const AURA_TIER_FILTERS = Object.freeze([
    { key: 'basic', label: 'Skip Basic Auras', className: 'rarity-tier-basic' },
    { key: 'epic', label: 'Skip Epic Auras', className: 'rarity-tier-epic' },
    { key: 'unique', label: 'Skip Unique Auras', className: 'rarity-tier-unique' },
    { key: 'legendary', label: 'Skip Legendary Auras', className: 'rarity-tier-legendary' },
    { key: 'mythic', label: 'Skip Mythic Auras', className: 'rarity-tier-mythic' },
    { key: 'exalted', label: 'Skip Exalted Auras', className: 'rarity-tier-exalted' },
    { key: 'glorious', label: 'Skip Glorious Auras', className: 'rarity-tier-glorious' },
    { key: 'transcendent', label: 'Skip Transcendent Auras', className: 'rarity-tier-transcendent' },
    { key: 'challenged', label: 'Skip Challenged Auras', className: 'rarity-tier-challenged' }
]);

const AURA_TIER_CLASS_TO_KEY = new Map(AURA_TIER_FILTERS.map(tier => [tier.className, tier.key]));
const AURA_TIER_SKIP_NAME_OVERRIDES = new Map([
    ['transcendent', ['Nyctophobia']],
    ['glorious', ['Unknown', 'Elude', 'Prologue', 'Dreamscape']],
    ['exalted', ['Juxtaposition']],
    ['mythic', ['Anima', 'Nihility', 'Undefined', 'Flowed', 'Shiftlock']],
    ['legendary', ['Raven']],
    ['basic', ['Nothing']]
]);

function formatAuraTierLabel(tier) {
    if (!tier) {
        return '';
    }
    const label = typeof tier.label === 'string' && tier.label.trim().length > 0
        ? tier.label
        : tier.key;
    return label
        .replace(/^Skip\s+/i, '')
        .replace(/\s*Auras?$/i, '')
        .trim();
}

function getIncludedAuraTierLabels() {
    if (!appState || !appState.auraTierFilters) {
        return [];
    }
    return AURA_TIER_FILTERS
        .filter(tier => !appState.auraTierFilters[tier.key])
        .map(formatAuraTierLabel)
        .filter(Boolean);
}

function getAuraFilterSummaryText() {
    const labels = getIncludedAuraTierLabels();
    return labels.length > 0 ? labels.join(', ') : 'None';
}

function initializeAuraFilters(registry) {
    if (!appState) {
        return;
    }
    if (!appState.auraFilters || typeof appState.auraFilters !== 'object') {
        appState.auraFilters = {};
    }
    if (!Array.isArray(registry)) {
        return;
    }
    registry.forEach(aura => {
        if (!aura || typeof aura.name !== 'string') {
            return;
        }
        if (typeof appState.auraFilters[aura.name] !== 'boolean') {
            appState.auraFilters[aura.name] = false;
        }
    });
}

function isAuraFiltered(aura) {
    if (!aura || !appState || !appState.auraFilters) {
        return false;
    }
    const auraName = aura.name || '';
    if (!auraName) {
        return false;
    }
    return Boolean(appState.auraFilters[auraName]);
}

function resolveAuraTierKey(aura, biome) {
    if (!aura) {
        return null;
    }
    const rarityClass = typeof resolveRarityClass === 'function'
        ? resolveRarityClass(aura, biome)
        : '';
    return AURA_TIER_CLASS_TO_KEY.get(rarityClass) || null;
}

function shouldSkipAuraByTierOverride(aura) {
    if (!aura || !appState || !appState.auraTierFilters) {
        return false;
    }
    const auraName = (aura.name || '').trim();
    if (!auraName) {
        return false;
    }
    const auraNameLower = auraName.toLowerCase();
    for (const [tierKey, auraPrefixes] of AURA_TIER_SKIP_NAME_OVERRIDES) {
        if (!appState.auraTierFilters[tierKey]) {
            continue;
        }
        for (const prefix of auraPrefixes) {
            if (auraNameLower.startsWith(prefix.toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}

function isAuraTierSkipped(aura, biome) {
    if (shouldSkipAuraByTierOverride(aura)) {
        return true;
    }
    const tierKey = resolveAuraTierKey(aura, biome);
    if (!tierKey || !appState || !appState.auraTierFilters) {
        return false;
    }
    if (appState.auraTierFilters[tierKey]) {
        return true;
    }
    if (tierKey === 'challenged' && shouldUseNativeOverrideTier(aura, biome)) {
        const baseTierClass = resolveBaseRarityClass(aura);
        const baseTierKey = AURA_TIER_CLASS_TO_KEY.get(baseTierClass) || null;
        if (baseTierKey && appState.auraTierFilters[baseTierKey]) {
            return true;
        }
    }
    return false;
}

const CHALLENGED_CUTSCENE_AURAS = new Set(['Oblivion', 'Memory', 'Neferkhaf']);

function shouldSkipAuraCutscene(aura, biome) {
    if (isAuraTierSkipped(aura, biome) || isAuraFiltered(aura)) {
        return true;
    }
    if (!aura || !appState || !appState.auraTierFilters) {
        return false;
    }
    if (!appState.auraTierFilters.challenged) {
        return false;
    }
    const auraName = aura.name || '';
    for (const label of CHALLENGED_CUTSCENE_AURAS) {
        if (auraName.startsWith(label)) {
            return true;
        }
    }
    return false;
}

const nativeAuraOutlineOverrides = new Map([
    ['Lunar : Full Moon', 'sigil-outline-night'],
    ['Lunar', 'sigil-outline-night'],
    ['Solar : Solstice', 'sigil-outline-day'],
    ['Solar', 'sigil-outline-day'],
    ['Twilight : Withering Grace', 'sigil-outline-night'],
    ['Twilight : Iridescent Memory', 'sigil-outline-night'],
    ['Twilight', 'sigil-outline-night'],
    ['Lullaby', 'sigil-outline-night'],
    ['Archangel', 'sigil-outline-heaven'],
]);

const auraOutlineOverrides = new Map([
    ['Illusionary', 'sigil-outline-illusionary'],
    ['Prowler', 'sigil-outline-prowler'],
    ['Verdict', 'sigil-outline-edict'],
    ['Attorney', 'sigil-outline-edict'],
    ['Divinus : Love', 'sigil-outline-valentine-2024'],
    ['Flushed : Heart Eye', 'sigil-outline-valentine-2024'],
    ['Pukeko', 'sigil-outline-april'],
    ['Flushed : Troll', 'sigil-outline-april'],
    ['Undefined : Defined', 'sigil-outline-april'],
    ['Origin : Onion', 'sigil-outline-april'],
    ['Chromatic : Kromat1k', 'sigil-outline-april'],
    ['Glock : the glock of the sky', 'sigil-outline-april'],
    ["Impeached : I'm Peach", 'sigil-outline-april'],
    ['Star Rider : Starfish Rider', 'sigil-outline-summer'],
    ['Watermelon', 'sigil-outline-summer'],
    ['Surfer : Shard Surfer', 'sigil-outline-summer'],
    ['Manta', 'sigil-outline-summer'],
    ['Aegis : Watergun', 'sigil-outline-summer'],
    ['Innovator', 'sigil-outline-innovator'],
    ['Wonderland', 'sigil-outline-winter'],
    ['Santa Frost', 'sigil-outline-winter'],
    ['Winter Fantasy', 'sigil-outline-winter'],
    ['Express', 'sigil-outline-winter'],
    ['Abominable', 'sigil-outline-winter'],
    ['Atlas : Yuletide', 'sigil-outline-winter'],
    ['Pump : Trickster', 'sigil-outline-blood'],
    ['Headless', 'sigil-outline-blood'],
    ['Oni', 'sigil-outline-blood'],
    ['Headless : Horseman', 'sigil-outline-blood'],
    ['Sinister', 'sigil-outline-blood'],
    ['Accursed', 'sigil-outline-blood'],
    ['Phantasma', 'sigil-outline-blood'],
    ['Apocalypse', 'sigil-outline-blood'],
    ['Malediction', 'sigil-outline-blood'],
    ['Banshee', 'sigil-outline-blood'],
    ['Ravage', 'sigil-outline-blood'],
    ['Arachnophobia', 'sigil-outline-blood'],
    ['Lamenthyr', 'sigil-outline-blood'],
    ['Erebus', 'sigil-outline-blood'],
    ['Wraithlight', 'sigil-outline-blood'],
    ['Grief', 'sigil-outline-blood'],
    ['Graveborn', 'sigil-outline-blood'],
    ['Crimson', 'sigil-outline-blood'],
    ['Shucks', 'sigil-outline-blood'],
    ['Afterparty', 'sigil-outline-blood'],
    ['Reaper', 'sigil-outline-blood'],
    ['Celestial : Wicked', 'sigil-outline-blood'],
    ['Lunar : Cultist', 'sigil-outline-blood'],
    ['Werewolf', 'sigil-outline-blood'],
    ['Bloodgarden', 'sigil-outline-blood'],
    ['Cryogenic', 'sigil-outline-cryogenic'],
    ['Leviathan', 'sigil-outline-leviathan'],
    ['Monarch', 'sigil-outline-monarch'],
    ['Winter Garden', 'sigil-outline-winter-garden'],
    ['Dream Traveler', 'sigil-outline-dream-traveler'],
    ['Sovereign : Frostveil', 'sigil-outline-frostveil'],
    ['Erebus', 'sigil-outline-erebus'],
    ['Lamenthyr', 'sigil-outline-lamenthyr'],
    ['Symphony : Bloomed', 'sigil-outline-valentine-2026'],
]);

const glitchOutlineNames = new Set(['Fault', 'Glitch', 'Oppression']);
const dreamspaceOutlineNames = new Set(['Dreammetric', 'Borealis', '★★★', '★★', '★']);
const cyberspaceOutlineExclusions = new Set(['Pixelation', 'Illusionary']);

function resolveAuraStyleClass(aura, biome) {
    if (!aura) return '';

    const name = typeof aura === 'string' ? aura : aura.name;
    if (!name) return '';

    const classes = [];
    if (name.startsWith('Oblivion')) classes.push('sigil-effect-oblivion');
    if (name.startsWith('Memory')) classes.push('sigil-effect-memory');
    if (name.startsWith('Neferkhaf')) classes.push('sigil-effect-neferkhaf');
    if (name.startsWith('Pixelation')) classes.push('sigil-effect-pixelation');
    if (name.startsWith('Luminosity')) classes.push('sigil-effect-luminosity');
    if (name.startsWith('Equinox')) classes.push('sigil-effect-equinox');
    if (name.startsWith('Megaphone')) classes.push('sigil-effect-megaphone');
    if (name.startsWith('Nyctophobia')) classes.push('sigil-effect-nyctophobia');
    if (name.startsWith('Clockwork')) classes.push('sigil-effect-clockwork');
    if (name.startsWith('Breakthrough')) classes.push('sigil-effect-breakthrough', 'sigil-border-breakthrough');
    if (name.startsWith('Glitch')) classes.push('sigil-effect-glitch');

    const auraData = typeof aura === 'string' ? null : aura;
    const auraEventId = auraData ? getAuraEventId(auraData) : null;

    const shortName = name.includes(' - ') ? name.split(' - ')[0].trim() : name.trim();

    if (auraEventId === 'winter26') {
        const shortNameCheck = name.includes(' - ') ? name.split(' - ')[0].trim() : name.trim();
        if (shortNameCheck !== 'Winter Garden' && shortNameCheck !== 'Dream Traveler' && shortNameCheck !== 'Sovereign : Frostveil') {
            classes.push('sigil-outline-winter-2026');
        }
    }

    if (auraMatchesAnyBiome(auraData, ['pumpkinMoon', 'graveyard']) && shortName !== 'Erebus' && shortName !== 'Lamenthyr') {
        classes.push('sigil-outline-halloween');
    }
    if (glitchOutlineNames.has(shortName)) {
        classes.push('sigil-outline-glitch');
    }

    if (dreamspaceOutlineNames.has(shortName)) {
        classes.push('sigil-outline-dreamspace');
    }

    const isCyberspaceAligned = auraData
        && biome === 'cyberspace'
        && (
            isAuraNativeTo(auraData, 'cyberspace')
            || (auraData.breakthroughs && auraData.breakthroughs.has('cyberspace'))
        );

    const isNativeRoll = auraData && biome ? isAuraNativeTo(auraData, biome) : false;
    if (isNativeRoll) {
        const nativeOverride = nativeAuraOutlineOverrides.get(shortName);
        if (nativeOverride) {
            classes.push(nativeOverride);
        }
    }

    if (isCyberspaceAligned && !cyberspaceOutlineExclusions.has(shortName)) {
        classes.push('sigil-outline-cyberspace');
    }

    const overrideClass = auraOutlineOverrides.get(shortName);
    if (overrideClass) {
        classes.push(overrideClass);
    }

    return classes.join(' ');
}

function shouldSuppressRarityClassForSpecialStyle(specialClass = '') {
    if (!specialClass) {
        return false;
    }
    return specialClass.includes('sigil-outline-edict') || specialClass.includes('sigil-effect-clockwork');
}

const OBLIVION_PRESET_IDENTIFIER = 'oblivion';
const OBLIVION_LUCK_TARGET = 600000;
const OBLIVION_AURA_LABEL = 'Oblivion';
const MEMORY_AURA_LABEL = 'Memory';
const OBLIVION_POTION_ODDS = 2000;
const OBLIVION_MEMORY_ODDS = 100;

const DUNE_PRESET_IDENTIFIER = 'dune';
const DUNE_LUCK_TARGET = 10000;
const DUNE_AURA_LABEL = 'Neferkhaf';
const DUNE_POTION_ODDS = 1000;

let oblivionPresetEnabled = false;
let oblivionAuraData = null;
let memoryAuraData = null;

let dunePresetEnabled = false;
let duneAuraData = null;

function handleOblivionPresetSelection(presetKey) {
    if (presetKey !== OBLIVION_PRESET_IDENTIFIER) {
        return;
    }

    applyLuckValue(OBLIVION_LUCK_TARGET, {
        luckSource: LUCK_SELECTION_SOURCE.STANDARD_PRESET,
        activateOblivionPreset: true,
        activateDunePreset: false
    });
}

function handleDunePresetSelection(presetKey) {
    if (presetKey !== DUNE_PRESET_IDENTIFIER) {
        return;
    }

    applyLuckValue(DUNE_LUCK_TARGET, {
        luckSource: LUCK_SELECTION_SOURCE.STANDARD_PRESET,
        activateDunePreset: true,
        activateOblivionPreset: false
    });
}

function syncLuckPotionButtonState(buttonId, isActive) {
    if (typeof document === 'undefined') {
        return;
    }

    const button = document.getElementById(buttonId);
    if (!button) {
        return;
    }

    button.classList.toggle('luck-preset-button--active', Boolean(isActive));
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
}

function syncLuckPotionPresetAvailability(isLimboSelected) {
    if (typeof document === 'undefined') {
        return;
    }

    const potionPresetButtons = ['luck-preset-oblivion', 'luck-preset-dune'];
    potionPresetButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (!button) {
            return;
        }

        button.disabled = isLimboSelected;
        if (isLimboSelected) {
            button.title = 'Unavailable while Limbo is selected.';
        } else {
            button.removeAttribute('title');
        }

        const actionButtons = button.closest('.preset-button')?.querySelectorAll('.preset-button__action');
        actionButtons?.forEach(actionButton => {
            actionButton.disabled = isLimboSelected;
            if (isLimboSelected) {
                actionButton.title = 'Unavailable while Limbo is selected.';
            } else {
                actionButton.removeAttribute('title');
            }
        });
    });
}

function applyOblivionPresetOptions(options = {}) {
    if ('activateOblivionPreset' in options) {
        oblivionPresetEnabled = options.activateOblivionPreset === true;
        syncLuckPotionButtonState('luck-preset-oblivion', oblivionPresetEnabled);
        if (typeof updateBiomeControlConstraints === 'function') {
            updateBiomeControlConstraints({ triggerSync: true });
        }
    }
}

function applyDunePresetOptions(options = {}) {
    if ('activateDunePreset' in options) {
        dunePresetEnabled = options.activateDunePreset === true;
        syncLuckPotionButtonState('luck-preset-dune', dunePresetEnabled);
    }
}

function formatAuraNameMarkup(aura, overrideName) {
    if (!aura) return overrideName || '';
    const baseName = typeof overrideName === 'string' && overrideName.length > 0 ? overrideName : aura.name;
    if (baseName.startsWith('Breakthrough')) {
        const [namePart, ...restParts] = baseName.split(' - ');
        const suffix = restParts.length > 0 ? ` - ${restParts.join(' - ')}` : '';
        const breakthroughMarkup = `<span class="sigil-effect-breakthrough__title">${namePart.toUpperCase()}</span>` +
            (suffix ? `<span class="sigil-effect-breakthrough__suffix">${suffix}</span>` : '');
        if (aura.subtitle) {
            return `${breakthroughMarkup} <span class="sigil-subtitle">${aura.subtitle}</span>`;
        }
        return breakthroughMarkup;
    }
    if (baseName.startsWith('Lamenthyr')) {
        if (aura.subtitle) {
            return `${baseName} <span class="sigil-subtitle">${aura.subtitle}</span>`;
        }
        return baseName;
    }
    if (aura.subtitle) {
        return `${baseName} <span class="sigil-subtitle">${aura.subtitle}</span>`;
    }
    return baseName;
}

function formatAuraNameText(aura, overrideName) {
    if (!aura) return overrideName || '';
    const baseName = typeof overrideName === 'string' && overrideName.length > 0 ? overrideName : aura.name;
    if (aura.subtitle) {
        return `${baseName} — ${aura.subtitle}`;
    }
    return baseName;
}

const layeredTextSigilClasses = ['sigil-outline-lamenthyr', 'sigil-outline-edict', 'sigil-effect-clockwork'];

function syncLayeredSigilText(element) {
    if (!element) return;
    const text = element.textContent;
    if (typeof text !== 'string' || text.length === 0) return;
    if (element.dataset.text !== text) {
        element.dataset.text = text;
    }
}

function updateLayeredSigilText(container = document) {
    if (!container) return;
    layeredTextSigilClasses.forEach(className => {
        container.querySelectorAll(`.${className}`).forEach(syncLayeredSigilText);
    });
}

function observeLayeredSigilText() {
    updateLayeredSigilText();
    if (!document.body) return;
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    const element = node;
                    layeredTextSigilClasses.forEach(className => {
                        if (element.classList.contains(className)) {
                            syncLayeredSigilText(element);
                        }
                        if (typeof element.querySelectorAll === 'function') {
                            element.querySelectorAll(`.${className}`).forEach(syncLayeredSigilText);
                        }
                    });
                });
            } else if (mutation.type === 'characterData') {
                const parent = mutation.target.parentElement;
                if (parent && layeredTextSigilClasses.some(className => parent.classList.contains(className))) {
                    syncLayeredSigilText(parent);
                }
            }
        });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function determineResultPriority(aura, baseChance) {
    if (!aura) return baseChance;
    if (aura.name === OBLIVION_AURA_LABEL) return Number.POSITIVE_INFINITY;
    if (aura.name === MEMORY_AURA_LABEL) return Number.MAX_SAFE_INTEGER;
    if (aura.name === DUNE_AURA_LABEL) return Number.MAX_SAFE_INTEGER - 1;
    return baseChance;
}

const MEGAPHONE_AURA_NAME = 'Megaphone - 5,000';
const BREAKTHROUGH_AURA_NAME = 'Breakthrough - 1,999,999,999';
const LEVIATHAN_AURA_NAME = 'Leviathan - 1,730,400,000';
const MONARCH_AURA_NAME = "Monarch - 3,000,000,000";

const NATIVE_BREAKTHROUGH_MULTIPLIERS = Object.freeze({
    cyberspace: 2,
    blazing: 2,
    aurora: 2,
    windy: 3,
    snowy: 3,
    rainy: 4,
    sandstorm: 4,
    starfall: 5,
    heaven: 5,
    corruption: 5,
    hell: 6,
    oldStarfall: 10,
    night: 10,
    day: 10,
    null: 1000,
    limbo: 1000
});

function nativeBreakthroughs(...biomes) {
    return Object.fromEntries(
        biomes
            .map(biome => [biome, NATIVE_BREAKTHROUGH_MULTIPLIERS[biome]])
            .filter(([, multiplier]) => Number.isFinite(multiplier) && multiplier > 0)
    );
}

const AURA_BLUEPRINT_SOURCE = Object.freeze([
    { name: "Oblivion", chance: 2000, requiresOblivionPreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Truth Seeker", cutscene: "oblivion-cutscene", disableRarityClass: true },
    { name: "Memory", chance: 200000, requiresOblivionPreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Fallen", cutscene: "memory-cutscene", disableRarityClass: true },
    { name: "Neferkhaf", chance: 1000, requiresDunePreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Crawler", cutscene: "neferkhaf-cutscene", disableRarityClass: true },
    { name: "Illusionary - 10,000,000", chance: 10000000, nativeBiomes: ["cyberspace"], ignoreLuck: true, fixedRollThreshold: 1, cutscene: "illusionary-cutscene" },
    { name: "Equinox - 2,500,000,000", chance: 2500000000, cutscene: "equinox-cutscene" },
    { name: "Dream Traveler - 2,025,012,025", chance: 2025012025, breakthroughs: nativeBreakthroughs("aurora"), cutscene: "dream-traveler-cutscene" },
    { name: MONARCH_AURA_NAME, chance: 3000000000, cutscene: "monarch-cutscene", nativeBiomes: ["corruption", "glitch"], disableNativeOverrideTier: true },
    { name: BREAKTHROUGH_AURA_NAME, chance: 1999999999, cutscene: "breakthrough-cutscene" },
    { name: LEVIATHAN_AURA_NAME, chance: 1730400000, nativeBiomes: ["rainy", "glitch"], cutscene: "leviathan-cutscene", disableNativeOverrideTier: true },
    { name: "Winter Garden - 1,450,012,025", chance: 1450012025, breakthroughs: nativeBreakthroughs("aurora"), cutscene: "winter-garden-cutscene" },
    { name: "Luminosity - 1,200,000,000", chance: 1200000000, cutscene: "luminosity-cutscene" },
    { name: "Erebus - 1,200,000,000", chance: 1200000000, nativeBiomes: ["glitch", "bloodRain"], cutscene: "erebus-cutscene" },
    { name: "Pixelation - 1,073,741,824", chance: 1073741824, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"], cutscene: "pixelation-cutscene" },
    { name: "Nyctophobia - 1,011,111,010", chance: 1011111010, nativeBiomes: ["limbo"], cutscene: "nyctophobia-cutscene" },
    { name: "Lamenthyr - 1,000,000,000", chance: 1000000000, nativeBiomes: ["glitch", "bloodRain"], cutscene: "lamenthyr-cutscene" },
    { name: "Sovereign : Frostveil - 1,000,000,000", chance: 1000000000, breakthroughs: nativeBreakthroughs("aurora"), cutscene: "frostveil-cutscene" },
    { name: "Arachnophobia - 940,000,000", chance: 940000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Ascendant - 935,000,000", chance: 935000000, breakthroughs: nativeBreakthroughs("heaven"), cutscene: "ascendant-cutscene" },
    { name: "Ravage - 930,000,000", chance: 930000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Dreamscape - 850,000,000", chance: 850000000, nativeBiomes: ["limbo"] },
    { name: "Aegis - 825,000,000", chance: 825000000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Aegis : Watergun - 825,000,000", chance: 825000000, breakthroughs: nativeBreakthroughs("blazing") },
    { name: "Apostolos : Veil - 800,000,000", chance: 800000000, nativeBiomes: ["graveyard", "pumpkinMoon"] },
    { name: "Ruins : Withered - 800,000,000", chance: 800000000 },
    { name: "Virtual : Full Control - 80,000,000", chance: 80000000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Parol - 760,000,000", chance: 760000000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Sovereign - 750,000,000", chance: 750000000 },
    { name: "Malediction - 730,000,000", chance: 730000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Banshee - 730,000,000", chance: 730000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Workshop - 700,000,000", chance: 700000000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Wraithlight - 695,000,000", chance: 695000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Pythos - 666,666,666", chance: 666666666, breakthroughs: nativeBreakthroughs("hell") },
    { name: "PROLOGUE - 666,616,111", chance: 666616111, nativeBiomes: ["limbo"] },
    { name: "Harvester - 666,000,000", chance: 666000000, nativeBiomes: ["graveyard"] },
    { name: "Apocalypse - 624,000,000", chance: 624000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Matrix : Reality - 601,020,102", chance: 601020102, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Sophyra - 570,000,000", chance: 570000000 },
    { name: "Elude - 555,555,555", chance: 555555555, nativeBiomes: ["limbo"] },
    { name: "Atlas : Yuletide - 510,000,000", chance: 510000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Matrix : Overdrive - 503,000,000", chance: 503000000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Ruins - 500,000,000", chance: 500000000 },
    { name: "Phantasma - 462,600,000", chance: 462600000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Kyawthuite : Remembrance - 450,000,000", chance: 450000000 },
    { name: "unknown - 444,444,444", chance: 444444444, nativeBiomes: ["limbo"] },
    { name: "Apostolos - 444,000,000", chance: 444000000 },
    { name: "Afterparty - 440,000,000", chance: 440000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Gargantua - 430,000,000", chance: 430000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "EveNight - 424,000,000", chance: 424000000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Northern - 405,000,000", chance: 405000000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Abyssal Hunter - 400,000,000", chance: 400000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Impeached : I'm Peach - 400,000,000", chance: 400000000 },
    { name: "Cryofang - 380,000,000", chance: 380000000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "CHILLSEAR - 375,000,000", chance: 375000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Symphony : Bloomed - 375,000,000", chance: 375000000 },
    { name: "Flora : Evergreen - 370,073,730", chance: 370073730 },
    { name: "Atlas - 360,000,000", chance: 360000000, breakthroughs: nativeBreakthroughs("sandstorm") },
    { name: "Archangel - 350,000,000", chance: 350000000, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Jazz : Orchestra - 336,870,912", chance: 336870912 },
    { name: "Dreammetric - 320,000,000", chance: 320000000, nativeBiomes: ["dreamspace"], cutscene: "dreammetric-cutscene" },
    { name: "LOTUSFALL - 320,000,000", chance: 320000000 },
    { name: "Perpetual - 315,000,000", chance: 315000000 },
    { name: "Maelstrom - 309,999,999", chance: 309999999, breakthroughs: nativeBreakthroughs("windy") },
    { name: "Manta - 300,000,000", chance: 300000000, breakthroughs: nativeBreakthroughs("blazing") },
    { name: "Overture : History - 300,000,000", chance: 300000000 },
    { name: "Bloodlust - 300,000,000", chance: 300000000, breakthroughs: nativeBreakthroughs("hell") },
    { name: "Exotic : Void - 299,999,999", chance: 299999999 },
    { name: "Graveborn - 290,000,000", chance: 290000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Prophecy - 275,649,430", chance: 275649430, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Astral : Zodiac - 267,200,000", chance: 267200000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Encase - 230,000,000", chance: 230000000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Surfer : Shard Surfer - 225,000,000", chance: 225000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "HYPER-VOLT : EVER-STORM - 225,000,000", chance: 225000000 },
    { name: "Lumenpool - 220,000,000", chance: 220000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Oppression - 220,000,000", chance: 220000000, nativeBiomes: ["glitch"], cutscene: "oppression-cutscene" },
    { name: "Impeached - 200,000,000", chance: 200000000, breakthroughs: nativeBreakthroughs("corruption") },
    { name: "Nightmare Sky - 190,000,000", chance: 190000000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Felled - 180,000,000", chance: 180000000, breakthroughs: nativeBreakthroughs("hell") },
    { name: "Twilight : Withering Grace - 180,000,000", chance: 180000000, breakthroughs: nativeBreakthroughs("night") },
    { name: "Symphony - 175,000,000", chance: 175000000 },
    { name: "Glock : the glock of the sky - 170,000,000", chance: 170000000 },
    { name: "Overture - 150,000,000", chance: 150000000 },
    { name: "Crimson - 120,000,000", chance: 120000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Abominable - 120,000,000", chance: 120000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Spectraflow - 100,000,000", chance: 100000000 },
    { name: "Starscourge : Radiant - 100,000,000", chance: 100000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Chromatic : GENESIS - 99,999,999", chance: 99999999 },
    { name: "Atomic : Nucleus - 92,118,000", chance: 92118000 },
    { name: "Express - 90,000,000", chance: 90000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Grief - 88,250,000", chance: 88250000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Bloodgarden - 88,000,000", chance: 88000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Virtual : Worldwide - 87,500,000", chance: 87500000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Harnessed : Elements - 85,000,000", chance: 85000000 },
    { name: "Accursed - 82,000,000", chance: 82000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Carriage - 80,000,000", chance: 80000000 },
    { name: "Sailor : Flying Dutchman - 80,000,000", chance: 80000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Dullahan - 72,000,000", chance: 72000000, nativeBiomes: ["graveyard"] },
    { name: "Winter Fantasy - 72,000,000", chance: 72000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Dominion - 70,000,000", chance: 70000000, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Reaper - 66,000,000", chance: 66000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Antivirus - 62,500,000", chance: 62500000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Skyburst - 60,000,000", chance: 60000000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "SENTINEL - 60,000,000", chance: 60000000 },
    { name: "Twilight : Iridescent Memory - 60,000,000", chance: 60000000, breakthroughs: nativeBreakthroughs("night") },
    { name: "Matrix - 50,000,000", chance: 50000000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Runic - 50,000,000", chance: 50000000 },
    { name: "Exotic : APEX - 49,999,500", chance: 49999500 },
    { name: "Santa Frost - 45,000,000", chance: 45000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "North Pole - 45,000,000", chance: 45000000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Overseer - 45,000,000", chance: 45000000 },
    { name: "{J u x t a p o s i t i o n} - 40,440,400", chance: 40440400, nativeBiomes: ["limbo"] },
    { name: "Virtual : Fatal Error - 40,413,000", chance: 40413000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Soul Hunter - 40,000,000", chance: 40000000, nativeBiomes: ["graveyard"] },
    { name: "Chromatic : Kromat1k - 40,000,000", chance: 40000000 },
    { name: "Ethereal - 35,000,000", chance: 35000000 },
    { name: "Flora : Florest - 32,800,000", chance: 32800000 },
    { name: "Headless : Horseman - 32,000,000", chance: 32000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Innovator - 30,000,000", chance: 30000000 },
    { name: "Arcane : Dark - 30,000,000", chance: 30000000 },
    { name: "Blizzard - 27,315,000", chance: 27315000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Apotheosis - 24,649,430", chance: 24649430 },
    { name: "Frostwood - 24,500,000", chance: 24500000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Aviator - 24,000,000", chance: 24000000 },
    { name: "Cryptfire - 21,000,000", chance: 21000000, nativeBiomes: ["graveyard"] },
    { name: "Chromatic - 20,000,000", chance: 20000000 },
    { name: "Lullaby - 17,000,000", chance: 17000000, breakthroughs: nativeBreakthroughs("night") },
    { name: "Icarus - 15,660,000", chance: 15660000, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Sinister - 15,000,000", chance: 15000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Arcane : Legacy - 15,000,000", chance: 15000000 },
    { name: "Sirius - 14,000,000", chance: 14000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Borealis - 13,333,333", chance: 11333333, nativeBiomes: ["dreamspace"] },
    { name: "Stormal : Hurricane - 13,500,000", chance: 13500000, breakthroughs: nativeBreakthroughs("windy") },
    { name: "Glitch - 12,210,110", chance: 12210110, nativeBiomes: ["glitch"] },
    { name: "Wonderland - 12,000,000", chance: 12000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Sailor - 12,000,000", chance: 12000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Melodic - 11,300,000", chance: 11300000 },
    { name: "Moonflower - 10,000,000", chance: 10000000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Starscourge - 10,000,000", chance: 10000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Sharkyn - 10,000,000", chance: 10000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Guardian - 10,000,000", chance: 10000000 },
    { name: "Lost Soul : Wander - 9,400,000", chance: 9400000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Amethyst - 9,333,700", chance: 9333700 },
    { name: "Stargazer - 9,200,000", chance: 9200000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Helios - 9,000,000", chance: 9000000 },
    { name: "Nihility - 9,000,000", chance: 9000000, breakthroughs: nativeBreakthroughs("null", "limbo"), nativeBiomes: ["limbo-null"] },
    { name: "Harnessed - 8,500,000", chance: 8500000 },
    { name: "Outlaw - 8,000,000", chance: 8000000, breakthroughs: nativeBreakthroughs("sandstorm") },
    { name: "Origin : Onion - 8,000,000", chance: 8000000 },
    { name: "Divinus : Guardian - 7,777,777", chance: 7777777, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Nautilus : Lost - 7,700,000", chance: 7700000 },
    { name: "Velocity - 7,630,000", chance: 7630000 },
    { name: "Faith - 7,250,000", chance: 7250000, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Refraction - 7,242,000", chance: 7242000 },
    { name: "Anubis - 7,200,000", chance: 7200000, breakthroughs: nativeBreakthroughs("sandstorm") },
    { name: "Oni - 6,666,666", chance: 6666666, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Hades - 6,666,666", chance: 6666666, breakthroughs: nativeBreakthroughs("hell") },
    { name: "Origin - 6,500,000", chance: 6500000 },
    { name: "Vital - 6,000,000", chance: 6000000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Twilight - 6,000,000", chance: 6000000, breakthroughs: nativeBreakthroughs("night") },
    { name: "Anima - 5,730,000", chance: 5730000, nativeBiomes: ["limbo"] },
    { name: "Galaxy - 5,000,000", chance: 5000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Lunar : Full Moon - 5,000,000", chance: 5000000, breakthroughs: nativeBreakthroughs("night") },
    { name: "Solar : Solstice - 5,000,000", chance: 5000000, breakthroughs: nativeBreakthroughs("day") },
    { name: "Jack Frost - 4,700,000", chance: 4700000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Zeus - 4,500,000", chance: 4500000 },
    { name: "Shucks - 4,460,000", chance: 4460000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Aquatic : Flame - 4,000,000", chance: 4000000 },
    { name: "Metabytes - 4,000,000", chance: 4000000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Poseidon - 4,000,000", chance: 4000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Gingerbread - 3,750,000", chance: 3750000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Werewolf - 3,600,000", chance: 3600000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Crystallized : Bejeweled - 3,600,000", chance: 3600000 },
    { name: "Shiftlock - 3,325,000", chance: 3325000, breakthroughs: nativeBreakthroughs("null", "limbo"), nativeBiomes: ["limbo-null"] },
    { name: "Headless - 3,200,000", chance: 3200000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Savior - 3,200,000", chance: 3200000 },
    { name: "Apatite - 3,133,133", chance: 3133133 },
    { name: "Lunar : Nightfall - 3,000,000", chance: 3000000, nativeBiomes: ["graveyard"] },
    { name: "Parasite - 3,000,000", chance: 3000000, breakthroughs: nativeBreakthroughs("corruption") },
    { name: "Virtual - 2,500,000", chance: 2500000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Evanescent - 2,360,000", chance: 2360000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Undefined : Defined - 2,222,000", chance: 2222000, breakthroughs: nativeBreakthroughs("null") },
    { name: "Flowed - 2,121,121", chance: 2121121, breakthroughs: nativeBreakthroughs("null", "limbo"), nativeBiomes: ["limbo-null"] },
    { name: "Lunar : Cultist - 2,000,000", chance: 2000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Bounded : Unbound - 2,000,000", chance: 2000000 },
    { name: "Gravitational - 2,000,000", chance: 2000000 },
    { name: "Player : Respawn - 1,999,999", chance: 1999999, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Cosmos - 1,766,000", chance: 1766000 },
    { name: "Cosmos - 1,520,000", chance: 1520000 },
    { name: "Celestial : Wicked - 1,500,000", chance: 1500000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Astral - 1,336,000", chance: 1336000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "symbiosis - 1,331,201", chance: 1336000, breakthroughs: nativeBreakthroughs("corruption") },
    { name: "Rage : Brawler - 1,280,000", chance: 1280000 },
    { name: "Undefined - 1,111,000", chance: 1111000, breakthroughs: nativeBreakthroughs("null", "limbo"), nativeBiomes: ["limbo-null"] },
    { name: "Magnetic : Reverse Polarity - 1,024,000", chance: 1024000 },
    { name: "Flushed : Troll - 1,000,000", chance: 1000000 },
    { name: "Arcane - 1,000,000", chance: 1000000 },
    { name: "Starlight : Kunzite - 1,000,000", chance: 1000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Kyawthuite - 850,000", chance: 850000 },
    { name: "Verdict - 700,000", chance: 700000, nativeBiomes: ["edict"], cutscene: "verdict-cutscene" },
    { name: "Undead : Devil - 666,666", chance: 666666, breakthroughs: nativeBreakthroughs("hell") },
    { name: "Warlock - 666,000", chance: 666000 },
    { name: "Pump : Trickster - 600,000", chance: 600000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Prowler - 540,000", chance: 540000, nativeBiomes: ["anotherRealm"], cutscene: "prowler-cutscene" },
    { name: "Clockwork - 530,000", chance: 530000, nativeBiomes: ["mastermind"], cutscene: "clockwork-cutscene" },
    { name: "Raven - 500,000", chance: 500000, nativeBiomes: ["limbo"] },
    { name: "Hope - 488,725", chance: 488725, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Terror - 400,000", chance: 400000 },
    { name: "Celestial - 350,000", chance: 350000 },
    { name: "Lantern - 333,333", chance: 333333 },
    { name: "Watermelon - 320,000", chance: 320000 },
    { name: "Attorney - 270,000", chance: 270000, nativeBiomes: ["edict"], cutscene: "attorney-cutscene" },
    { name: "Star Rider : Starfish Rider - 250,000", chance: 250000, breakthroughs: nativeBreakthroughs("oldstarfall") },
    { name: "Cryogenic - 250,000", chance: 250000, nativeBiomes: ["aurora"], ignoreLuck: true, fixedRollThreshold: 1 },
    { name: "Star Rider : Snowflake - 240,000", chance: 240000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "Pump - 200,000", chance: 200000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Bounded - 200,000", chance: 200000 },
    { name: "Aether - 180,000", chance: 180000 },
    { name: "Jade - 125,000", chance: 125000 },
    { name: "Divinus : Angel - 120,000", chance: 120000, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Comet - 120,000", chance: 120000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Diaboli : Void - 100,400", chance: 100400 },
    { name: "Exotic - 99,999", chance: 99999 },
    { name: "Stormal - 90,000", chance: 90000, breakthroughs: nativeBreakthroughs("windy") },
    { name: "Flow - 87,000", chance: 87000 , breakthroughs: nativeBreakthroughs("windy") },
    { name: "Permafrost - 73,500", chance: 73500, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Nautilus - 70,000", chance: 70000 },
    { name: "Hazard : Rays - 70,000", chance: 70000, breakthroughs: nativeBreakthroughs("corruption") },
    { name: "Flushed : Lobotomy - 69,000", chance: 69000 },
    { name: "Star Rider - 50,000", chance: 50000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Starlight - 50,000", chance: 50000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Solar - 50,000", chance: 50000, breakthroughs: nativeBreakthroughs("day") },
    { name: "Lunar - 50,000", chance: 50000, breakthroughs: nativeBreakthroughs("night") },
    { name: "Aquatic - 40,000", chance: 40000 },
    { name: "Watt - 32,768", chance: 32768 },
    { name: "Copper - 29,000", chance: 29000 },
    { name: "Powered - 16,384", chance: 16384 },
    { name: "LEAK - 14,000", chance: 14000 },
    { name: "Rage : Heated - 12,800", chance: 12800 },
    { name: "Corrosive - 12,000", chance: 12000, breakthroughs: nativeBreakthroughs("corruption") },
    { name: "Undead - 12,000", chance: 12000, breakthroughs: nativeBreakthroughs("hell") },
    { name: "Snowball - 10,000", chance: 10000, breakthroughs: nativeBreakthroughs("aurora") },
    { name: "★★★ - 10,000", chance: 10000, nativeBiomes: ["dreamspace"] },
    { name: "Atomic : Riboneucleic - 9876", chance: 9876 },
    { name: "Lost Soul - 9,200", chance: 9200 },
    { name: "Honey - 8,335", chance: 8335 },
    { name: "Quartz - 8,192", chance: 8192 },
    { name: "Doddle - 7,500", chance: 7500 },
    { name: "Hazard - 7,000", chance: 7000, breakthroughs: nativeBreakthroughs("corruption") },
    { name: "Flushed : Heart Eye - 6,900", chance: 6900 },
    { name: "Flushed - 6,900", chance: 6900 },
    { name: MEGAPHONE_AURA_NAME, chance: 5000, requiresYgBlessing: true },
    { name: "Flutter - 5,000", chance: 5000 },
    { name: "Bleeding - 4,444", chance: 4444 },
    { name: "Sidereum - 4,096", chance: 4096 },
    { name: "Cola - 3,999", chance: 3999 },
    { name: "Flora - 3,700", chance: 3700 },
    { name: "Pukeko - 3,198", chance: 3198 },
    { name: "Fault - 3,000", chance: 3000, nativeBiomes: ["glitch"] },
    { name: "Player - 3,000", chance: 3000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Glacier - 2,304", chance: 2304, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Ash - 2,300", chance: 2300 },
    { name: "Magnetic - 2,048", chance: 2048 },
    { name: "Glock - 1,700", chance: 1700 },
    { name: "Atomic - 1,180", chance: 1180 },
    { name: "Precious - 1,024", chance: 1024 },
    { name: "Diaboli - 1,004", chance: 1004 },
    { name: "★★ - 1,000", chance: 1000, nativeBiomes: ["dreamspace"] },
    { name: "Aquamarine - 900", chance: 900 },
    { name: "Wind - 900", chance: 900, breakthroughs: nativeBreakthroughs("windy") },
    { name: "Sapphire - 800", chance: 800 },
    { name: "Jackpot - 777", chance: 777, breakthroughs: nativeBreakthroughs("sandstorm") },
    { name: "Ink - 700", chance: 700 },
    { name: "Gilded - 512", chance: 512, breakthroughs: nativeBreakthroughs("sandstorm") },
    { name: "Emerald - 500", chance: 500 },
    { name: "Forbidden - 404", chance: 404, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Ruby - 350", chance: 350 },
    { name: "Topaz - 150", chance: 150 },
    { name: "Rage - 128", chance: 128 },
    { name: "★ - 100", chance: 100, nativeBiomes: ["dreamspace"] },
    { name: "Crystallized - 64", chance: 64 },
    { name: "Divinus : Love - 32", chance: 32 },
    { name: "Divinus - 32", chance: 32, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Rare - 16", chance: 16 },
    { name: "Natural - 8", chance: 8 },
    { name: "Good - 5", chance: 5 },
    { name: "Uncommon - 4", chance: 4 },
    { name: "Common - 2", chance: 1 },
    { name: "Nothing - 1", chance: 1, nativeBiomes: ["limbo"] },
]);

function coerceNativeBiomes(nativeBiomes) {
    if (!nativeBiomes) return null;
    const queue = Array.isArray(nativeBiomes) ? nativeBiomes : [nativeBiomes];
    const normalized = new Set();
    for (const item of queue) {
        if (typeof item !== 'string') continue;
        const fragments = item.split(',');
        for (const fragment of fragments) {
            const trimmed = fragment.trim();
            if (trimmed) {
                normalized.add(trimmed);
            }
        }
    }
    return normalized.size > 0 ? normalized : null;
}

function coerceBreakthroughMap(breakthroughs) {
    if (!breakthroughs) return null;
    const pairs = breakthroughs instanceof Map
        ? Array.from(breakthroughs.entries())
        : Object.entries(breakthroughs);
    const sanitized = new Map();
    for (const [biome, multiplier] of pairs) {
        const value = Number(multiplier);
        if (Number.isFinite(value) && value > 0) {
            sanitized.set(biome, value);
        }
    }
    return sanitized.size > 0 ? sanitized : null;
}

function normalizeAuraDefinition(definition) {
    const { nativeBiomes, breakthroughs, ...rest } = definition;
    return {
        ...rest,
        nativeBiomes: coerceNativeBiomes(nativeBiomes),
        breakthroughs: coerceBreakthroughMap(breakthroughs)
    };
}

function createAuraRegistry(definitions) {
    const catalog = [];
    for (const entry of definitions) {
        const normalized = normalizeAuraDefinition(entry);
        catalog.push(Object.freeze(normalized));
    }
    return Object.freeze(catalog);
}

const AURA_REGISTRY = createAuraRegistry(AURA_BLUEPRINT_SOURCE);
initializeAuraFilters(AURA_REGISTRY);

const auraRollState = new WeakMap();

function getAuraState(aura) {
    let state = auraRollState.get(aura);
    if (!state) {
        state = { wonCount: 0, effectiveChance: aura.chance };
        auraRollState.set(aura, state);
    }
    return state;
}

function resetAuraRollState(registry) {
    for (const aura of registry) {
        const state = getAuraState(aura);
        state.wonCount = 0;
        state.effectiveChance = aura.chance;
    }
}

function recordAuraWin(aura) {
    if (!aura) return;
    const state = getAuraState(aura);
    state.wonCount += 1;
}

function setAuraEffectiveChance(aura, value) {
    const state = getAuraState(aura);
    state.effectiveChance = value;
}

function readAuraWinCount(aura) {
    return getAuraState(aura).wonCount;
}

function isAuraNativeTo(aura, biome) {
    return Boolean(aura && aura.nativeBiomes && aura.nativeBiomes.has(biome));
}

function auraMatchesAnyBiome(aura, biomes) {
    if (!aura || !aura.nativeBiomes || !Array.isArray(biomes)) return false;
    for (const biome of biomes) {
        if (aura.nativeBiomes.has(biome)) {
            return true;
        }
    }
    return false;
}

function readBreakthroughMultiplier(aura, biome) {
    if (!aura || !aura.breakthroughs) return null;
    return aura.breakthroughs.get(biome) ?? null;
}

const EVENT_LIST = [
    { id: "valentine24", label: "Valentine 2024" },
    { id: "aprilFools24", label: "April Fools 2024" },
    { id: "summer24", label: "Summer 2024" },
    { id: "ria24", label: "RIA 2024" },
    { id: "halloween24", label: "Halloween 2024" },
    { id: "winter25", label: "Winter 2025" },
    { id: "aprilFools25", label: "April Fools 2025" },
    { id: "summer25", label: "Summer 2025" },
    { id: "halloween25", label: "Halloween 2025" },
    { id: "winter26", label: "Winter 2026" },
    { id: "valentine26", label: "Valentine 2026" },
];

const VALENTINE_EVENT_IDS = Object.freeze(['valentine24', 'valentine26']);
const HALLOWEEN_EVENT_IDS = Object.freeze(['halloween24', 'halloween25']);
const SUMMER_EVENT_IDS = Object.freeze(['summer24', 'summer25']);
const WINTER_EVENT_IDS = Object.freeze(['winter25', 'winter26']);

const EVENT_LABEL_MAP = new Map(EVENT_LIST.map(({ id, label }) => [id, label]));
const HALLOWEEN_2024_EVENT_ID = 'halloween24';
const HARVESTER_AURA_NAME = 'Harvester - 666,000,000';
const HARVESTER_CURSE_LAYER_ID = 'harvester-curse-layer';
let harvesterCurseTimeoutId = null;

const EVENT_AURA_LOOKUP = {
    valentine24: [
        "Divinus : Love - 32",
        "Flushed : Heart Eye - 6,900",
    ],
    aprilFools24: [
        "Undefined : Defined - 2,222,000",
        "Chromatic : Kromat1k - 40,000,000",
        "Impeached : I'm Peach - 400,000,000",
    ],
    summer24: [
        "Star Rider : Starfish Rider - 250,000",
        "Watermelon - 320,000",
        "Surfer : Shard Surfer - 225,000,000",
    ],
    ria24: [
        "Innovator - 30,000,000",
    ],
    halloween24: [
        "Apostolos : Veil - 800,000,000",
        "Harvester - 666,000,000",
        "Nightmare Sky - 190,000,000",
        "Dullahan - 72,000,000",
        "Soul Hunter - 40,000,000",
        "Cryptfire - 21,000,000",
        "Moonflower - 10,000,000",
        "Vital - 6,000,000",
        "Lunar : Nightfall - 3,000,000",
        "Pump - 200,000",
    ],
    winter25: [
        "Atlas : Yuletide - 510,000,000",
        "Abominable - 120,000,000",
        "Express - 90,000,000",
        "Winter Fantasy - 72,000,000",
        "Santa Frost - 45,000,000",
        "Wonderland - 12,000,000",
    ],
    aprilFools25: [
        "Glock : the glock of the sky - 170,000,000",
        "Origin : Onion - 8,000,000",
        "Flushed : Troll - 1,000,000",
        "Pukeko - 3,198",
    ],
    summer25: [
        "Aegis : Watergun - 825,000,000",
        "Manta - 300,000,000",
    ],
    halloween25: [
        "Pump : Trickster - 600,000",
        "Headless - 3,200,000",
        "Oni - 6,666,666",
        "Headless : Horseman - 32,000,000",
        "Sinister - 15,000,000",
        "Accursed - 82,000,000",
        "Phantasma - 462,600,000",
        "Apocalypse - 624,000,000",
        "Wraithlight - 695,000,000",
        "Malediction - 730,000,000",
        "Banshee - 730,000,000",
        "Ravage - 930,000,000",
        "Arachnophobia - 940,000,000",
        "Lamenthyr - 1,000,000,000",
        "Erebus - 1,200,000,000",
        "Grief - 88,250,000",
        "Graveborn - 290,000,000",
        "Celestial : Wicked - 1,500,000",
        "Reaper - 66,000,000",
        "Shucks - 4,460,000",
        "Bloodgarden - 88,000,000",
        "Werewolf - 3,600,000",
        "Crimson - 120,000,000",
        "Lunar : Cultist - 2,000,000",
        "Afterparty - 440,000,000"
    ],
    winter26: [
        "Snowball - 10,000",
        "Star Rider : Snowflake - 240,000",
        "Gingerbread - 3,750,000",
        "Jack Frost - 4,700,000",
        "Lost Soul : Wander - 9,400,000",
        "Frostwood - 24,500,000",
        "North Pole - 45,000,000",
        "Skyburst - 60,000,000",
        "Encase - 230,000,000",
        "Cryofang - 380,000,000",
        "Northern - 405,000,000",
        "EveNight - 424,000,000",
        "Workshop - 700,000,000",
        "Parol - 760,000,000",
        "Sovereign : Frostveil - 1,000,000,000",
        "Winter Garden - 1,450,012,025",
        "Dream Traveler - 2,025,012,025",
        "Cryogenic - 250,000"
    ],
    valentine26: [
        "Symphony : Bloomed - 375,000,000",
    ],
};

const BIOME_EVENT_CONSTRAINTS = {
    graveyard: ["halloween24", "halloween25"],
    pumpkinMoon: ["halloween24", "halloween25"],
    bloodRain: ["halloween25"],
    blazing: ["summer25"],
    aurora: ["winter26"],
};

const EVENT_BIOME_CONDITION_MESSAGES = Object.freeze({
    anotherRealm: 'Requires Dev Biomes to be enabled under run parameters.',
    mastermind: 'Requires Dev Biomes to be enabled under run parameters.',
    edict: 'Requires Dev Biomes to be enabled under run parameters.',
    graveyard: 'Requires Night time with Halloween 2024 or Halloween 2025 enabled.',
    pumpkinMoon: 'Requires Night time with Halloween 2024 or Halloween 2025 enabled.',
    bloodRain: 'Requires Halloween 2025 enabled.',
    blazing: 'Requires Summer 2025 enabled.',
    aurora: 'Requires Winter 2026 enabled.',
    unknown: 'Requires Dev Biomes to be enabled under run parameters.',
});

const enabledEvents = new Set(['valentine26']);
const auraEventIndex = new Map();

function hasAnyEnabledEvent(eventIds) {
    return eventIds.some(eventId => enabledEvents.has(eventId));
}

function hasCombinedEventsEnabled() {
    return enabledEvents.size > 1;
}

function resolveEventThemeVariant() {
    if (hasCombinedEventsEnabled()) return 'default';
    if (hasAnyEnabledEvent(VALENTINE_EVENT_IDS)) return 'valentine';
    if (hasAnyEnabledEvent(WINTER_EVENT_IDS)) return 'winter';
    if (hasAnyEnabledEvent(HALLOWEEN_EVENT_IDS)) return 'halloween';
    if (hasAnyEnabledEvent(SUMMER_EVENT_IDS)) return 'summer';
    return 'default';
}

function resolveParticleMode() {
    if (hasCombinedEventsEnabled()) return 'none';
    if (hasAnyEnabledEvent(VALENTINE_EVENT_IDS)) return 'hearts';
    if (hasAnyEnabledEvent(WINTER_EVENT_IDS)) return 'snow';
    return 'none';
}

function syncEventVisualPresentation() {
    if (!pageBody) {
        return;
    }

    const variant = resolveEventThemeVariant();
    pageBody.classList.toggle('theme-event-valentine', variant === 'valentine');
    pageBody.classList.toggle('theme-event-winter', variant === 'winter');
    pageBody.classList.toggle('theme-event-halloween', variant === 'halloween');
    pageBody.classList.toggle('theme-event-summer', variant === 'summer');

    snowEffectState.mode = resolveParticleMode();
    syncSnowEffect();
}

function biomeEventRequirementsMet(biomeId) {
    if (!biomeId) {
        return true;
    }

    if (DEV_BIOME_IDS.has(biomeId) && !devBiomesEnabled) {
        return false;
    }

    const requiredEvent = BIOME_EVENT_CONSTRAINTS[biomeId];
    if (!requiredEvent) {
        return true;
    }

    const requiredEvents = Array.isArray(requiredEvent) ? requiredEvent : [requiredEvent];
    return requiredEvents.some(eventId => enabledEvents.has(eventId));
}

const GLITCH_EVENT_WHITELIST = new Set([
    "halloween24",
    "halloween25",
]);

for (const [eventId, auraNames] of Object.entries(EVENT_AURA_LOOKUP)) {
    auraNames.forEach(name => {
        auraEventIndex.set(name, eventId);
    });
}

function getAuraEventId(aura) {
    if (!aura) return null;
    return auraEventIndex.get(aura.name) || null;
}

const CUTSCENE_PRIORITY_SEQUENCE = [
            "illusionary-cutscene", "oblivion-cutscene", "memory-cutscene", "neferkhaf-cutscene",
            "monarch-cutscene", "equinox-cutscene", "dream-traveler-cutscene", "breakthrough-cutscene",
            "leviathan-cutscene", "winter-garden-cutscene", "erebus-cutscene", "luminosity-cutscene",
            "pixelation-cutscene", "nyctophobia-cutscene", "frostveil-cutscene", "lamenthyr-cutscene",
            "ascendant-cutscene", "dreammetric-cutscene", "oppression-cutscene", "verdict-cutscene",
            "prowler-cutscene", "clockwork-cutscene", "attorney-cutscene"
                                    ];

oblivionAuraData = AURA_REGISTRY.find(aura => aura.name === OBLIVION_AURA_LABEL) || null;
memoryAuraData = AURA_REGISTRY.find(aura => aura.name === MEMORY_AURA_LABEL) || null;
duneAuraData = AURA_REGISTRY.find(aura => aura.name === DUNE_AURA_LABEL) || null;

const ROE_EXCLUSION_SET = new Set([
    "Erebus - 1,200,000,000",
    "Lamenthyr - 1,000,000,000",
    "Arachnophobia - 940,000,000",
    "Ravage - 930,000,000",
    "Apostolos : Veil - 800,000,000",
    "Malediction - 730,000,000",
    "Banshee - 730,000,000",
    "Wraithlight - 695,000,000",
    "Harvester - 666,000,000",
    "Apocalypse - 624,000,000",
    "Dreammetric - 320,000,000",
    "Phantasma - 462,600,000",
    "Graveborn - 290,000,000",
    "Oppression - 220,000,000",
    "Nightmare Sky - 190,000,000",
    "Crimson - 120,000,000",
    "Grief - 88,250,000",
    "Bloodgarden - 88,000,000",
    "Accursed - 82,000,000",
    "Dullahan - 72,000,000",
    "Reaper - 66,000,000",
    "Soul Hunter - 40,000,000",
    "Headless : Horseman - 32,000,000",
    "Cryptfire - 21,000,000",
    "Sinister - 15,000,000",
    "Borealis - 13,333,333",
    "Glitch - 12,210,110",
    "Moonflower - 10,000,000",
    "Oni - 6,666,666",
    "Vital - 6,000,000",
    "Shucks - 4,460,000",
    "Headless - 3,200,000",
    "Lunar : Nightfall - 3,000,000",
    "Werewolf - 3,600,000",
    "Lunar : Cultist - 2,000,000",
    "Celestial : Wicked - 1,500,000",
    "Pump : Trickster - 600,000",
    "Prowler - 540,000",
    "Pump - 200,000",
    "★★★ - 10,000",
    "Fault - 3,000",
    "★★ - 1,000",
    "★ - 100"
]);

const ROE_BREAKTHROUGH_BLOCKLIST = new Set([
    "Twilight : Withering Grace - 180,000,000",
    "Aegis : Watergun - 825,000,000",
    "Manta - 300,000,000"
]);

AURA_REGISTRY.forEach(getAuraState);

const EVENT_SUMMARY_EMPTY_LABEL = "No events enabled";

function syncEventOptionVisualState(eventId, enabled) {
    const eventMenu = document.getElementById('event-option-list');
    if (!eventMenu) return;

    const checkbox = eventMenu.querySelector(`input[type="checkbox"][data-event-id="${eventId}"]`);
    if (!checkbox) return;

    if (checkbox.checked !== enabled) {
        checkbox.checked = enabled;
    }

    const option = checkbox.closest('.interface-select__option--checkbox');
    if (option) {
        option.classList.toggle('interface-select__option--active', !!enabled);
    }
}

function gatherActiveEventLabels() {
    return EVENT_LIST
        .filter(event => enabledEvents.has(event.id))
        .map(event => event.label);
}

function updateEventSummary() {
    const summary = document.getElementById('event-selector-summary');
    if (!summary) return;

    const labels = gatherActiveEventLabels();
    let displayText = EVENT_SUMMARY_EMPTY_LABEL;

    if (labels.length === 0) {
        summary.classList.add('form-field__input--placeholder');
    } else {
        summary.classList.remove('form-field__input--placeholder');
        if (labels.length === 1) {
            displayText = labels[0];
        } else if (labels.length === 2) {
            displayText = `${labels[0]}, ${labels[1]}`;
        } else {
            displayText = `${labels[0]}, ${labels[1]} +${labels.length - 2} more`;
        }
    }

    summary.textContent = displayText;
    summary.title = labels.length > 0 ? labels.join(', ') : EVENT_SUMMARY_EMPTY_LABEL;

    const details = document.getElementById('event-selector');
    const isOpen = !!(details && details.open);
    summary.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeOpenSelectMenus(except, options = {}) {
    const { focusSummary = false } = options;
    let hasFocused = false;
    const openSelects = document.querySelectorAll('details.interface-select[open]');
    openSelects.forEach(details => {
        if (except && details === except) return;
        details.open = false;
        const summary = details.querySelector('.interface-select__summary');
        if (summary) {
            summary.setAttribute('aria-expanded', 'false');
            if (focusSummary && !hasFocused) {
                summary.focus();
                hasFocused = true;
            }
        }
        if (details.id === 'event-selector') {
            updateEventSummary();
        }
        const selectId = details.dataset.select;
        if (selectId) {
            const registryEntry = selectWidgetRegistry.get(selectId);
            if (registryEntry && typeof registryEntry.update === 'function') {
                registryEntry.update();
            }
        }
    });
}

document.addEventListener('click', event => {
    const parentSelect = event.target.closest('details.interface-select');
    closeOpenSelectMenus(parentSelect);
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        const rollOverlay = document.getElementById('rollWarningOverlay');
        const rollOverlayVisible = rollOverlay && !rollOverlay.hasAttribute('hidden');
        if (rollOverlayVisible) {
            largeRollWarningManager.cancel();
            return;
        }

        const overlay = document.getElementById('cutsceneWarningOverlay');
        const overlayVisible = overlay && !overlay.hasAttribute('hidden');
        if (overlayVisible) {
            cutsceneWarningManager.hide();
            return;
        }

        const rotationOverlay = document.getElementById('rotationPromptOverlay');
        const rotationOverlayVisible = rotationOverlay && !rotationOverlay.hasAttribute('hidden');
        if (rotationOverlayVisible) {
            rotationPromptManager.hide();
            return;
        }

        const cyberspaceOverlay = document.getElementById('cyberspaceIllusionaryOverlay');
        const cyberspaceOverlayVisible = cyberspaceOverlay && !cyberspaceOverlay.hasAttribute('hidden');
        if (cyberspaceOverlayVisible) {
            cyberspaceIllusionaryWarningManager.hide();
            return;
        }
        closeOpenSelectMenus(null, { focusSummary: true });
    }
});

function enforceBiomeEventRestrictions() {
    const biomeSelector = document.getElementById('biome-dropdown');
    if (!biomeSelector) return;

    const currentValue = biomeSelector.value;
    let resetToDefault = false;

    Array.from(biomeSelector.options).forEach(option => {
        let disabled = false;
        let title = '';

        if (DEV_BIOME_IDS.has(option.value) && !devBiomesEnabled) {
            disabled = true;
            title = 'Enable Dev Biomes to access this biome.';
        }

        const requiredEvent = BIOME_EVENT_CONSTRAINTS[option.value];
        if (requiredEvent) {
            const requiredEvents = Array.isArray(requiredEvent) ? requiredEvent : [requiredEvent];
            const enabled = requiredEvents.some(eventId => enabledEvents.has(eventId));
            if (!enabled) {
                disabled = true;
                const eventLabels = requiredEvents
                    .map(eventId => EVENT_LIST.find(event => event.id === eventId)?.label)
                    .filter(Boolean);
                if (eventLabels.length > 0) {
                    let labelText = eventLabels[0];
                    if (eventLabels.length === 2) {
                        labelText = `${eventLabels[0]} or ${eventLabels[1]}`;
                    } else if (eventLabels.length > 2) {
                        labelText = `${eventLabels.slice(0, -1).join(', ')}, or ${eventLabels[eventLabels.length - 1]}`;
                    }
                    title = title || `${labelText} must be enabled to access this biome.`;
                }
            }
        }

        option.disabled = disabled;
        if (title) {
            option.title = title;
        } else {
            option.removeAttribute('title');
        }

        if (disabled && option.value === currentValue) {
            resetToDefault = true;
        }
    });

    if (resetToDefault) {
        biomeSelector.value = 'normal';
        if (typeof initializeBiomeInterface === 'function') {
            initializeBiomeInterface();
        } else if (typeof handleBiomeInterface === 'function') {
            handleBiomeInterface();
        }
    }

    refreshCustomSelect('biome-dropdown');
    updateBiomeControlConstraints();
}

function showBiomeConditionOverlay(biomeId, { message: overrideMessage = null, labelOverride = null, titleOverride = null } = {}) {
    if (typeof document === 'undefined') {
        return;
    }

    const message = overrideMessage ?? EVENT_BIOME_CONDITION_MESSAGES[biomeId];
    if (!message) {
        return;
    }

    const overlay = document.getElementById('biomeConditionOverlay');
    const title = document.getElementById('biomeConditionTitle');
    const body = document.getElementById('biomeConditionBody');

    if (!overlay || !title || !body || typeof revealOverlay !== 'function') {
        return;
    }

    const fallbackLabel = labelOverride || 'Biome';
    const label = labelOverride
        || (biomeId && typeof resolveSelectionLabel === 'function'
            ? resolveSelectionLabel(BIOME_PRIMARY_SELECT_ID, biomeId, { fallbackLabel })
            : fallbackLabel);

    title.textContent = titleOverride || `${label} requirements`;
    body.textContent = message;
    revealOverlay(overlay);
}

function showYgBlessingOverlay() {
    if (typeof document === 'undefined') {
        return;
    }

    const overlay = document.getElementById('ygBlessingOverlay');
    const body = document.getElementById('ygBlessingBody');
    if (!overlay || !body || typeof revealOverlay !== 'function') {
        return;
    }

    body.textContent = YG_BLESSING_EVENT_BLOCK_MESSAGE;
    revealOverlay(overlay);
}

function setEventToggleState(eventId, enabled) {
    if (!eventId) return;
    const hasEvent = enabledEvents.has(eventId);
    if (enabled && !hasEvent) {
        enabledEvents.add(eventId);
    } else if (!enabled && hasEvent) {
        enabledEvents.delete(eventId);
    } else {
        syncEventOptionVisualState(eventId, enabled);
        return;
    }

    syncEventOptionVisualState(eventId, enabled);

    updateEventSummary();
    enforceBiomeEventRestrictions();
    syncEventVisualPresentation();
}

function initializeEventSelector() {
    const eventMenu = document.getElementById('event-option-list');
    if (!eventMenu) return;

    const checkboxes = eventMenu.querySelectorAll('input[type="checkbox"][data-event-id]');
    checkboxes.forEach(input => {
        const eventId = input.dataset.eventId;
        input.checked = enabledEvents.has(eventId);
        syncEventOptionVisualState(eventId, input.checked);
        input.addEventListener('change', () => {
            setEventToggleState(eventId, input.checked);
        });
    });

    const details = document.getElementById('event-selector');
    if (details) {
        details.addEventListener('toggle', () => {
            const summary = document.getElementById('event-selector-summary');
            if (summary) {
                summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
            }
        });
    }

    updateEventSummary();
    enforceBiomeEventRestrictions();
    syncEventVisualPresentation();
}

function initializeDevBiomeToggle() {
    const toggle = document.getElementById('dev-biomes-toggle');
    if (!toggle) {
        return;
    }

    const applyState = () => {
        devBiomesEnabled = toggle.checked;
        enforceBiomeEventRestrictions();
    };

    applyState();

    toggle.addEventListener('change', applyState);
}

function triggerLuckPresetButtonAnimation(button, className) {
    if (!button) {
        return;
    }

    button.classList.remove('luck-preset-button--pop', 'luck-preset-button--mega-pop');
    // Force reflow so the animation can retrigger
    void button.offsetWidth;
    button.classList.add(className);
}

function bindLuckPresetButtonAnimation(button, className, animationNames) {
    if (!button) {
        return;
    }

    button.addEventListener('click', () => {
        if (appState.reduceMotion) {
            return;
        }
        triggerLuckPresetButtonAnimation(button, className);
    });

    button.addEventListener('animationend', event => {
        if (animationNames.includes(event.animationName)) {
            button.classList.remove(className);
        }
    });
}

function setupLuckPresetAnimations() {
    resetLuckPresetAnimations();

    const oneMillionButton = document.getElementById('luck-preset-one-million');
    const tenMillionButton = document.getElementById('luck-preset-ten-million');
    const hundredMillionButton = document.getElementById('luck-preset-hundred-million');

    bindLuckPresetButtonAnimation(oneMillionButton, 'luck-preset-button--pop', ['luckPresetPop']);
    bindLuckPresetButtonAnimation(tenMillionButton, 'luck-preset-button--mega-pop', ['luckPresetMegaPop']);
    bindLuckPresetButtonAnimation(hundredMillionButton, 'luck-preset-button--master-pop', ['luckPresetMasterPop']);
}

function setVersionButtonExpanded(state) {
    if (versionInfoButton) {
        versionInfoButton.setAttribute('aria-expanded', state ? 'true' : 'false');
    }
}

function showVersionChangelogOverlay() {
    const overlay = document.getElementById('versionChangelogOverlay');
    if (!overlay) {
        return;
    }

    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.focus === 'function') {
        versionChangelogOverlayState.lastFocusedElement = activeElement;
    } else {
        versionChangelogOverlayState.lastFocusedElement = null;
    }

    revealOverlay(overlay);
    setVersionButtonExpanded(true);

    if (!versionChangelogOverlayState.escapeHandler) {
        versionChangelogOverlayState.escapeHandler = event => {
            if (event.key === 'Escape' || event.key === 'Esc') {
                event.preventDefault();
                hideVersionChangelogOverlay();
            }
        };
        document.addEventListener('keydown', versionChangelogOverlayState.escapeHandler);
    }

    const closeButton = document.getElementById('versionChangelogClose');
    if (closeButton) {
        closeButton.focus();
    }
}

function hideVersionChangelogOverlay({ focusTrigger = true } = {}) {
    const overlay = document.getElementById('versionChangelogOverlay');
    if (!overlay || overlay.hasAttribute('hidden') || overlay.hasAttribute('data-closing')) {
        setVersionButtonExpanded(false);
        return;
    }

    setVersionButtonExpanded(false);

    if (versionChangelogOverlayState.escapeHandler) {
        document.removeEventListener('keydown', versionChangelogOverlayState.escapeHandler);
        versionChangelogOverlayState.escapeHandler = null;
    }

    const focusTarget = versionChangelogOverlayState.lastFocusedElement;
    versionChangelogOverlayState.lastFocusedElement = null;

    concealOverlay(overlay, {
        onHidden: () => {
            if (!focusTrigger) {
                return;
            }
            if (focusTarget && typeof focusTarget.focus === 'function') {
                focusTarget.focus();
                return;
            }
            if (versionInfoButton && typeof versionInfoButton.focus === 'function') {
                versionInfoButton.focus();
            }
        }
    });
}

function setupChangelogTabs() {
    const tablist = document.querySelector('[data-changelog-tablist]');
    if (!tablist) {
        return;
    }

    const tabs = Array.from(tablist.querySelectorAll('[data-changelog-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-changelog-panel]'));
    const panelContainer = document.querySelector('[data-changelog-panels]');

    if (!tabs.length || !panels.length) {
        return;
    }

    applyLatestUpdateBadgeToChangelogTabs(tabs);

    const panelLookup = new Map();
    panels.forEach(panel => {
        panelLookup.set(panel.dataset.changelogPanel, panel);
    });

    let activePanelId = null;

    if (panelContainer) {
        const releaseHeight = () => {
            panelContainer.classList.remove('changelog-modal__panels--animating');
            panelContainer.style.height = '';
        };

        panelContainer.addEventListener('transitionend', event => {
            if (event.target === panelContainer && event.propertyName === 'height') {
                releaseHeight();
            }
        });

        panelContainer.addEventListener('transitioncancel', event => {
            if (event.target === panelContainer && event.propertyName === 'height') {
                releaseHeight();
            }
        });
    }

    const activateTab = (targetId, { animate = true } = {}) => {
        const nextPanel = panelLookup.get(targetId);
        if (!nextPanel) {
            return;
        }

        const previousPanel = activePanelId ? panelLookup.get(activePanelId) : null;
        const shouldAnimate = Boolean(
            animate &&
            panelContainer &&
            previousPanel &&
            previousPanel !== nextPanel &&
            !appState.reduceMotion
        );

        if (panelContainer) {
            if (shouldAnimate) {
                panelContainer.classList.add('changelog-modal__panels--animating');
                panelContainer.style.height = `${previousPanel.scrollHeight}px`;
            } else {
                panelContainer.classList.remove('changelog-modal__panels--animating');
                panelContainer.style.height = '';
            }
        }

        tabs.forEach(tab => {
            const isActive = tab.dataset.changelogTab === targetId;
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tab.setAttribute('tabindex', isActive ? '0' : '-1');
            tab.classList.toggle('changelog-tab--active', isActive);
        });

        panelLookup.forEach((panel, panelId) => {
            const isActive = panelId === targetId;
            panel.hidden = !isActive;
            panel.setAttribute('tabindex', isActive ? '0' : '-1');
            if (isActive) {
                panel.removeAttribute('aria-hidden');
            } else {
                panel.setAttribute('aria-hidden', 'true');
            }
        });

        if (panelContainer) {
            if (shouldAnimate) {
                const applyTargetHeight = () => {
                    panelContainer.style.height = `${nextPanel.scrollHeight}px`;
                };
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(applyTargetHeight);
                } else {
                    applyTargetHeight();
                }
            } else {
                panelContainer.style.height = '';
            }
        }

        activePanelId = targetId;
    };

    const focusTabByOffset = (currentTab, offset) => {
        const currentIndex = tabs.indexOf(currentTab);
        if (currentIndex === -1) {
            return;
        }
        const nextIndex = (currentIndex + offset + tabs.length) % tabs.length;
        const nextTab = tabs[nextIndex];
        if (nextTab) {
            nextTab.focus();
            activateTab(nextTab.dataset.changelogTab);
        }
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activateTab(tab.dataset.changelogTab);
        });

        tab.addEventListener('keydown', event => {
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                focusTabByOffset(tab, 1);
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                focusTabByOffset(tab, -1);
            } else if (event.key === 'Home') {
                event.preventDefault();
                const firstTab = tabs[0];
                if (firstTab) {
                    firstTab.focus();
                    activateTab(firstTab.dataset.changelogTab);
                }
            } else if (event.key === 'End') {
                event.preventDefault();
                const lastTab = tabs[tabs.length - 1];
                if (lastTab) {
                    lastTab.focus();
                    activateTab(lastTab.dataset.changelogTab);
                }
            }
        });
    });

    const presetActiveTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    const initialTab = presetActiveTab || tabs[0];
    if (initialTab) {
        activateTab(initialTab.dataset.changelogTab, { animate: false });
    }
}

function setupVersionChangelogOverlay() {
    const overlay = document.getElementById('versionChangelogOverlay');
    const trigger = versionInfoButton;
    const closeButton = document.getElementById('versionChangelogClose');

    if (!overlay || !trigger) {
        return;
    }

    trigger.addEventListener('click', () => {
        if (overlay.hasAttribute('hidden')) {
            showVersionChangelogOverlay();
        } else {
            hideVersionChangelogOverlay();
        }
    });

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            hideVersionChangelogOverlay();
        });
    }

    overlay.addEventListener('click', event => {
        if (event.target === overlay) {
            hideVersionChangelogOverlay();
        }
    });
}

function setupNodeShiftAnimation() {
    const nodeShiftLink = document.querySelector('.resource-link--nodeshift');
    const nodeShiftImage = document.querySelector('.resource-link__image--nodeshift');

    if (!nodeShiftLink || !nodeShiftImage) {
        return;
    }

    const triggerAnimation = () => {
        nodeShiftImage.classList.remove('hurt-burst');
        void nodeShiftImage.offsetWidth;
        nodeShiftImage.classList.add('hurt-burst');
    };

    nodeShiftLink.addEventListener('mouseenter', triggerAnimation);
    nodeShiftImage.addEventListener('mouseenter', triggerAnimation);
    nodeShiftLink.addEventListener('focus', triggerAnimation);
    nodeShiftImage.addEventListener('focus', triggerAnimation);
}

function relocateResourcesPanelForMobile() {
    const resourcesPanel = document.querySelector('.surface--side');
    const footer = document.querySelector('.interface-footer');

    if (!resourcesPanel || !footer) {
        return;
    }

    const originalParent = resourcesPanel.parentElement;
    const originalNextSibling = resourcesPanel.nextElementSibling;
    const mobileQuery = window.matchMedia('(max-width: 900px)');

    const moveToFooter = () => {
        footer.parentElement.insertBefore(resourcesPanel, footer);
    };

    const restoreToLayout = () => {
        if (originalParent && originalParent.contains(resourcesPanel)) {
            return;
        }

        if (originalParent) {
            if (originalNextSibling && originalNextSibling.parentElement === originalParent) {
                originalParent.insertBefore(resourcesPanel, originalNextSibling);
            } else {
                originalParent.appendChild(resourcesPanel);
            }
        }
    };

    const syncLayout = () => {
        if (mobileQuery.matches) {
            moveToFooter();
        } else {
            restoreToLayout();
        }
    };

    syncLayout();
    mobileQuery.addEventListener('change', syncLayout);
}

document.addEventListener('DOMContentLoaded', initializeEventSelector);
document.addEventListener('DOMContentLoaded', initializeDevBiomeToggle);
document.addEventListener('DOMContentLoaded', setupLuckPresetAdjustmentButtons);
document.addEventListener('DOMContentLoaded', setupLuckPresetAnimations);
document.addEventListener('DOMContentLoaded', setupChangelogTabs);
document.addEventListener('DOMContentLoaded', setupVersionChangelogOverlay);
document.addEventListener('DOMContentLoaded', localizeChangelogUpdateTimes);
document.addEventListener('DOMContentLoaded', maybeShowChangelogOnFirstVisit);
document.addEventListener('DOMContentLoaded', initializeIntroOverlay);
document.addEventListener('DOMContentLoaded', initializeRollTriggerFloating);
document.addEventListener('DOMContentLoaded', setupRollCancellationControl);
document.addEventListener('DOMContentLoaded', setupNodeShiftAnimation);
document.addEventListener('DOMContentLoaded', relocateResourcesPanelForMobile);
document.addEventListener('DOMContentLoaded', observeLayeredSigilText);


function spawnFortePixelatedSecretMessage() {
    const secretLayer = document.getElementById('fortePixelatedSecretLayer');
    const trigger = document.getElementById('fortePixelatedTrigger');
    if (!secretLayer || !trigger) {
        return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const layerRect = secretLayer.getBoundingClientRect();
    const originX = triggerRect.left - layerRect.left + (triggerRect.width / 2);
    const originY = triggerRect.top - layerRect.top - 10;

    const secretMessage = document.createElement('span');
    secretMessage.className = 'preset-signoff__secret-message preset-signoff__secret-message--above-trigger sigil-effect-pixelation';
    secretMessage.textContent = 'Meow :3';
    secretMessage.style.setProperty('--secret-left', `${originX}px`);
    secretMessage.style.setProperty('--secret-top', `${originY}px`);
    secretLayer.append(secretMessage);

    secretMessage.addEventListener('animationend', () => {
        secretMessage.remove();
    }, { once: true });
}

function setupFortePixelatedSecret() {
    const trigger = document.getElementById('fortePixelatedTrigger');
    if (!trigger) {
        return;
    }

    const activateSecret = () => {
        fortePixelatedSecretState.clickCount += 1;
        if (fortePixelatedSecretState.clickCount < fortePixelatedSecretState.threshold) {
            return;
        }

        fortePixelatedSecretState.clickCount = 0;
        spawnFortePixelatedSecretMessage();
        playSoundEffect(qbearMeowSoundEffectElement, 'ui');
    };

    trigger.addEventListener('click', activateSecret);
    trigger.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        activateSecret();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const confirmButton = document.getElementById('cutsceneWarningConfirm');
    if (confirmButton) {
        confirmButton.addEventListener('click', () => {
            cutsceneWarningManager.hide();
        });
    }

    const dismissButton = document.getElementById('cutsceneWarningDismiss');
    if (dismissButton) {
        dismissButton.addEventListener('click', () => {
            cutsceneWarningManager.suppress();
            cutsceneWarningManager.hide();
        });
    }

    const overlay = document.getElementById('cutsceneWarningOverlay');
    if (overlay) {
        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                cutsceneWarningManager.hide();
            }
        });
    }

    const rotationConfirm = document.getElementById('rotationPromptConfirm');
    if (rotationConfirm) {
        rotationConfirm.addEventListener('click', () => {
            rotationPromptManager.confirm();
        });
    }

    const rotationDismiss = document.getElementById('rotationPromptDismiss');
    if (rotationDismiss) {
        rotationDismiss.addEventListener('click', () => {
            rotationPromptManager.dismiss();
        });
    }

    const rotationOverlay = document.getElementById('rotationPromptOverlay');
    if (rotationOverlay) {
        rotationOverlay.addEventListener('click', event => {
            if (event.target === rotationOverlay) {
                rotationPromptManager.hide();
            }
        });
    }

    const cyberspaceConfirm = document.getElementById('cyberspaceIllusionaryConfirm');
    if (cyberspaceConfirm) {
        cyberspaceConfirm.addEventListener('click', () => {
            cyberspaceIllusionaryWarningManager.hide();
        });
    }

    const cyberspaceDismiss = document.getElementById('cyberspaceIllusionaryDismiss');
    if (cyberspaceDismiss) {
        cyberspaceDismiss.addEventListener('click', () => {
            cyberspaceIllusionaryWarningManager.suppress();
        });
    }

    const cyberspaceOverlay = document.getElementById('cyberspaceIllusionaryOverlay');
    if (cyberspaceOverlay) {
        cyberspaceOverlay.addEventListener('click', event => {
            if (event.target === cyberspaceOverlay) {
                cyberspaceIllusionaryWarningManager.hide();
            }
        });
    }

    const rollConfirm = document.getElementById('rollWarningConfirm');
    if (rollConfirm) {
        rollConfirm.addEventListener('click', () => {
            largeRollWarningManager.confirm();
        });
    }

    const rollCancel = document.getElementById('rollWarningCancel');
    if (rollCancel) {
        rollCancel.addEventListener('click', () => {
            largeRollWarningManager.cancel();
        });
    }

    const rollOverlay = document.getElementById('rollWarningOverlay');
    if (rollOverlay) {
        rollOverlay.addEventListener('click', event => {
            if (event.target === rollOverlay) {
                largeRollWarningManager.cancel();
            }
        });
    }

    const backgroundApply = document.getElementById('backgroundRollingApply');
    if (backgroundApply) {
        backgroundApply.addEventListener('click', () => {
            backgroundRollingPreference.suppressPrompt = false;
            setBackgroundRollingEnabled(true);
            hideBackgroundRollingOverlay();
        });
    }

    const backgroundApplyPersist = document.getElementById('backgroundRollingApplyPersist');
    if (backgroundApplyPersist) {
        backgroundApplyPersist.addEventListener('click', () => {
            backgroundRollingPreference.suppressPrompt = true;
            setBackgroundRollingEnabled(true);
            hideBackgroundRollingOverlay();
        });
    }

    const backgroundCancel = document.getElementById('backgroundRollingCancel');
    if (backgroundCancel) {
        backgroundCancel.addEventListener('click', () => {
            hideBackgroundRollingOverlay();
        });
    }

    const backgroundOverlay = document.getElementById('backgroundRollingOverlay');
    if (backgroundOverlay) {
        backgroundOverlay.addEventListener('click', event => {
            if (event.target === backgroundOverlay) {
                hideBackgroundRollingOverlay();
            }
        });
    }
});

const BIOME_ICON_OVERRIDES = {
    none: 'files/otherBiomeIcon.png',
    normal: 'files/otherBiomeIcon.png',
    day: 'files/otherBiomeIcon.png',
    night: 'files/otherBiomeIcon.png',
    aurora: 'files/auroraBiomeIcon.png',
    edict: 'files/heavenBiomeIcon.png'
};

function getBiomeIconSource(value) {
    if (!value) {
        return null;
    }
    const runeConfig = resolveRuneConfiguration(value);
    if (runeConfig && runeConfig.icon) {
        return runeConfig.icon;
    }
    const override = BIOME_ICON_OVERRIDES[value];
    if (override) {
        return override;
    }
    return `files/${value}BiomeIcon.png`;
}

function populateBiomeOptionElement(target, option) {
    if (!target || !option) {
        return '';
    }

    const label = option.textContent.trim();
    target.innerHTML = '';

    const iconSource = getBiomeIconSource(option.value);
    if (iconSource) {
        const icon = document.createElement('img');
        icon.className = 'biome-option__icon';
        icon.src = iconSource;
        icon.alt = '';
        icon.loading = 'lazy';
        icon.decoding = 'async';
        icon.setAttribute('aria-hidden', 'true');
        icon.width = 28;
        icon.height = 28;
        icon.draggable = false;
        icon.addEventListener('error', () => {
            icon.classList.add('biome-option__icon--hidden');
        }, { once: true });
        target.appendChild(icon);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'biome-option__label';
    labelSpan.textContent = label;
    target.appendChild(labelSpan);

    target.title = label;
    return label;
}

function initializeSingleSelectControl(selectId) {
    const select = document.getElementById(selectId);
    const details = document.querySelector(`details[data-select="${selectId}"]`);
    if (!select || !details) return;

    const summary = details.querySelector('.interface-select__summary');
    const menu = details.querySelector('.interface-select__menu');
    if (!summary || !menu) return;

    const placeholder = summary.dataset.placeholder || summary.textContent.trim();
    menu.innerHTML = '';

    const isBiomeSelect = selectId === 'biome-dropdown'
        || selectId === BIOME_PRIMARY_SELECT_ID
        || selectId === BIOME_OTHER_SELECT_ID
        || selectId === BIOME_TIME_SELECT_ID;

    const setElementContent = (element, option) => {
        if (!option) {
            element.textContent = '';
            element.removeAttribute('title');
            return;
        }

        if (isBiomeSelect) {
            populateBiomeOptionElement(element, option);
        } else {
            const label = option.textContent.trim();
            element.textContent = label;
            element.title = label;
        }
    };

    const optionButtons = Array.from(select.options).map(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'interface-select__option-button';
        button.dataset.value = option.value;
        setElementContent(button, option);
        button.setAttribute('role', 'option');
        const getConditionMessage = () => {
            const biomeCondition = isBiomeSelect && option.disabled
                ? EVENT_BIOME_CONDITION_MESSAGES[option.value]
                : '';
            return option.dataset.conditionMessage || biomeCondition || '';
        };

        const getConditionLabel = () => option.dataset.conditionLabel
            || (typeof resolveSelectionLabel === 'function'
                ? resolveSelectionLabel(selectId, option.value, {
                    fallbackLabel: isBiomeSelect ? 'Biome' : 'Selection',
                    noneLabel: isBiomeSelect ? 'Biome' : 'Selection'
                })
                : option.textContent.trim());

        const showConditionOverlay = () => {
            const message = getConditionMessage();
            if (!message && !(isBiomeSelect && EVENT_BIOME_CONDITION_MESSAGES[option.value])) {
                return;
            }
            const label = getConditionLabel();
            showBiomeConditionOverlay(option.value, {
                message: message || undefined,
                labelOverride: label || undefined
            });
        };

        button.addEventListener('click', () => {
            if (option.disabled) {
                showConditionOverlay();
                return;
            }
            const valueChanged = select.value !== option.value;
            if (valueChanged) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            details.open = false;
            summary.focus();
            updateSummary();
        });
        menu.appendChild(button);
        return { button, option };
    });

    if (!menu.hasAttribute('role')) {
        menu.setAttribute('role', 'listbox');
    }

    function updateSummary() {
        const selectedOption = select.options[select.selectedIndex];
        const label = selectedOption ? selectedOption.textContent.trim() : placeholder;
        const normalizedLabel = label ? label.trim() : '';

        if (selectedOption) {
            setElementContent(summary, selectedOption);
        } else {
            summary.textContent = normalizedLabel;
            summary.title = normalizedLabel;
        }

        summary.classList.toggle('form-field__input--placeholder', !selectedOption);
        summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');

        optionButtons.forEach(({ button, option }) => {
            const isActive = option.value === select.value;
            const conditionMessage = option.dataset.conditionMessage
                || (isBiomeSelect && option.disabled ? EVENT_BIOME_CONDITION_MESSAGES[option.value] : '');
            const hasConditionHelp = !!conditionMessage;

            setElementContent(button, option);
            button.classList.toggle('interface-select__option-button--active', isActive);
            button.classList.toggle('interface-select__option-button--disabled', option.disabled);
            button.classList.toggle('interface-select__option-button--condition', hasConditionHelp);
            button.disabled = !!option.disabled && !hasConditionHelp;

            if (option.disabled) {
                button.setAttribute('aria-disabled', 'true');
            } else {
                button.removeAttribute('aria-disabled');
            }
        });
    }

    select.addEventListener('change', updateSummary);
    details.addEventListener('toggle', () => {
        summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
    });

    selectWidgetRegistry.set(selectId, { update: updateSummary });

    updateSummary();
}

function refreshCustomSelect(selectId) {
    const registryEntry = selectWidgetRegistry.get(selectId);
    if (registryEntry && typeof registryEntry.update === 'function') {
        registryEntry.update();
    }
}

function findFirstEnabledOption(select, predicate = () => true) {
    if (!select) return null;
    return Array.from(select.options).find(option => !option.disabled && predicate(option));
}

function collectBiomeSelectionState() {
    if (typeof document === 'undefined') {
        return {
            canonicalBiome: 'normal',
            primaryBiome: 'normal',
            timeBiome: 'none',
            runeValue: 'none',
            runeConfig: null,
            runeBiome: null,
            themeBiome: 'normal',
            activeBiomes: ['normal'],
            breakthroughBiomes: ['normal']
        };
    }

    const primarySelect = document.getElementById(BIOME_PRIMARY_SELECT_ID);
    const otherSelect = document.getElementById(BIOME_OTHER_SELECT_ID);
    const timeSelect = document.getElementById(BIOME_TIME_SELECT_ID);

    const primaryBiome = primarySelect ? (primarySelect.value || 'normal') : 'normal';
    const runeValue = otherSelect ? (otherSelect.value || 'none') : 'none';
    const timeBiome = timeSelect ? (timeSelect.value || 'none') : 'none';

    const runeConfig = resolveRuneConfiguration(runeValue);
    const runeBiome = (() => {
        if (!runeConfig) {
            return (runeValue && runeValue !== 'none') ? runeValue : null;
        }
        return runeConfig.canonicalBiome || runeConfig.themeBiome || null;
    })();

    const hasPrimary = primaryBiome && primaryBiome !== 'none';
    const hasDistinctPrimary = hasPrimary && primaryBiome !== 'normal';
    const hasTime = timeBiome && timeBiome !== 'none';

    const canonicalBiome = (() => {
        if (hasDistinctPrimary) {
            return primaryBiome;
        }
        if (hasTime) {
            return timeBiome;
        }
        if (hasPrimary) {
            return primaryBiome;
        }
        return 'normal';
    })();

    const themeBiome = (() => {
        if (hasDistinctPrimary) {
            return primaryBiome;
        }
        if (hasTime) {
            return timeBiome;
        }
        if (hasPrimary) {
            return primaryBiome;
        }
        return canonicalBiome;
    })();

    const activeBiomeSet = new Set();
    if (canonicalBiome && canonicalBiome !== 'none') {
        activeBiomeSet.add(canonicalBiome);
    }
    if (primaryBiome && primaryBiome !== 'none') {
        activeBiomeSet.add(primaryBiome);
    }
    if (timeBiome && timeBiome !== 'none') {
        activeBiomeSet.add(timeBiome);
    }
    if (runeConfig && Array.isArray(runeConfig.activeBiomes)) {
        for (const biomeId of runeConfig.activeBiomes) {
            if (biomeId) {
                activeBiomeSet.add(biomeId);
            }
        }
    }
    if (runeBiome && runeBiome !== 'none') {
        activeBiomeSet.add(runeBiome);
    }
    if (runeConfig && typeof runeConfig.exclusivityBiome === 'string' && runeConfig.exclusivityBiome.length > 0) {
        activeBiomeSet.add(runeConfig.exclusivityBiome);
    }

    const breakthroughCandidates = [];
    if (runeConfig && Array.isArray(runeConfig.breakthroughBiomes)) {
        breakthroughCandidates.push(...runeConfig.breakthroughBiomes);
    }
    if (runeBiome && runeBiome !== 'none') {
        breakthroughCandidates.push(runeBiome);
    }
    if (runeConfig && typeof runeConfig.exclusivityBiome === 'string' && runeConfig.exclusivityBiome.length > 0) {
        breakthroughCandidates.push(runeConfig.exclusivityBiome);
    }
    if (primaryBiome && primaryBiome !== 'none') {
        breakthroughCandidates.push(primaryBiome);
    }
    if (timeBiome && timeBiome !== 'none') {
        breakthroughCandidates.push(timeBiome);
    }
    breakthroughCandidates.push(canonicalBiome);

    const uniqueBreakthroughs = [];
    const seen = new Set();
    for (const candidate of breakthroughCandidates) {
        if (!candidate || seen.has(candidate)) {
            continue;
        }
        seen.add(candidate);
        uniqueBreakthroughs.push(candidate);
    }

    return {
        canonicalBiome,
        primaryBiome,
        timeBiome,
        runeValue,
        runeConfig,
        runeBiome,
        themeBiome,
        activeBiomes: Array.from(activeBiomeSet),
        breakthroughBiomes: uniqueBreakthroughs
    };
}

function computeActiveBiomeValue() {
    const selection = collectBiomeSelectionState();
    return selection.canonicalBiome;
}

function syncActiveBiomeSelection({ forceDispatch = false } = {}) {
    const biomeSelect = document.getElementById('biome-dropdown');
    if (!biomeSelect) {
        return;
    }

    const previousValue = biomeSelect.value;
    const nextValue = computeActiveBiomeValue();

    if (previousValue !== nextValue) {
        biomeSelect.value = nextValue;
        biomeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (forceDispatch) {
        biomeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function updateBiomeControlConstraints({ source = null, triggerSync = true } = {}) {
    const primarySelect = document.getElementById(BIOME_PRIMARY_SELECT_ID);
    const otherSelect = document.getElementById(BIOME_OTHER_SELECT_ID);
    const timeSelect = document.getElementById(BIOME_TIME_SELECT_ID);
    const canonicalSelect = document.getElementById('biome-dropdown');
    if (!primarySelect || !otherSelect || !timeSelect || !canonicalSelect) {
        return;
    }

    let primaryChanged = false;
    let otherChanged = false;
    let timeChanged = false;

    const selectedRuneConfig = resolveRuneConfiguration(otherSelect.value);
    const runeActive = selectedRuneConfig !== null && !oblivionPresetEnabled;

    if (timeSelect.value === 'day' && DAY_RESTRICTED_BIOMES.has(primarySelect.value)) {
        if (source === BIOME_TIME_SELECT_ID) {
            const fallback = findFirstEnabledOption(primarySelect, option => !DAY_RESTRICTED_BIOMES.has(option.value));
            if (fallback) {
                primarySelect.value = fallback.value;
                primaryChanged = true;
            }
        } else {
            timeSelect.value = 'night';
            timeChanged = true;
        }
    }

    if (primarySelect.value === 'limbo' && runeActive) {
        if (source === BIOME_PRIMARY_SELECT_ID) {
            otherSelect.value = 'none';
            otherChanged = true;
        } else {
            const fallback = findFirstEnabledOption(primarySelect, option => option.value !== 'limbo');
            if (fallback) {
                primarySelect.value = fallback.value;
                primaryChanged = true;
            } else {
                otherSelect.value = 'none';
                otherChanged = true;
            }
        }
    }

    const eventDisabledMap = new Map();
    const eventTitleMap = new Map();
    Array.from(canonicalSelect.options).forEach(option => {
        eventDisabledMap.set(option.value, option.disabled);
        eventTitleMap.set(option.value, option.title || '');
    });

    const daySelected = timeSelect.value === 'day';
    Array.from(primarySelect.options).forEach(option => {
        const disabledByEvent = eventDisabledMap.get(option.value) || false;
        let disabledByConflict = false;
        let conflictTitle = '';

        if (daySelected && DAY_RESTRICTED_BIOMES.has(option.value)) {
            disabledByConflict = true;
            conflictTitle = 'Unavailable while Day is selected.';
        }
        if (runeActive && option.value === 'limbo') {
            disabledByConflict = true;
            conflictTitle = 'Unavailable while a rune is active.';
        }

        option.disabled = disabledByEvent || disabledByConflict;
        if (disabledByEvent) {
            const eventTitle = eventTitleMap.get(option.value);
            if (eventTitle) {
                option.title = eventTitle;
            } else if (conflictTitle) {
                option.title = conflictTitle;
            } else {
                option.removeAttribute('title');
            }
        } else if (disabledByConflict) {
            option.title = conflictTitle;
        } else {
            option.removeAttribute('title');
        }
    });

    if (primarySelect.options[primarySelect.selectedIndex]?.disabled) {
        const fallback = findFirstEnabledOption(primarySelect, option => !option.disabled);
        if (fallback) {
            primarySelect.value = fallback.value;
            primaryChanged = true;
        }
    }

    if (oblivionPresetEnabled && selectedRuneConfig !== null) {
        otherSelect.value = 'none';
        otherChanged = true;
    }

    const limboSelected = primarySelect.value === 'limbo';
    if (limboSelected) {
        if (oblivionPresetEnabled) {
            applyOblivionPresetOptions({ activateOblivionPreset: false });
        }
        if (dunePresetEnabled) {
            applyDunePresetOptions({ activateDunePreset: false });
        }
    }
    syncLuckPotionPresetAvailability(limboSelected);

    Array.from(otherSelect.options).forEach(option => {
        const runeOption = resolveRuneConfiguration(option.value);
        let disabled = false;
        let title = '';
        if (oblivionPresetEnabled && runeOption) {
            disabled = true;
            title = 'Unavailable while Oblivion preset is active.';
            option.dataset.conditionMessage = title;
            option.dataset.conditionLabel = option.textContent?.trim() || 'Rune';
        } else if (limboSelected && runeOption) {
            disabled = true;
            title = 'Unavailable while Limbo is selected.';
            option.dataset.conditionMessage = title;
            option.dataset.conditionLabel = option.textContent?.trim() || 'Rune';
        } else {
            option.removeAttribute('data-condition-message');
            option.removeAttribute('data-condition-label');
        }
        option.disabled = disabled;
        if (title) {
            option.title = title;
        } else {
            option.removeAttribute('title');
        }
    });

    if (otherSelect.options[otherSelect.selectedIndex]?.disabled) {
        otherSelect.value = 'none';
        otherChanged = true;
    }

    Array.from(timeSelect.options).forEach(option => {
        let disabled = false;
        let title = '';
        if (option.value === 'day' && DAY_RESTRICTED_BIOMES.has(primarySelect.value)) {
            disabled = true;
            title = 'Unavailable while Pumpkin Moon, Graveyard, or Blood Rain is selected.';
        }
        option.disabled = disabled;
        if (title) {
            option.title = title;
        } else {
            option.removeAttribute('title');
        }
    });

    if (timeSelect.options[timeSelect.selectedIndex]?.disabled) {
        const fallback = findFirstEnabledOption(timeSelect, option => !option.disabled && option.value !== 'none');
        if (fallback) {
            timeSelect.value = fallback.value;
        } else {
            timeSelect.value = 'none';
        }
        timeChanged = true;
    }

    const currentPrimarySelection = primarySelect.value;
    if (currentPrimarySelection !== lastPrimaryBiomeSelection) {
        if (currentPrimarySelection === 'cyberspace' && !cyberspaceIllusionaryWarningManager.isSuppressed()) {
            cyberspaceIllusionaryWarningManager.show();
        }
        const unmetRequirements = EVENT_BIOME_CONDITION_MESSAGES[currentPrimarySelection]
            && !biomeEventRequirementsMet(currentPrimarySelection);
        if (unmetRequirements) {
            showBiomeConditionOverlay(currentPrimarySelection);
        }
        lastPrimaryBiomeSelection = currentPrimarySelection;
    }

    refreshCustomSelect(BIOME_PRIMARY_SELECT_ID);
    refreshCustomSelect(BIOME_OTHER_SELECT_ID);
    refreshCustomSelect(BIOME_TIME_SELECT_ID);

    if (source === BIOME_OTHER_SELECT_ID) {
        updateGlitchPresentation();
    }

    if (triggerSync) {
        syncActiveBiomeSelection({ forceDispatch: primaryChanged || otherChanged || timeChanged });
    }
}

function setupBiomeControlDependencies() {
    const primarySelect = document.getElementById(BIOME_PRIMARY_SELECT_ID);
    const otherSelect = document.getElementById(BIOME_OTHER_SELECT_ID);
    const timeSelect = document.getElementById(BIOME_TIME_SELECT_ID);

    if (!primarySelect || !otherSelect || !timeSelect) {
        return;
    }

    primarySelect.addEventListener('change', () => updateBiomeControlConstraints({ source: BIOME_PRIMARY_SELECT_ID }));
    otherSelect.addEventListener('change', () => updateBiomeControlConstraints({ source: BIOME_OTHER_SELECT_ID }));
    timeSelect.addEventListener('change', () => updateBiomeControlConstraints({ source: BIOME_TIME_SELECT_ID }));

    updateBiomeControlConstraints({ triggerSync: false });
    syncActiveBiomeSelection({ forceDispatch: true });
}

function setPrimaryBiomeSelection(value) {
    const select = document.getElementById(BIOME_PRIMARY_SELECT_ID);
    if (!select) {
        return;
    }
    if (!Array.from(select.options).some(option => option.value === value)) {
        return;
    }
    select.value = value;
    refreshCustomSelect(BIOME_PRIMARY_SELECT_ID);
}

function setOtherBiomeSelection(value) {
    const select = document.getElementById(BIOME_OTHER_SELECT_ID);
    if (!select) {
        return;
    }
    if (!Array.from(select.options).some(option => option.value === value)) {
        return;
    }
    select.value = value;
    refreshCustomSelect(BIOME_OTHER_SELECT_ID);
}

function setTimeBiomeSelection(value) {
    const select = document.getElementById(BIOME_TIME_SELECT_ID);
    if (!select) {
        return;
    }
    if (!Array.from(select.options).some(option => option.value === value)) {
        return;
    }
    select.value = value;
    refreshCustomSelect(BIOME_TIME_SELECT_ID);
}

document.addEventListener('DOMContentLoaded', () => {
    initializeSingleSelectControl('vip-dropdown');
    initializeSingleSelectControl('dave-luck-dropdown');
    initializeSingleSelectControl(BIOME_PRIMARY_SELECT_ID);
    initializeSingleSelectControl(BIOME_OTHER_SELECT_ID);
    initializeSingleSelectControl(BIOME_TIME_SELECT_ID);
});

document.addEventListener('DOMContentLoaded', setupBiomeControlDependencies);

document.addEventListener('DOMContentLoaded', () => {
    hydrateAudioSettings();
    setupFortePixelatedSecret();
    const buttons = document.querySelectorAll('button');
    const inputs = document.querySelectorAll('input');
    const selects = document.querySelectorAll('select');
    const clickSound = clickSoundEffectElement;
    const hoverSound = document.getElementById('hoverSoundFx');

    buttons.forEach(button => {
        button.addEventListener('click', () => playSoundEffect(clickSound, 'ui'));
        button.addEventListener('mouseenter', () => playSoundEffect(hoverSound, 'ui'));
    });

    inputs.forEach(input => {
        input.addEventListener('click', () => playSoundEffect(clickSound, 'ui'));
        input.addEventListener('mouseenter', () => playSoundEffect(hoverSound, 'ui'));
    });

    selects.forEach(select => {
        select.addEventListener('change', () => playSoundEffect(clickSound, 'ui'));
        select.addEventListener('mouseenter', () => playSoundEffect(hoverSound, 'ui'));
    });

    const luckField = document.getElementById('luck-total');
    if (luckField) {
        bindNumericInputFormatting(luckField, { min: 0 });
        if (!luckField.dataset.rawValue) {
            setNumericInputValue(luckField, baseLuck, { format: true, min: 0 });
        }
    }

    const rollField = document.getElementById('roll-total');
    if (rollField) {
        bindNumericInputFormatting(rollField, { min: 1, max: 1000000000000 });
        if (!rollField.dataset.rawValue) {
            setNumericInputValue(rollField, 1, { format: true, min: 1, max: 1000000000000 });
        }
    }

    document.getElementById('vip-dropdown').addEventListener('change', recomputeLuckValue);
    const xyzToggle = document.getElementById('xyz-luck-toggle');
    const sorryToggle = document.getElementById('sorry-luck-toggle');
    const axisToggle = document.getElementById('axis-luck-toggle');
    if (xyzToggle) {
        xyzToggle.addEventListener('change', () => {
            enforceExclusiveEventToggles(xyzToggle);
            if (xyzToggle.checked) {
                disableYgBlessing({ silent: true });
            }
            recomputeLuckValue();
        });
    }
    if (sorryToggle) {
        sorryToggle.addEventListener('change', () => {
            enforceExclusiveEventToggles(sorryToggle);
            if (sorryToggle.checked) {
                disableYgBlessing({ silent: true });
            }
            recomputeLuckValue();
        });
    }
    const xcToggle = document.getElementById('xc-luck-toggle');
    if (xcToggle) {
        xcToggle.addEventListener('change', () => {
            enforceExclusiveEventToggles(xcToggle);
            if (xcToggle.checked) {
                disableYgBlessing({ silent: true });
            }
            recomputeLuckValue();
        });
    }
    if (axisToggle) {
        axisToggle.addEventListener('change', () => {
            enforceExclusiveEventToggles(axisToggle);
            if (axisToggle.checked) {
                disableYgBlessing({ silent: true });
            }
            recomputeLuckValue();
        });
    }
    const dorcelessnessToggle = document.getElementById('dorcelessness-luck-toggle');
    if (dorcelessnessToggle) {
        dorcelessnessToggle.addEventListener('change', () => {
            enforceExclusiveEventToggles(dorcelessnessToggle);
            recomputeLuckValue();
        });
    }
    const daveDropdown = document.getElementById('dave-luck-dropdown');
    if (daveDropdown) {
        daveDropdown.addEventListener('change', recomputeLuckValue);
    }

    const ygBlessingToggle = document.getElementById('yg-blessing-toggle');
    if (ygBlessingToggle) {
        ygBlessingToggle.addEventListener('change', () => {
            if (!ygBlessingToggle.checked) {
                return;
            }
            if (suppressYgBlessingAlert) {
                return;
            }
            if (isAnyToggleActive(YG_BLESSING_BLOCKING_EVENT_IDS)) {
                showYgBlessingOverlay();
                disableYgBlessing({ silent: true });
            }
        });
    }

    if (luckField) {
        luckField.addEventListener('input', () => {
            const raw = luckField.dataset.rawValue ?? '';
            const parsed = raw ? Number.parseFloat(raw) : NaN;
            const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.max(0, parsed) : 0;
            baseLuck = normalized;
            currentLuck = normalized;
            setLuckSelectionSource(LUCK_SELECTION_SOURCE.MANUAL);
            lastVipMultiplier = 1;
            lastXyzMultiplier = 1;
            lastSorryMultiplier = 1;
            lastXcMultiplier = 1;
            lastAxisMultiplier = 1;
            lastDaveMultiplier = 1;
            lastDorcelessnessMultiplier = 1;
            document.getElementById('vip-dropdown').value = '1';
            document.getElementById('sorry-luck-toggle').checked = false;
            document.getElementById('xyz-luck-toggle').checked = false;
            document.getElementById('xc-luck-toggle').checked = false;
            document.getElementById('axis-luck-toggle').checked = false;
            document.getElementById('dorcelessness-luck-toggle').checked = false;
            document.getElementById('yg-blessing-toggle').checked = false;
            refreshCustomSelect('vip-dropdown');
            if (daveDropdown) {
                daveDropdown.value = '1';
                refreshCustomSelect('dave-luck-dropdown');
            }
            syncLuckVisualEffects(baseLuck);
        });
    }

    const biomeDropdown = document.getElementById('biome-dropdown');
    biomeDropdown.addEventListener('change', initializeBiomeInterface);
    initializeBiomeInterface();

    setupShareInterface();
    initializeAudioSettingsPanel();
    const masterMuteToggle = document.getElementById('masterMuteToggle');
    if (masterMuteToggle) {
        masterMuteToggle.addEventListener('click', toggleMasterMute);
    }
    setMasterMuteState(appState.audio.masterMuted, { force: true, persist: false });

    const biomeConditionOverlay = document.getElementById('biomeConditionOverlay');
    const biomeConditionClose = document.getElementById('biomeConditionClose');
    if (biomeConditionOverlay && biomeConditionClose) {
        biomeConditionClose.addEventListener('click', () => concealOverlay(biomeConditionOverlay));
        biomeConditionOverlay.addEventListener('click', event => {
            if (event.target === biomeConditionOverlay) {
                concealOverlay(biomeConditionOverlay);
            }
        });
    }

    const ygBlessingOverlay = document.getElementById('ygBlessingOverlay');
    const ygBlessingClose = document.getElementById('ygBlessingClose');
    if (ygBlessingOverlay && ygBlessingClose) {
        ygBlessingClose.addEventListener('click', () => concealOverlay(ygBlessingOverlay));
        ygBlessingOverlay.addEventListener('click', event => {
            if (event.target === ygBlessingOverlay) {
                concealOverlay(ygBlessingOverlay);
            }
        });
    }

    hydrateVisualSettings();

    const cutsceneToggle = document.getElementById('cinematicToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = appState.cinematic ? 'Cutscenes (Fullscreen recommended): On' : 'Cutscenes (Fullscreen recommended): Off';
        cutsceneToggle.setAttribute('aria-pressed', appState.cinematic ? 'true' : 'false');
    }

    initializeQualityPreferencesMenu();
    applyReducedMotionState(appState.reduceMotion);
    applyQualityPreferencesState();

    hydrateBackgroundRollingPreference();
    setBackgroundRollingEnabled(backgroundRollingPreference.allowed, { persistPreference: false });
    hydrateAuraFilters();
    hydrateAuraTierFilters();

    const backgroundRollingButton = document.getElementById('backgroundRollingButton');
    if (backgroundRollingButton) {
        backgroundRollingButton.addEventListener('click', () => {
            if (appState.backgroundRolling) {
                setBackgroundRollingEnabled(false);
                return;
            }

            if (backgroundRollingPreference.suppressPrompt) {
                setBackgroundRollingEnabled(true);
                return;
            }

            showBackgroundRollingOverlay();
        });
    }

    initializeOptionsMenu('filterMenu', 'filterMenuToggle', 'filterMenuPanel');
    initializeOptionsMenu('optionsMenu', 'optionsMenuToggle', 'optionsMenuPanel');
    initializeAuraTierFilterPanel();
    initializeAuraDetailFilterPanel();

    const yearEl = document.getElementById('build-year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
});

// XP is awarded once per rarity tier. Landing any aura within an inclusive tier range grants that tier's XP
// a single time per simulation run, regardless of how many qualifying entries in AURA_REGISTRY were rolled in that band.
const XP_RARITY_ROWS = Object.freeze([
    ['tier-9k', 9999, 99998, 1000, '1 in 9,999 – 99,998'],
    ['tier-99k', 99999, 999998, 2500, '1 in 99,999 – 999,998'],
    ['tier-999k', 999999, 9999998, 5000, '1 in 999,999 – 9,999,998'],
    ['tier-9m', 9999999, 99999998, 7500, '1 in 9,999,999 – 99,999,998'],
    ['tier-99m', 99999999, 999999998, 15000, '1 in 99,999,999 – 999,999,998'],
    ['tier-999m', 999999999, Number.POSITIVE_INFINITY, 30000, '1 in 999,999,999+']
]);

const XP_RARITY_TABLE = Object.freeze(XP_RARITY_ROWS.map(([key, min, max, xp, label]) => Object.freeze({ key, min, max, xp, label })));

function resolveXpTierForChance(chance) {
    if (!Number.isFinite(chance)) return null;
    return XP_RARITY_TABLE.find(tier => chance >= tier.min && chance <= tier.max) || null;
}

const LIMBO_NATIVE_FILTER = ['limbo', 'limbo-null'];
const GLITCH_BREAKTHROUGH_EXCLUSION_SET = new Set(['day', 'night', 'aurora']);
const NULL_BIOME_FILTER = new Set(['null', 'limbo-null']);
const LEVIATHAN_ALLOWED_BIOMES = new Set(['rainy', 'glitch']);
const MONARCH_ALLOWED_BIOMES = new Set(['corruption', 'glitch']);

function isYgBlessingEnabled() {
    if (typeof document === 'undefined') {
        return false;
    }

    const toggle = document.getElementById('yg-blessing-toggle');
    return Boolean(toggle && toggle.checked);
}

function createAuraEvaluationContext(selection, { eventChecker, luckValue } = {}) {
    const selectionState = selection || collectBiomeSelectionState();
    const biome = selectionState?.canonicalBiome || 'normal';
    const runeConfig = selectionState?.runeConfig || resolveRuneConfiguration(selectionState?.runeValue);
    const runeValue = selectionState?.runeValue || null;
    const primaryBiome = selectionState?.primaryBiome || null;
    const timeBiome = selectionState?.timeBiome || null;
    const exclusivityBiome = runeConfig?.exclusivityBiome || biome;
    const isRoe = biome === 'roe' || runeValue === 'roe';
    const glitchExplicitlySelected = selectionState?.primaryBiome === 'glitch'
        || selectionState?.timeBiome === 'glitch'
        || biome === 'glitch'
        || runeValue === 'glitch';
    const glitchLikeBiome = glitchExplicitlySelected;

    let activeBiomes = Array.isArray(selectionState?.activeBiomes) && selectionState.activeBiomes.length > 0
        ? selectionState.activeBiomes.slice()
        : [exclusivityBiome].filter(Boolean);
    let breakthroughBiomes = Array.isArray(selectionState?.breakthroughBiomes) && selectionState.breakthroughBiomes.length > 0
        ? selectionState.breakthroughBiomes.slice()
        : [exclusivityBiome, biome].filter(Boolean);

    const baseActiveBiomeSet = new Set();
    if (biome && biome !== 'none') {
        baseActiveBiomeSet.add(biome);
    }
    if (primaryBiome && primaryBiome !== 'none') {
        baseActiveBiomeSet.add(primaryBiome);
    }
    if (timeBiome && timeBiome !== 'none') {
        baseActiveBiomeSet.add(timeBiome);
    }
    const baseActiveBiomes = Array.from(baseActiveBiomeSet);

    const baseBreakthroughCandidates = [];
    if (primaryBiome && primaryBiome !== 'none') {
        baseBreakthroughCandidates.push(primaryBiome);
    }
    if (timeBiome && timeBiome !== 'none') {
        baseBreakthroughCandidates.push(timeBiome);
    }
    if (biome && biome !== 'none') {
        baseBreakthroughCandidates.push(biome);
    }
    const baseBreakthroughBiomes = [];
    const baseBreakthroughSeen = new Set();
    for (const candidate of baseBreakthroughCandidates) {
        if (!candidate || baseBreakthroughSeen.has(candidate)) {
            continue;
        }
        baseBreakthroughSeen.add(candidate);
        baseBreakthroughBiomes.push(candidate);
    }

    if (!glitchExplicitlySelected && runeConfig?.exclusivityBiome === 'glitch') {
        activeBiomes = activeBiomes.filter(biomeId => biomeId !== 'glitch');
        breakthroughBiomes = breakthroughBiomes.filter(biomeId => biomeId !== 'glitch');
    }

    return {
        biome,
        isRoe,
        glitchLikeBiome,
        exclusivityBiome,
        eventChecker,
        activeBiomes,
        breakthroughBiomes,
        runeValue,
        primaryBiome,
        timeBiome,
        baseActiveBiomes,
        baseBreakthroughBiomes,
        ygBlessingActive: isYgBlessingEnabled(),
        luckSource: getLuckSelectionSource(),
        luckValue: Number.isFinite(luckValue) ? luckValue : currentLuck
    };
}

function isIllusionaryAura(aura) {
    if (!aura || typeof aura.name !== 'string') {
        return false;
    }
    return aura.name.startsWith('Illusionary');
}

function computeLimboEffectiveChance(aura, context) {
    if (aura.requiresOblivionPreset || aura.requiresDunePreset) return Infinity;
    if (!context.eventChecker(aura)) return Infinity;
    if (!aura.nativeBiomes) return Infinity;
    if (!auraMatchesAnyBiome(aura, LIMBO_NATIVE_FILTER)) return Infinity;

    let effectiveChance = aura.chance;
    const limboBreakthrough = readBreakthroughMultiplier(aura, 'limbo');
    if (limboBreakthrough) {
        effectiveChance = Math.floor(aura.chance / limboBreakthrough);
    }
    return Math.max(1, effectiveChance);
}

function computeStandardEffectiveChance(aura, context) {
    const { biome, exclusivityBiome, glitchLikeBiome, isRoe, activeBiomes, breakthroughBiomes, primaryBiome } = context;
    if (aura.requiresOblivionPreset || aura.requiresDunePreset) return Infinity;

    const eventId = getAuraEventId(aura);
    const eventEnabled = context.eventChecker(aura);
    if (!eventEnabled) return Infinity;

    if (isRoe && ROE_EXCLUSION_SET.has(aura.name)) {
        const matchesActive = Array.isArray(activeBiomes) && activeBiomes.length > 0
            ? auraMatchesAnyBiome(aura, activeBiomes)
            : false;
        if (!matchesActive) {
            const glitchPrimarySelected = primaryBiome === 'glitch';
            if (!glitchPrimarySelected) {
                return Infinity;
            }
        }
    }

    const isRuneIgnoredAura = aura?.name === LEVIATHAN_AURA_NAME || aura?.name === MONARCH_AURA_NAME;
    const resolvedActiveBiomes = isRuneIgnoredAura && Array.isArray(context.baseActiveBiomes)
        ? context.baseActiveBiomes
        : activeBiomes;
    const resolvedBreakthroughBiomes = isRuneIgnoredAura && Array.isArray(context.baseBreakthroughBiomes)
        ? context.baseBreakthroughBiomes
        : breakthroughBiomes;

    let allowCyberspaceNativeRarity = true;
    if (aura.nativeBiomes) {
        if (isAuraNativeTo(aura, 'limbo') && !isAuraNativeTo(aura, 'limbo-null')) {
            return Infinity;
        }

        const allowEventGlitchAccess = glitchLikeBiome
            && eventId
            && eventEnabled
            && GLITCH_EVENT_WHITELIST.has(eventId);

        const activeBiomeList = Array.isArray(resolvedActiveBiomes) && resolvedActiveBiomes.length > 0
            ? resolvedActiveBiomes
            : [exclusivityBiome];
        const matchesActiveBiome = auraMatchesAnyBiome(aura, activeBiomeList);

        const cyberspaceNative = isAuraNativeTo(aura, 'cyberspace');
        const inCyberspace = biome === 'cyberspace';
        const cyberspaceActive = inCyberspace || activeBiomeList.includes('cyberspace');

        if (isIllusionaryAura(aura) && !cyberspaceActive) {
            return Infinity;
        }

        const treatCyberspaceNativeAsNonNative = cyberspaceNative && !cyberspaceActive;
        const resolvedActiveMatch = treatCyberspaceNativeAsNonNative ? true : matchesActiveBiome;

        allowCyberspaceNativeRarity = cyberspaceNative
            ? inCyberspace
            : true;

        if (!isAuraNativeTo(aura, 'limbo-null') && !resolvedActiveMatch && !allowEventGlitchAccess) {
            return Infinity;
        }
    }

    let effectiveChance = aura.chance;
    if (aura.breakthroughs) {
        let breakthroughAppliedViaGlitch = false;

        if (glitchLikeBiome
            && (!isRoe || !ROE_BREAKTHROUGH_BLOCKLIST.has(aura.name))
            && allowCyberspaceNativeRarity) {
            const eligibleBreakthroughs = Array.from(aura.breakthroughs.entries())
                .filter(([biomeId]) => !GLITCH_BREAKTHROUGH_EXCLUSION_SET.has(biomeId));

            if (eligibleBreakthroughs.length > 0) {
                let minChance = aura.chance;
                for (const [, multiplier] of eligibleBreakthroughs) {
                    const scaled = Math.floor(aura.chance / multiplier);
                    if (scaled < minChance) {
                        minChance = scaled;
                    }
                }
                effectiveChance = minChance;
                breakthroughAppliedViaGlitch = true;
            }
        }

        if (!breakthroughAppliedViaGlitch) {
            const candidates = Array.isArray(resolvedBreakthroughBiomes) && resolvedBreakthroughBiomes.length > 0
                ? resolvedBreakthroughBiomes
                : [exclusivityBiome, biome].filter(Boolean);
            let multiplier = null;
            for (const candidate of candidates) {
                if (!allowCyberspaceNativeRarity && candidate === 'cyberspace') {
                    continue;
                }
                multiplier = readBreakthroughMultiplier(aura, candidate);
                if (multiplier) {
                    break;
                }
            }
            if (!multiplier && exclusivityBiome && !candidates.includes(exclusivityBiome)) {
                multiplier = readBreakthroughMultiplier(aura, exclusivityBiome);
            }
            if (!multiplier && biome && !candidates.includes(biome)) {
                multiplier = readBreakthroughMultiplier(aura, biome);
            }
            if (multiplier) {
                effectiveChance = Math.floor(aura.chance / multiplier);
            }
        }
    }

    return Math.max(1, effectiveChance);
}

function determineAuraEffectiveChance(aura, context) {
    if (aura?.name === BREAKTHROUGH_AURA_NAME) {
        const canonicalBiome = context?.biome || 'normal';
        if (NULL_BIOME_FILTER.has(canonicalBiome)) {
            return Infinity;
        }
    }
    if (aura?.name === LEVIATHAN_AURA_NAME) {
        const canonicalBiome = context?.biome || 'normal';
        const inAllowedBiome = LEVIATHAN_ALLOWED_BIOMES.has(canonicalBiome);
        if (!inAllowedBiome) {
            return Infinity;
        }
    }
    if (aura?.name === MONARCH_AURA_NAME) {
        const canonicalBiome = context?.biome || 'normal';
        const inAllowedBiome = MONARCH_ALLOWED_BIOMES.has(canonicalBiome);
        if (!inAllowedBiome) {
            return Infinity;
        }
    }
    if (aura?.requiresYgBlessing) {
        const blessingActive = context?.ygBlessingActive === true;
        const canonicalBiome = context?.biome || 'normal';
        if (!blessingActive) {
            return Infinity;
        }
        if (canonicalBiome === 'limbo' || canonicalBiome === 'limbo-null') {
            return Infinity;
        }
    }

    if (context.biome === 'limbo') {
        return computeLimboEffectiveChance(aura, context);
    }
    return computeStandardEffectiveChance(aura, context);
}

function buildComputedAuraEntries(registry, context, luckValue, breakthroughStatsMap) {
    const evaluated = [];
    for (const aura of registry) {
        const effectiveChance = determineAuraEffectiveChance(aura, context);
        if (!Number.isFinite(effectiveChance)) {
            setAuraEffectiveChance(aura, Number.POSITIVE_INFINITY);
            continue;
        }
        setAuraEffectiveChance(aura, effectiveChance);

        const usesBreakthrough = effectiveChance !== aura.chance;
        const breakthroughStats = usesBreakthrough ? { count: 0, btChance: effectiveChance } : null;
        if (breakthroughStats) {
            breakthroughStatsMap.set(aura.name, breakthroughStats);
        }

        let successThreshold;
        if (aura.ignoreLuck) {
            const fixedThreshold = Number.isFinite(aura.fixedRollThreshold) ? aura.fixedRollThreshold : 1;
            successThreshold = Math.max(0, Math.min(effectiveChance, fixedThreshold));
        } else {
            successThreshold = Math.min(effectiveChance, luckValue);
        }

        const successRatio = successThreshold > 0 ? successThreshold / effectiveChance : 0;
        evaluated.push({ aura, successRatio, breakthroughStats, effectiveChance });
    }

    evaluated.sort((a, b) => b.effectiveChance - a.effectiveChance);
    return evaluated;
}

function buildResultEntries(registry, biome, breakthroughStatsMap) {
    let entries = [];
    for (const aura of registry) {
        if (isAuraTierSkipped(aura, biome) || isAuraFiltered(aura)) {
            continue;
        }
        const winCount = readAuraWinCount(aura);
        if (winCount <= 0) continue;

        const specialClass = typeof resolveAuraStyleClass === 'function' ? resolveAuraStyleClass(aura, biome) : '';
        const rarityClass = typeof resolveRarityClass === 'function' && !shouldSuppressRarityClassForSpecialStyle(specialClass)
            ? resolveRarityClass(aura, biome)
            : '';
        const eventClass = getAuraEventId(aura) ? 'sigil-event-text' : '';
        const classAttr = [rarityClass, specialClass, eventClass].filter(Boolean).join(' ');
        const formattedName = formatAuraNameMarkup(aura);
        const formattedTextName = formatAuraNameText(aura);
        const breakthroughStats = breakthroughStatsMap.get(aura.name);
        const isBreakthrough = aura.name.startsWith('Breakthrough');

        const formatBreakthroughMarkupWithCount = (nameValue, countValue) => {
            const [namePart, ...restParts] = nameValue.split(' - ');
            const suffixText = restParts.length > 0 ? ` - ${restParts.join(' - ')}` : '';
            const detailText = `${suffixText} | Times Rolled: ${formatWithCommas(countValue)}`;
            return `<span class="sigil-effect-breakthrough__title">${namePart.toUpperCase()}</span>` +
                `<span class="sigil-effect-breakthrough__suffix">${detailText}</span>`;
        };

        const eventId = getAuraEventId(aura);
        const specialClassTokens = specialClass
            ? specialClass.split(/\s+/).filter(Boolean)
            : [];
        const shareSpecialTokens = specialClassTokens.slice();
        if (eventId === 'winter26' && !shareSpecialTokens.includes('sigil-outline-winter')) {
            shareSpecialTokens.push('sigil-outline-winter');
        }
        const isBreakthroughAura = aura.name.startsWith('Breakthrough');

        const createShareVisualRecord = (baseName, countValue, options = {}) => ({
            aura,
            displayName: isBreakthroughAura
                ? `${baseName} | Times Rolled: ${formatWithCommas(countValue)}`
                : baseName,
            subtitle: aura.subtitle || null,
            prefix: typeof options.prefix === 'string' && options.prefix.length > 0 ? options.prefix : null,
            variant: options.variant || 'standard',
            count: countValue,
            countLabel: isBreakthroughAura ? null : `Times Rolled: ${formatWithCommas(countValue)}`,
            classes: {
                rarity: rarityClass || null,
                special: shareSpecialTokens,
                event: Boolean(eventId)
            }
        });

        const pushVisualEntry = (markup, shareText, priority, visualRecord, auraName) => {
            entries.push({ markup, share: shareText, priority, visual: visualRecord || null, auraName: auraName || null });
        };

        if (breakthroughStats && breakthroughStats.count > 0) {
            const btName = aura.name.replace(/-\s*[\d,]+/, `- ${formatWithCommas(breakthroughStats.btChance)}`);
            const nativeLabel = isBreakthrough
                ? formatBreakthroughMarkupWithCount(btName, breakthroughStats.count)
                : formatAuraNameMarkup(aura, btName);
            const nativeShareName = formatAuraNameText(aura, btName);
            pushVisualEntry(
                isBreakthrough
                    ? `<span class="${classAttr}">[Native] ${nativeLabel}</span>`
                    : `<span class="${classAttr}">[Native] ${nativeLabel} | Times Rolled: ${formatWithCommas(breakthroughStats.count)}</span>`,
                `[Native] ${nativeShareName} | Times Rolled: ${formatWithCommas(breakthroughStats.count)}`,
                determineResultPriority(aura, breakthroughStats.btChance),
                createShareVisualRecord(btName, breakthroughStats.count, { prefix: '[Native]', variant: 'native' }),
                aura.name
            );

            if (winCount > breakthroughStats.count) {
                const remainingCount = winCount - breakthroughStats.count;
                const breakthroughRemainingLabel = isBreakthrough
                    ? formatBreakthroughMarkupWithCount(aura.name, remainingCount)
                    : formattedName;
                pushVisualEntry(
                    isBreakthrough
                        ? `<span class="${classAttr}">${breakthroughRemainingLabel}</span>`
                        : `<span class="${classAttr}">${formattedName} | Times Rolled: ${formatWithCommas(remainingCount)}</span>`,
                    `${formattedTextName} | Times Rolled: ${formatWithCommas(remainingCount)}`,
                    determineResultPriority(aura, aura.chance),
                    createShareVisualRecord(aura.name, remainingCount, { variant: 'standard' }),
                    aura.name
                );
            }
        } else {
            const breakthroughLabel = isBreakthrough
                ? formatBreakthroughMarkupWithCount(aura.name, winCount)
                : formattedName;
            pushVisualEntry(
                isBreakthrough
                    ? `<span class="${classAttr}">${breakthroughLabel}</span>`
                    : `<span class="${classAttr}">${formattedName} | Times Rolled: ${formatWithCommas(winCount)}</span>`,
                `${formattedTextName} | Times Rolled: ${formatWithCommas(winCount)}`,
                determineResultPriority(aura, aura.chance),
                createShareVisualRecord(aura.name, winCount, { variant: 'standard' }),
                aura.name
            );
        }
    }

    // Primary sort by computed priority
    entries.sort((a, b) => b.priority - a.priority);

    // Ensure Illusionary entries are always at the very top
    const illusionaryEntries = entries.filter(e => typeof e.auraName === 'string' && e.auraName.startsWith('Illusionary'));
    if (illusionaryEntries.length > 0) {
        // Remove all Illusionary entries from the array
        entries = entries.filter(e => !(typeof e.auraName === 'string' && e.auraName.startsWith('Illusionary')));
        // Prepend them in original discovered order
        entries = [...illusionaryEntries, ...entries];
    }

    // Ensure Cryogenic entries appear above Equinox entries
    const cryogenicEntries = entries.filter(e => typeof e.auraName === 'string' && e.auraName.startsWith('Cryogenic'));
    if (cryogenicEntries.length > 0) {
        // Remove Cryogenic entries
        entries = entries.filter(e => !(typeof e.auraName === 'string' && e.auraName.startsWith('Cryogenic')));
        // Find first Equinox index
        const equinoxIndex = entries.findIndex(e => typeof e.auraName === 'string' && e.auraName.startsWith('Equinox'));
        const insertIndex = equinoxIndex >= 0 ? equinoxIndex : 0;
        // Insert Cryogenic entries before Equinox (or at top if Equinox missing)
        entries.splice(insertIndex, 0, ...cryogenicEntries);
    }
    const markupList = [];
    const shareRecords = [];
    const shareVisualRecords = [];
    for (const entry of entries) {
        markupList.push(entry.markup);
        if (entry.share) {
            shareRecords.push(entry.share);
        }
        if (entry.visual) {
            shareVisualRecords.push(entry.visual);
        }
    }

    return { markupList, shareRecords, shareVisualRecords };
}

function summarizeXpRewards(registry) {
    const earnedTiers = new Set();
    registry.forEach(aura => {
        if (readAuraWinCount(aura) > 0) {
            const tier = resolveXpTierForChance(aura.chance);
            if (tier) {
                earnedTiers.add(tier.key);
            }
        }
    });

    let totalXp = 0;
    const lines = [];
    for (const tier of XP_RARITY_TABLE) {
        if (earnedTiers.has(tier.key)) {
            totalXp += tier.xp;
            lines.push(`Reached ${tier.label}: +${formatWithCommas(tier.xp)} XP`);
        }
    }

    return { totalXp, lines };
}

function clearHarvesterCurseLayer() {
    if (typeof document === 'undefined') return;
    if (harvesterCurseTimeoutId !== null) {
        clearTimeout(harvesterCurseTimeoutId);
        harvesterCurseTimeoutId = null;
    }
    const existing = document.getElementById(HARVESTER_CURSE_LAYER_ID);
    if (existing && existing.parentElement) {
        existing.parentElement.removeChild(existing);
    }
}

function renderHarvesterCurseLayer(count) {
    if (typeof document === 'undefined') return;
    clearHarvesterCurseLayer();

    if (!count || count <= 0) {
        return;
    }

    const layer = document.createElement('div');
    layer.id = HARVESTER_CURSE_LAYER_ID;
    layer.className = 'harvester-curse';

    const visibleStacks = Math.min(count, 24);
    for (let i = 0; i < visibleStacks; i++) {
        const card = document.createElement('div');
        card.className = 'harvester-curse__card';
        card.style.setProperty('--harvester-tilt', `${(Math.random() * 12 - 6).toFixed(2)}deg`);
        card.style.setProperty('--harvester-delay', `${Math.floor(Math.random() * 120)}ms`);
        card.style.setProperty('--harvester-rumble-speed', `${70 + Math.floor(Math.random() * 60)}ms`);
        card.style.setProperty('--harvester-jux-speed', `${55 + Math.floor(Math.random() * 45)}ms`);
        card.style.left = `${4 + Math.random() * 92}vw`;
        card.style.top = `${4 + Math.random() * 92}vh`;
        card.innerHTML = [
            '<span class="harvester-curse__line harvester-curse__line--i">I</span>',
            '<span class="harvester-curse__line">HATE</span>',
            '<span class="harvester-curse__line harvester-curse__line--jux">JUX</span>'
        ].join('');
        layer.appendChild(card);
    }

    document.body.appendChild(layer);

    const lifetimeMs = Math.min(14000, 5000 + (visibleStacks * 320));
    harvesterCurseTimeoutId = setTimeout(() => {
        harvesterCurseTimeoutId = null;
        clearHarvesterCurseLayer();
    }, lifetimeMs);
}

function requestRollCancellation() {
    if (!simulationActive || cancelRollRequested) {
        return;
    }

    cancelRollRequested = true;
    const { cancelRollButton } = uiHandles;
    if (cancelRollButton) {
        cancelRollButton.disabled = true;
        cancelRollButton.textContent = 'Cancelling...';
    }
}

function setupRollCancellationControl() {
    const { cancelRollButton } = uiHandles;
    if (!cancelRollButton) {
        return;
    }

    cancelRollButton.addEventListener('click', () => {
        requestRollCancellation();
    });
}

function shouldScheduleBackgroundWork() {
    // Always prefer timer-based scheduling when background rolling is enabled.
    // Using requestAnimationFrame will pause entirely once the tab becomes
    // hidden, which prevents long simulations from continuing in the
    // background. Timers continue to fire (even if throttled), so they keep
    // work progressing when the page is inactive.
    return Boolean(appState && appState.backgroundRolling);
}

function queueSimulationWork(callback) {
    if (typeof callback !== 'function') {
        return;
    }

    const preferTimers = shouldScheduleBackgroundWork();

    if (preferTimers && typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(callback, 16);
        return;
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(callback);
        return;
    }

    setTimeout(callback, 16);
}

// Run the roll simulation while keeping the UI responsive
function runRollSimulation(options = {}) {
    if (simulationActive) return;

    if (!feedContainer) {
        feedContainer = document.getElementById('simulation-feed');
    }
    if (!luckField) {
        luckField = document.getElementById('luck-total');
    }

    if (!feedContainer || !luckField) {
        return;
    }

    clearHarvesterCurseLayer();

    const {
        rollTriggerButton,
        cancelRollButton,
        brandMark,
        rollCountInput,
        biomeSelector,
        progressPanel,
        progressBarFill,
        progressLabel,
        audio
    } = uiHandles;

    if (!rollTriggerButton || !rollCountInput || !luckField) {
        return;
    }

    const bypassRollWarning = Boolean(options && options.bypassRollWarning);
    const bypassRotationPrompt = Boolean(options && options.bypassRotationPrompt);
    const totalOverride = options && Number.isFinite(options.totalOverride)
        ? Number.parseInt(options.totalOverride, 10)
        : null;

    const rollInputValue = getNumericInputValue(rollCountInput, { min: 1, max: 1000000000000 });
    let total = Number.isFinite(totalOverride)
        ? totalOverride
        : rollInputValue;

    if (!Number.isFinite(total) || total <= 0) {
        total = 1;
    }

    if (!bypassRotationPrompt && rotationPromptManager.shouldPrompt()) {
        rotationPromptManager.prompt(() => runRollSimulation({
            ...options,
            bypassRotationPrompt: true,
            totalOverride: total
        }));
        return;
    }

    if (!bypassRollWarning && total > LARGE_ROLL_WARNING_THRESHOLD) {
        largeRollWarningManager.prompt(total, () => runRollSimulation({
            bypassRollWarning: true,
            totalOverride: total
        }));
        return;
    }

    const shouldFormatRolls = document.activeElement !== rollCountInput;
    setNumericInputValue(rollCountInput, total, { format: shouldFormatRolls, min: 1, max: 1000000000000 });

    simulationActive = true;
    cancelRollRequested = false;
    rollTriggerButton.disabled = true;
    rollTriggerButton.style.opacity = '0.5';
    if (cancelRollButton) {
        cancelRollButton.hidden = false;
        cancelRollButton.disabled = false;
        cancelRollButton.textContent = 'Cancel Roll';
    }
    if (brandMark) {
        brandMark.classList.add('banner__emblem--spinning');
    }

    playSoundEffect(audio.roll, 'obtain');
    if (total >= 10000000) {
        playSoundEffect(audio.explosion, 'obtain');
    }

    let parsedLuck = getNumericInputValue(luckField, { min: 0 });
    if (!Number.isFinite(parsedLuck)) {
        parsedLuck = 1;
        const shouldFormatLuck = document.activeElement !== luckField;
        setNumericInputValue(luckField, parsedLuck, { format: shouldFormatLuck, min: 0 });
    }
    const luckValue = Math.max(0, parsedLuck);
    const selectionState = collectBiomeSelectionState();
    const biome = selectionState.canonicalBiome;
    const primaryBiome = selectionState.primaryBiome;
    const runeValue = selectionState.runeValue;
    const timeBiome = selectionState.timeBiome;

    const eventSnapshot = enabledEvents.size > 0 ? new Set(enabledEvents) : null;
    const isEventAuraEnabled = aura => {
        const eventId = getAuraEventId(aura);
        return !eventId || (eventSnapshot ? eventSnapshot.has(eventId) : enabledEvents.has(eventId));
    };

    feedContainer.innerHTML = 'Rolling...';
    let rolls = 0;
    const startTime = performance.now();

    resetAuraRollState(AURA_REGISTRY);

    const breakthroughStatsMap = new Map();

    const PROGRESS_DECIMAL_PLACES = 2;
    const PROGRESS_ROUNDING_STEP = 1 / (10 ** PROGRESS_DECIMAL_PLACES);
    const formatProgressLabel = value => value.toFixed(PROGRESS_DECIMAL_PLACES);

    const progressElementsAvailable = progressPanel && progressBarFill && progressLabel;
    const showProgress = progressElementsAvailable;
    if (progressPanel) {
        progressPanel.style.display = showProgress ? 'grid' : 'none';
        progressPanel.classList.toggle('loading-indicator--active', showProgress);
        if (!showProgress) {
            delete progressPanel.dataset.loadingIndicator;
        }
    }
    if (progressElementsAvailable) {
        const formattedInitialProgress = formatProgressLabel(0);
        progressBarFill.style.width = '0%';
        progressLabel.textContent = `${formattedInitialProgress}%`;
        if (showProgress && progressPanel) {
            progressPanel.dataset.loadingIndicator = formattedInitialProgress;
        }
    }

    const evaluationContext = createAuraEvaluationContext(selectionState, {
        eventChecker: isEventAuraEnabled,
        eventSnapshot,
        luckValue
    });
    const computedAuras = buildComputedAuraEntries(AURA_REGISTRY, evaluationContext, luckValue, breakthroughStatsMap);
    const lucklessAuras = computedAuras.filter(entry => entry.aura && entry.aura.ignoreLuck);
    const luckAffectedAuras = computedAuras.filter(entry => !entry.aura || !entry.aura.ignoreLuck);

    const activeDuneAura = (dunePresetEnabled && baseLuck >= DUNE_LUCK_TARGET) ? duneAuraData : null;
    const activeOblivionAura = (oblivionPresetEnabled && luckValue >= OBLIVION_LUCK_TARGET) ? oblivionAuraData : null;
    const activeMemoryAura = (oblivionPresetEnabled && luckValue >= OBLIVION_LUCK_TARGET) ? memoryAuraData : null;
    const duneProbability = activeDuneAura ? 1 / DUNE_POTION_ODDS : 0;
    const memoryProbability = activeMemoryAura ? 1 / OBLIVION_MEMORY_ODDS : 0;
    const oblivionProbability = activeOblivionAura ? 1 / OBLIVION_POTION_ODDS : 0;
    const cutscenesEnabled = appState.cinematic === true;

    const queueAnimationFrame = callback => queueSimulationWork(callback);
    const updateProgress = showProgress
        ? (() => {
            let lastProgressValue = null;
            return progress => {
                const progressValueRounded = Math.floor(progress / PROGRESS_ROUNDING_STEP) * PROGRESS_ROUNDING_STEP;
                const formattedProgressValue = formatProgressLabel(progressValueRounded);
                if (formattedProgressValue === lastProgressValue && progress < 100) {
                    return;
                }
                lastProgressValue = formattedProgressValue;
                progressBarFill.style.width = `${progress}%`;
                progressLabel.textContent = `${formattedProgressValue}%`;
                progressPanel.dataset.loadingIndicator = `${formattedProgressValue}`;
            };
        })()
        : null;

    const MAX_FRAME_DURATION = 18;
    const MAX_ROLLS_PER_CHUNK = Math.min(500000, Math.max(80000, Math.ceil(total / 90)));
    const CHECK_INTERVAL = Math.max(1024, Math.floor(MAX_ROLLS_PER_CHUNK / 28));
    let currentRoll = 0;

    const sampleEntropy = (typeof drawEntropy === 'function') ? drawEntropy : Math.random;

    const finalizeSimulation = cancelled => {
        if (progressPanel) {
            progressPanel.style.display = 'none';
            progressPanel.classList.remove('loading-indicator--active');
            delete progressPanel.dataset.loadingIndicator;
        }
        rollTriggerButton.disabled = false;
        rollTriggerButton.style.opacity = '1';
        if (brandMark) {
            brandMark.classList.remove('banner__emblem--spinning');
        }
        if (cancelRollButton) {
            cancelRollButton.hidden = true;
            cancelRollButton.disabled = false;
            cancelRollButton.textContent = 'Cancel Roll';
        }
        simulationActive = false;
        cancelRollRequested = false;

        if (cancelled) {
            feedContainer.textContent = 'Rolling canceled.';
            clearHarvesterCurseLayer();
            return;
        }

        const endTime = performance.now();
        const executionTime = ((endTime - startTime) / 1000).toFixed(0);

        if (cutscenesEnabled) {
            const cutsceneQueue = [];
            for (const videoId of CUTSCENE_PRIORITY_SEQUENCE) {
                const aura = AURA_REGISTRY.find(entry => entry.cutscene === videoId);
                if (aura && readAuraWinCount(aura) > 0 && !shouldSkipAuraCutscene(aura, biome)) {
                    cutsceneQueue.push(videoId);
                }
            }
            if (cutsceneQueue.length > 0) {
                playAuraSequence(cutsceneQueue);
            }
        }

        let highestChance = 0;
        for (const aura of AURA_REGISTRY) {
            if (readAuraWinCount(aura) > 0 && aura.chance > highestChance) {
                highestChance = aura.chance;
            }
        }

        if (highestChance >= 99999999) {
            if (biome === 'limbo') {
                playSoundEffect(audio.limbo99m, 'obtain');
            } else {
                playSoundEffect(audio.m100, 'obtain');
            }
        } else if (highestChance >= 10000000) {
            playSoundEffect(audio.m10, 'obtain');
        } else if (highestChance >= 1000000) {
            playSoundEffect(audio.k100, 'obtain');
        } else if (highestChance >= 100000) {
            playSoundEffect(audio.k10, 'obtain');
        } else if (highestChance >= 1000) {
            playSoundEffect(audio.k1, 'obtain');
        }

        const biomeLabel = resolveSelectionLabel(
            BIOME_PRIMARY_SELECT_ID,
            primaryBiome,
            { noneLabel: 'None', fallbackLabel: biome || 'Unknown' }
        );
        const runeLabel = resolveSelectionLabel(
            BIOME_OTHER_SELECT_ID,
            runeValue,
            { noneLabel: 'None', fallbackLabel: 'None' }
        );
        const timeLabel = resolveSelectionLabel(
            BIOME_TIME_SELECT_ID,
            timeBiome,
            { noneLabel: 'Neutral', fallbackLabel: timeBiome || 'Neutral' }
        );

        const usedEventIds = eventSnapshot ? Array.from(eventSnapshot) : [];
        const eventLabels = usedEventIds.map(id => EVENT_LABEL_MAP.get(id) || id);
        const eventSummaryText = eventLabels.length > 0 ? eventLabels.join(', ') : EVENT_SUMMARY_EMPTY_LABEL;
        const auraFilterSummaryText = getAuraFilterSummaryText();

        const resultChunks = [
            `Execution time: ${executionTime} seconds.<br>`,
            `Rolls: ${formatWithCommas(rolls)}<br>`,
            `Luck: ${formatWithCommas(luckValue)}<br>`,
            `Biome: ${biomeLabel}<br>`,
            `Rune: ${runeLabel}<br>`,
            `Time: ${timeLabel}<br>`,
            `Events: ${eventSummaryText}<br>`,
            `Included Aura Tiers: ${auraFilterSummaryText}<br><br>`
        ];

        const { markupList, shareRecords, shareVisualRecords } = buildResultEntries(AURA_REGISTRY, biome, breakthroughStatsMap);
        for (const markup of markupList) {
            resultChunks.push(`${markup}<br>`);
        }

        const { totalXp, lines: xpLines } = summarizeXpRewards(AURA_REGISTRY);
        resultChunks.push(`<br><strong>Total XP Earned: ${formatWithCommas(totalXp)}</strong><br>`);
        for (const line of xpLines) {
            resultChunks.push(`${line}<br>`);
        }

        feedContainer.innerHTML = resultChunks.join('');

        const harvesterAura = AURA_REGISTRY.find(aura => aura.name === HARVESTER_AURA_NAME) || null;
        const harvesterCount = harvesterAura ? readAuraWinCount(harvesterAura) : 0;
        const halloween24Active = eventSnapshot
            ? eventSnapshot.has(HALLOWEEN_2024_EVENT_ID)
            : enabledEvents.has(HALLOWEEN_2024_EVENT_ID);

        if (halloween24Active && harvesterCount > 0) {
            renderHarvesterCurseLayer(harvesterCount);
        } else {
            clearHarvesterCurseLayer();
        }

        const executionSeconds = Number.parseFloat(executionTime);
        lastSimulationSummary = {
            rolls,
            luck: luckValue,
            biomeId: biome,
            biomeLabel,
            primaryBiomeId: primaryBiome,
            primaryBiomeLabel: biomeLabel,
            runeId: runeValue,
            runeLabel,
            timeId: timeBiome,
            timeLabel,
            eventIds: usedEventIds,
            eventLabels,
            shareRecords,
            shareVisuals: shareVisualRecords,
            xpTotal: totalXp,
            xpLines,
            auraFilterSummary: auraFilterSummaryText,
            auraFilterTiers: getIncludedAuraTierLabels(),
            executionSeconds: Number.isFinite(executionSeconds) ? executionSeconds : 0
        };
    };

    const lucklessAuraCandidates = lucklessAuras.filter(entry => entry.successRatio > 0);
    const luckAffectedAuraCandidates = luckAffectedAuras.filter(entry => entry.successRatio > 0);
    const lucklessAuraCount = lucklessAuraCandidates.length;
    const luckAffectedAuraCount = luckAffectedAuraCandidates.length;

    const lucklessAuraList = new Array(lucklessAuraCount);
    const lucklessAuraRatios = new Array(lucklessAuraCount);
    const lucklessBreakthroughStats = new Array(lucklessAuraCount);

    for (let i = 0; i < lucklessAuraCount; i++) {
        const entry = lucklessAuraCandidates[i];
        lucklessAuraList[i] = entry.aura;
        lucklessAuraRatios[i] = entry.successRatio;
        lucklessBreakthroughStats[i] = entry.breakthroughStats || null;
    }

    const luckAffectedAuraList = new Array(luckAffectedAuraCount);
    const luckAffectedAuraRatios = new Array(luckAffectedAuraCount);
    const luckAffectedBreakthroughStats = new Array(luckAffectedAuraCount);

    for (let i = 0; i < luckAffectedAuraCount; i++) {
        const entry = luckAffectedAuraCandidates[i];
        luckAffectedAuraList[i] = entry.aura;
        luckAffectedAuraRatios[i] = entry.successRatio;
        luckAffectedBreakthroughStats[i] = entry.breakthroughStats || null;
    }

    const buildWeightedSelection = ratios => {
        const count = ratios.length;
        if (!count) {
            return null;
        }

        const cumulativeWeights = new Array(count);
        let remainingProbability = 1;
        let totalProbability = 0;

        for (let i = 0; i < count; i++) {
            const ratio = ratios[i];
            const weight = remainingProbability * ratio;
            totalProbability += weight;
            cumulativeWeights[i] = totalProbability;
            remainingProbability *= (1 - ratio);

            if (remainingProbability <= 0) {
                for (let j = i + 1; j < count; j++) {
                    cumulativeWeights[j] = totalProbability;
                }
                break;
            }
        }

        return { cumulativeWeights, totalProbability };
    };

    const selectWeightedIndex = (selection, randomValue) => {
        if (!selection || selection.totalProbability <= 0 || randomValue >= selection.totalProbability) {
            return -1;
        }

        const { cumulativeWeights } = selection;
        let low = 0;
        let high = cumulativeWeights.length - 1;

        while (low < high) {
            const mid = (low + high) >> 1;
            if (randomValue < cumulativeWeights[mid]) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return low;
    };

    const prerollAuraList = [];
    const prerollAuraRatios = [];

    if (duneProbability > 0 && activeDuneAura) {
        prerollAuraList.push(activeDuneAura);
        prerollAuraRatios.push(duneProbability);
    }
    if (memoryProbability > 0 && activeMemoryAura) {
        prerollAuraList.push(activeMemoryAura);
        prerollAuraRatios.push(memoryProbability);
    }
    if (oblivionProbability > 0 && activeOblivionAura) {
        prerollAuraList.push(activeOblivionAura);
        prerollAuraRatios.push(oblivionProbability);
    }

    const prerollSelection = buildWeightedSelection(prerollAuraRatios);
    const lucklessSelection = buildWeightedSelection(lucklessAuraRatios);
    const luckAffectedSelection = buildWeightedSelection(luckAffectedAuraRatios);

    function performSingleRollCheck() {
        const prerollIndex = selectWeightedIndex(prerollSelection, sampleEntropy());
        if (prerollIndex !== -1) {
            recordAuraWin(prerollAuraList[prerollIndex]);
            rolls++;
            return;
        }

        const lucklessIndex = selectWeightedIndex(lucklessSelection, sampleEntropy());
        if (lucklessIndex !== -1) {
            recordAuraWin(lucklessAuraList[lucklessIndex]);
            const stats = lucklessBreakthroughStats[lucklessIndex];
            if (stats) {
                stats.count++;
            }
            rolls++;
            return;
        }

        const luckAffectedIndex = selectWeightedIndex(luckAffectedSelection, sampleEntropy());
        if (luckAffectedIndex !== -1) {
            recordAuraWin(luckAffectedAuraList[luckAffectedIndex]);
            const stats = luckAffectedBreakthroughStats[luckAffectedIndex];
            if (stats) {
                stats.count++;
            }
        }

        rolls++;
    }

    function processRollSequence() {
        if (cancelRollRequested) {
            finalizeSimulation(true);
            return;
        }

        const deadline = performance.now() + MAX_FRAME_DURATION;
        let processedThisChunk = 0;
        let timeCheckCounter = 0;

        while (currentRoll < total && processedThisChunk < MAX_ROLLS_PER_CHUNK) {
            performSingleRollCheck();
            currentRoll++;
            processedThisChunk++;
            timeCheckCounter++;

            if (timeCheckCounter >= CHECK_INTERVAL) {
                if (performance.now() >= deadline) {
                    break;
                }
                timeCheckCounter = 0;
            }
        }

        if (updateProgress) {
            const progress = (currentRoll / total) * 100;

            queueAnimationFrame(() => updateProgress(progress));

        }

        if (currentRoll < total) {
            queueAnimationFrame(processRollSequence);
            return;
        }

        finalizeSimulation(false);

    }

    queueAnimationFrame(processRollSequence);
}

function setupShareInterface() {
    if (typeof document === 'undefined') return;
    const controls = document.getElementById('feedShareControls');
    const trigger = document.getElementById('feedShareButton');
    const menu = document.getElementById('feedShareMenu');
    const imageMenu = document.getElementById('feedShareImageMenu');
    if (!controls || !trigger || !menu) return;

    const defaultLabel = trigger.textContent ? trigger.textContent.trim() : '';
    trigger.dataset.defaultLabel = defaultLabel || 'Share Result';

    let pendingImageModeResolve = null;

    const finalizeImageMenu = (value, restoreFocus) => {
        const wasOpen = imageMenu && !imageMenu.hidden;
        const hadPending = Boolean(pendingImageModeResolve);
        if (imageMenu && !imageMenu.hidden) {
            imageMenu.classList.remove('feed-share__menu--open');
            imageMenu.hidden = true;
        }
        if (restoreFocus && (wasOpen || hadPending) && typeof trigger.focus === 'function') {
            trigger.focus({ preventScroll: true });
        }
        if (pendingImageModeResolve) {
            const resolve = pendingImageModeResolve;
            pendingImageModeResolve = null;
            resolve(value);
        }
    };

    const cancelImageMenu = restoreFocus => {
        finalizeImageMenu(null, restoreFocus);
    };

    const openImageMenu = () => {
        if (!imageMenu) return;
        imageMenu.hidden = false;
        const activate = () => {
            imageMenu.classList.add('feed-share__menu--open');
            const first = imageMenu.querySelector('[data-image-share-mode]');
            if (first) {
                first.focus({ preventScroll: true });
            }
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(activate);
        } else {
            setTimeout(activate, 0);
        }
    };

    if (imageMenu) {
        imageShareModeRequester = () => {
            if (pendingImageModeResolve) {
                return Promise.resolve(null);
            }
            return new Promise(resolve => {
                pendingImageModeResolve = resolve;
                openImageMenu();
            });
        };
        imageMenu.addEventListener('click', event => {
            event.stopPropagation();
        });
        imageMenu.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                cancelImageMenu(true);
            }
        });
        const imageButtons = imageMenu.querySelectorAll('[data-image-share-mode]');
        imageButtons.forEach(button => {
            button.addEventListener('click', () => {
                const mode = button.getAttribute('data-image-share-mode');
                if (mode === 'copy' || mode === 'download') {
                    finalizeImageMenu(mode, true);
                } else {
                    cancelImageMenu(true);
                }
            });
        });
    } else {
        imageShareModeRequester = null;
    }

    const closeMenu = () => {
        if (menu.hidden) return;
        menu.classList.remove('feed-share__menu--open');
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
    };

    const openMenu = focusFirst => {
        if (!menu.hidden) return;
        menu.hidden = false;
        const activate = () => {
            menu.classList.add('feed-share__menu--open');
            if (focusFirst) {
                const firstItem = menu.querySelector('[data-share-format]');
                if (firstItem) {
                    firstItem.focus({ preventScroll: true });
                }
            }
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(activate);
        } else {
            setTimeout(activate, 0);
        }
        trigger.setAttribute('aria-expanded', 'true');
    };

    trigger.addEventListener('click', event => {
        event.stopPropagation();
        if (menu.hidden) {
            cancelImageMenu(false);
            openMenu(event.detail === 0);
        } else {
            closeMenu();
            cancelImageMenu(false);
        }
    });

    trigger.addEventListener('keydown', event => {
        if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && menu.hidden) {
            event.preventDefault();
            cancelImageMenu(false);
            openMenu(true);
        } else if (event.key === 'Escape' && !menu.hidden) {
            event.preventDefault();
            closeMenu();
            cancelImageMenu(true);
        }
    });

    menu.addEventListener('click', event => {
        event.stopPropagation();
    });

    menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeMenu();
            trigger.focus({ preventScroll: true });
        }
    });

    document.addEventListener('click', event => {
        if (!controls.contains(event.target)) {
            closeMenu();
            cancelImageMenu(false);
        }
    });

    controls.addEventListener('focusout', event => {
        const nextFocus = event.relatedTarget;
        if (!nextFocus || !controls.contains(nextFocus)) {
            closeMenu();
            cancelImageMenu(true);
        }
    });

    const shareButtons = menu.querySelectorAll('[data-share-format]');
    shareButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const format = button.getAttribute('data-share-format');
            closeMenu();
            cancelImageMenu(false);
            await handleShareAction(format);
        });
    });
}

function notifyShareResult(message, tone = 'success') {
    if (typeof document === 'undefined') return;
    const trigger = document.getElementById('feedShareButton');
    if (!trigger) return;

    const defaultLabel = trigger.dataset.defaultLabel || trigger.textContent || 'Share Result';
    trigger.dataset.defaultLabel = defaultLabel;

    trigger.textContent = message;
    trigger.classList.remove('feed-share__trigger--success', 'feed-share__trigger--error');
    if (tone === 'success') {
        trigger.classList.add('feed-share__trigger--success');
    } else if (tone === 'error') {
        trigger.classList.add('feed-share__trigger--error');
    }

    if (typeof window !== 'undefined' && shareFeedbackTimerId) {
        window.clearTimeout(shareFeedbackTimerId);
    }

    const timeout = tone === 'error' ? 4200 : 2600;
    const reset = () => {
        trigger.textContent = trigger.dataset.defaultLabel || defaultLabel;
        trigger.classList.remove('feed-share__trigger--success', 'feed-share__trigger--error');
        shareFeedbackTimerId = null;
    };

    if (typeof window !== 'undefined') {
        shareFeedbackTimerId = window.setTimeout(reset, timeout);
    } else {
        reset();
    }
}

async function handleShareAction(format) {
    const normalized = typeof format === 'string' ? format.toLowerCase() : '';
    if (!lastSimulationSummary) {
        notifyShareResult('Run a simulation first', 'error');
        return;
    }

    try {
        if (normalized === 'markdown' || normalized === 'discord') {
            const text = createDiscordShareText(lastSimulationSummary);
            const copied = await copyTextToClipboard(text);
            if (copied) {
                notifyShareResult('Discord format copied!');
            } else {
                if (typeof window !== 'undefined') {
                    window.prompt('Copy the roll result:', text);
                }
                notifyShareResult('Copy manually required', 'neutral');
            }
        } else if (normalized === 'plain' || normalized === 'text') {
            const text = createPlainShareText(lastSimulationSummary);
            const copied = await copyTextToClipboard(text);
            if (copied) {
                notifyShareResult('Plain text copied!');
            } else {
                if (typeof window !== 'undefined') {
                    window.prompt('Copy the roll result:', text);
                }
                notifyShareResult('Copy manually required', 'neutral');
            }
        } else if (normalized === 'image') {
            const mode = await requestImageShareMode();
            if (!mode) {
                notifyShareResult('Image share cancelled', 'neutral');
                return;
            }
            const outcome = await generateShareImage(lastSimulationSummary, mode);
            if (outcome === 'copied') {
                notifyShareResult('Image copied to clipboard!', 'success');
            } else if (outcome === 'downloaded') {
                notifyShareResult('Image downloaded!', 'success');
            } else if (outcome === 'downloaded-fallback') {
                notifyShareResult('Clipboard unavailable, image downloaded instead.', 'neutral');
            } else {
                notifyShareResult('Image failed', 'error');
            }
        } else {
            notifyShareResult('Unknown share option', 'error');
        }
    } catch (error) {
        console.error('Share action failed', error);
        notifyShareResult('Share failed', 'error');
    }
}

async function copyTextToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.warn('Clipboard API copy failed', error);
        }
    }

    if (typeof document === 'undefined') {
        return false;
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        const selection = document.getSelection();
        const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (previousRange && selection) {
            selection.removeAllRanges();
            selection.addRange(previousRange);
        }
        return successful;
    } catch (error) {
        console.warn('execCommand copy failed', error);
        return false;
    }
}

function requestImageShareMode() {
    if (typeof imageShareModeRequester === 'function') {
        return imageShareModeRequester();
    }
    if (typeof window === 'undefined') {
        return Promise.resolve('download');
    }
    const response = window.prompt('How would you like to share the image? Enter "download" or "copy".', 'download');
    if (response === null) {
        return Promise.resolve(null);
    }
    const normalized = response.trim().toLowerCase();
    if (normalized === 'download' || normalized === 'copy') {
        return Promise.resolve(normalized);
    }
    window.alert('Unrecognized option. The image will be downloaded.');
    return Promise.resolve('download');
}

async function copyImageBlobToClipboard(blob) {
    if (!blob) {
        return false;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function') {
        return false;
    }
    if (typeof ClipboardItem === 'undefined') {
        return false;
    }
    try {
        const item = new ClipboardItem({ [blob.type || 'image/png']: blob });
        await navigator.clipboard.write([item]);
        return true;
    } catch (error) {
        console.warn('Clipboard image copy failed', error);
        return false;
    }
}

function createDiscordShareText(summary) {
    const eventSummary = summary.eventLabels && summary.eventLabels.length > 0
        ? summary.eventLabels.join(', ')
        : EVENT_SUMMARY_EMPTY_LABEL;
    const auraFilterSummary = summary.auraFilterSummary || getAuraFilterSummaryText();
    const details = [
        `> **Rolls:** ${formatWithCommas(summary.rolls)}`,
        `> **Luck:** ${formatWithCommas(summary.luck)}`,
        `> **Biome:** ${summary.biomeLabel}`,
        `> **Rune:** ${summary.runeLabel || 'None'}`,
        `> **Time:** ${summary.timeLabel || 'Neutral'}`,
        `> **Events:** ${eventSummary}`,
        `> **Included Tiers:** ${auraFilterSummary}`,
        `> **Duration:** ${Math.max(0, Math.round(summary.executionSeconds))}s`,
        `> **Total XP:** ${formatWithCommas(summary.xpTotal)}`
    ];

    const auraLines = summary.shareRecords && summary.shareRecords.length > 0
        ? summary.shareRecords.map(line => `* ${line}`)
        : ['* No auras were rolled.'];

    const milestoneLines = summary.xpLines && summary.xpLines.length > 0
        ? summary.xpLines.map(line => `* ${line}`)
        : [];

    const sections = [
        '**Sols Roll Result**',
        details.join('\n'),
        '',
        '**Auras Rolled**',
        auraLines.join('\n')
    ];

    if (milestoneLines.length > 0) {
        sections.push('');
        sections.push('**Milestones**');
        sections.push(milestoneLines.join('\n'));
    }

    return sections.filter(Boolean).join('\n');
}

function createPlainShareText(summary) {
    const eventSummary = summary.eventLabels && summary.eventLabels.length > 0
        ? summary.eventLabels.join(', ')
        : EVENT_SUMMARY_EMPTY_LABEL;
    const auraFilterSummary = summary.auraFilterSummary || getAuraFilterSummaryText();
    const lines = [
        'Sols Roll Result',
        `Rolls: ${formatWithCommas(summary.rolls)}`,
        `Luck: ${formatWithCommas(summary.luck)}`,
        `Biome: ${summary.biomeLabel}`,
        `Rune: ${summary.runeLabel || 'None'}`,
        `Time: ${summary.timeLabel || 'Neutral'}`,
        `Events: ${eventSummary}`,
        `Included Aura Tiers: ${auraFilterSummary}`,
        `Duration: ${Math.max(0, Math.round(summary.executionSeconds))}s`,
        `Total XP: ${formatWithCommas(summary.xpTotal)}`,
        '',
        'Auras Rolled'
    ];

    if (summary.shareRecords && summary.shareRecords.length > 0) {
        summary.shareRecords.forEach(record => {
            lines.push(`${record}`);
        });
    } else {
        lines.push('No auras were rolled.');
    }

    if (summary.xpLines && summary.xpLines.length > 0) {
        lines.push('', 'Milestones');
        summary.xpLines.forEach(line => {
            lines.push(`${line}`);
        });
    }

    return lines.join('\n');
}

const SHARE_IMAGE_BASE_NAME_STYLE = Object.freeze({
    font: '600 28px "Sarpanch", sans-serif',
    fill: '#f6fbff',
    letterSpacing: 0,
    shadowLayers: [
        { color: 'rgba(14, 22, 38, 0.55)', blur: 12, offsetX: 0, offsetY: 4 }
    ],
    lineHeightMultiplier: 1.35
});

const SHARE_IMAGE_BASE_PREFIX_STYLE = Object.freeze({
    font: '600 20px "Sarpanch", sans-serif',
    fill: '#7fe3ff',
    letterSpacing: 0.5,
    shadowLayers: [
        { color: 'rgba(127, 227, 255, 0.45)', blur: 10, offsetX: 0, offsetY: 3 }
    ],
    lineHeightMultiplier: 1.2
});

const SHARE_IMAGE_BASE_COUNT_STYLE = Object.freeze({
    font: '500 22px "Sarpanch", sans-serif',
    fill: '#cfe7ff',
    letterSpacing: 0.5,
    shadowLayers: [
        { color: 'rgba(12, 32, 60, 0.65)', blur: 8, offsetX: 0, offsetY: 3 }
    ],
    lineHeightMultiplier: 1.25
});

const SHARE_IMAGE_BASE_SUBTITLE_STYLE = Object.freeze({
    font: 'italic 500 20px "Sarpanch", sans-serif',
    fill: 'rgba(199, 219, 255, 0.72)',
    letterSpacing: 1.6,
    shadowLayers: [],
    lineHeightMultiplier: 1.2
});

const SHARE_IMAGE_RARITY_STYLES = Object.freeze({
    'rarity-tier-basic': {
        fill: '#d8ddea',
        shadows: [
            { color: 'rgba(220, 230, 255, 0.25)', blur: 6 },
            { color: 'rgba(14, 22, 38, 0.75)', blur: 2 }
        ]
    },
    'rarity-tier-epic': {
        fill: '#815482',
        shadows: [
            { color: 'rgba(129, 84, 130, 0.32)', blur: 8 },
            { color: 'rgba(15, 6, 24, 0.8)', blur: 2 }
        ]
    },
    'rarity-tier-unique': {
        fill: '#dba738',
        shadows: [
            { color: 'rgba(219, 167, 56, 0.35)', blur: 10 },
            { color: 'rgba(32, 16, 0, 0.82)', blur: 3 }
        ]
    },
    'rarity-tier-legendary': {
        fill: '#3df1cf',
        shadows: [
            { color: 'rgba(61, 241, 207, 0.35)', blur: 12 },
            { color: 'rgba(0, 22, 18, 0.78)', blur: 3 }
        ]
    },
    'rarity-tier-mythic': {
        fill: '#df1ab0',
        shadows: [
            { color: 'rgba(223, 26, 176, 0.38)', blur: 14 },
            { color: 'rgba(30, 0, 22, 0.82)', blur: 4 }
        ]
    },
    'rarity-tier-exalted': {
        fill: '#10477c',
        shadows: [
            { color: 'rgba(16, 71, 124, 0.35)', blur: 12 },
            { color: 'rgba(0, 12, 28, 0.85)', blur: 3 }
        ]
    },
    'rarity-tier-glorious': {
        fill: '#851010',
        shadows: [
            { color: 'rgba(133, 16, 16, 0.4)', blur: 12 },
            { color: 'rgba(26, 0, 0, 0.8)', blur: 3 }
        ]
    },
    'rarity-tier-transcendent': {
        fill: '#b7f5f5',
        shadows: [
            { color: 'rgba(183, 245, 245, 0.42)', blur: 14 },
            { color: 'rgba(18, 30, 36, 0.72)', blur: 3 }
        ]
    },
    'rarity-tier-challenged': {
        fill: '#080808',
        shadows: [
            { color: 'rgba(255, 255, 255, 0.65)', blur: 6 },
            { color: 'rgba(0, 0, 0, 0.85)', blur: 2 }
        ]
    },
    'rarity-tier-limbo': {
        fill: '#d7d7d7',
        shadows: [
            { color: 'rgba(40, 40, 40, 0.95)', blur: 6 },
            { color: 'rgba(10, 10, 10, 0.9)', blur: 12 },
            { color: 'rgba(0, 0, 0, 0.95)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(0, 0, 0, 0.95)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(0, 0, 0, 0.95)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(0, 0, 0, 0.95)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    }
});

const SHARE_IMAGE_OUTLINE_STYLES = Object.freeze({
    'sigil-outline-halloween': {
        shadows: [
            { color: 'rgba(255, 140, 0, 0.85)', blur: 4 },
            { color: 'rgba(255, 90, 0, 0.7)', blur: 8 },
            { color: 'rgba(60, 20, 0, 0.95)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(60, 20, 0, 0.95)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(60, 20, 0, 0.95)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(60, 20, 0, 0.95)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-prowler': {
        shadows: [
            { color: 'rgba(80, 170, 255, 0.85)', blur: 4 },
            { color: 'rgba(20, 110, 220, 0.7)', blur: 8 },
            { color: 'rgba(5, 40, 120, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(5, 40, 120, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(5, 40, 120, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(5, 40, 120, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-valentine-2024': {
        shadows: [
            { color: 'rgba(255, 140, 200, 0.85)', blur: 4 },
            { color: 'rgba(255, 95, 170, 0.75)', blur: 8 },
            { color: 'rgba(115, 20, 80, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(115, 20, 80, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(115, 20, 80, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(115, 20, 80, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-valentine-2026': {
        shadows: [
            { color: 'rgba(255, 140, 200, 0.85)', blur: 4 },
            { color: 'rgba(248, 127, 184, 0.75)', blur: 8 },
            { color: 'rgba(140, 45, 105, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(141, 49, 108, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(146, 44, 109, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(126, 13, 85, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-april': {
        shadows: [
            { color: 'rgba(190, 190, 190, 0.85)', blur: 4 },
            { color: 'rgba(140, 140, 140, 0.75)', blur: 8 },
            { color: 'rgba(80, 80, 80, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(80, 80, 80, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(80, 80, 80, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(80, 80, 80, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-summer': {
        shadows: [
            { color: 'rgba(255, 255, 140, 0.9)', blur: 4 },
            { color: 'rgba(234, 240, 70, 0.75)', blur: 8 },
            { color: 'rgba(145, 155, 10, 0.85)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(155, 155, 10, 0.85)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(150, 155, 10, 0.85)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(155, 155, 10, 0.85)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-innovator': {
        fill: '#f1e6ff',
        shadows: [
            { color: 'rgba(200, 140, 255, 0.9)', blur: 4 },
            { color: 'rgba(150, 90, 235, 0.75)', blur: 8 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-winter': {
        shadows: [
            { color: 'rgba(210, 240, 255, 0.9)', blur: 4 },
            { color: 'rgba(140, 200, 255, 0.75)', blur: 8 },
            { color: 'rgba(40, 90, 140, 0.85)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(40, 90, 140, 0.85)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(40, 90, 140, 0.85)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(40, 90, 140, 0.85)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-winter-2026': {
        fill: '#eafcff',
        shadows: [
            { color: 'rgba(210, 246, 255, 0.95)', blur: 5 },
            { color: 'rgba(125, 208, 255, 0.85)', blur: 12 },
            { color: 'rgba(40, 120, 170, 0.92)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(40, 120, 170, 0.92)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(40, 120, 170, 0.92)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(40, 120, 170, 0.92)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-winter-garden': {
        font: '600 35px "Parisienne", "Sarpanch", cursive',
        letterSpacing: 0.25,
        lineHeightMultiplier: 1.3,
        shadowLayers: [],
        replaceShadows: true,
        fill: (ctx, x, y, width, height) => {
            const gradient = ctx.createLinearGradient(x, y, x, y + height);
            gradient.addColorStop(0.22, '#7ef1ff');
            gradient.addColorStop(0.35, '#8980ff');
            gradient.addColorStop(0.5, '#7c68cf');
            gradient.addColorStop(0.75, '#e0d8fa');
            return gradient;
        }
    },
    'sigil-outline-dream-traveler': {
        font: '700 italic 35px "Jura", "Sarpanch", sans-serif',
        lineHeightMultiplier: 1.3,
        shadowLayers: [],
        replaceShadows: true,
        fill: (ctx, x, y, width, height) => {
            const gradient = createAngleGradient(ctx, x, y, width, height, 170);
            gradient.addColorStop(0.27, '#2e1885');
            gradient.addColorStop(0.33, '#c5aefe');
            gradient.addColorStop(0.42, '#41307a');
            gradient.addColorStop(0.46, '#fdeef4');
            gradient.addColorStop(0.52, '#f3daf3');
            gradient.addColorStop(0.7, '#6f1930');
            gradient.addColorStop(0.75, '#c26181');
            gradient.addColorStop(0.9, '#f1a9cb');
            return gradient;
        }
    },
    'sigil-outline-frostveil': {
        font: '600 34px "Kings", "Sarpanch", serif',
        lineHeightMultiplier: 1.3,
        shadowLayers: [],
        replaceShadows: true,
        fill: (ctx, x, y, width, height) => {
            const gradient = ctx.createLinearGradient(x, y, x, y + height);
            gradient.addColorStop(0.35, '#a9afff');
            gradient.addColorStop(0.5, '#7594f9');
            gradient.addColorStop(0.7, '#a2dbff');
            return gradient;
        }
    },
    'sigil-outline-lamenthyr': {
        font: 'italic 700 26px "Kings", "Sarpanch", sans-serif',
        letterSpacing: 3.12,
        lineHeightMultiplier: 1.25,
        transform: text => text.toUpperCase(),
        shadowLayers: [
            { color: 'rgba(0, 0, 0, 0.35)', blur: 6, offsetX: 0, offsetY: 3 }
        ],
        replaceShadows: true,
        fill: (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.4);
            gradient.addColorStop(0.35, '#420000');
            gradient.addColorStop(0.5, '#ffc3b6');
            gradient.addColorStop(0.6, '#420000');
            return gradient;
        }
    },
    'sigil-outline-cryogenic': {
        fill: '#e9f8ff',
        shadows: [
            { color: 'rgba(150, 230, 255, 0.95)', blur: 6 },
            { color: 'rgba(90, 190, 255, 0.9)', blur: 14 },
            { color: 'rgba(20, 110, 160, 0.95)', blur: 0, offsetX: 2, offsetY: 2 },
            { color: 'rgba(20, 110, 160, 0.95)', blur: 0, offsetX: -2, offsetY: 2 },
            { color: 'rgba(20, 110, 160, 0.95)', blur: 0, offsetX: 2, offsetY: -2 },
            { color: 'rgba(20, 110, 160, 0.95)', blur: 0, offsetX: -2, offsetY: -2 }
        ]
    },
    'sigil-outline-blood': {
        shadows: [
            { color: 'rgba(200, 20, 20, 0.9)', blur: 4 },
            { color: 'rgba(150, 0, 0, 0.75)', blur: 8 },
            { color: 'rgba(60, 0, 0, 0.95)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(60, 0, 0, 0.95)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(60, 0, 0, 0.95)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(60, 0, 0, 0.95)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-illusionary': {
        fill: '#f7fbff',
        shadows: [
            { color: 'rgba(255, 255, 255, 0.95)', blur: 12 },
            { color: 'rgba(176, 216, 255, 0.88)', blur: 22 },
            { color: 'rgba(255, 255, 255, 0.95)', blur: 0, offsetX: 4, offsetY: 0 },
            { color: 'rgba(134, 194, 255, 0.95)', blur: 0, offsetX: -4, offsetY: 0 },
            { color: 'rgba(255, 255, 255, 0.92)', blur: 0, offsetX: 0, offsetY: 4 },
            { color: 'rgba(134, 194, 255, 0.92)', blur: 0, offsetX: 0, offsetY: -4 },
            { color: 'rgba(255, 255, 255, 0.8)', blur: 0, offsetX: 6, offsetY: 2 },
            { color: 'rgba(176, 216, 255, 0.82)', blur: 0, offsetX: -6, offsetY: -2 }
        ]
    },
    'sigil-outline-glitch': {
        fill: '#0f0018',
        shadows: [
            { color: 'rgba(255, 255, 255, 0.95)', blur: 6 },
            { color: 'rgba(255, 255, 255, 0.85)', blur: 14 },
            { color: 'rgba(255, 255, 255, 0.98)', blur: 0, offsetX: 2, offsetY: 0 },
            { color: 'rgba(255, 255, 255, 0.98)', blur: 0, offsetX: -2, offsetY: 0 },
            { color: 'rgba(255, 255, 255, 0.98)', blur: 0, offsetX: 0, offsetY: 2 },
            { color: 'rgba(255, 255, 255, 0.98)', blur: 0, offsetX: 0, offsetY: -2 }
        ]
    },
    'sigil-outline-dreamspace': {
        fill: '#ffe9ff',
        shadows: [
            { color: 'rgba(255, 140, 220, 0.95)', blur: 10 },
            { color: 'rgba(255, 90, 210, 0.85)', blur: 18 },
            { color: 'rgba(255, 110, 220, 0.96)', blur: 0, offsetX: 3, offsetY: 0 },
            { color: 'rgba(255, 110, 220, 0.96)', blur: 0, offsetX: -3, offsetY: 0 },
            { color: 'rgba(255, 110, 220, 0.96)', blur: 0, offsetX: 0, offsetY: 3 },
            { color: 'rgba(255, 110, 220, 0.96)', blur: 0, offsetX: 0, offsetY: -3 }
        ]
    },
    'sigil-outline-cyberspace': {
        fill: '#e1edff',
        shadows: [
            { color: 'rgba(60, 120, 200, 0.95)', blur: 10 },
            { color: 'rgba(40, 90, 170, 0.85)', blur: 18 },
            { color: 'rgba(35, 90, 175, 0.96)', blur: 0, offsetX: 3, offsetY: 0 },
            { color: 'rgba(35, 90, 175, 0.96)', blur: 0, offsetX: -3, offsetY: 0 },
            { color: 'rgba(35, 90, 175, 0.96)', blur: 0, offsetX: 0, offsetY: 3 },
            { color: 'rgba(35, 70, 135, 0.96)', blur: 0, offsetX: 0, offsetY: -3 }
        ]
    },
    'sigil-outline-day': {
        fill: '#ffe9ff',
        shadows: [
            { color: 'rgba(95, 90, 58, 0.85)', blur: 10 },
            { color: 'rgba(106, 109, 73, 0.7)', blur: 18 },
            { color: 'rgba(162, 170, 76, 0.7)', blur: 0, offsetX: 3, offsetY: 0 },
            { color: 'rgba(53, 54, 38, 0.7)', blur: 0, offsetX: -3, offsetY: 0 },
            { color: 'rgba(94, 97, 57, 0.7)', blur: 0, offsetX: 0, offsetY: 3 },
            { color: 'rgba(66, 68, 39, 0.7)', blur: 0, offsetX: 0, offsetY: -3 }
        ]
    },
    'sigil-outline-night': {
        fill: '#e1edff',
        shadows: [
            { color: 'rgba(71, 28, 100, 0.95)', blur: 10 },
            { color: 'rgba(65, 26, 97, 0.85)', blur: 18 },
            { color: 'rgba(67, 27, 90, 0.96)', blur: 0, offsetX: 3, offsetY: 0 },
            { color: 'rgba(39, 2, 48, 0.96)', blur: 0, offsetX: -3, offsetY: 0 },
            { color: 'rgba(31, 3, 77, 0.96)', blur: 0, offsetX: 0, offsetY: 3 },
            { color: 'rgba(43, 5, 68, 0.96)', blur: 0, offsetX: 0, offsetY: -3 }
        ]
    },
    'sigil-outline-heaven': {
        fill: '#ffffffff',
        shadows: [
            { color: 'rgba(190, 180, 102, 0.95)', blur: 10 },
            { color: 'rgba(216, 184, 22, 0.85)', blur: 18 },
            { color: 'rgba(173, 144, 29, 0.96)', blur: 0, offsetX: 3, offsetY: 0 },
            { color: 'rgba(172, 158, 65, 0.96)', blur: 0, offsetX: -3, offsetY: 0 },
            { color: 'rgba(204, 177, 43, 0.96)', blur: 0, offsetX: 0, offsetY: 3 },
            { color: 'rgba(167, 181, 38, 0.96)', blur: 0, offsetX: 0, offsetY: -3 }
        ]
    },
    'sigil-outline-limbo': {
        fill: '#000000',
        shadows: [
            { color: 'rgba(172, 172, 172, 0.95)', blur: 10 },
            { color: 'rgba(175, 175, 175, 0.88)', blur: 18 },
            { color: 'rgba(176, 176, 176, 0.8)', blur: 32 },
            { color: 'rgba(136, 136, 136, 0.96)', blur: 0, offsetX: 1, offsetY: 0 },
            { color: 'rgba(83, 83, 83, 0.96)', blur: 0, offsetX: -1, offsetY: 0 },
            { color: 'rgba(64, 64, 64, 0.96)', blur: 0, offsetX: 0, offsetY: 1 },
            { color: 'rgba(55, 55, 55, 0.94)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-leviathan': {
        fill: '#000000',
        shadows: [
            { color: 'rgba(0, 117, 87, 0.95)', blur: 10 },
            { color: 'rgba(0, 155, 57, 0.88)', blur: 18 },
            { color: 'rgba(0, 166, 122, 0.8)', blur: 32 },
            { color: 'rgba(0, 186, 149, 0.96)', blur: 0, offsetX: 1, offsetY: 0 },
            { color: 'rgba(0, 101, 98, 0.96)', blur: 0, offsetX: -1, offsetY: 0 },
            { color: 'rgba(95, 255, 204, 0.96)', blur: 0, offsetX: 0, offsetY: 1 },
            { color: 'rgba(0, 172, 154, 0.94)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    },
    'sigil-outline-monarch': {
        fill: '#000000',
        shadows: [
            { color: 'rgba(81, 3, 154, 0.9)', blur: 4 },
            { color: 'rgba(68, 9, 149, 0.75)', blur: 8 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(70, 20, 120, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
        ]
    }
});

function cloneShareShadowLayer(layer) {
    return {
        color: layer.color,
        blur: layer.blur ?? 0,
        offsetX: layer.offsetX ?? 0,
        offsetY: layer.offsetY ?? 0,
        fill: layer.fill || null
    };
}

function cloneShareStyle(style) {
    return {
        ...style,
        shadowLayers: style.shadowLayers ? style.shadowLayers.map(cloneShareShadowLayer) : [],
        baseShadow: style.baseShadow ? { ...style.baseShadow } : null,
        decorations: style.decorations ? { ...style.decorations } : null
    };
}

function parseFontSize(font) {
    const match = /([0-9]+(?:\.[0-9]+)?)px/.exec(font);
    if (!match) return 24;
    const value = Number.parseFloat(match[1]);
    return Number.isFinite(value) ? value : 24;
}

function computeLineHeight(font, multiplier) {
    const size = parseFontSize(font);
    const factor = Number.isFinite(multiplier) ? multiplier : 1.3;
    return Math.ceil(size * factor);
}

function applyRarityStyle(style, className) {
    const config = SHARE_IMAGE_RARITY_STYLES[className];
    if (!config) return;
    if (config.fill) {
        style.fill = config.fill;
    }
    if (Array.isArray(config.shadows)) {
        style.shadowLayers.push(...config.shadows.map(cloneShareShadowLayer));
    }
}

function applyOutlineStyle(style, className) {
    const config = SHARE_IMAGE_OUTLINE_STYLES[className];
    if (!config) return;
    if (config.font) {
        style.font = config.font;
    }
    if (Number.isFinite(config.letterSpacing)) {
        style.letterSpacing = config.letterSpacing;
    }
    if (typeof config.lineHeightMultiplier === 'number') {
        style.lineHeightMultiplier = config.lineHeightMultiplier;
    }
    if (typeof config.transform === 'function') {
        style.transform = config.transform;
    }
    if (config.fill) {
        style.fill = config.fill;
    }
    if (Array.isArray(config.shadows)) {
        style.shadowLayers.push(...config.shadows.map(cloneShareShadowLayer));
    }
    if (Array.isArray(config.shadowLayers)) {
        if (config.replaceShadows) {
            style.shadowLayers = config.shadowLayers.map(cloneShareShadowLayer);
        } else {
            style.shadowLayers.push(...config.shadowLayers.map(cloneShareShadowLayer));
        }
    }
}

const SHARE_IMAGE_EFFECT_HANDLERS = Object.freeze({
    'sigil-effect-oblivion': styleSet => {
        styleSet.name.shadowLayers = [
            { color: 'rgba(187, 122, 255, 0.45)', blur: 16, offsetX: 0, offsetY: 3 }
        ];
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.25);
            gradient.addColorStop(0, '#bb7aff');
            gradient.addColorStop(0.4, '#401768');
            gradient.addColorStop(1, '#26063c');
            return gradient;
        };
    },
    'sigil-effect-memory': styleSet => {
        styleSet.name.shadowLayers = [
            { color: 'rgba(200, 140, 255, 0.55)', blur: 20, offsetX: 0, offsetY: 4 }
        ];
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.3);
            gradient.addColorStop(0, '#f3d9ff');
            gradient.addColorStop(0.45, '#a26bff');
            gradient.addColorStop(1, '#3b1061');
            return gradient;
        };
    },
    'sigil-effect-neferkhaf': styleSet => {
        styleSet.name.shadowLayers = [
            { color: 'rgba(11, 8, 5, 0.82)', blur: 8, offsetX: 0, offsetY: 2 },
            { color: 'rgba(217, 170, 92, 0.55)', blur: 22, offsetX: 0, offsetY: 8 }
        ];
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.25);
            gradient.addColorStop(0, '#0b0805');
            gradient.addColorStop(0.5, '#f1d7a5');
            gradient.addColorStop(1, '#c7903e');
            return gradient;
        };
    },
    'sigil-effect-pixelation': styleSet => {
        styleSet.name.font = '700 22px "Press Start 2P", "Sarpanch", sans-serif';
        styleSet.name.letterSpacing = 2.6;
        styleSet.name.lineHeightMultiplier = 1.45;
        styleSet.name.shadowLayers = [
            { color: 'rgba(0, 0, 0, 0.85)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(255, 255, 255, 0.55)', blur: 8, offsetX: 0, offsetY: 0 }
        ];
        styleSet.name.fill = '#ff004c';
        styleSet.name.transform = text => text.toUpperCase();
    },
    'sigil-effect-megaphone': styleSet => {
        const font = '700 24px "Press Start 2P", "Sarpanch", sans-serif';
        styleSet.name.font = font;
        styleSet.name.letterSpacing = 1.8;
        styleSet.name.lineHeightMultiplier = 1.2;
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.2);
            gradient.addColorStop(0, '#a7ffe7');
            gradient.addColorStop(0.45, '#6bf5c6');
            gradient.addColorStop(1, '#38c9a2');
            return gradient;
        };
        styleSet.name.shadowLayers = [
            { color: 'rgba(0, 40, 32, 0.85)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(60, 220, 200, 0.4)', blur: 10, offsetX: 0, offsetY: 2 },
            { color: 'rgba(14, 28, 24, 0.65)', blur: 18, offsetX: 0, offsetY: 6 }
        ];
        styleSet.name.transform = text => text.toUpperCase();
        if (styleSet.subtitle) {
            styleSet.subtitle.font = '600 16px "Sarpanch", sans-serif';
            styleSet.subtitle.fill = 'rgba(140, 244, 214, 0.9)';
            styleSet.subtitle.letterSpacing = 1.2;
            styleSet.subtitle.lineHeightMultiplier = 1.2;
        }
    },
    'sigil-effect-luminosity': styleSet => {
        styleSet.name.shadowLayers = [
            { color: 'rgba(142, 230, 255, 0.85)', blur: 18, offsetX: 0, offsetY: 3 }
        ];
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.2);
            gradient.addColorStop(0, '#f7fdff');
            gradient.addColorStop(0.4, '#6ad6ff');
            gradient.addColorStop(0.7, '#e4f7ff');
            gradient.addColorStop(1, '#ffffff');
            return gradient;
        };
    },
    'sigil-effect-equinox': styleSet => {
        const font = '700 26px "Noto Serif TC", "Noto Serif", "Songti TC", serif';
        styleSet.name.font = font;
        styleSet.name.letterSpacing = Number.parseFloat((0.3 * parseFontSize(font)).toFixed(2));
        styleSet.name.lineHeightMultiplier = 1.6;
        styleSet.name.transform = text => text.toUpperCase();
        styleSet.name.shadowLayers = [
            { color: 'rgba(99, 99, 99, 0.9)', blur: 1, offsetX: 0, offsetY: 1 },
            { color: 'rgba(12, 21, 43, 0.58)', blur: 18, offsetX: 0, offsetY: 6 }
        ];
        styleSet.name.fill = '#ffffff';
        styleSet.name.decorations = {
            before: '『',
            after: '』',
            font,
            letterSpacing: 0
        };
        if (styleSet.subtitle) {
            styleSet.subtitle.font = 'italic 500 18px "Noto Serif TC", "Noto Serif", serif';
            styleSet.subtitle.fill = 'rgba(214, 228, 255, 0.78)';
            styleSet.subtitle.letterSpacing = 1.4;
            styleSet.subtitle.lineHeightMultiplier = 1.25;
        }
    },
    'sigil-effect-nyctophobia': styleSet => {
        const baseFill = SHARE_IMAGE_BASE_NAME_STYLE.fill;
        const hasCustomFill = styleSet.name.fill !== baseFill;
        styleSet.name.shadowLayers.push(
            { color: 'rgba(255, 255, 255, 0.82)', blur: 6, offsetX: 0, offsetY: 0 },
            { color: 'rgba(0, 0, 0, 0.9)', blur: 0, offsetX: 1, offsetY: 1 }
        );
        if (!hasCustomFill) {
            styleSet.name.fill = '#000000';
        }
        const nyctoFrames = [
            'N̵̮̖͎͐Y̸̱̝͕̏̔͆C̶̫̒̀͌T̵̻̪̓͛̕O̸̪͗͌͝P̷̳̙̏͘H̶͔̮͒̓͝O̵̱̲̎̽͗B̸̗̤̅͐͝I̷͎̫̠̐̏͝Ḁ̶̯̺͋',
            'N̵̗̙̊̒Y̴̢͕͕͋̑͠C̵̘͛̐͘T̴̢͉͂͌O̷̺͇̐̕̚P̵̮̾̅̓H̸̦̫̑̀͠O̸̘͚̾͂B̵̨̮̈́͌Ḭ̵̱̇̓͠A̸̯̼̓̊',
            'N̸̺̯̓̑Y̷̪͓̆̿͝C̷̼̫̍̿̚T̸̯̘̿̿̕Ǫ̶̖̅͘P̵̨̩͋͌̕H̴̰̺̎͘͝O̵̠̺̒͛͝B̴̖͕̾̑̕I̵̙̖̐͠A̵̤͕͗̒̕',
            'Ṅ̷̢̤̗Y̷̡̯͂̎͝C̷̢̛̘̏͗T̴̥͚̽̋O̷̢͖͌͘P̶̫̥͋̿H̶̖̦͂̓́O̵̪͂̍̈́B̴̥̃̔̔I̵̪̩͒̕A̷̯̞͗͠',
            'N̵͚̠̟̯͂Ỵ̷̱̊̌C̸̣̈́Ṱ̸̣̌̂̉͂O̵P̷̬͒Ḩ̷̤̉̾̀O̶͈͙̕B̸̻͑I̸͓̩̥͐̈́͝A̶̱̣̟̝̎'
        ];
        styleSet.name.transform = () => nyctoFrames[0];
        if (styleSet.subtitle) {
            styleSet.subtitle.fill = 'rgba(255, 255, 255, 0.82)';
        }
    },
    'sigil-effect-lamenthyr': styleSet => {
        const font = 'italic 700 26px "Kings", "Sarpanch", sans-serif';
        styleSet.name.font = font;
        styleSet.name.letterSpacing = Number.parseFloat((0.12 * parseFontSize(font)).toFixed(2));
        styleSet.name.lineHeightMultiplier = 1.25;
        styleSet.name.shadowLayers = [
            { color: 'rgba(0, 0, 0, 0.35)', blur: 6, offsetX: 0, offsetY: 3 }
        ];
        styleSet.name.transform = text => text.toUpperCase();
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.4);
            gradient.addColorStop(0.35, '#420000');
            gradient.addColorStop(0.5, '#ffc3b6');
            gradient.addColorStop(0.6, '#420000');
            return gradient;
        };
    },
    'sigil-effect-breakthrough': styleSet => {
        const font = '700 24px "Arial", "Sarpanch", sans-serif';
        styleSet.name.font = font;
        styleSet.name.letterSpacing = Number.parseFloat((0.1 * parseFontSize(font)).toFixed(2));
        styleSet.name.lineHeightMultiplier = 1.35;
        styleSet.name.shadowLayers = [];
        styleSet.name.transform = text => text.toUpperCase();
        styleSet.name.fill = (ctx, x, y, width) => {
            const gradient = ctx.createLinearGradient(x, y, x + width, y + width * 0.6);
            gradient.addColorStop(0.1, '#f2fdfe');
            gradient.addColorStop(0.19, '#cfd5e3');
            gradient.addColorStop(0.2, '#252a48');
            gradient.addColorStop(0.35, '#312d40');
            gradient.addColorStop(0.35, '#cdd0e9');
            gradient.addColorStop(0.4, '#c4c6e9');
            gradient.addColorStop(0.45, '#bac3f1');
            gradient.addColorStop(0.5, '#272930');
            gradient.addColorStop(0.55, '#d0d5f1');
            gradient.addColorStop(0.7, '#30303e');
            gradient.addColorStop(0.71, '#eef4fa');
            gradient.addColorStop(0.75, '#e0e6ef');
            gradient.addColorStop(0.8, '#e9ebfc');
            return gradient;
        };
    }
});

function applyEffectStyle(styleSet, effectClass) {
    const handler = SHARE_IMAGE_EFFECT_HANDLERS[effectClass];
    if (handler) {
        handler(styleSet);
    }
}

function applyEventStyle(styleSet) {
    if (!styleSet || !styleSet.name) return;
    styleSet.name.fill = '#ffffff';
    styleSet.name.shadowLayers = [
        { color: 'rgba(0, 0, 0, 0.9)', blur: 2, offsetX: 1, offsetY: 1 }
    ];
}

function ensureStyleLineHeights(styleSet) {
    if (styleSet.name) {
        styleSet.name.lineHeight = computeLineHeight(styleSet.name.font, styleSet.name.lineHeightMultiplier);
    }
    if (styleSet.prefix) {
        styleSet.prefix.lineHeight = computeLineHeight(styleSet.prefix.font, styleSet.prefix.lineHeightMultiplier);
    }
    if (styleSet.count) {
        styleSet.count.lineHeight = computeLineHeight(styleSet.count.font, styleSet.count.lineHeightMultiplier);
    }
    if (styleSet.subtitle) {
        styleSet.subtitle.lineHeight = computeLineHeight(styleSet.subtitle.font, styleSet.subtitle.lineHeightMultiplier);
    }
}

function computeAuraCanvasStyles(record) {
    const baseStyles = {
        name: cloneShareStyle(SHARE_IMAGE_BASE_NAME_STYLE),
        prefix: cloneShareStyle(SHARE_IMAGE_BASE_PREFIX_STYLE),
        count: cloneShareStyle(SHARE_IMAGE_BASE_COUNT_STYLE),
        subtitle: record && record.subtitle ? cloneShareStyle(SHARE_IMAGE_BASE_SUBTITLE_STYLE) : null
    };

    if (record && record.classes) {
        if (record.classes.rarity) {
            applyRarityStyle(baseStyles.name, record.classes.rarity);
        }

        if (Array.isArray(record.classes.special) && record.classes.special.length > 0) {
            record.classes.special
                .filter(token => token.startsWith('sigil-outline-'))
                .forEach(token => applyOutlineStyle(baseStyles.name, token));

            record.classes.special
                .filter(token => token.startsWith('sigil-effect-'))
                .forEach(token => applyEffectStyle(baseStyles, token));
        }

        if (record.classes.event && (!Array.isArray(record.classes.special) || record.classes.special.length === 0)) {
            applyEventStyle(baseStyles);
        }
    }

    if (Array.isArray(record?.classes?.special) && record.classes.special.includes('sigil-outline-leviathan')) {
        const font = '600 28px "Playfair Display", "Sarpanch", serif';
        baseStyles.name.font = font;
        baseStyles.name.letterSpacing = Number.parseFloat((0.15 * parseFontSize(font)).toFixed(2));
        baseStyles.name.transform = text => text.toUpperCase();
    }

    if (record && record.prefix) {
        baseStyles.prefix = cloneShareStyle(baseStyles.name);
        baseStyles.prefix.font = baseStyles.name.font;
        baseStyles.prefix.letterSpacing = baseStyles.name.letterSpacing || 0;
        baseStyles.prefix.lineHeightMultiplier = baseStyles.name.lineHeightMultiplier;
    }

    ensureStyleLineHeights(baseStyles);
    return baseStyles;
}

function measureStyledSegmentWidth(context, text, style) {
    if (!text || !style) return 0;
    context.save();
    context.font = style.font;
    let width = 0;
    if (style.letterSpacing && style.letterSpacing !== 0) {
        const spacing = style.letterSpacing;
        for (let i = 0; i < text.length; i++) {
            width += context.measureText(text[i]).width;
            if (i < text.length - 1) {
                width += spacing;
            }
        }
    } else {
        width = context.measureText(text).width;
    }
    context.restore();
    return width;
}

function measureStyledTextWidth(context, text, style) {
    if (!text || !style) return 0;
    const segments = [];
    const baseText = style.transform ? style.transform(text) : text;
    if (style.decorations && style.decorations.before) {
        segments.push({
            text: style.decorations.before,
            style: {
                ...style,
                font: style.decorations.font || style.font,
                letterSpacing: style.decorations.letterSpacing ?? style.letterSpacing ?? 0,
                decorations: null,
                transform: null
            }
        });
    }
    segments.push({
        text: baseText,
        style: { ...style, decorations: null }
    });
    if (style.decorations && style.decorations.after) {
        segments.push({
            text: style.decorations.after,
            style: {
                ...style,
                font: style.decorations.font || style.font,
                letterSpacing: style.decorations.letterSpacing ?? style.letterSpacing ?? 0,
                decorations: null,
                transform: null
            }
        });
    }

    return segments.reduce((total, segment) => total + measureStyledSegmentWidth(context, segment.text, segment.style), 0);
}

function drawTextWithSpacing(context, text, x, y, letterSpacing) {
    if (!text) return;
    if (!letterSpacing) {
        context.fillText(text, x, y);
        return;
    }
    let cursor = x;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        context.fillText(char, cursor, y);
        cursor += context.measureText(char).width;
        if (i < text.length - 1) {
            cursor += letterSpacing;
        }
    }
}

function resolveFillStyle(style, context, x, y, width, height) {
    if (typeof style.fill === 'function') {
        return style.fill(context, x, y, width, height);
    }
    return style.fill || '#ffffff';
}

function renderStyledSegment(context, text, x, y, style) {
    if (!text || !style) return 0;
    context.save();
    context.font = style.font;
    const letterSpacing = style.letterSpacing || 0;
    const width = measureStyledSegmentWidth(context, text, { ...style, decorations: null, transform: null });
    const fill = resolveFillStyle(style, context, x, y, width, style.lineHeight || computeLineHeight(style.font));

    if (Array.isArray(style.shadowLayers) && style.shadowLayers.length > 0) {
        for (const layer of style.shadowLayers) {
            context.shadowColor = layer.color || 'rgba(0, 0, 0, 0)';
            context.shadowBlur = layer.blur ?? 0;
            context.shadowOffsetX = layer.offsetX ?? 0;
            context.shadowOffsetY = layer.offsetY ?? 0;
            context.fillStyle = layer.fill || fill;
            drawTextWithSpacing(context, text, x, y, letterSpacing);
        }
    }

    if (style.baseShadow) {
        context.shadowColor = style.baseShadow.color || 'rgba(0, 0, 0, 0)';
        context.shadowBlur = style.baseShadow.blur ?? 0;
        context.shadowOffsetX = style.baseShadow.offsetX ?? 0;
        context.shadowOffsetY = style.baseShadow.offsetY ?? 0;
    } else {
        context.shadowColor = 'rgba(0, 0, 0, 0)';
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
    }

    context.fillStyle = fill;
    drawTextWithSpacing(context, text, x, y, letterSpacing);
    context.restore();
    return width;
}

function renderStyledText(context, text, x, y, style) {
    if (!text || !style) return 0;
    const segments = [];
    const baseText = style.transform ? style.transform(text) : text;
    if (style.decorations && style.decorations.before) {
        segments.push({
            text: style.decorations.before,
            style: {
                ...style,
                font: style.decorations.font || style.font,
                letterSpacing: style.decorations.letterSpacing ?? style.letterSpacing ?? 0,
                decorations: null,
                transform: null
            }
        });
    }
    segments.push({ text: baseText, style: { ...style, decorations: null } });
    if (style.decorations && style.decorations.after) {
        segments.push({
            text: style.decorations.after,
            style: {
                ...style,
                font: style.decorations.font || style.font,
                letterSpacing: style.decorations.letterSpacing ?? style.letterSpacing ?? 0,
                decorations: null,
                transform: null
            }
        });
    }

    let cursorX = x;
    for (const segment of segments) {
        cursorX += renderStyledSegment(context, segment.text, cursorX, y, segment.style);
    }
    return cursorX - x;
}

function createAngleGradient(context, x, y, width, height, angleDeg) {
    const radians = (angleDeg * Math.PI) / 180;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const halfDiagonal = Math.sqrt(width * width + height * height) / 2;
    const dx = Math.cos(radians) * halfDiagonal;
    const dy = Math.sin(radians) * halfDiagonal;
    return context.createLinearGradient(centerX - dx, centerY - dy, centerX + dx, centerY + dy);
}

function createAuraBlock(context, record) {
    const styles = computeAuraCanvasStyles(record);
    const prefixText = record && record.prefix ? `${record.prefix}` : '';
    const nameText = record && record.displayName ? record.displayName : '';
    const subtitleText = record && record.subtitle ? record.subtitle : '';
    const countText = record && record.countLabel ? record.countLabel : '';
    const hasBreakthroughBorder = Boolean(record?.classes?.special?.includes('sigil-border-breakthrough'));
    const hasBreakthroughEffect = Boolean(record?.classes?.special?.includes('sigil-effect-breakthrough'));
    const [breakthroughTitle, ...breakthroughSuffixParts] = hasBreakthroughEffect ? nameText.split(' - ') : [nameText];
    const breakthroughSuffix = hasBreakthroughEffect && breakthroughSuffixParts.length > 0
        ? ` - ${breakthroughSuffixParts.join(' - ')}`
        : '';
    const breakthroughSuffixStyle = hasBreakthroughEffect
        ? {
            ...styles.name,
            letterSpacing: 0,
            transform: null
        }
        : null;

    const prefixWidth = prefixText ? measureStyledTextWidth(context, prefixText, styles.prefix) : 0;
    const prefixGap = prefixText ? 12 : 0;
    const breakthroughTitleWidth = hasBreakthroughEffect
        ? measureStyledTextWidth(context, breakthroughTitle, styles.name)
        : 0;
    const breakthroughSuffixWidth = hasBreakthroughEffect && breakthroughSuffixStyle
        ? measureStyledTextWidth(context, breakthroughSuffix, breakthroughSuffixStyle)
        : 0;
    const nameWidth = hasBreakthroughEffect
        ? breakthroughTitleWidth + breakthroughSuffixWidth
        : measureStyledTextWidth(context, nameText, styles.name);
    const combinedNameWidth = prefixWidth + prefixGap + nameWidth;
    const nameLineHeight = styles.name.lineHeight;
    const countLineHeight = countText ? styles.count.lineHeight : 0;
    const countGap = countText ? 28 : 0;
    const subtitleLineHeight = subtitleText && styles.subtitle ? styles.subtitle.lineHeight : 0;

    const firstLineHeight = Math.max(nameLineHeight, countLineHeight);
    const contentHeight = firstLineHeight + subtitleLineHeight;

    return {
        contentHeight,
        gapAfter: 22,
        draw(ctx, x, y) {
            let currentY = y;
            const nameX = prefixText ? x + prefixWidth + prefixGap : x;
            if (hasBreakthroughBorder) {
                ctx.save();
                ctx.font = styles.name.font;
                const metricsText = nameText || prefixText || '';
                const metrics = metricsText ? ctx.measureText(metricsText) : { actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 };
                const fontSize = parseFontSize(styles.name.font);
                const padding = Math.ceil(fontSize * 0.1);
                const ascent = metrics.actualBoundingBoxAscent || Math.ceil(fontSize * 0.8);
                const descent = metrics.actualBoundingBoxDescent || Math.ceil(fontSize * 0.2);
                const borderWidth = 1;
                const boxX = x - padding;
                const boxY = currentY - ascent - padding;
                const boxWidth = combinedNameWidth + padding * 2;
                const boxHeight = ascent + descent + padding * 2;
                const innerX = boxX + borderWidth;
                const innerY = boxY + borderWidth;
                const innerWidth = boxWidth - borderWidth * 2;
                const innerHeight = boxHeight - borderWidth * 2;
                const bgGradient = createAngleGradient(ctx, innerX, innerY, innerWidth, innerHeight, 150);
                bgGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
                bgGradient.addColorStop(0.15, 'rgba(0, 0, 0, 0)');
                bgGradient.addColorStop(0.25, '#00000d');
                bgGradient.addColorStop(1, '#00000d');
                ctx.fillStyle = bgGradient;
                ctx.fillRect(innerX, innerY, innerWidth, innerHeight);

                const borderGradient = createAngleGradient(ctx, boxX, boxY, boxWidth, boxHeight, 290);
                borderGradient.addColorStop(0.05, '#666680');
                borderGradient.addColorStop(0.1, '#636c88');
                borderGradient.addColorStop(0.2, 'rgba(0, 0, 0, 0)');
                borderGradient.addColorStop(0.9, 'rgba(0, 0, 0, 0)');
                borderGradient.addColorStop(0.95, 'rgba(132, 135, 157, 0.7)');
                borderGradient.addColorStop(1, 'rgba(132, 135, 157, 0.7)');
                ctx.strokeStyle = borderGradient;
                ctx.lineWidth = borderWidth;
                ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);
                ctx.restore();
            }
            if (prefixText) {
                renderStyledText(ctx, prefixText, x, currentY, styles.prefix);
            }
            if (hasBreakthroughEffect) {
                renderStyledText(ctx, breakthroughTitle, nameX, currentY, styles.name);
                if (breakthroughSuffix && breakthroughSuffixStyle) {
                    renderStyledText(ctx, breakthroughSuffix, nameX + breakthroughTitleWidth, currentY, breakthroughSuffixStyle);
                }
            } else {
                renderStyledText(ctx, nameText, nameX, currentY, styles.name);
            }
            if (countText) {
                const countX = nameX + nameWidth + countGap;
                renderStyledText(ctx, countText, countX, currentY, styles.count);
            }
            currentY += firstLineHeight;
            if (subtitleText && styles.subtitle) {
                renderStyledText(ctx, subtitleText, nameX, currentY, styles.subtitle);
                currentY += subtitleLineHeight;
            }
        }
    };
}

async function ensureShareFontsLoaded() {
    if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') {
        return;
    }
    const requests = [
        document.fonts.load('700 48px "Sarpanch"'),
        document.fonts.load('600 28px "Sarpanch"'),
        document.fonts.load('500 22px "Sarpanch"'),
        document.fonts.load('italic 500 20px "Sarpanch"'),
        document.fonts.load('600 28px "Playfair Display"'),
        document.fonts.load('700 26px "Noto Serif TC"'),
        document.fonts.load('700 22px "Press Start 2P"'),
        document.fonts.load('600 35px "Parisienne"'),
        document.fonts.load('700 italic 35px "Jura"'),
        document.fonts.load('600 34px "Kings"')
    ];
    try {
        await Promise.allSettled(requests);
    } catch (error) {
        console.warn('Font loading for share image failed', error);
    }
}



async function generateShareImage(summary, mode = 'download') {
    if (typeof document === 'undefined') {
        return false;
    }

    await ensureShareFontsLoaded();

    const canvas = document.createElement('canvas');
    const width = 1260;
    canvas.width = width;
    let context = canvas.getContext('2d');
    if (!context) {
        return false;
    }

    const margin = 64;
    const maxWidth = width - margin * 2;
    const headerFont = '700 48px "Sarpanch", sans-serif';
    const detailFont = '500 26px "Sarpanch", sans-serif';
    const auraFont = '400 22px "Noto Serif TC", serif';
    const milestoneFont = '500 22px "Sarpanch", sans-serif';

    const eventSummary = summary.eventLabels && summary.eventLabels.length > 0
        ? summary.eventLabels.join(', ')
        : EVENT_SUMMARY_EMPTY_LABEL;
    const auraFilterSummary = summary.auraFilterSummary || getAuraFilterSummaryText();

    const detailEntries = [
        `Rolls: ${formatWithCommas(summary.rolls)}`,
        `Luck: ${formatWithCommas(summary.luck)}`,
        `Biome: ${summary.biomeLabel}`,
        `Rune: ${summary.runeLabel || 'None'}`,
        `Time: ${summary.timeLabel || 'Neutral'}`,
        `Events: ${eventSummary}`,
        `Included Aura Tiers: ${auraFilterSummary}`,
        `Duration: ${Math.max(0, Math.round(summary.executionSeconds))}s`,
        `Total XP: ${formatWithCommas(summary.xpTotal)}`
    ];

    const milestoneEntries = summary.xpLines && summary.xpLines.length > 0
        ? summary.xpLines.slice()
        : [];

    const auraVisuals = Array.isArray(summary.shareVisuals) && summary.shareVisuals.length > 0
        ? summary.shareVisuals.slice()
        : null;

    const drawQueue = [];
    drawQueue.push({ type: 'text', text: 'Sols Roll Result', font: headerFont, color: '#f6fbff', lineHeight: 58 });
    drawQueue.push({ type: 'spacer', size: 22 });

    context.font = detailFont;
    detailEntries.forEach(entry => {
        wrapTextLines(context, entry, maxWidth).forEach(line => {
            drawQueue.push({ type: 'text', text: line, font: detailFont, color: '#cfe7ff', lineHeight: 36 });
        });
    });

    drawQueue.push({ type: 'spacer', size: 30 });
    drawQueue.push({ type: 'text', text: 'Auras Rolled', font: detailFont, color: '#f6c361', lineHeight: 36 });

    const auraBlocks = [];
    if (auraVisuals && auraVisuals.length > 0) {
        auraVisuals.forEach(record => {
            const block = createAuraBlock(context, record);
            auraBlocks.push(block);
        });
        if (auraBlocks.length > 0) {
            auraBlocks[auraBlocks.length - 1].gapAfter = 0;
            auraBlocks.forEach(block => {
                drawQueue.push({ type: 'aura', block });
            });
        }
    } else {
        const fallbackAuras = summary.shareRecords && summary.shareRecords.length > 0
            ? summary.shareRecords.slice()
            : ['No auras were rolled.'];
        context.font = auraFont;
        fallbackAuras.forEach(entry => {
            wrapTextLines(context, entry, maxWidth).forEach(line => {
                drawQueue.push({ type: 'text', text: line, font: auraFont, color: '#ffffff', lineHeight: 32 });
            });
        });
    }

    if (milestoneEntries.length > 0) {
        drawQueue.push({ type: 'spacer', size: 30 });
        drawQueue.push({ type: 'text', text: 'Milestones', font: detailFont, color: '#7fe3ff', lineHeight: 36 });
        context.font = milestoneFont;
        milestoneEntries.forEach(entry => {
            wrapTextLines(context, entry, maxWidth).forEach(line => {
                drawQueue.push({ type: 'text', text: line, font: milestoneFont, color: '#dbefff', lineHeight: 32 });
            });
        });
    }

    let totalHeight = margin;
    drawQueue.forEach(command => {
        if (command.type === 'spacer') {
            totalHeight += command.size;
        } else if (command.type === 'aura') {
            totalHeight += command.block.contentHeight + command.block.gapAfter;
        } else {
            totalHeight += command.lineHeight;
        }
    });
    totalHeight += margin;

    canvas.height = Math.max(560, Math.ceil(totalHeight));
    context = canvas.getContext('2d');
    if (!context) {
        return false;
    }

    const gradient = context.createLinearGradient(0, 0, width, canvas.height);
    gradient.addColorStop(0, '#050a18');
    gradient.addColorStop(1, '#0b1530');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, canvas.height);

    context.strokeStyle = 'rgba(127, 227, 255, 0.45)';
    context.lineWidth = 2;
    context.strokeRect(margin - 30, margin - 30, width - (margin - 30) * 2, canvas.height - (margin - 30) * 2);

    context.textBaseline = 'top';

    let cursorY = margin;
    drawQueue.forEach(command => {
        if (command.type === 'spacer') {
            cursorY += command.size;
            return;
        }
        if (command.type === 'aura') {
            command.block.draw(context, margin, cursorY);
            cursorY += command.block.contentHeight + command.block.gapAfter;
            return;
        }
        context.font = command.font;
        context.fillStyle = command.color;
        context.fillText(command.text, margin, cursorY);
        cursorY += command.lineHeight;
    });

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
        return 'failed';
    }

    let fallbackFromCopy = false;
    if (mode === 'copy') {
        const copied = await copyImageBlobToClipboard(blob);
        if (copied) {
            return 'copied';
        }
        mode = 'download';
        fallbackFromCopy = true;
    }

    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'sols-roll-result.png';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    } finally {
        if (typeof window !== 'undefined') {
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
            URL.revokeObjectURL(url);
        }
    }

    if (mode === 'download') {
        return fallbackFromCopy ? 'downloaded-fallback' : 'downloaded';
    }
    return 'failed';
}

function wrapTextLines(context, text, maxWidth) {
    const sanitized = typeof text === 'string' ? text : String(text ?? '');
    const baseLines = sanitized.split(/\n/);
    const lines = [];

    baseLines.forEach(segment => {
        const words = segment.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines.push('');
            return;
        }

        let currentLine = '';
        words.forEach(word => {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (context.measureText(candidate).width <= maxWidth) {
                currentLine = candidate;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = word;
            }
        });

        if (currentLine) {
            lines.push(currentLine);
        }
    });

    return lines;
}
