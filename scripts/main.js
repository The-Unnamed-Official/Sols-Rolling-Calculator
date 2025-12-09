// Reference frequently accessed UI elements at module load
let feedContainer = document.getElementById('simulation-feed');
let luckField = document.getElementById('luck-total');
const pageBody = document.body;
const reduceMotionToggleButton = document.getElementById('reduceMotionToggle');
const versionInfoButton = document.getElementById('versionInfoButton');
const clickSoundEffectElement = document.getElementById('clickSoundFx');
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

const CHANGELOG_VERSION_STORAGE_KEY = 'solsRollingCalculator:lastSeenChangelogVersion';

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


const selectWidgetRegistry = new Map();

const BIOME_PRIMARY_SELECT_ID = 'biome-primary-dropdown';
const BIOME_OTHER_SELECT_ID = 'biome-other-dropdown';
const BIOME_TIME_SELECT_ID = 'biome-time-dropdown';
const DAY_RESTRICTED_BIOMES = new Set(['pumpkinMoon', 'graveyard']);
const CYBERSPACE_ILLUSIONARY_WARNING_STORAGE_KEY = 'solsRollingCalculator:hideCyberspaceIllusionaryWarning';
let lastPrimaryBiomeSelection = null;
const DEV_BIOME_IDS = new Set(['anotherRealm', 'unknown']);
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
}

function updateUiToggleStatus() {
    const uiToggle = document.getElementById('audioUiToggle');
    if (uiToggle) {
        uiToggle.checked = appState.audio.ui;
    }
}

function setChannelVolume(channel, normalized) {
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
    const channelVolume = getChannelVolumeMultiplier(category);
    if (channelVolume <= 0) return false;
    if (category === 'ui') return appState.audio.ui;
    if (category === 'cutscene') return appState.audio.roll;
    return appState.audio.roll;
}

