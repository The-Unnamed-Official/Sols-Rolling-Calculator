// Generate pseudo-random numbers using a hybrid SplitMix-inspired algorithm for consistent rolls
function createHybridEntropyStream(a, b, c, d) {
    let state = (a ^ b ^ c ^ d) >>> 0;
    return () => {
        state = (state + 0x9E3779B9) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Capture a random seed for each component so the generator starts in a varied state
const captureSeedComponent = () => (Math.random() * 2 ** 32) >>> 0;
// Shared generator instance that all random helpers read from
const drawEntropy = createHybridEntropyStream(
    captureSeedComponent(),
    captureSeedComponent(),
    captureSeedComponent(),
    captureSeedComponent()
);

// Produce an integer between two inclusive bounds
function randomIntegerBetween(min, max) {
    return Math.floor(drawEntropy() * (max - min + 1)) + min;
}

// Produce a floating-point value between two bounds
function randomDecimalBetween(min, max) {
    return drawEntropy() * (max - min) + min;
}

// Track each feature toggle to avoid repeated DOM queries
let rollingAudioEnabled = false;
let interfaceAudioEnabled = false;
let cinematicModeEnabled = false;
let glitchEffectsActive = true;
let videoPlaybackActive = false;
let scrollLockSnapshot = null;

// These caches prevent redundant audio decoding and keep track of gain adjustments
const audioBufferStore = new Map();
const audioBufferTasks = new Map();
const mediaGainRegistry = new WeakMap();
let audioContextHandle = null;

// Lazily create (or reuse) a web audio context when the browser allows it
function getAudioContextHandle() {
    if (typeof window === 'undefined') return null;
    if (!audioContextHandle) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        audioContextHandle = new AudioContextClass();
    }
    return audioContextHandle;
}

// Make sure playback can resume after a user gesture if the context was suspended
function resumeAudioEngine() {
    const context = getAudioContextHandle();
    if (context && context.state === 'suspended') {
        context.resume().catch(() => {});
    }
    return context;
}

// Normalize the audio/video source so caching keys are consistent across relative URLs
function normalizeMediaSource(element) {
    if (!element) return null;
    const rawSrc = element.getAttribute('src') || element.currentSrc;
    if (!rawSrc) return null;
    try {
        return new URL(rawSrc, window.location.href).href;
    } catch (err) {
        return rawSrc;
    }
}

// Check whether connecting the media element to the Web Audio graph is safe
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

// Apply gain configuration through Web Audio when possible, otherwise fall back to element volume
function applyMediaGain(element) {
    if (!element) return;
    const dataset = element.dataset || {};
    const gainValueRaw = dataset.gain ?? dataset.boost ?? dataset.volume;
    if (gainValueRaw === undefined) return;

    let gainValue = Number.parseFloat(gainValueRaw);
    if (!Number.isFinite(gainValue) || gainValue <= 0) return;

    const context = canUseMediaElementSource(element) ? resumeAudioEngine() : null;
    if (context) {
        try {
            let entry = mediaGainRegistry.get(element);
            if (!entry) {
                const source = context.createMediaElementSource(element);
                const gainNode = context.createGain();
                source.connect(gainNode).connect(context.destination);
                entry = { gainNode };
                mediaGainRegistry.set(element, entry);
            }
            entry.gainNode.gain.value = gainValue;
            return;
        } catch (error) {
            console.warn('Unable to configure media element gain', error);
        }
    }

    element.volume = Math.max(0, Math.min(gainValue, 1));
}

// Heuristic to detect touch-first devices and adjust UI expectations
function detectTouchFirstPlatform() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.matchMedia("(max-width: 768px)").matches)
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0)
        || (navigator.msMaxTouchPoints > 0);
}

// Separate toggles for UI and rolling sounds so they can be controlled independently
function isSoundChannelActive(category) {
    if (category === 'ui') return interfaceAudioEnabled;
    return rollingAudioEnabled;
}