function playSoundEffect(audioElement, category = 'rolling') {
    if (!audioElement) return;
    if (!isSoundChannelActive(category)) return;
    if (category !== 'ui' && appState.videoPlaying) return;

    const baseGain = resolveBaseGain(audioElement, category === 'ui' ? 0.3 : 1);
    const channelMultiplier = getChannelVolumeMultiplier(category);
    const playbackGain = baseGain * channelMultiplier;
    if (playbackGain <= 0) return;

    const spawnFallbackPlayer = () => {
        const sourceUrl = normalizeMediaSource(audioElement);
        if (!sourceUrl) {
            audioElement.currentTime = 0;
            audioElement.muted = false;
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

        fallbackPlayer.volume = clamp01(playbackGain);

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
            spawnFallbackPlayer();
        }
        return;
    }

    const sourceKey = normalizeMediaSource(audioElement);
    if (!sourceKey) {
        spawnFallbackPlayer();
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
        if (!buffer) {
            spawnFallbackPlayer();
            return;
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        const gainNode = context.createGain();
        gainNode.gain.value = playbackGain;
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
    const glitchBiomeActive = isGlitchBiomeSelected();
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
}

function toggleReducedMotion() {
    appState.reduceMotion = !appState.reduceMotion;
    applyReducedMotionState(appState.reduceMotion);
    playSoundEffect(clickSoundEffectElement, 'ui');
}

const reduceMotionMediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

if (reduceMotionMediaQuery) {
    appState.reduceMotion = reduceMotionMediaQuery.matches;
    reduceMotionMediaQuery.addEventListener('change', event => {
        appState.reduceMotion = event.matches;
        applyReducedMotionState(appState.reduceMotion);
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
    unknown: { image: 'files/unknownBiomeImage.png', music: 'files/unknownBiomeMusic.mp3' },
    graveyard: { image: 'files/graveyardBiomeImage.jpg', music: 'files/graveyardBiomeMusic.mp3' },
    pumpkinMoon: { image: 'files/pumpkinMoonBiomeImage.jpg', music: 'files/pumpkinMoonBiomeMusic.mp3' },
    bloodRain: { image: 'files/bloodRainBiomeImage.jpg', music: 'files/bloodRainBiomeMusic.mp3' },
    limbo: { image: 'files/limboImage.jpg', music: 'files/limboMusic.mp3' },
    blazing: { image: 'files/blazingBiomeImage.jpg', music: 'files/blazingBiomeMusic.mp3' }
};

function updateBloodRainWeather(biome) {
    const container = document.querySelector('.climate--blood-rain');
    if (!container) return;

    const isActive = biome === 'bloodRain';
    container.dataset.active = isActive ? 'true' : 'false';
    if (!isActive) {
        if (container.childElementCount > 0) {
            container.replaceChildren();
        }
        container.dataset.initialized = 'false';
        return;
    }

    let dropTotal = 80;
    let viewportWidth = 1280;
    let viewportHeight = 720;
    if (typeof window !== 'undefined') {
        viewportWidth = window.innerWidth || viewportWidth;
        viewportHeight = window.innerHeight || viewportHeight;
        const density = Math.max(72, Math.floor((viewportWidth * viewportHeight) / 22000));
        dropTotal = Math.min(220, density);
    }

    container.replaceChildren();

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < dropTotal; i++) {
        const drop = document.createElement('span');
        drop.className = 'blood-rain-drop';
        const offsetX = randomDecimalBetween(0, 100);
        const delay = randomDecimalBetween(0, 2.2);
        const duration = randomDecimalBetween(1.2, 2.8);
        drop.style.setProperty('--start-offset', `${offsetX}%`);
        drop.style.setProperty('--travel-duration', `${duration}s`);
        drop.style.setProperty('--start-delay', `${delay}s`);
        fragment.appendChild(drop);
    }

    container.appendChild(fragment);
    container.dataset.initialized = 'true';
}

function shouldUseGlitchBaseEffect() {
    return glitchPresentationEnabled && glitchUiState.isUiGlitching;
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
    const duration = randomDecimalBetween(0.18, 0.45);
    const wobble = randomDecimalBetween(0.08, 0.18);
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
    }, Math.floor(randomDecimalBetween(650, 1080)));
}

const GLITCH_BURST_TRIGGER_CHANCE = 0.42;

function computeGlitchRestDelay() {
    return Math.floor(randomDecimalBetween(8000, 16000));
}

function computeGlitchBurstDuration() {
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
    const themeCandidate = selection.themeBiome || biome;
    const assetKey = Object.prototype.hasOwnProperty.call(biomeAssets, themeCandidate)
        ? themeCandidate
        : (Object.prototype.hasOwnProperty.call(biomeAssets, biome) ? biome : 'normal');
    const assets = biomeAssets[assetKey] || biomeAssets.normal;
    const isVideoAsset = assets && typeof assets.image === 'string' && /\.(webm|mp4|ogv|ogg)$/i.test(assets.image);

    const body = document.body;
    const root = document.documentElement;
    const isBloodRain = assetKey === 'bloodRain';
    if (body) {
        body.classList.toggle('biome--blood-rain', isBloodRain);
    }
    if (root) {
        root.classList.toggle('biome--blood-rain', isBloodRain);
    }

    updateBloodRainWeather(assetKey);

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
let lastXcMultiplier = 1;
let lastDaveMultiplier = 1;
let lastDorcelessnessMultiplier = 1;

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

function isLuckPresetStackingEnabled() {
    if (typeof document === 'undefined') {
        return false;
    }

    const toggle = document.getElementById('luck-preset-add-toggle');
    return Boolean(toggle && toggle.checked);
}

function syncLuckVisualEffects(luckValue) {
    if (!pageBody) {
        return;
    }

    const shouldApplyMillionEffect = luckValue >= MILLION_LUCK_PRESET && !appState.reduceMotion;

    pageBody.classList.toggle('luck-effect--million', shouldApplyMillionEffect);

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
    if (options.luckSource) {
        setLuckSelectionSource(options.luckSource);
    }

    const stackPresets = isLuckPresetStackingEnabled();
    const luckInput = document.getElementById('luck-total');
    const existingLuck = luckInput ? getNumericInputValue(luckInput, { min: 1 }) : baseLuck;
    const startingLuck = Number.isFinite(existingLuck) ? existingLuck : baseLuck;
    const targetLuck = Math.max(1, stackPresets ? startingLuck + value : value);

    baseLuck = targetLuck;

    if (!stackPresets) {
        currentLuck = targetLuck;
        lastVipMultiplier = 1;
        lastXyzMultiplier = 1;
        lastXcMultiplier = 1;
        lastDaveMultiplier = 1;
        lastDorcelessnessMultiplier = 1;
        document.getElementById('vip-dropdown').value = '1';
        document.getElementById('xyz-luck-toggle').checked = false;
        document.getElementById('xc-luck-toggle').checked = false;
        document.getElementById('dorcelessness-luck-toggle').checked = false;
        document.getElementById('yg-blessing-toggle').checked = false;
        refreshCustomSelect('vip-dropdown');
        if (document.getElementById('dave-luck-dropdown')) {
            document.getElementById('dave-luck-dropdown').value = '1';
            refreshCustomSelect('dave-luck-dropdown');
        }
    }

    if (luckInput) {
        setNumericInputValue(luckInput, targetLuck, { format: true, min: 1 });
    }

    syncLuckVisualEffects(targetLuck);

    if (stackPresets) {
        recomputeLuckValue();
    }

    if (typeof applyOblivionPresetOptions === 'function') {
        applyOblivionPresetOptions(options);
    }
    if (typeof applyDunePresetOptions === 'function') {
        applyDunePresetOptions(options);
    }
}

function applyLuckPresetDelta(presetValue) {
    const numericPresetValue = Number(presetValue);
    const stackPresets = isLuckPresetStackingEnabled();

    if (!stackPresets || !Number.isFinite(numericPresetValue) || numericPresetValue <= 0) {
        return;
    }

    applyLuckValue(-numericPresetValue);
}

function syncLuckPresetSubtractButtons() {
    const stackable = isLuckPresetStackingEnabled();

    if (document.body) {
        document.body.classList.toggle('luck-preset--stackable', stackable);
    }

    const subtractButtons = document.querySelectorAll('.preset-button__subtract');
    subtractButtons.forEach(button => {
        button.tabIndex = stackable ? 0 : -1;
        button.setAttribute('aria-hidden', stackable ? 'false' : 'true');
    });
}

function createLuckPresetSubtractButton(button, presetValue) {
    const subtractButton = document.createElement('button');
    const formattedValue = Number(presetValue).toLocaleString('en-US');

    subtractButton.type = 'button';
    subtractButton.className = 'preset-button__subtract';
    subtractButton.textContent = 'Decrease';
    subtractButton.dataset.luckValue = String(presetValue);
    subtractButton.setAttribute('aria-label', `Remove ${formattedValue} luck`);
    subtractButton.addEventListener('click', event => {
        event.stopPropagation();
        applyLuckPresetDelta(presetValue);
    });

    return subtractButton;
}

function setupLuckPresetSubtractButtons() {
    const panel = document.getElementById('luck-preset-panel');

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
        button.style.display = '';

        const parent = button.parentNode;
        if (!parent) {
            return;
        }

        parent.insertBefore(wrapper, button);
        wrapper.appendChild(button);

        const subtractButton = createLuckPresetSubtractButton(button, presetValue);
        wrapper.appendChild(subtractButton);
    });

    const toggle = document.getElementById('luck-preset-add-toggle');
    if (toggle) {
        toggle.addEventListener('change', syncLuckPresetSubtractButtons);
    }

    syncLuckPresetSubtractButtons();
}

function applyRollPreset(value) {
    const rollField = document.getElementById('roll-total');
    if (!rollField) {
        return;
    }

    setNumericInputValue(rollField, value, { format: true, min: 1, max: 100000000 });
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
        xc: document.getElementById('xc-luck-toggle'),
        dorcelessness: document.getElementById('dorcelessness-luck-toggle'),
        dave: document.getElementById('dave-luck-dropdown'),
        luckInput: document.getElementById('luck-total')
    };

    const biomeValue = controls.biome ? controls.biome.value : 'normal';
    const isLimboBiome = biomeValue === 'limbo';

    const multipliers = {
        vip: parseFloat(controls.vip ? controls.vip.value : '1') || 1,
        xyz: controls.xyz && controls.xyz.checked ? 2 : 1,
        xc: controls.xc && controls.xc.checked ? 2 : 1,
        dorcelessness: controls.dorcelessness && controls.dorcelessness.checked ? 2 : 1,
        dave: isLimboBiome && controls.dave ? parseFloat(controls.dave.value) || 1 : 1
    };

    const luckField = controls.luckInput;
    const rawLuckValue = luckField ? (luckField.dataset.rawValue ?? '') : '';
    const enteredLuck = rawLuckValue ? Number.parseFloat(rawLuckValue) : NaN;
    if (luckField && rawLuckValue && Number.isFinite(enteredLuck) && enteredLuck !== currentLuck) {
        const normalizedLuck = Math.max(1, enteredLuck);
        baseLuck = normalizedLuck;
        currentLuck = normalizedLuck;
        setLuckSelectionSource(LUCK_SELECTION_SOURCE.MANUAL);
        lastVipMultiplier = 1;
        lastXyzMultiplier = 1;
        lastXcMultiplier = 1;
        lastDaveMultiplier = 1;
        lastDorcelessnessMultiplier = 1;
        if (controls.vip) {
            controls.vip.value = '1';
            refreshCustomSelect('vip-dropdown');
        }
        if (controls.xyz) {
            controls.xyz.checked = false;
        }
        if (controls.xc) {
            controls.xc.checked = false;
        }
        if (controls.dorcelessness) {
            controls.dorcelessness.checked = false;
        }
        if (controls.dave) {
            controls.dave.value = '1';
            refreshCustomSelect('dave-luck-dropdown');
        }
        const shouldFormat = document.activeElement !== luckField;
        setNumericInputValue(luckField, baseLuck, { format: shouldFormat, min: 1 });
        syncLuckVisualEffects(baseLuck);
        if (typeof applyOblivionPresetOptions === 'function') {
            applyOblivionPresetOptions({});
        }
        if (typeof applyDunePresetOptions === 'function') {
            applyDunePresetOptions({});
        }
        return;
    }

    currentLuck = baseLuck * multipliers.vip * multipliers.xyz * multipliers.xc * multipliers.dorcelessness * multipliers.dave;
    lastVipMultiplier = multipliers.vip;
    lastXyzMultiplier = multipliers.xyz;
    lastXcMultiplier = multipliers.xc;
    lastDaveMultiplier = multipliers.dave;
    lastDorcelessnessMultiplier = multipliers.dorcelessness;
    if (luckField) {
        const shouldFormat = document.activeElement !== luckField;
        setNumericInputValue(luckField, currentLuck, { format: shouldFormat, min: 1 });
    }

    syncLuckVisualEffects(currentLuck);
}

function resetLuckFields() {
    const luckInput = document.getElementById('luck-total');
    if (luckInput) {
        const shouldFormat = document.activeElement !== luckInput;
        setNumericInputValue(luckInput, 1, { format: shouldFormat, min: 1 });
    }
    playSoundEffect(clickSoundEffectElement, 'ui');
    recomputeLuckValue();
    if (typeof applyOblivionPresetOptions === 'function') {
        applyOblivionPresetOptions({});
    }
    if (typeof applyDunePresetOptions === 'function') {
        applyDunePresetOptions({});
    }
}