// Play a sound effect with respect to user toggles and cached buffers
function playSoundEffect(audioElement, category = 'rolling') {
    if (!audioElement) return;

    if (!isSoundChannelActive(category)) return;

    if (category !== 'ui' && videoPlaybackActive) return;

    const dataset = audioElement.dataset || {};
    const baseVolumeRaw = dataset.volume ?? '0.1';
    const boostRaw = dataset.boost ?? '1';

    let baseVolume = Number.parseFloat(baseVolumeRaw);
    let boost = Number.parseFloat(boostRaw);

    if (!Number.isFinite(baseVolume)) baseVolume = 0.1;
    if (!Number.isFinite(boost)) boost = 1;

    const gainValue = Math.max(0, baseVolume * boost);
    if (gainValue === 0) return;

    const context = resumeAudioEngine();
    const sourceUrl = normalizeMediaSource(audioElement);

    const playViaElement = () => {
        if (!isSoundChannelActive(category)) return;
        if (category !== 'ui' && videoPlaybackActive) return;
        const newAudio = audioElement.cloneNode();
        newAudio.muted = false;
        newAudio.loop = false;
        newAudio.volume = Math.max(0, Math.min(gainValue, 1));
        const cleanup = () => newAudio.remove();
        newAudio.addEventListener('ended', cleanup, { once: true });
        newAudio.addEventListener('error', cleanup, { once: true });
        const playPromise = newAudio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(cleanup);
        }
    };

    if (context && sourceUrl) {
        const playBuffer = buffer => {
            if (!buffer || !isSoundChannelActive(category)) return;
            if (category !== 'ui' && videoPlaybackActive) return;
            const activeContext = resumeAudioEngine();
            if (!activeContext) {
                playViaElement();
                return;
            }
            const gainNode = activeContext.createGain();
            gainNode.gain.value = gainValue;
            const source = activeContext.createBufferSource();
            source.buffer = buffer;
            source.connect(gainNode).connect(activeContext.destination);
            source.start();
        };

        const cachedBuffer = audioBufferStore.get(sourceUrl);
        if (cachedBuffer) {
            playBuffer(cachedBuffer);
            return;
        }

        let pending = audioBufferTasks.get(sourceUrl);
        if (!pending) {
            pending = fetch(sourceUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch audio: ${response.status}`);
                    }
                    return response.arrayBuffer();
                })
                .then(arrayBuffer => context.decodeAudioData(arrayBuffer))
                .then(buffer => {
                    audioBufferStore.set(sourceUrl, buffer);
                    audioBufferTasks.delete(sourceUrl);
                    return buffer;
                })
                .catch(error => {
                    console.error('Audio buffer error:', error);
                    audioBufferTasks.delete(sourceUrl);
                    return null;
                });
            audioBufferTasks.set(sourceUrl, pending);
        }

        pending.then(buffer => {
            if (!buffer) {
                playViaElement();
                return;
            }
            playBuffer(buffer);
        });
        return;
    }

    playViaElement();
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

function synchronizeBackgroundRouting(bgMusic) {
    if (!bgMusic) {
        return { baseVolume: 0.18, chain: null };
    }

    const baseVolume = computeBackgroundMusicBase(bgMusic);
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
            if (!rollingAudioEnabled) return;
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
    rollingAudioEnabled = !rollingAudioEnabled;
    const bgMusic = document.getElementById('ambientMusic');
    const soundToggle = document.getElementById('rollAudioToggle');
    if (bgMusic && !bgMusic.getAttribute('data-current-src')) {
        bgMusic.setAttribute('data-current-src', bgMusic.src);
    }

    if (rollingAudioEnabled) {
        resumeAudioEngine();
        playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
        if (bgMusic) {
            primeBackgroundMusic(bgMusic);
            if (glitchPresentationEnabled) {
                updateGlitchAudioControls(shouldUseGlitchBaseEffect());
            }
            startBackgroundMusic(bgMusic);
        }
    } else {
        if (bgMusic) {
            bgMusic.muted = true;
            if (typeof bgMusic.setAttribute === 'function') {
                bgMusic.setAttribute('muted', '');
            }
            bgMusic.pause();
            bgMusic.currentTime = 0;
        }
    }

    if (soundToggle) {
        soundToggle.textContent = rollingAudioEnabled ? 'Other Sounds: On' : 'Other Sounds: Off';
        soundToggle.setAttribute('aria-pressed', rollingAudioEnabled);
    }
}

function toggleInterfaceAudio() {
    interfaceAudioEnabled = !interfaceAudioEnabled;
    resumeAudioEngine();

    const uiSoundToggle = document.getElementById('uiAudioToggle');
    if (uiSoundToggle) {
        uiSoundToggle.textContent = interfaceAudioEnabled ? 'UI Sound: On' : 'UI Sound: Off';
        uiSoundToggle.setAttribute('aria-pressed', interfaceAudioEnabled);
    }

    if (interfaceAudioEnabled) {
        playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    }
}

function toggleCinematicMode() {
    cinematicModeEnabled = !cinematicModeEnabled;
    const cutsceneToggle = document.getElementById('cinematicToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = cinematicModeEnabled ? 'Cutscenes (Fullscreen recommended): On' : 'Cutscenes (Fullscreen recommended): Off';
        cutsceneToggle.setAttribute('aria-pressed', cinematicModeEnabled ? 'true' : 'false');
    }

    const clickSound = document.getElementById('clickSoundFx');
    if (clickSound) {
        playSoundEffect(clickSound, 'ui');
    }

    if (!cinematicModeEnabled) {
        const skipButton = document.getElementById('skip-cinematic-button');
        if (skipButton && skipButton.style.display !== 'none') {
            skipButton.click();
        }
    }
}

function isGlitchBiomeSelected() {
    const biomeSelect = document.getElementById('biome-dropdown');
    return biomeSelect ? biomeSelect.value === 'glitch' : false;
}

function updateGlitchPresentation() {
    const glitchBiomeActive = isGlitchBiomeSelected();
    applyGlitchVisuals(glitchEffectsActive && glitchBiomeActive, { forceTheme: glitchBiomeActive });
}

function toggleGlitchEffects() {
    glitchEffectsActive = !glitchEffectsActive;
    const glitchToggle = document.getElementById('glitchEffectsToggle');
    if (glitchToggle) {
        glitchToggle.textContent = glitchEffectsActive ? 'Glitch Effects: On' : 'Glitch Effects: Off';
        glitchToggle.setAttribute('aria-pressed', glitchEffectsActive ? 'true' : 'false');
    }

    playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    updateGlitchPresentation();
}

let baseLuck = 1;
let currentLuck = 1;
let lastVipMultiplier = 1;
let lastXyzMultiplier = 1;
let lastDaveMultiplier = 1;

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
    corruption: { image: 'files/corruptionBiomeImage.jpg', music: 'files/corruptionBiomeMusic.mp3' },
    null: { image: 'files/nullBiomeImage.jpg', music: 'files/nullBiomeMusic.mp3' },
    dreamspace: { image: 'files/dreamspaceBiomeImage.jpg', music: 'files/dreamspaceBiomeMusic.mp3' },
    glitch: { image: 'files/glitchBiomeImage.webm', music: 'files/glitchBiomeMusic.mp3' },
    anotherRealm: { image: 'files/anotherRealmBiomeImage.jpg', music: 'files/anotherRealmBiomeMusic.mp3' },
    graveyard: { image: 'files/graveyardBiomeImage.jpg', music: 'files/graveyardBiomeMusic.mp3' },
    pumpkinMoon: { image: 'files/pumpkinMoonBiomeImage.jpg', music: 'files/pumpkinMoonBiomeMusic.mp3' },
    bloodRain: { image: 'files/bloodRainBiomeImage.jpg', music: 'files/bloodRainBiomeMusic.mp3' },
    limbo: { image: 'files/limboImage.jpg', music: 'files/limboMusic.mp3' },
    blazing: { image: 'files/blazingBiomeImage.jpg', music: 'files/blazingBiomeMusic.mp3' }
};

function updateBloodRainWeather(biome) {
    const container = document.querySelector('.weather--blood-rain');
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
        const length = randomDecimalBetween(0.9, 2.6);
        const thickness = randomDecimalBetween(0.8, 1.9);
        const opacity = randomDecimalBetween(0.6, 0.95);
        const skew = randomDecimalBetween(-4, 4);
        const drift = randomDecimalBetween(-18, 18);
        const startOffset = randomDecimalBetween(0, 60);
        drop.style.setProperty('--x', `${offsetX.toFixed(2)}%`);
        drop.style.setProperty('--delay', `${delay.toFixed(2)}s`);
        drop.style.setProperty('--duration', `${duration.toFixed(2)}s`);
        drop.style.setProperty('--length', length.toFixed(2));
        drop.style.setProperty('--thickness', thickness.toFixed(2));
        drop.style.setProperty('--opacity', opacity.toFixed(2));
        drop.style.setProperty('--skew', `${skew.toFixed(2)}deg`);
        drop.style.setProperty('--drift', `${drift.toFixed(2)}px`);
        drop.style.setProperty('--start-offset', `${startOffset.toFixed(2)}%`);
        fragment.appendChild(drop);
    }

    container.appendChild(fragment);
    container.dataset.initialized = 'true';
}

const glitchAudioChainMap = new WeakMap();
const glitchAudioState = {
    originalPlaybackRate: null,
    basePlaybackRate: null,
    ruinTimeoutId: null,
    isRuinActive: false,
    warbleIntervalId: null
};
const glitchUiState = {
    loopTimeoutId: null,
    activeTimeoutId: null,
    isUiGlitching: false
};
let glitchPresentationEnabled = false;

function shouldUseGlitchBaseEffect() {
    return glitchPresentationEnabled && glitchUiState.isUiGlitching;
}

const GLITCH_BASE_FILTER_FREQUENCY = 2400;
const GLITCH_BASE_FILTER_Q = 0.5;
const GLITCH_BASE_GAIN = 0.32;
const GLITCH_BASE_DISTORTION = 220;
const GLITCH_BASE_HIGHPASS_FREQUENCY = 480;
const GLITCH_BASE_HIGHPASS_Q = 0.65;
const GLITCH_IDLE_HIGHPASS_FREQUENCY = 140;
const GLITCH_IDLE_HIGHPASS_Q = 0.6;
const GLITCH_WARBLE_RATE_MIN = 0.78;
const GLITCH_WARBLE_RATE_MAX = 0.9;
const GLITCH_WARBLE_REST_MIN = 1600;
const GLITCH_WARBLE_REST_MAX = 3200;
const GLITCH_RUIN_MIN_FREQUENCY = 360;
const GLITCH_RUIN_MIN_DISTORTION = 180;
const GLITCH_RUIN_MAX_DISTORTION = 420;

function resetGlitchRuinTimer() {
    if (glitchAudioState.ruinTimeoutId !== null && typeof window !== 'undefined') {
        window.clearTimeout(glitchAudioState.ruinTimeoutId);
        glitchAudioState.ruinTimeoutId = null;
    }
}

function resetGlitchWarbleTimer() {
    if (glitchAudioState.warbleIntervalId !== null && typeof window !== 'undefined') {
        window.clearTimeout(glitchAudioState.warbleIntervalId);
        glitchAudioState.warbleIntervalId = null;
    }
}

function scheduleGlitchWarbleCycle(bgMusic, chain) {
    if (!bgMusic || typeof window === 'undefined') return;

    resetGlitchWarbleTimer();

    const context = chain?.context || getAudioContextHandle();
    const applyWarble = () => {
        if (!glitchPresentationEnabled) {
            resetGlitchWarbleTimer();
            return;
        }

        if (glitchAudioState.isRuinActive) {
            glitchAudioState.warbleIntervalId = window.setTimeout(applyWarble, randomIntegerBetween(420, 900));
            return;
        }

        const warbleRate = randomDecimalBetween(GLITCH_WARBLE_RATE_MIN, GLITCH_WARBLE_RATE_MAX);
        glitchAudioState.basePlaybackRate = warbleRate;

        try {
            bgMusic.playbackRate = warbleRate;
        } catch (error) {
            console.warn('Unable to apply glitch base warble rate', error);
        }

        const baseGain = chain?.baseGain ?? computeBackgroundMusicBase(bgMusic);
        if (context && chain?.gainNode?.gain && typeof chain.gainNode.gain.setTargetAtTime === 'function') {
            const warpedGain = Math.max(0, Math.min(1, baseGain * randomDecimalBetween(0.45, 0.7)));
            chain.gainNode.gain.setTargetAtTime(warpedGain, context.currentTime, 0.6);
        }

        if (context && chain?.highpass?.frequency && typeof chain.highpass.frequency.setTargetAtTime === 'function') {
            const warpedHighpass = Math.max(0, GLITCH_BASE_HIGHPASS_FREQUENCY * randomDecimalBetween(1.05, 1.4));
            chain.highpass.frequency.setTargetAtTime(warpedHighpass, context.currentTime, 0.6);
        }

        if (context && chain?.filter?.detune && typeof chain.filter.detune.setTargetAtTime === 'function') {
            const detune = randomDecimalBetween(-680, 420);
            chain.filter.detune.setTargetAtTime(detune, context.currentTime, 0.6);
        }

        glitchAudioState.warbleIntervalId = window.setTimeout(applyWarble, randomIntegerBetween(GLITCH_WARBLE_REST_MIN, GLITCH_WARBLE_REST_MAX));
    };

    glitchAudioState.warbleIntervalId = window.setTimeout(applyWarble, randomIntegerBetween(180, 520));
}

function createDistortionCurve(amount = 0) {
    const sampleCount = 44100;
    const curve = new Float32Array(sampleCount);
    const deg = Math.PI / 180;
    for (let i = 0; i < sampleCount; i++) {
        const x = i * 2 / sampleCount - 1;
        if (amount === 0) {
            curve[i] = x;
        } else {
            curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
        }
    }
    return curve;
}

function ensureGlitchAudioChain(audioElement) {
    if (!audioElement) return null;
    const context = getAudioContextHandle();
    if (!context) return null;

    let chain = glitchAudioChainMap.get(audioElement);
    const baseVolume = computeBackgroundMusicBase(audioElement);

    if (!canUseMediaElementSource(audioElement)) {
        glitchAudioChainMap.delete(audioElement);
        audioElement.volume = Math.max(0, Math.min(baseVolume, 1));
        return null;
    }
    if (chain && chain.context === context) {
        if (!chain.highpass) {
            glitchAudioChainMap.delete(audioElement);
            return ensureGlitchAudioChain(audioElement);
        }
        chain.baseGain = baseVolume;
        chain.originalFilterType = chain.originalFilterType || chain.filter.type;
        if (chain.gainNode && chain.gainNode.gain) {
            const gainParam = chain.gainNode.gain;
            if (!glitchPresentationEnabled) {
                if (context.state === 'running' && typeof gainParam.setTargetAtTime === 'function') {
                    gainParam.setTargetAtTime(baseVolume, context.currentTime, 0.01);
                } else {
                    gainParam.value = baseVolume;
                }
            }
        }
        audioElement.volume = 1;
        return chain;
    }

    try {
        const source = context.createMediaElementSource(audioElement);
        const highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = GLITCH_IDLE_HIGHPASS_FREQUENCY;
        highpass.Q.value = GLITCH_IDLE_HIGHPASS_Q;

        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 14000;
        filter.Q.value = 0.3;

        const waveshaper = context.createWaveShaper();
        const neutralCurve = createDistortionCurve(0);
        waveshaper.curve = neutralCurve;

        const gainNode = context.createGain();
        gainNode.gain.value = baseVolume;

        source.connect(highpass).connect(filter).connect(waveshaper).connect(gainNode).connect(context.destination);

        audioElement.volume = 1;
        chain = {
            context,
            source,
            highpass,
            filter,
            waveshaper,
            gainNode,
            neutralCurve,
            baseGain: baseVolume,
            originalFilterType: filter.type
        };
        glitchAudioChainMap.set(audioElement, chain);
        return chain;
    } catch (error) {
        console.warn('Unable to initialize glitch audio nodes', error);
        return null;
    }
}

function updateGlitchAudioControls(enabled) {
    const bgMusic = document.getElementById('ambientMusic');
    if (!bgMusic) return;

    const context = enabled ? resumeAudioEngine() : getAudioContextHandle();
    const chain = ensureGlitchAudioChain(bgMusic);

    if (!context || !chain) {
        if (!enabled && glitchAudioState.originalPlaybackRate !== null) {
            try {
                bgMusic.playbackRate = glitchAudioState.originalPlaybackRate;
            } catch (error) {
                console.warn('Unable to restore playback rate', error);
            }
            glitchAudioState.originalPlaybackRate = null;
            glitchAudioState.basePlaybackRate = null;
        }
        return;
    }

    resetGlitchRuinTimer();
    glitchAudioState.isRuinActive = false;

    const baseGain = chain.baseGain ?? computeBackgroundMusicBase(bgMusic);

    if (enabled) {
        if (glitchAudioState.originalPlaybackRate === null) {
            glitchAudioState.originalPlaybackRate = bgMusic.playbackRate || 1;
        }
        if (glitchAudioState.basePlaybackRate === null) {
            glitchAudioState.basePlaybackRate = randomDecimalBetween(GLITCH_WARBLE_RATE_MIN, GLITCH_WARBLE_RATE_MAX);
        }
        const baseRate = glitchAudioState.basePlaybackRate ?? glitchAudioState.originalPlaybackRate ?? bgMusic.playbackRate;
        try {
            bgMusic.playbackRate = baseRate;
        } catch (error) {
            console.warn('Unable to apply base glitch playback rate', error);
        }
        try {
            chain.filter.type = chain.originalFilterType || 'lowpass';
        } catch (error) {
            console.warn('Unable to restore glitch filter type', error);
        }

        if (context.state === 'running') {
            if (chain.highpass) {
                chain.highpass.frequency.setTargetAtTime(GLITCH_BASE_HIGHPASS_FREQUENCY, context.currentTime, 0.25);
                chain.highpass.Q.setTargetAtTime(GLITCH_BASE_HIGHPASS_Q, context.currentTime, 0.25);
            }
            chain.filter.frequency.setTargetAtTime(GLITCH_BASE_FILTER_FREQUENCY, context.currentTime, 0.25);
            chain.filter.Q.setTargetAtTime(GLITCH_BASE_FILTER_Q, context.currentTime, 0.25);
            chain.gainNode.gain.setTargetAtTime(baseGain * GLITCH_BASE_GAIN, context.currentTime, 0.25);
        } else {
            if (chain.highpass) {
                chain.highpass.frequency.value = GLITCH_BASE_HIGHPASS_FREQUENCY;
                chain.highpass.Q.value = GLITCH_BASE_HIGHPASS_Q;
            }
            chain.filter.frequency.value = GLITCH_BASE_FILTER_FREQUENCY;
            chain.filter.Q.value = GLITCH_BASE_FILTER_Q;
            chain.gainNode.gain.value = baseGain * GLITCH_BASE_GAIN;
        }
        chain.waveshaper.curve = createDistortionCurve(GLITCH_BASE_DISTORTION);
        if (chain.waveshaper) {
            chain.waveshaper.oversample = '4x';
        }
    } else {
        try {
            chain.filter.type = chain.originalFilterType || 'lowpass';
        } catch (error) {
            console.warn('Unable to restore glitch filter type', error);
        }

        if (glitchAudioState.originalPlaybackRate !== null) {
            try {
                bgMusic.playbackRate = glitchAudioState.originalPlaybackRate;
            } catch (error) {
                console.warn('Unable to restore playback rate', error);
            }
        }
        glitchAudioState.originalPlaybackRate = null;
        glitchAudioState.basePlaybackRate = null;
        if (context.state === 'running') {
            if (chain.highpass) {
                chain.highpass.frequency.setTargetAtTime(GLITCH_IDLE_HIGHPASS_FREQUENCY, context.currentTime, 0.4);
                chain.highpass.Q.setTargetAtTime(GLITCH_IDLE_HIGHPASS_Q, context.currentTime, 0.4);
            }
            chain.filter.frequency.setTargetAtTime(14000, context.currentTime, 0.4);
            chain.filter.Q.setTargetAtTime(0.4, context.currentTime, 0.4);
            chain.gainNode.gain.setTargetAtTime(baseGain, context.currentTime, 0.4);
        } else {
            if (chain.highpass) {
                chain.highpass.frequency.value = GLITCH_IDLE_HIGHPASS_FREQUENCY;
                chain.highpass.Q.value = GLITCH_IDLE_HIGHPASS_Q;
            }
            chain.filter.frequency.value = 14000;
            chain.filter.Q.value = 0.4;
            chain.gainNode.gain.value = baseGain;
        }
        chain.waveshaper.curve = chain.neutralCurve || createDistortionCurve(0);
        if (chain.waveshaper) {
            chain.waveshaper.oversample = 'none';
        }
    }

    if (enabled) {
        scheduleGlitchWarbleCycle(bgMusic, chain);
    } else {
        resetGlitchWarbleTimer();
    }
}

function triggerGlitchBurst() {
    const bgMusic = document.getElementById('ambientMusic');
    if (!bgMusic || !shouldUseGlitchBaseEffect()) return;

    const context = getAudioContextHandle();
    const chain = ensureGlitchAudioChain(bgMusic);

    if (!context || !chain) return;

    glitchAudioState.isRuinActive = true;
    resetGlitchRuinTimer();
    resetGlitchWarbleTimer();

    if (glitchAudioState.originalPlaybackRate === null) {
        glitchAudioState.originalPlaybackRate = bgMusic.playbackRate || 1;
    }
    if (glitchAudioState.basePlaybackRate === null) {
        glitchAudioState.basePlaybackRate = randomDecimalBetween(GLITCH_WARBLE_RATE_MIN, GLITCH_WARBLE_RATE_MAX);
    }

    if (!chain.originalFilterType) {
        chain.originalFilterType = chain.filter.type;
    }

    try {
        chain.filter.type = 'bandpass';
    } catch (error) {
        console.warn('Unable to adjust glitch filter type', error);
    }

    const baseGain = chain.baseGain ?? computeBackgroundMusicBase(bgMusic);

    const applyChaosPulse = () => {
        if (!glitchAudioState.isRuinActive) return;

        const chaoticRate = randomDecimalBetween(0.38, 1.72);
        try {
            bgMusic.playbackRate = chaoticRate;
        } catch (error) {
            console.warn('Unable to modify playback rate for glitch ruin', error);
        }

        const frequency = randomDecimalBetween(GLITCH_RUIN_MIN_FREQUENCY, 2600);
        const q = randomDecimalBetween(1.4, 9);
        const gain = Math.max(0, Math.min(1, baseGain * randomDecimalBetween(0.25, 0.7)));
        const distortionAmount = randomIntegerBetween(GLITCH_RUIN_MIN_DISTORTION, GLITCH_RUIN_MAX_DISTORTION);
        const filterTypes = ['bandpass', 'highpass', 'notch'];
        const selectedType = filterTypes[Math.floor(Math.random() * filterTypes.length)] || 'bandpass';

        if (context.state === 'running') {
            chain.filter.frequency.setTargetAtTime(frequency, context.currentTime, 0.05);
            chain.filter.Q.setTargetAtTime(q, context.currentTime, 0.05);
            chain.gainNode.gain.setTargetAtTime(gain, context.currentTime, 0.05);
        } else {
            chain.filter.frequency.value = frequency;
            chain.filter.Q.value = q;
            chain.gainNode.gain.value = gain;
        }

        try {
            chain.filter.type = selectedType;
        } catch (error) {
            console.warn('Unable to set glitch filter mode', error);
        }

        if (chain.filter?.detune && typeof chain.filter.detune.setTargetAtTime === 'function') {
            const detune = randomDecimalBetween(-2400, 2400);
            chain.filter.detune.setTargetAtTime(detune, context.currentTime, 0.05);
        }

        chain.waveshaper.curve = createDistortionCurve(distortionAmount);
        if (chain.waveshaper) {
            chain.waveshaper.oversample = Math.random() > 0.4 ? '4x' : '2x';
        }

        if (typeof window !== 'undefined') {
            glitchAudioState.ruinTimeoutId = window.setTimeout(applyChaosPulse, randomIntegerBetween(120, 260));
        }
    };

    applyChaosPulse();
}

function completeGlitchBurst() {
    glitchAudioState.isRuinActive = false;
    resetGlitchRuinTimer();

    const bgMusic = document.getElementById('ambientMusic');
    if (!bgMusic) return;

    const context = getAudioContextHandle();
    const chain = glitchAudioChainMap.get(bgMusic) || ensureGlitchAudioChain(bgMusic);

    const baseEffectEnabled = shouldUseGlitchBaseEffect();
    const resetRate = baseEffectEnabled
        ? (glitchAudioState.basePlaybackRate ?? glitchAudioState.originalPlaybackRate ?? 1)
        : (glitchAudioState.originalPlaybackRate ?? glitchAudioState.basePlaybackRate ?? 1);

    try {
        bgMusic.playbackRate = resetRate;
    } catch (error) {
        console.warn('Unable to restore playback rate after glitch ruin', error);
    }

    if (!context || !chain) {
        if (baseEffectEnabled) {
            scheduleGlitchWarbleCycle(bgMusic, null);
        } else {
            resetGlitchWarbleTimer();
        }
        return;
    }

    const baseGain = chain.baseGain ?? computeBackgroundMusicBase(bgMusic);
    const targetGain = baseEffectEnabled ? baseGain * GLITCH_BASE_GAIN : baseGain;
    const targetFrequency = baseEffectEnabled ? GLITCH_BASE_FILTER_FREQUENCY : 14000;
    const targetQ = baseEffectEnabled ? GLITCH_BASE_FILTER_Q : 0.4;
    const targetHighpassFrequency = baseEffectEnabled ? GLITCH_BASE_HIGHPASS_FREQUENCY : GLITCH_IDLE_HIGHPASS_FREQUENCY;
    const targetHighpassQ = baseEffectEnabled ? GLITCH_BASE_HIGHPASS_Q : GLITCH_IDLE_HIGHPASS_Q;

    try {
        chain.filter.type = chain.originalFilterType || 'lowpass';
    } catch (error) {
        console.warn('Unable to restore glitch filter type', error);
    }

    if (context.state === 'running') {
        if (chain.highpass) {
            chain.highpass.frequency.setTargetAtTime(targetHighpassFrequency, context.currentTime, 0.2);
            chain.highpass.Q.setTargetAtTime(targetHighpassQ, context.currentTime, 0.2);
        }
        chain.filter.frequency.setTargetAtTime(targetFrequency, context.currentTime, 0.2);
        chain.filter.Q.setTargetAtTime(targetQ, context.currentTime, 0.2);
        chain.gainNode.gain.setTargetAtTime(targetGain, context.currentTime, 0.2);
    } else {
        if (chain.highpass) {
            chain.highpass.frequency.value = targetHighpassFrequency;
            chain.highpass.Q.value = targetHighpassQ;
        }
        chain.filter.frequency.value = targetFrequency;
        chain.filter.Q.value = targetQ;
        chain.gainNode.gain.value = targetGain;
    }

    chain.waveshaper.curve = baseEffectEnabled ? createDistortionCurve(GLITCH_BASE_DISTORTION) : (chain.neutralCurve || createDistortionCurve(0));
    if (chain.waveshaper) {
        chain.waveshaper.oversample = baseEffectEnabled ? '4x' : 'none';
    }

    if (baseEffectEnabled) {
        scheduleGlitchWarbleCycle(bgMusic, chain);
    } else {
        resetGlitchWarbleTimer();
    }
}

function queueGlitchBurstCycle(delay) {
    if (typeof window === 'undefined') return;
    if (glitchUiState.loopTimeoutId !== null) {
        window.clearTimeout(glitchUiState.loopTimeoutId);
    }
    glitchUiState.loopTimeoutId = window.setTimeout(() => {
        glitchUiState.loopTimeoutId = null;
        executeGlitchBurstSequence();
    }, Math.max(0, delay));
}

function executeGlitchBurstSequence() {
    if (!glitchPresentationEnabled) return;
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;

    glitchUiState.isUiGlitching = true;
    body.classList.add('is-glitching');
    root.classList.add('is-glitching');
    updateGlitchAudioControls(shouldUseGlitchBaseEffect());
    triggerGlitchBurst();

    if (typeof window === 'undefined') return;
    if (glitchUiState.activeTimeoutId !== null) {
        window.clearTimeout(glitchUiState.activeTimeoutId);
    }
    glitchUiState.activeTimeoutId = window.setTimeout(() => {
        body.classList.remove('is-glitching');
        root.classList.remove('is-glitching');
        glitchUiState.activeTimeoutId = null;
        glitchUiState.isUiGlitching = false;
        completeGlitchBurst();
        updateGlitchAudioControls(shouldUseGlitchBaseEffect());
        if (glitchPresentationEnabled) {
            queueGlitchBurstCycle(randomIntegerBetween(1800, 4200));
        }
    }, randomIntegerBetween(320, 980));
}

function startGlitchLoop(forceImmediate = false) {
    if (!glitchPresentationEnabled || typeof window === 'undefined') return;
    const initialDelay = forceImmediate ? randomIntegerBetween(120, 420) : randomIntegerBetween(600, 1800);
    queueGlitchBurstCycle(initialDelay);
}

function isGlitchLoopScheduled() {
    if (!glitchPresentationEnabled) return;
    const body = document.body;
    if (!body) return;
    if (glitchUiState.loopTimeoutId === null && !body.classList.contains('is-glitching')) {
        queueGlitchBurstCycle(randomIntegerBetween(1800, 4200));
    }
}

function stopGlitchLoop(options = {}) {
    const { preserveBiomeClass = false } = options;
    if (typeof window !== 'undefined') {
        if (glitchUiState.loopTimeoutId !== null) {
            window.clearTimeout(glitchUiState.loopTimeoutId);
            glitchUiState.loopTimeoutId = null;
        }
        if (glitchUiState.activeTimeoutId !== null) {
            window.clearTimeout(glitchUiState.activeTimeoutId);
            glitchUiState.activeTimeoutId = null;
        }
        resetGlitchRuinTimer();
        glitchAudioState.isRuinActive = false;
        resetGlitchWarbleTimer();
    }

    glitchUiState.isUiGlitching = false;
    completeGlitchBurst();
    updateGlitchAudioControls(false);

    const body = document.body;
    const root = document.documentElement;
    if (body) {
        body.classList.remove('is-glitching');
        if (!preserveBiomeClass) {
            body.classList.remove('biome--glitch');
        }
    }
    if (root) {
        root.classList.remove('is-glitching');
        if (!preserveBiomeClass) {
            root.classList.remove('biome--glitch');
        }
    }
}

function applyGlitchVisuals(enabled, options = {}) {
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;
    const { forceTheme = false } = options;

    if (enabled) {
        root.classList.add('biome--glitch');
        body.classList.add('biome--glitch');
        if (!glitchPresentationEnabled) {
            glitchPresentationEnabled = true;
            updateGlitchAudioControls(shouldUseGlitchBaseEffect());
            startGlitchLoop(true);
        } else {
            updateGlitchAudioControls(shouldUseGlitchBaseEffect());
            isGlitchLoopScheduled();
        }
    } else {
        if (glitchPresentationEnabled) {
            glitchPresentationEnabled = false;
            stopGlitchLoop({ preserveBiomeClass: forceTheme });
        }
        if (forceTheme) {
            root.classList.add('biome--glitch');
            body.classList.add('biome--glitch');
        } else {
            body.classList.remove('biome--glitch');
            root.classList.remove('biome--glitch');
        }
        glitchUiState.isUiGlitching = false;
        updateGlitchAudioControls(false);
    }
}

function applyBiomeTheme(biome) {
    const assetKey = Object.prototype.hasOwnProperty.call(biomeAssets, biome) ? biome : 'normal';
    const assets = biomeAssets[assetKey];
    const isVideoAsset = typeof assets.image === 'string' && /\.(webm|mp4|ogv|ogg)$/i.test(assets.image);

    const body = document.body;
    const root = document.documentElement;
    const isBloodRain = biome === 'bloodRain';
    if (body) {
        body.classList.toggle('biome--blood-rain', isBloodRain);
    }
    if (root) {
        root.classList.toggle('biome--blood-rain', isBloodRain);
    }

    updateBloodRainWeather(biome);

    if (root) {
        root.style.setProperty('--biome-background', isVideoAsset ? 'none' : `url("${assets.image}")`);
    }

    const backdrop = document.querySelector('.ui-backdrop');
    if (backdrop) {
        const backdropVideo = backdrop.querySelector('.ui-backdrop__video');
        if (isVideoAsset && backdropVideo) {
            backdrop.classList.add('ui-backdrop--video-active');
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
        } else {
            backdrop.classList.remove('ui-backdrop--video-active');
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
    if (bgMusic) {
        const currentSrc = bgMusic.getAttribute('data-current-src');
        const shouldUpdateMusic = currentSrc !== assets.music;
        if (shouldUpdateMusic) {
            bgMusic.pause();
            bgMusic.currentTime = 0;
            bgMusic.src = assets.music;
            bgMusic.setAttribute('data-current-src', assets.music);
            bgMusic.load();
        }

        if (rollingAudioEnabled) {
            primeBackgroundMusic(bgMusic);
            if (glitchPresentationEnabled) {
                updateGlitchAudioControls(shouldUseGlitchBaseEffect());
            }
        }

        if (rollingAudioEnabled && (shouldUpdateMusic || bgMusic.paused)) {
            startBackgroundMusic(bgMusic);
        }
    }
}

function applyLuckValue(value, options = {}) {
    baseLuck = value;
    currentLuck = value;
    lastVipMultiplier = 1;
    lastXyzMultiplier = 1;
    lastDaveMultiplier = 1;
    document.getElementById('vip-dropdown').value = "1";
    document.getElementById('xyz-luck-toggle').checked = false;
    refreshCustomSelect('vip-dropdown');
    if (document.getElementById('dave-luck-dropdown')) {
        document.getElementById('dave-luck-dropdown').value = "1";
        refreshCustomSelect('dave-luck-dropdown');
    }
    document.getElementById('luck-total').value = value;

    if (typeof applyOblivionPresetOptions === 'function') {
        applyOblivionPresetOptions(options);
    }
}

// Recalculate the combined luck multiplier whenever a control changes
function recomputeLuckValue() {
    const controls = {
        biome: document.getElementById('biome-dropdown'),
        vip: document.getElementById('vip-dropdown'),
        xyz: document.getElementById('xyz-luck-toggle'),
        dave: document.getElementById('dave-luck-dropdown'),
        luckInput: document.getElementById('luck-total')
    };

    const biomeValue = controls.biome ? controls.biome.value : 'normal';
    const isLimboBiome = biomeValue === 'limbo';

    const multipliers = {
        vip: parseFloat(controls.vip ? controls.vip.value : '1') || 1,
        xyz: !isLimboBiome && controls.xyz && controls.xyz.checked ? 2 : 1,
        dave: isLimboBiome && controls.dave ? parseFloat(controls.dave.value) || 1 : 1
    };

    const luckField = controls.luckInput;
    const enteredLuck = luckField && luckField.value ? parseFloat(luckField.value) : NaN;
    if (luckField && luckField.value && Number.isFinite(enteredLuck) && enteredLuck !== currentLuck) {
        baseLuck = enteredLuck;
        currentLuck = enteredLuck;
        lastVipMultiplier = 1;
        lastXyzMultiplier = 1;
        lastDaveMultiplier = 1;
        if (controls.vip) {
            controls.vip.value = "1";
            refreshCustomSelect('vip-dropdown');
        }
        if (controls.xyz) {
            controls.xyz.checked = false;
        }
        if (controls.dave) {
            controls.dave.value = "1";
            refreshCustomSelect('dave-luck-dropdown');
        }
        if (typeof applyOblivionPresetOptions === 'function') {
            applyOblivionPresetOptions({});
        }
        return;
    }

    currentLuck = baseLuck * multipliers.vip * multipliers.xyz * multipliers.dave;
    lastVipMultiplier = multipliers.vip;
    lastXyzMultiplier = multipliers.xyz;
    lastDaveMultiplier = multipliers.dave;
    if (luckField) {
        luckField.value = currentLuck;
    }
}

function resetLuckFields() {
    document.getElementById('luck-total').value = 1;
    playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    recomputeLuckValue();
    if (typeof applyOblivionPresetOptions === 'function') {
        applyOblivionPresetOptions({});
    }
}

function resetRollCount() {
    document.getElementById('roll-total').value = 1;
    playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
}

function setGlitchPreset() {
    document.getElementById('biome-dropdown').value = 'glitch';
    playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    initializeBiomeInterface();
}

function setLimboPreset() {
    document.getElementById('biome-dropdown').value = 'limbo';
    playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    initializeBiomeInterface();
}

function setRoePreset() {
    document.getElementById('biome-dropdown').value = 'roe';
    playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    initializeBiomeInterface();
}

function resetBiomeChoice() {
    document.getElementById('biome-dropdown').value = 'normal';
    playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    initializeBiomeInterface();
}

function initializeBiomeInterface() {
    const biome = document.getElementById('biome-dropdown').value;
    const daveLuckContainer = document.getElementById('dave-luck-wrapper');
    const xyzLuckContainer = document.getElementById('xyz-luck-wrapper');
    const luckPresets = document.getElementById('luck-preset-panel');
    const voidHeartBtn = document.getElementById('void-heart-trigger');
    if (biome === "limbo") {
        if (daveLuckContainer) daveLuckContainer.style.display = "";
        if (xyzLuckContainer) xyzLuckContainer.style.display = "none";
        if (luckPresets) {
            Array.from(luckPresets.children).forEach(btn => {
                if (btn === voidHeartBtn) {
                    btn.style.display = "";
                } else if (btn.textContent.includes("VIP") || btn.textContent.includes("Dave") || btn === voidHeartBtn) {
                    btn.style.display = "";
                } else {
                    btn.style.display = "none";
                }
            });
        }
    } else {
        if (daveLuckContainer) daveLuckContainer.style.display = "none";
        if (xyzLuckContainer) xyzLuckContainer.style.display = "";
        if (luckPresets) {
            Array.from(luckPresets.children).forEach(btn => {
                if (btn === voidHeartBtn) {
                    btn.style.display = "none";
                } else {
                    btn.style.display = "";
                }
            });
        }
    }
    applyBiomeTheme(biome);
    updateGlitchPresentation();
    recomputeLuckValue();
    refreshCustomSelect('biome-dropdown');
}

document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('button');
    const inputs = document.querySelectorAll('input');
    const selects = document.querySelectorAll('select');
    const clickSound = document.getElementById('clickSoundFx');
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
    document.getElementById('vip-dropdown').addEventListener('change', recomputeLuckValue);
    const xyzToggle = document.getElementById('xyz-luck-toggle');
    if (xyzToggle) {
        xyzToggle.addEventListener('change', recomputeLuckValue);
    }
    if (document.getElementById('dave-luck-dropdown')) {
        document.getElementById('dave-luck-dropdown').addEventListener('change', recomputeLuckValue);
    }
    document.getElementById('luck-total').addEventListener('input', function() {
        const value = parseInt(this.value) || 1;
        baseLuck = value;
        currentLuck = value;
        lastVipMultiplier = 1;
        lastXyzMultiplier = 1;
        lastDaveMultiplier = 1;
        document.getElementById('vip-dropdown').value = "1";
        document.getElementById('xyz-luck-toggle').checked = false;
        refreshCustomSelect('vip-dropdown');
        if (document.getElementById('dave-luck-dropdown')) {
            document.getElementById('dave-luck-dropdown').value = "1";
            refreshCustomSelect('dave-luck-dropdown');
        }
    });
    document.getElementById('biome-dropdown').addEventListener('change', initializeBiomeInterface);
    initializeBiomeInterface();

    const soundToggle = document.getElementById('rollAudioToggle');
    if (soundToggle) {
        soundToggle.textContent = 'Other Sounds: Off';
        soundToggle.setAttribute('aria-pressed', 'false');
    }

    const uiSoundToggle = document.getElementById('uiAudioToggle');
    if (uiSoundToggle) {
        uiSoundToggle.textContent = 'UI Sound: Off';
        uiSoundToggle.setAttribute('aria-pressed', 'false');
    }

    const cutsceneToggle = document.getElementById('cinematicToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = 'Cutscenes (Fullscreen recommended): Off';
        cutsceneToggle.setAttribute('aria-pressed', 'false');
    }

    const glitchToggle = document.getElementById('glitchEffectsToggle');
    if (glitchToggle) {
        glitchToggle.textContent = glitchEffectsActive ? 'Glitch Effects: On' : 'Glitch Effects: Off';
        glitchToggle.setAttribute('aria-pressed', glitchEffectsActive ? 'true' : 'false');
    }

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

function playAuraVideo(videoId) {
    return new Promise(resolve => {
        if (!cinematicModeEnabled) {
            resolve();
            return;
        }

        if (detectTouchFirstPlatform()) {
            const bgMusic = document.getElementById('ambientMusic');
            if (bgMusic && !bgMusic.paused) {
                bgMusic.pause();
                setTimeout(() => {
                    if (rollingAudioEnabled) bgMusic.play();
                }, 500);
            }
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

        if (rollingAudioEnabled) {
            applyMediaGain(video);
        }

        videoPlaybackActive = true;
        const bgMusic = document.getElementById('ambientMusic');
        const wasPlaying = bgMusic && !bgMusic.paused;

        if (bgMusic && wasPlaying) {
            bgMusic.pause();
        }

        overlay.style.display = 'flex';
        video.style.display = 'block';
        skipButton.style.display = 'block';
        if (!scrollLockSnapshot && document.body) {
            const body = document.body;
            const previousOverflow = body.style.overflow;
            const previousPadding = body.style.paddingRight;
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            body.style.overflow = 'hidden';
            if (scrollbarWidth > 0) {
                body.style.paddingRight = `${scrollbarWidth}px`;
            }
            scrollLockSnapshot = {
                overflow: previousOverflow,
                paddingRight: previousPadding
            };
        }
        video.currentTime = 0;
        video.muted = !rollingAudioEnabled;

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            videoPlaybackActive = false;
            video.pause();
            video.currentTime = 0;
            video.style.display = 'none';
            overlay.style.display = 'none';
            skipButton.style.display = 'none';
            if (scrollLockSnapshot && document.body) {
                const body = document.body;
                body.style.overflow = scrollLockSnapshot.overflow;
                body.style.paddingRight = scrollLockSnapshot.paddingRight;
                scrollLockSnapshot = null;
            }
            if (bgMusic && wasPlaying && rollingAudioEnabled) {
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

async function playAuraSequence(queue) {
    if (!Array.isArray(queue) || queue.length === 0) return;

    for (const videoId of queue) {
        if (!cinematicModeEnabled) break;
        await playAuraVideo(videoId);
    }
}

// Decide which rarity CSS class to apply to an aura for display purposes
function resolveRarityClass(aura, biome) {
    if (aura && aura.disableRarityClass) return '';
    // Fault always appears with a challenged rarity style to match in-game presentation
    if (aura && aura.name === "Fault") return 'rarity-tier-challenged';
    if (aura && aura.exclusiveTo && (aura.exclusiveTo.includes("limbo") || aura.exclusiveTo.includes("limbo-null"))) {
        if (biome === "limbo") return 'rarity-tier-limbo';
        // Limbo exclusives revert to their standard rarity outside of Limbo
    }
    if (aura && aura.exclusiveTo && !aura.exclusiveTo.includes("limbo-null")) return 'rarity-tier-challenged';
    const chance = aura.chance;
    if (chance >= 1000000000) return 'rarity-tier-transcendent';
    if (chance >= 99999999) return 'rarity-tier-glorious';
    if (chance >= 10000000) return 'rarity-tier-exalted';
    if (chance >= 1000000) return 'rarity-tier-mythic';
    if (chance >= 99999) return 'rarity-tier-legendary';
    if (chance >= 10000) return 'rarity-tier-unique';
    if (chance >= 1000) return 'rarity-tier-epic';
    return 'rarity-tier-basic';
}

const auraOutlineOverrides = new Map([
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
]);

function resolveAuraStyleClass(aura) {
    if (!aura) return '';

    const name = typeof aura === 'string' ? aura : aura.name;
    if (!name) return '';

    const classes = [];
    if (name.startsWith('Oblivion')) classes.push('sigil-effect-oblivion');
    if (name.startsWith('Memory')) classes.push('sigil-effect-memory');
    if (name.startsWith('Pixelation')) classes.push('sigil-effect-pixelation');
    if (name.startsWith('Luminosity')) classes.push('sigil-effect-luminosity');
    if (name.startsWith('Equinox')) classes.push('sigil-effect-equinox');

    const auraData = typeof aura === 'string' ? null : aura;
    const exclusiveTo = auraData && Array.isArray(auraData.exclusiveTo) ? auraData.exclusiveTo : null;
    if (exclusiveTo && exclusiveTo.some((zone) => zone === 'pumpkinMoon' || zone === 'graveyard')) {
        classes.push('sigil-outline-halloween');
    }

    const shortName = name.includes(' - ') ? name.split(' - ')[0].trim() : name.trim();
    const overrideClass = auraOutlineOverrides.get(shortName);
    if (overrideClass) {
        classes.push(overrideClass);
    }

    return classes.join(' ');
}