function resetRollCount() {
    const rollField = document.getElementById('roll-total');
    if (rollField) {
        const shouldFormat = document.activeElement !== rollField;
        setNumericInputValue(rollField, 1, { format: shouldFormat, min: 1, max: 100000000 });
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
    const xcLuckContainer = document.getElementById('xc-luck-wrapper');
    const dorcelessnessLuckContainer = document.getElementById('dorcelessness-luck-wrapper');
    const ygBlessingContainer = document.getElementById('yg-blessing-wrapper');
    const luckPresets = document.getElementById('luck-preset-panel');
    const voidHeartBtn = document.getElementById('void-heart-trigger');
    if (biome === 'limbo') {
        if (daveLuckContainer) daveLuckContainer.style.display = '';
        if (xyzLuckContainer) xyzLuckContainer.style.display = '';
        if (xcLuckContainer) xcLuckContainer.style.display = '';
        if (dorcelessnessLuckContainer) dorcelessnessLuckContainer.style.display = '';
        if (ygBlessingContainer) ygBlessingContainer.style.display = '';
    } else {
        if (daveLuckContainer) daveLuckContainer.style.display = 'none';
        if (xyzLuckContainer) xyzLuckContainer.style.display = '';
        if (xcLuckContainer) xcLuckContainer.style.display = '';
        if (dorcelessnessLuckContainer) dorcelessnessLuckContainer.style.display = '';
        if (ygBlessingContainer) ygBlessingContainer.style.display = '';
    }

    if (luckPresets) {
        const isLimbo = biome === 'limbo';
        Array.from(luckPresets.children).forEach(element => {
            const containsVoidHeart = Boolean(voidHeartBtn && (element === voidHeartBtn || element.contains(voidHeartBtn)));
            const shouldShow = isLimbo ? containsVoidHeart : !containsVoidHeart;

            element.style.display = shouldShow ? '' : 'none';

            if (containsVoidHeart && voidHeartBtn) {
                voidHeartBtn.style.display = shouldShow ? '' : 'none';
            }
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
    if (aura && aura.disableRarityClass) return '';
    if (aura && aura.name === 'Fault') return 'rarity-tier-challenged';
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
    ['Divinus : Love', 'sigil-outline-valentine'],
    ['Flushed : Heart Eye', 'sigil-outline-valentine'],
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
    ['Werefolf', 'sigil-outline-blood'],
    ['Bloodgarden', 'sigil-outline-blood'],
]);

const glitchOutlineNames = new Set(['Fault', 'Glitch', 'Oppression']);
const dreamspaceOutlineNames = new Set(['Dreammetric', '★★★', '★★', '★']);
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

    const auraData = typeof aura === 'string' ? null : aura;

    if (auraMatchesAnyBiome(auraData, ['pumpkinMoon', 'graveyard'])) {
        classes.push('sigil-outline-halloween');
    }

    const shortName = name.includes(' - ') ? name.split(' - ')[0].trim() : name.trim();
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
let currentOblivionPresetLabel = 'Select preset';
let oblivionAuraData = null;
let memoryAuraData = null;

let dunePresetEnabled = false;
let currentDunePresetLabel = 'Select preset';
let duneAuraData = null;

function handleOblivionPresetSelection(presetKey) {
    const options = {};
    if (presetKey === OBLIVION_PRESET_IDENTIFIER) {
        options.activateOblivionPreset = true;
        options.presetLabel = 'Oblivion Potion Preset';
    } else {
        options.activateOblivionPreset = false;
        options.presetLabel = 'Godlike + Heavenly + Bound';
    }

    options.luckSource = LUCK_SELECTION_SOURCE.STANDARD_PRESET;
    applyLuckValue(OBLIVION_LUCK_TARGET, options);

    const dropdown = document.getElementById('oblivion-preset-menu');
    if (dropdown) {
        dropdown.open = false;
        const summary = dropdown.querySelector('.preset-toggle__summary');
        if (summary) {
            summary.focus();
        }
    }
}

function handleDunePresetSelection(presetKey) {
    const options = {};
    if (presetKey === DUNE_PRESET_IDENTIFIER) {
        options.activateDunePreset = true;
        options.dunePresetLabel = 'Potion of Dune Preset';
    } else {
        options.activateDunePreset = false;
        options.dunePresetLabel = 'Popping Potion Preset';
    }

    options.luckSource = LUCK_SELECTION_SOURCE.STANDARD_PRESET;
    applyLuckValue(DUNE_LUCK_TARGET, options);

    const dropdown = document.getElementById('dune-preset-menu');
    if (dropdown) {
        dropdown.open = false;
        const summary = dropdown.querySelector('.preset-toggle__summary');
        if (summary) {
            summary.focus();
        }
    }
}

function updateOblivionPresetDisplay() {
    const selection = document.getElementById('oblivion-preset-label');
    if (selection) {
        selection.textContent = currentOblivionPresetLabel;
        selection.classList.toggle('preset-toggle__selection--placeholder', currentOblivionPresetLabel === 'Select preset');
    }
}

function updateDunePresetDisplay() {
    const selection = document.getElementById('dune-preset-label');
    if (selection) {
        selection.textContent = currentDunePresetLabel;
        selection.classList.toggle('preset-toggle__selection--placeholder', currentDunePresetLabel === 'Select preset');
    }
}

function applyOblivionPresetOptions(options = {}) {
    oblivionPresetEnabled = options.activateOblivionPreset === true;

    if (typeof options.presetLabel === 'string') {
        currentOblivionPresetLabel = options.presetLabel;
    } else {
        currentOblivionPresetLabel = 'Select preset';
    }

    updateOblivionPresetDisplay();
}

function applyDunePresetOptions(options = {}) {
    dunePresetEnabled = options.activateDunePreset === true;

    if (typeof options.dunePresetLabel === 'string') {
        currentDunePresetLabel = options.dunePresetLabel;
    } else {
        currentDunePresetLabel = 'Select preset';
    }

    updateDunePresetDisplay();
}

function formatAuraNameMarkup(aura, overrideName) {
    if (!aura) return overrideName || '';
    const baseName = typeof overrideName === 'string' && overrideName.length > 0 ? overrideName : aura.name;
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

function determineResultPriority(aura, baseChance) {
    if (!aura) return baseChance;
    if (aura.name === OBLIVION_AURA_LABEL) return Number.POSITIVE_INFINITY;
    if (aura.name === MEMORY_AURA_LABEL) return Number.MAX_SAFE_INTEGER;
    if (aura.name === DUNE_AURA_LABEL) return Number.MAX_SAFE_INTEGER - 1;
    return baseChance;
}

const MEGAPHONE_AURA_NAME = 'Megaphone - 5,000';

const NATIVE_BREAKTHROUGH_MULTIPLIERS = Object.freeze({
    cyberspace: 2,
    blazing: 2,
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
    { name: "Luminosity - 1,200,000,000", chance: 1200000000, cutscene: "luminosity-cutscene" },
    { name: "Erebus - 1,200,000,000", chance: 1200000000, nativeBiomes: ["glitch", "bloodRain"], cutscene: "erebus-cutscene" },
    { name: "Pixelation - 1,073,741,824", chance: 1073741824, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"], cutscene: "pixelation-cutscene" },
    { name: "Nyctophobia - 1,011,111,010", chance: 1011111010, nativeBiomes: ["limbo"], cutscene: "nyctophobia-cutscene" },
    { name: "Lamenthyr - 1,000,000,000", chance: 1000000000, nativeBiomes: ["glitch", "bloodRain"], cutscene: "lamenthyr-cutscene" },
    { name: "Arachnophobia - 940,000,000", chance: 940000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Ravage - 930,000,000", chance: 930000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Dreamscape - 850,000,000", chance: 850000000, nativeBiomes: ["limbo"] },
    { name: "Aegis - 825,000,000", chance: 825000000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Aegis : Watergun - 825,000,000", chance: 825000000, breakthroughs: nativeBreakthroughs("blazing") },
    { name: "Apostolos : Veil - 800,000,000", chance: 800000000, nativeBiomes: ["graveyard", "pumpkinMoon"] },
    { name: "Ruins : Withered - 800,000,000", chance: 800000000 },
    { name: "Sovereign - 750,000,000", chance: 750000000 },
    { name: "Malediction - 730,000,000", chance: 730000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Banshee - 730,000,000", chance: 730000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Wraithlight - 695,000,000", chance: 695000000, nativeBiomes: ["glitch", "bloodRain"] },
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
    { name: "Abyssal Hunter - 400,000,000", chance: 400000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Impeached : I'm Peach - 400,000,000", chance: 400000000 },
    { name: "CHILLSEAR - 375,000,000", chance: 375000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Flora : Evergreen - 370,073,730", chance: 370073730 },
    { name: "Atlas - 360,000,000", chance: 360000000, breakthroughs: nativeBreakthroughs("sandstorm") },
    { name: "Archangel - 350,000,000", chance: 350000000, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Jazz : Orchestra - 336,870,912", chance: 336870912 },
    { name: "Dreammetric - 320,000,000", chance: 320000000, nativeBiomes: ["dreamspace"], cutscene: "dreammetric-cutscene" },
    { name: "LOTUSFALL - 320,000,000", chance: 320000000 },
    { name: "Maelstrom - 309,999,999", chance: 309999999, breakthroughs: nativeBreakthroughs("windy") },
    { name: "Manta - 300,000,000", chance: 300000000, breakthroughs: nativeBreakthroughs("blazing") },
    { name: "Overture : History - 300,000,000", chance: 300000000 },
    { name: "Bloodlust - 300,000,000", chance: 300000000, breakthroughs: nativeBreakthroughs("hell") },
    { name: "Exotic : Void - 299,999,999", chance: 299999999 },
    { name: "Graveborn - 290,000,000", chance: 290000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Astral : Zodiac - 267,200,000", chance: 267200000, breakthroughs: nativeBreakthroughs("starfall") },
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
    { name: "Starscourge : Radiant - 100,000,000", chance: 100000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Chromatic : GENESIS - 99,999,999", chance: 99999999 },
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
    { name: "Reaper - 66,000,000", chance: 66000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Antivirus - 62,500,000", chance: 62500000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "SENTINEL - 60,000,000", chance: 60000000 },
    { name: "Twilight : Iridescent Memory - 60,000,000", chance: 60000000, breakthroughs: nativeBreakthroughs("night") },
    { name: "Matrix - 50,000,000", chance: 50000000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Runic - 50,000,000", chance: 50000000 },
    { name: "Exotic : APEX - 49,999,500", chance: 49999500 },
    { name: "Santa Frost - 45,000,000", chance: 45000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Overseer - 45,000,000", chance: 45000000 },
    { name: "{J u x t a p o s i t i o n} - 40,440,400", chance: 40440400, nativeBiomes: ["limbo"] },
    { name: "Virtual : Fatal Error - 40,413,000", chance: 40413000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Soul Hunter - 40,000,000", chance: 40000000, nativeBiomes: ["graveyard"] },
    { name: "Chromatic : Kromat1k - 40,000,000", chance: 40000000 },
    { name: "Ethereal - 35,000,000", chance: 35000000 },
    { name: "Headless : Horseman - 32,000,000", chance: 32000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Innovator - 30,000,000", chance: 30000000 },
    { name: "Arcane : Dark - 30,000,000", chance: 30000000 },
    { name: "Blizzard - 27,315,000", chance: 27315000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Aviator - 24,000,000", chance: 24000000 },
    { name: "Cryptfire - 21,000,000", chance: 21000000, nativeBiomes: ["graveyard"] },
    { name: "Chromatic - 20,000,000", chance: 20000000 },
    { name: "Lullaby - 17,000,000", chance: 17000000, breakthroughs: nativeBreakthroughs("night") },
    { name: "Icarus - 15,660,000", chance: 15660000, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Sinister - 15,000,000", chance: 15000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Arcane : Legacy - 15,000,000", chance: 15000000 },
    { name: "Sirius - 14,000,000", chance: 14000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Stormal : Hurricane - 13,500,000", chance: 13500000, breakthroughs: nativeBreakthroughs("windy") },
    { name: "Glitch - 12,210,110", chance: 12210110, nativeBiomes: ["glitch"] },
    { name: "Wonderland - 12,000,000", chance: 12000000, breakthroughs: nativeBreakthroughs("snowy") },
    { name: "Sailor - 12,000,000", chance: 12000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Moonflower - 10,000,000", chance: 10000000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Starscourge - 10,000,000", chance: 10000000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Stargazer - 9,200,000", chance: 9200000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Helios - 9,000,000", chance: 9000000 },
    { name: "Nihility - 9,000,000", chance: 9000000, breakthroughs: nativeBreakthroughs("null", "limbo"), nativeBiomes: ["limbo-null"] },
    { name: "Harnessed - 8,500,000", chance: 8500000 },
    { name: "Origin : Onion - 8,000,000", chance: 8000000 },
    { name: "Divinus : Guardian - 7,777,777", chance: 7777777, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Nautilus : Lost - 7,700,000", chance: 7700000 },
    { name: "Velocity - 7,630,000", chance: 7630000 },
    { name: "Faith - 7,250,000", chance: 7250000, breakthroughs: nativeBreakthroughs("heaven") },
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
    { name: "Shucks - 4,460,000", chance: 4460000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Aquatic : Flame - 4,000,000", chance: 4000000 },
    { name: "Poseidon - 4,000,000", chance: 4000000, breakthroughs: nativeBreakthroughs("rainy") },
    { name: "Werewolf - 3,600,000", chance: 3600000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Shiftlock - 3,325,000", chance: 3325000, breakthroughs: nativeBreakthroughs("null", "limbo"), nativeBiomes: ["limbo-null"] },
    { name: "Headless - 3,200,000", chance: 3200000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Savior - 3,200,000", chance: 3200000 },
    { name: "Lunar : Nightfall - 3,000,000", chance: 3000000, nativeBiomes: ["graveyard"] },
    { name: "Parasite - 3,000,000", chance: 3000000, breakthroughs: nativeBreakthroughs("corruption") },
    { name: "Virtual - 2,500,000", chance: 2500000, breakthroughs: nativeBreakthroughs("cyberspace"), nativeBiomes: ["cyberspace"] },
    { name: "Undefined : Defined - 2,222,000", chance: 2222000, breakthroughs: nativeBreakthroughs("null") },
    { name: "Lunar : Cultist - 2,000,000", chance: 2000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Bounded : Unbound - 2,000,000", chance: 2000000 },
    { name: "Gravitational - 2,000,000", chance: 2000000 },
    { name: "Cosmos - 1,520,000", chance: 1520000 },
    { name: "Celestial : Wicked - 1,500,000", chance: 1500000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Astral - 1,336,000", chance: 1336000, breakthroughs: nativeBreakthroughs("starfall") },
    { name: "Rage : Brawler - 1,280,000", chance: 1280000 },
    { name: "Undefined - 1,111,000", chance: 1111000, breakthroughs: nativeBreakthroughs("null", "limbo"), nativeBiomes: ["limbo-null"] },
    { name: "Magnetic : Reverse Polarity - 1,024,000", chance: 1024000 },
    { name: "Flushed : Troll - 1,000,000", chance: 1000000 },
    { name: "Arcane - 1,000,000", chance: 1000000 },
    { name: "Kyawthuite - 850,000", chance: 850000 },
    { name: "Undead : Devil - 666,666", chance: 666666, breakthroughs: nativeBreakthroughs("hell") },
    { name: "Warlock - 666,000", chance: 666000 },
    { name: "Pump : Trickster - 600,000", chance: 600000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Prowler - 540,000", chance: 540000, nativeBiomes: ["anotherRealm"], cutscene: "prowler-cutscene" },
    { name: "Raven - 500,000", chance: 500000, nativeBiomes: ["limbo"] },
    { name: "Hope - 488,725", chance: 488725, breakthroughs: nativeBreakthroughs("heaven") },
    { name: "Terror - 400,000", chance: 400000 },
    { name: "Celestial - 350,000", chance: 350000 },
    { name: "Watermelon - 320,000", chance: 320000 },
    { name: "Star Rider : Starfish Rider - 250,000", chance: 250000, breakthroughs: nativeBreakthroughs("starfall") },
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
    { name: "★★★ - 10,000", chance: 10000, nativeBiomes: ["dreamspace"] },
    { name: "Atomic : Riboneucleic - 9876", chance: 9876 },
    { name: "Lost Soul - 9,200", chance: 9200 },
    { name: "Honey - 8,335", chance: 8335 },
    { name: "Quartz - 8,192", chance: 8192 },
    { name: "Hazard - 7,000", chance: 7000, breakthroughs: nativeBreakthroughs("corruption") },
    { name: "Flushed : Heart Eye - 6,900", chance: 6900 },
    { name: "Flushed - 6,900", chance: 6900 },
    { name: MEGAPHONE_AURA_NAME, chance: 5000, requiresYgBlessing: true },
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
    { id: "ria24", label: "RIA Event 2024" },
    { id: "halloween24", label: "Halloween 2024" },
    { id: "winter24", label: "Winter 2024" },
    { id: "aprilFools25", label: "April Fools 2025" },
    { id: "summer25", label: "Summer 2025" },
    { id: "halloween25", label: "Halloween 2025" },
];

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
    winter24: [
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
};

const BIOME_EVENT_CONSTRAINTS = {
    graveyard: ["halloween24", "halloween25"],
    pumpkinMoon: ["halloween24", "halloween25"],
    bloodRain: ["halloween25"],
    blazing: ["summer25"],
};

const EVENT_BIOME_CONDITION_MESSAGES = Object.freeze({
    anotherRealm: 'Requires Dev Biomes to be enabled under run parameters.',
    graveyard: 'Requires Night time with Halloween 2024 or Halloween 2025 enabled.',
    pumpkinMoon: 'Requires Night time with Halloween 2024 or Halloween 2025 enabled.',
    bloodRain: 'Requires Halloween 2025 enabled.',
    blazing: 'Requires Summer 2025 enabled.',
    unknown: 'Requires Dev Biomes to be enabled under run parameters.',
});

const enabledEvents = new Set([""]);
const auraEventIndex = new Map();

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

const CUTSCENE_PRIORITY_SEQUENCE = ["oblivion-cutscene", "memory-cutscene", "neferkhaf-cutscene", "illusionary-cutscene", "equinox-cutscene", "erebus-cutscene", "luminosity-cutscene", "pixelation-cutscene", "nyctophobia-cutscene", "lamenthyr-cutscene", "dreammetric-cutscene", "oppression-cutscene", "prowler-cutscene"];

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
    "Dreammetric - 520,000,000",
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

    bindLuckPresetButtonAnimation(oneMillionButton, 'luck-preset-button--pop', ['luckPresetPop']);
    bindLuckPresetButtonAnimation(tenMillionButton, 'luck-preset-button--mega-pop', ['luckPresetMegaPop']);
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

document.addEventListener('DOMContentLoaded', initializeEventSelector);
document.addEventListener('DOMContentLoaded', initializeDevBiomeToggle);
document.addEventListener('DOMContentLoaded', updateOblivionPresetDisplay);
document.addEventListener('DOMContentLoaded', updateDunePresetDisplay);
document.addEventListener('DOMContentLoaded', setupLuckPresetSubtractButtons);
document.addEventListener('DOMContentLoaded', setupLuckPresetAnimations);
document.addEventListener('DOMContentLoaded', setupChangelogTabs);
document.addEventListener('DOMContentLoaded', setupVersionChangelogOverlay);
document.addEventListener('DOMContentLoaded', maybeShowChangelogOnFirstVisit);
document.addEventListener('DOMContentLoaded', initializeIntroOverlay);
document.addEventListener('DOMContentLoaded', initializeRollTriggerFloating);
document.addEventListener('DOMContentLoaded', setupRollCancellationControl);

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
});

const BIOME_ICON_OVERRIDES = {
    none: 'files/otherBiomeIcon.png',
    normal: 'files/otherBiomeIcon.png',
    day: 'files/otherBiomeIcon.png',
    night: 'files/otherBiomeIcon.png'
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
    const runeActive = selectedRuneConfig !== null;

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

    const limboSelected = primarySelect.value === 'limbo';
    Array.from(otherSelect.options).forEach(option => {
        const runeOption = resolveRuneConfiguration(option.value);
        let disabled = false;
        let title = '';
        if (limboSelected && runeOption) {
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
        bindNumericInputFormatting(luckField, { min: 1 });
        if (!luckField.dataset.rawValue) {
            setNumericInputValue(luckField, baseLuck, { format: true, min: 1 });
        }
    }

    const rollField = document.getElementById('roll-total');
    if (rollField) {
        bindNumericInputFormatting(rollField, { min: 1, max: 100000000 });
        if (!rollField.dataset.rawValue) {
            setNumericInputValue(rollField, 1, { format: true, min: 1, max: 100000000 });
        }
    }

    document.getElementById('vip-dropdown').addEventListener('change', recomputeLuckValue);
    const xyzToggle = document.getElementById('xyz-luck-toggle');
    if (xyzToggle) {
        xyzToggle.addEventListener('change', recomputeLuckValue);
    }
    const xcToggle = document.getElementById('xc-luck-toggle');
    if (xcToggle) {
        xcToggle.addEventListener('change', recomputeLuckValue);
    }
    const dorcelessnessToggle = document.getElementById('dorcelessness-luck-toggle');
    if (dorcelessnessToggle) {
        dorcelessnessToggle.addEventListener('change', recomputeLuckValue);
    }
    const daveDropdown = document.getElementById('dave-luck-dropdown');
    if (daveDropdown) {
        daveDropdown.addEventListener('change', recomputeLuckValue);
    }

    if (luckField) {
        luckField.addEventListener('input', () => {
            const raw = luckField.dataset.rawValue ?? '';
            const parsed = raw ? Number.parseFloat(raw) : NaN;
            const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.max(1, parsed) : 1;
            baseLuck = normalized;
            currentLuck = normalized;
            setLuckSelectionSource(LUCK_SELECTION_SOURCE.MANUAL);
            lastVipMultiplier = 1;
            lastXyzMultiplier = 1;
            lastXcMultiplier = 1;
            lastDaveMultiplier = 1;
            lastDorcelessnessMultiplier = 1;
            document.getElementById('vip-dropdown').value = '1';
            document.getElementById('xyz-luck-toggle').checked = false;
            document.getElementById('xc-luck-toggle').checked = false;
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

    const cutsceneToggle = document.getElementById('cinematicToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = 'Cutscenes (Fullscreen recommended): Off';
        cutsceneToggle.setAttribute('aria-pressed', 'false');
    }

    const glitchToggle = document.getElementById('glitchEffectsToggle');
    if (glitchToggle) {
        glitchToggle.textContent = appState.glitch ? 'Glitch Effects: On' : 'Glitch Effects: Off';
        glitchToggle.setAttribute('aria-pressed', appState.glitch ? 'true' : 'false');
    }

    applyReducedMotionState(appState.reduceMotion);

    const settingsMenu = document.getElementById('optionsMenu');
    const settingsToggleButton = document.getElementById('optionsMenuToggle');
    const settingsPanel = document.getElementById('optionsMenuPanel');
    if (settingsMenu && settingsToggleButton && settingsPanel) {
        const closeSettingsMenu = () => {
            settingsMenu.classList.remove('options-menu--open');
            settingsToggleButton.setAttribute('aria-expanded', 'false');
        };

        const openSettingsMenu = () => {
            settingsMenu.classList.add('options-menu--open');
            settingsToggleButton.setAttribute('aria-expanded', 'true');
        };

        settingsToggleButton.addEventListener('click', event => {
            event.stopPropagation();
            if (settingsMenu.classList.contains('options-menu--open')) {
                closeSettingsMenu();
            } else {
                openSettingsMenu();
                if (event.detail === 0) {
                    const firstItem = settingsPanel.querySelector('button');
                    if (firstItem) {
                        firstItem.focus({ preventScroll: true });
                    }
                }
            }
        });

        document.addEventListener('click', event => {
            if (!settingsMenu.contains(event.target)) {
                closeSettingsMenu();
            }
        });

        settingsMenu.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeSettingsMenu();
                settingsToggleButton.focus({ preventScroll: true });
            }
        });

        settingsMenu.addEventListener('focusout', event => {
            const nextFocus = event.relatedTarget;
            if (nextFocus instanceof Node && !settingsMenu.contains(nextFocus)) {
                closeSettingsMenu();
            }
        });

        closeSettingsMenu();
    }

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
const GLITCH_BREAKTHROUGH_EXCLUSION_SET = new Set(['day', 'night']);

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
        primaryBiome: selectionState?.primaryBiome || null,
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

    let allowCyberspaceNativeRarity = true;
    if (aura.nativeBiomes) {
        if (isAuraNativeTo(aura, 'limbo') && !isAuraNativeTo(aura, 'limbo-null')) {
            return Infinity;
        }

        const allowEventGlitchAccess = glitchLikeBiome
            && eventId
            && eventEnabled
            && GLITCH_EVENT_WHITELIST.has(eventId);

        const activeBiomeList = Array.isArray(activeBiomes) && activeBiomes.length > 0
            ? activeBiomes
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
            ? (inCyberspace || isRoe)
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
            const candidates = Array.isArray(breakthroughBiomes) && breakthroughBiomes.length > 0
                ? breakthroughBiomes
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
    const entries = [];
    for (const aura of registry) {
        const winCount = readAuraWinCount(aura);
        if (winCount <= 0) continue;

        const rarityClass = typeof resolveRarityClass === 'function' ? resolveRarityClass(aura, biome) : '';
        const specialClass = typeof resolveAuraStyleClass === 'function' ? resolveAuraStyleClass(aura, biome) : '';
        const eventClass = getAuraEventId(aura) ? 'sigil-event-text' : '';
        const classAttr = [rarityClass, specialClass, eventClass].filter(Boolean).join(' ');
        const formattedName = formatAuraNameMarkup(aura);
        const formattedTextName = formatAuraNameText(aura);
        const breakthroughStats = breakthroughStatsMap.get(aura.name);

        const specialClassTokens = specialClass
            ? specialClass.split(/\s+/).filter(Boolean)
            : [];

        const createShareVisualRecord = (baseName, countValue, options = {}) => ({
            aura,
            displayName: baseName,
            subtitle: aura.subtitle || null,
            prefix: typeof options.prefix === 'string' && options.prefix.length > 0 ? options.prefix : null,
            variant: options.variant || 'standard',
            count: countValue,
            countLabel: `Times Rolled: ${formatWithCommas(countValue)}`,
            classes: {
                rarity: rarityClass || null,
                special: specialClassTokens,
                event: Boolean(eventClass)
            }
        });

        const pushVisualEntry = (markup, shareText, priority, visualRecord) => {
            entries.push({ markup, share: shareText, priority, visual: visualRecord || null });
        };

        if (breakthroughStats && breakthroughStats.count > 0) {
            const btName = aura.name.replace(/-\s*[\d,]+/, `- ${formatWithCommas(breakthroughStats.btChance)}`);
            const nativeLabel = formatAuraNameMarkup(aura, btName);
            const nativeShareName = formatAuraNameText(aura, btName);
            pushVisualEntry(
                `<span class="${classAttr}">[Native] ${nativeLabel} | Times Rolled: ${formatWithCommas(breakthroughStats.count)}</span>`,
                `[Native] ${nativeShareName} | Times Rolled: ${formatWithCommas(breakthroughStats.count)}`,
                determineResultPriority(aura, breakthroughStats.btChance),
                createShareVisualRecord(btName, breakthroughStats.count, { prefix: '[Native]', variant: 'native' })
            );

            if (winCount > breakthroughStats.count) {
                const remainingCount = winCount - breakthroughStats.count;
                pushVisualEntry(
                    `<span class="${classAttr}">${formattedName} | Times Rolled: ${formatWithCommas(remainingCount)}</span>`,
                    `${formattedTextName} | Times Rolled: ${formatWithCommas(remainingCount)}`,
                    determineResultPriority(aura, aura.chance),
                    createShareVisualRecord(aura.name, remainingCount, { variant: 'standard' })
                );
            }
        } else {
            pushVisualEntry(
                `<span class="${classAttr}">${formattedName} | Times Rolled: ${formatWithCommas(winCount)}</span>`,
                `${formattedTextName} | Times Rolled: ${formatWithCommas(winCount)}`,
                determineResultPriority(aura, aura.chance),
                createShareVisualRecord(aura.name, winCount, { variant: 'standard' })
            );
        }
    }

    entries.sort((a, b) => b.priority - a.priority);
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

    const rollInputValue = getNumericInputValue(rollCountInput, { min: 1, max: 100000000 });
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
    setNumericInputValue(rollCountInput, total, { format: shouldFormatRolls, min: 1, max: 100000000 });

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

    let parsedLuck = getNumericInputValue(luckField, { min: 1 });
    if (!Number.isFinite(parsedLuck)) {
        parsedLuck = 1;
        const shouldFormatLuck = document.activeElement !== luckField;
        setNumericInputValue(luckField, parsedLuck, { format: shouldFormatLuck, min: 1 });
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

    const progressElementsAvailable = progressPanel && progressBarFill && progressLabel;
    const showProgress = progressElementsAvailable && total >= 100000;
    if (progressPanel) {
        progressPanel.style.display = showProgress ? 'grid' : 'none';
        progressPanel.classList.toggle('loading-indicator--active', showProgress);
        if (!showProgress) {
            delete progressPanel.dataset.progress;
        }
    }
    if (progressElementsAvailable) {
        progressBarFill.style.width = '0%';
        progressLabel.textContent = '0%';
        if (showProgress && progressPanel) {
            progressPanel.dataset.progress = '0';
        }
    }

    const evaluationContext = createAuraEvaluationContext(selectionState, {
        eventChecker: isEventAuraEnabled,
        eventSnapshot,
        luckValue
    });
    const computedAuras = buildComputedAuraEntries(AURA_REGISTRY, evaluationContext, luckValue, breakthroughStatsMap);

    const activeDuneAura = (dunePresetEnabled && baseLuck >= DUNE_LUCK_TARGET) ? duneAuraData : null;
    const activeOblivionAura = (oblivionPresetEnabled && luckValue >= OBLIVION_LUCK_TARGET) ? oblivionAuraData : null;
    const activeMemoryAura = (oblivionPresetEnabled && luckValue >= OBLIVION_LUCK_TARGET) ? memoryAuraData : null;
    const duneProbability = activeDuneAura ? 1 / DUNE_POTION_ODDS : 0;
    const memoryProbability = activeMemoryAura ? 1 / OBLIVION_MEMORY_ODDS : 0;
    const oblivionProbability = activeOblivionAura ? 1 / OBLIVION_POTION_ODDS : 0;
    const cutscenesEnabled = appState.cinematic === true;

    const queueAnimationFrame = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
        ? callback => window.requestAnimationFrame(callback)
        : callback => setTimeout(callback, 0);

    const PROGRESS_ROUNDING_STEP = 1;
    const updateProgress = showProgress
        ? (() => {
            let lastProgressValue = -1;
            return progress => {
                const progressValueRounded = Math.floor(progress / PROGRESS_ROUNDING_STEP) * PROGRESS_ROUNDING_STEP;
                if (progressValueRounded === lastProgressValue && progress < 100) {
                    return;
                }
                lastProgressValue = progressValueRounded;
                progressBarFill.style.width = `${progress}%`;
                progressLabel.textContent = `${progressValueRounded}%`;
                progressPanel.dataset.progress = `${progressValueRounded}`;
            };
        })()
        : null;

    const MAX_FRAME_DURATION = 14;
    const MAX_ROLLS_PER_CHUNK = 40000;
    const CHECK_INTERVAL = 512;
    let currentRoll = 0;

    const sampleEntropy = (typeof drawEntropy === 'function') ? drawEntropy : Math.random;

    const finalizeSimulation = cancelled => {
        if (progressPanel) {
            progressPanel.style.display = 'none';
            progressPanel.classList.remove('loading-indicator--active');
            delete progressPanel.dataset.progress;
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
                if (aura && readAuraWinCount(aura) > 0) {
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

        const resultChunks = [
            `Execution time: ${executionTime} seconds.<br>`,
            `Rolls: ${formatWithCommas(rolls)}<br>`,
            `Luck: ${formatWithCommas(luckValue)}<br>`,
            `Biome: ${biomeLabel}<br>`,
            `Rune: ${runeLabel}<br>`,
            `Time: ${timeLabel}<br>`,
            `Events: ${eventSummaryText}<br><br>`
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
            executionSeconds: Number.isFinite(executionSeconds) ? executionSeconds : 0
        };
    };

    function performSingleRollCheck() {
        if (duneProbability > 0 && sampleEntropy() < duneProbability) {
            recordAuraWin(activeDuneAura);
            rolls++;
            return;
        }
        if (memoryProbability > 0 && sampleEntropy() < memoryProbability) {
            recordAuraWin(activeMemoryAura);
            rolls++;
            return;
        }

        if (oblivionProbability > 0 && sampleEntropy() < oblivionProbability) {
            recordAuraWin(activeOblivionAura);
            rolls++;
            return;
        }

        for (let j = 0; j < computedAuras.length; j++) {
            const entry = computedAuras[j];
            if (entry.successRatio > 0 && sampleEntropy() < entry.successRatio) {
                recordAuraWin(entry.aura);
                if (entry.breakthroughStats) {
                    entry.breakthroughStats.count++;
                }
                break;
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

        while (currentRoll < total && processedThisChunk < MAX_ROLLS_PER_CHUNK) {
            performSingleRollCheck();
            currentRoll++;
            processedThisChunk++;

            if (processedThisChunk % CHECK_INTERVAL === 0 && performance.now() >= deadline) {
                break;
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
    const details = [
        `> **Rolls:** ${formatWithCommas(summary.rolls)}`,
        `> **Luck:** ${formatWithCommas(summary.luck)}`,
        `> **Biome:** ${summary.biomeLabel}`,
        `> **Rune:** ${summary.runeLabel || 'None'}`,
        `> **Time:** ${summary.timeLabel || 'Neutral'}`,
        `> **Events:** ${eventSummary}`,
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
    const lines = [
        'Sols Roll Result',
        `Rolls: ${formatWithCommas(summary.rolls)}`,
        `Luck: ${formatWithCommas(summary.luck)}`,
        `Biome: ${summary.biomeLabel}`,
        `Rune: ${summary.runeLabel || 'None'}`,
        `Time: ${summary.timeLabel || 'Neutral'}`,
        `Events: ${eventSummary}`,
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
    'sigil-outline-valentine': {
        shadows: [
            { color: 'rgba(255, 140, 200, 0.85)', blur: 4 },
            { color: 'rgba(255, 95, 170, 0.75)', blur: 8 },
            { color: 'rgba(115, 20, 80, 0.9)', blur: 0, offsetX: 1, offsetY: 1 },
            { color: 'rgba(115, 20, 80, 0.9)', blur: 0, offsetX: -1, offsetY: 1 },
            { color: 'rgba(115, 20, 80, 0.9)', blur: 0, offsetX: 1, offsetY: -1 },
            { color: 'rgba(115, 20, 80, 0.9)', blur: 0, offsetX: -1, offsetY: -1 }
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
    if (config.fill) {
        style.fill = config.fill;
    }
    if (Array.isArray(config.shadows)) {
        style.shadowLayers.push(...config.shadows.map(cloneShareShadowLayer));
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

        if (record.classes.event) {
            applyEventStyle(baseStyles);
        }
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

function createAuraBlock(context, record) {
    const styles = computeAuraCanvasStyles(record);
    const prefixText = record && record.prefix ? `${record.prefix}` : '';
    const nameText = record && record.displayName ? record.displayName : '';
    const subtitleText = record && record.subtitle ? record.subtitle : '';
    const countText = record && record.countLabel ? record.countLabel : '';

    const prefixWidth = prefixText ? measureStyledTextWidth(context, prefixText, styles.prefix) : 0;
    const prefixGap = prefixText ? 12 : 0;
    const nameWidth = measureStyledTextWidth(context, nameText, styles.name);
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
            if (prefixText) {
                renderStyledText(ctx, prefixText, x, currentY, styles.prefix);
            }
            renderStyledText(ctx, nameText, nameX, currentY, styles.name);
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
        document.fonts.load('700 26px "Noto Serif TC"'),
        document.fonts.load('700 22px "Press Start 2P"')
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

    const detailEntries = [
        `Rolls: ${formatWithCommas(summary.rolls)}`,
        `Luck: ${formatWithCommas(summary.luck)}`,
        `Biome: ${summary.biomeLabel}`,
        `Rune: ${summary.runeLabel || 'None'}`,
        `Time: ${summary.timeLabel || 'Neutral'}`,
        `Events: ${eventSummary}`,
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