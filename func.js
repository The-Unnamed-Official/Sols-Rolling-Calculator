// Generate pseudo-random numbers using the SFC32 algorithm for consistent rolls
function createSfc32Generator(a, b, c, d) {
    return function() {
      a |= 0; b |= 0; c |= 0; d |= 0;
      let t = (a + b | 0) + d | 0;
      d = d + 1 | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = (c << 21 | c >>> 11);
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    }
}

// Capture a random seed for each component so the generator starts in a varied state
const seedgen = () => (Math.random()*2**32)>>>0;
// Shared generator instance that all random helpers read from
const getRand = createSfc32Generator(seedgen(), seedgen(), seedgen(), seedgen());

// Produce an integer between two inclusive bounds
function randomIntegerInRange(min, max) {
    return Math.floor(getRand() * (max - min + 1)) + min;
}

// Produce a floating-point value between two bounds
function randomDecimalInRange(min, max) {
    return getRand() * (max - min) + min;
}

// Track each feature toggle to avoid repeated DOM queries
let rollingSoundEnabled = false;
let uiSoundEnabled = false;
let cutscenesEnabled = false;
let glitchEffectsEnabled = true;
let videoPlaying = false;
let scrollLockState = null;

// These caches prevent redundant audio decoding and keep track of gain adjustments
const audioBufferCache = new Map();
const audioBufferPromises = new Map();
const mediaElementGainMap = new WeakMap();
let audioContextInstance = null;

// Lazily create (or reuse) a web audio context when the browser allows it
function obtainAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioContextInstance) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        audioContextInstance = new AudioContextClass();
    }
    return audioContextInstance;
}

// Make sure playback can resume after a user gesture if the context was suspended
function resumeAudioContextPlayback() {
    const context = obtainAudioContext();
    if (context && context.state === 'suspended') {
        context.resume().catch(() => {});
    }
    return context;
}

// Normalize the audio/video source so caching keys are consistent across relative URLs
function normalizeMediaSourceUrl(element) {
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
function isMediaElementSourceAllowed(element) {
    if (!element || typeof window === 'undefined') return false;

    const { location } = window;
    if (!location) return false;

    if (location.protocol === 'file:') {
        return false;
    }

    const sourceUrl = normalizeMediaSourceUrl(element);
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
function applyMediaElementGainControl(element) {
    if (!element) return;
    const dataset = element.dataset || {};
    const gainValueRaw = dataset.gain ?? dataset.boost ?? dataset.volume;
    if (gainValueRaw === undefined) return;

    let gainValue = Number.parseFloat(gainValueRaw);
    if (!Number.isFinite(gainValue) || gainValue <= 0) return;

    const context = isMediaElementSourceAllowed(element) ? resumeAudioContextPlayback() : null;
    if (context) {
        try {
            let entry = mediaElementGainMap.get(element);
            if (!entry) {
                const source = context.createMediaElementSource(element);
                const gainNode = context.createGain();
                source.connect(gainNode).connect(context.destination);
                entry = { gainNode };
                mediaElementGainMap.set(element, entry);
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
function detectMobilePlatform() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.matchMedia("(max-width: 768px)").matches)
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0)
        || (navigator.msMaxTouchPoints > 0);
}

// Separate toggles for UI and rolling sounds so they can be controlled independently
function isSoundCategoryActive(category) {
    if (category === 'ui') return uiSoundEnabled;
    return rollingSoundEnabled;
}

// Play a sound effect with respect to user toggles and cached buffers
function emitSoundEffect(audioElement, category = 'rolling') {
    if (!audioElement) return;

    if (!isSoundCategoryActive(category)) return;

    if (category !== 'ui' && videoPlaying) return;

    const dataset = audioElement.dataset || {};
    const baseVolumeRaw = dataset.volume ?? '0.1';
    const boostRaw = dataset.boost ?? '1';

    let baseVolume = Number.parseFloat(baseVolumeRaw);
    let boost = Number.parseFloat(boostRaw);

    if (!Number.isFinite(baseVolume)) baseVolume = 0.1;
    if (!Number.isFinite(boost)) boost = 1;

    const gainValue = Math.max(0, baseVolume * boost);
    if (gainValue === 0) return;

    const context = resumeAudioContextPlayback();
    const sourceUrl = normalizeMediaSourceUrl(audioElement);

    const playViaElement = () => {
        if (!isSoundCategoryActive(category)) return;
        if (category !== 'ui' && videoPlaying) return;
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
            if (!buffer || !isSoundCategoryActive(category)) return;
            if (category !== 'ui' && videoPlaying) return;
            const activeContext = resumeAudioContextPlayback();
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

        const cachedBuffer = audioBufferCache.get(sourceUrl);
        if (cachedBuffer) {
            playBuffer(cachedBuffer);
            return;
        }

        let pending = audioBufferPromises.get(sourceUrl);
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
                    audioBufferCache.set(sourceUrl, buffer);
                    audioBufferPromises.delete(sourceUrl);
                    return buffer;
                })
                .catch(error => {
                    console.error('Audio buffer error:', error);
                    audioBufferPromises.delete(sourceUrl);
                    return null;
                });
            audioBufferPromises.set(sourceUrl, pending);
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

function calculateBgMusicBaseVolume(bgMusic) {
    if (!bgMusic) return 0.18;
    const dataset = bgMusic.dataset || {};
    const rawValue = dataset.volume ?? dataset.gain ?? dataset.boost;
    const parsed = Number.parseFloat(rawValue);
    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(parsed, 1);
    }
    return 0.18;
}

function syncBgMusicRouting(bgMusic) {
    if (!bgMusic) {
        return { baseVolume: 0.18, chain: null };
    }

    const baseVolume = calculateBgMusicBaseVolume(bgMusic);
    const chain = ensureGlitchAudioChainInitialized(bgMusic);

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

function readyBgMusicForPlayback(bgMusic) {
    if (!bgMusic) return;

    syncBgMusicRouting(bgMusic);
    try {
        bgMusic.muted = false;
        if (typeof bgMusic.removeAttribute === 'function') {
            bgMusic.removeAttribute('muted');
        }
    } catch (error) {
        console.warn('Unable to unmute background music element', error);
    }
}

function startBgMusicPlayback(bgMusic) {
    if (!bgMusic) return;

    const playPromise = bgMusic.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
            if (!rollingSoundEnabled) return;
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

function switchRollingSound() {
    rollingSoundEnabled = !rollingSoundEnabled;
    const bgMusic = document.getElementById('bgMusic');
    const soundToggle = document.getElementById('soundToggle');
    if (bgMusic && !bgMusic.getAttribute('data-current-src')) {
        bgMusic.setAttribute('data-current-src', bgMusic.src);
    }

    if (rollingSoundEnabled) {
        resumeAudioContextPlayback();
        emitSoundEffect(document.getElementById('clickSound'), 'ui');
        if (bgMusic) {
            readyBgMusicForPlayback(bgMusic);
            if (glitchPresentationEnabled) {
                updateGlitchAudioState(shouldEnableGlitchBaseEffect());
            }
            startBgMusicPlayback(bgMusic);
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
        soundToggle.textContent = rollingSoundEnabled ? 'Other Sounds: On' : 'Other Sounds: Off';
        soundToggle.setAttribute('aria-pressed', rollingSoundEnabled);
    }
}

function switchUiSound() {
    uiSoundEnabled = !uiSoundEnabled;
    resumeAudioContextPlayback();

    const uiSoundToggle = document.getElementById('uiSoundToggle');
    if (uiSoundToggle) {
        uiSoundToggle.textContent = uiSoundEnabled ? 'UI Sound: On' : 'UI Sound: Off';
        uiSoundToggle.setAttribute('aria-pressed', uiSoundEnabled);
    }

    if (uiSoundEnabled) {
        emitSoundEffect(document.getElementById('clickSound'), 'ui');
    }
}

function switchCutsceneMode() {
    cutscenesEnabled = !cutscenesEnabled;
    const cutsceneToggle = document.getElementById('cutsceneToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = cutscenesEnabled ? 'Cutscenes (Fullscreen recommended): On' : 'Cutscenes (Fullscreen recommended): Off';
        cutsceneToggle.setAttribute('aria-pressed', cutscenesEnabled ? 'true' : 'false');
    }

    const clickSound = document.getElementById('clickSound');
    if (clickSound) {
        emitSoundEffect(clickSound, 'ui');
    }

    if (!cutscenesEnabled) {
        const skipButton = document.getElementById('skip-button');
        if (skipButton && skipButton.style.display !== 'none') {
            skipButton.click();
        }
    }
}

function checkGlitchBiomeSelected() {
    const biomeSelect = document.getElementById('biome-select');
    return biomeSelect ? biomeSelect.value === 'glitch' : false;
}

function syncGlitchPresentation() {
    const glitchBiomeActive = checkGlitchBiomeSelected();
    applyGlitchPresentation(glitchEffectsEnabled && glitchBiomeActive, { forceTheme: glitchBiomeActive });
}

function switchGlitchEffects() {
    glitchEffectsEnabled = !glitchEffectsEnabled;
    const glitchToggle = document.getElementById('glitchToggle');
    if (glitchToggle) {
        glitchToggle.textContent = glitchEffectsEnabled ? 'Glitch Effects: On' : 'Glitch Effects: Off';
        glitchToggle.setAttribute('aria-pressed', glitchEffectsEnabled ? 'true' : 'false');
    }

    emitSoundEffect(document.getElementById('clickSound'), 'ui');
    syncGlitchPresentation();
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

function syncBloodRainWeather(biome) {
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
        const offsetX = randomDecimalInRange(0, 100);
        const delay = randomDecimalInRange(0, 2.2);
        const duration = randomDecimalInRange(1.2, 2.8);
        const length = randomDecimalInRange(0.9, 2.6);
        const thickness = randomDecimalInRange(0.8, 1.9);
        const opacity = randomDecimalInRange(0.6, 0.95);
        const skew = randomDecimalInRange(-4, 4);
        const drift = randomDecimalInRange(-18, 18);
        const startOffset = randomDecimalInRange(0, 60);
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

function shouldEnableGlitchBaseEffect() {
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

function resetGlitchAudioRuinTimer() {
    if (glitchAudioState.ruinTimeoutId !== null && typeof window !== 'undefined') {
        window.clearTimeout(glitchAudioState.ruinTimeoutId);
        glitchAudioState.ruinTimeoutId = null;
    }
}

function resetGlitchBaseWarbleTimer() {
    if (glitchAudioState.warbleIntervalId !== null && typeof window !== 'undefined') {
        window.clearTimeout(glitchAudioState.warbleIntervalId);
        glitchAudioState.warbleIntervalId = null;
    }
}

function scheduleGlitchBaseWarbleCycle(bgMusic, chain) {
    if (!bgMusic || typeof window === 'undefined') return;

    resetGlitchBaseWarbleTimer();

    const context = chain?.context || obtainAudioContext();
    const applyWarble = () => {
        if (!glitchPresentationEnabled) {
            resetGlitchBaseWarbleTimer();
            return;
        }

        if (glitchAudioState.isRuinActive) {
            glitchAudioState.warbleIntervalId = window.setTimeout(applyWarble, randomIntegerInRange(420, 900));
            return;
        }

        const warbleRate = randomDecimalInRange(GLITCH_WARBLE_RATE_MIN, GLITCH_WARBLE_RATE_MAX);
        glitchAudioState.basePlaybackRate = warbleRate;

        try {
            bgMusic.playbackRate = warbleRate;
        } catch (error) {
            console.warn('Unable to apply glitch base warble rate', error);
        }

        const baseGain = chain?.baseGain ?? calculateBgMusicBaseVolume(bgMusic);
        if (context && chain?.gainNode?.gain && typeof chain.gainNode.gain.setTargetAtTime === 'function') {
            const warpedGain = Math.max(0, Math.min(1, baseGain * randomDecimalInRange(0.45, 0.7)));
            chain.gainNode.gain.setTargetAtTime(warpedGain, context.currentTime, 0.6);
        }

        if (context && chain?.highpass?.frequency && typeof chain.highpass.frequency.setTargetAtTime === 'function') {
            const warpedHighpass = Math.max(0, GLITCH_BASE_HIGHPASS_FREQUENCY * randomDecimalInRange(1.05, 1.4));
            chain.highpass.frequency.setTargetAtTime(warpedHighpass, context.currentTime, 0.6);
        }

        if (context && chain?.filter?.detune && typeof chain.filter.detune.setTargetAtTime === 'function') {
            const detune = randomDecimalInRange(-680, 420);
            chain.filter.detune.setTargetAtTime(detune, context.currentTime, 0.6);
        }

        glitchAudioState.warbleIntervalId = window.setTimeout(applyWarble, randomIntegerInRange(GLITCH_WARBLE_REST_MIN, GLITCH_WARBLE_REST_MAX));
    };

    glitchAudioState.warbleIntervalId = window.setTimeout(applyWarble, randomIntegerInRange(180, 520));
}

function generateDistortionCurve(amount = 0) {
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

function ensureGlitchAudioChainInitialized(audioElement) {
    if (!audioElement) return null;
    const context = obtainAudioContext();
    if (!context) return null;

    let chain = glitchAudioChainMap.get(audioElement);
    const baseVolume = calculateBgMusicBaseVolume(audioElement);

    if (!isMediaElementSourceAllowed(audioElement)) {
        glitchAudioChainMap.delete(audioElement);
        audioElement.volume = Math.max(0, Math.min(baseVolume, 1));
        return null;
    }
    if (chain && chain.context === context) {
        if (!chain.highpass) {
            glitchAudioChainMap.delete(audioElement);
            return ensureGlitchAudioChainInitialized(audioElement);
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
        const neutralCurve = generateDistortionCurve(0);
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

function updateGlitchAudioState(enabled) {
    const bgMusic = document.getElementById('bgMusic');
    if (!bgMusic) return;

    const context = enabled ? resumeAudioContextPlayback() : obtainAudioContext();
    const chain = ensureGlitchAudioChainInitialized(bgMusic);

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

    resetGlitchAudioRuinTimer();
    glitchAudioState.isRuinActive = false;

    const baseGain = chain.baseGain ?? calculateBgMusicBaseVolume(bgMusic);

    if (enabled) {
        if (glitchAudioState.originalPlaybackRate === null) {
            glitchAudioState.originalPlaybackRate = bgMusic.playbackRate || 1;
        }
        if (glitchAudioState.basePlaybackRate === null) {
            glitchAudioState.basePlaybackRate = randomDecimalInRange(GLITCH_WARBLE_RATE_MIN, GLITCH_WARBLE_RATE_MAX);
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
        chain.waveshaper.curve = generateDistortionCurve(GLITCH_BASE_DISTORTION);
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
        chain.waveshaper.curve = chain.neutralCurve || generateDistortionCurve(0);
        if (chain.waveshaper) {
            chain.waveshaper.oversample = 'none';
        }
    }

    if (enabled) {
        scheduleGlitchBaseWarbleCycle(bgMusic, chain);
    } else {
        resetGlitchBaseWarbleTimer();
    }
}

function triggerGlitchAudioBurst() {
    const bgMusic = document.getElementById('bgMusic');
    if (!bgMusic || !shouldEnableGlitchBaseEffect()) return;

    const context = obtainAudioContext();
    const chain = ensureGlitchAudioChainInitialized(bgMusic);

    if (!context || !chain) return;

    glitchAudioState.isRuinActive = true;
    resetGlitchAudioRuinTimer();
    resetGlitchBaseWarbleTimer();

    if (glitchAudioState.originalPlaybackRate === null) {
        glitchAudioState.originalPlaybackRate = bgMusic.playbackRate || 1;
    }
    if (glitchAudioState.basePlaybackRate === null) {
        glitchAudioState.basePlaybackRate = randomDecimalInRange(GLITCH_WARBLE_RATE_MIN, GLITCH_WARBLE_RATE_MAX);
    }

    if (!chain.originalFilterType) {
        chain.originalFilterType = chain.filter.type;
    }

    try {
        chain.filter.type = 'bandpass';
    } catch (error) {
        console.warn('Unable to adjust glitch filter type', error);
    }

    const baseGain = chain.baseGain ?? calculateBgMusicBaseVolume(bgMusic);

    const applyChaosPulse = () => {
        if (!glitchAudioState.isRuinActive) return;

        const chaoticRate = randomDecimalInRange(0.38, 1.72);
        try {
            bgMusic.playbackRate = chaoticRate;
        } catch (error) {
            console.warn('Unable to modify playback rate for glitch ruin', error);
        }

        const frequency = randomDecimalInRange(GLITCH_RUIN_MIN_FREQUENCY, 2600);
        const q = randomDecimalInRange(1.4, 9);
        const gain = Math.max(0, Math.min(1, baseGain * randomDecimalInRange(0.25, 0.7)));
        const distortionAmount = randomIntegerInRange(GLITCH_RUIN_MIN_DISTORTION, GLITCH_RUIN_MAX_DISTORTION);
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
            const detune = randomDecimalInRange(-2400, 2400);
            chain.filter.detune.setTargetAtTime(detune, context.currentTime, 0.05);
        }

        chain.waveshaper.curve = generateDistortionCurve(distortionAmount);
        if (chain.waveshaper) {
            chain.waveshaper.oversample = Math.random() > 0.4 ? '4x' : '2x';
        }

        if (typeof window !== 'undefined') {
            glitchAudioState.ruinTimeoutId = window.setTimeout(applyChaosPulse, randomIntegerInRange(120, 260));
        }
    };

    applyChaosPulse();
}

function completeGlitchAudioBurst() {
    glitchAudioState.isRuinActive = false;
    resetGlitchAudioRuinTimer();

    const bgMusic = document.getElementById('bgMusic');
    if (!bgMusic) return;

    const context = obtainAudioContext();
    const chain = glitchAudioChainMap.get(bgMusic) || ensureGlitchAudioChainInitialized(bgMusic);

    const baseEffectEnabled = shouldEnableGlitchBaseEffect();
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
            scheduleGlitchBaseWarbleCycle(bgMusic, null);
        } else {
            resetGlitchBaseWarbleTimer();
        }
        return;
    }

    const baseGain = chain.baseGain ?? calculateBgMusicBaseVolume(bgMusic);
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

    chain.waveshaper.curve = baseEffectEnabled ? generateDistortionCurve(GLITCH_BASE_DISTORTION) : (chain.neutralCurve || generateDistortionCurve(0));
    if (chain.waveshaper) {
        chain.waveshaper.oversample = baseEffectEnabled ? '4x' : 'none';
    }

    if (baseEffectEnabled) {
        scheduleGlitchBaseWarbleCycle(bgMusic, chain);
    } else {
        resetGlitchBaseWarbleTimer();
    }
}

function scheduleGlitchBurstCycle(delay) {
    if (typeof window === 'undefined') return;
    if (glitchUiState.loopTimeoutId !== null) {
        window.clearTimeout(glitchUiState.loopTimeoutId);
    }
    glitchUiState.loopTimeoutId = window.setTimeout(() => {
        glitchUiState.loopTimeoutId = null;
        executeGlitchBurst();
    }, Math.max(0, delay));
}

function executeGlitchBurst() {
    if (!glitchPresentationEnabled) return;
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;

    glitchUiState.isUiGlitching = true;
    body.classList.add('is-glitching');
    root.classList.add('is-glitching');
    updateGlitchAudioState(shouldEnableGlitchBaseEffect());
    triggerGlitchAudioBurst();

    if (typeof window === 'undefined') return;
    if (glitchUiState.activeTimeoutId !== null) {
        window.clearTimeout(glitchUiState.activeTimeoutId);
    }
    glitchUiState.activeTimeoutId = window.setTimeout(() => {
        body.classList.remove('is-glitching');
        root.classList.remove('is-glitching');
        glitchUiState.activeTimeoutId = null;
        glitchUiState.isUiGlitching = false;
        completeGlitchAudioBurst();
        updateGlitchAudioState(shouldEnableGlitchBaseEffect());
        if (glitchPresentationEnabled) {
            scheduleGlitchBurstCycle(randomIntegerInRange(1800, 4200));
        }
    }, randomIntegerInRange(320, 980));
}

function beginGlitchLoop(forceImmediate = false) {
    if (!glitchPresentationEnabled || typeof window === 'undefined') return;
    const initialDelay = forceImmediate ? randomIntegerInRange(120, 420) : randomIntegerInRange(600, 1800);
    scheduleGlitchBurstCycle(initialDelay);
}

function confirmGlitchLoopScheduled() {
    if (!glitchPresentationEnabled) return;
    const body = document.body;
    if (!body) return;
    if (glitchUiState.loopTimeoutId === null && !body.classList.contains('is-glitching')) {
        scheduleGlitchBurstCycle(randomIntegerInRange(1800, 4200));
    }
}

function haltGlitchLoop(options = {}) {
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
        resetGlitchAudioRuinTimer();
        glitchAudioState.isRuinActive = false;
        resetGlitchBaseWarbleTimer();
    }

    glitchUiState.isUiGlitching = false;
    completeGlitchAudioBurst();
    updateGlitchAudioState(false);

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

function applyGlitchPresentation(enabled, options = {}) {
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;
    const { forceTheme = false } = options;

    if (enabled) {
        root.classList.add('biome--glitch');
        body.classList.add('biome--glitch');
        if (!glitchPresentationEnabled) {
            glitchPresentationEnabled = true;
            updateGlitchAudioState(shouldEnableGlitchBaseEffect());
            beginGlitchLoop(true);
        } else {
            updateGlitchAudioState(shouldEnableGlitchBaseEffect());
            confirmGlitchLoopScheduled();
        }
    } else {
        if (glitchPresentationEnabled) {
            glitchPresentationEnabled = false;
            haltGlitchLoop({ preserveBiomeClass: forceTheme });
        }
        if (forceTheme) {
            root.classList.add('biome--glitch');
            body.classList.add('biome--glitch');
        } else {
            body.classList.remove('biome--glitch');
            root.classList.remove('biome--glitch');
        }
        glitchUiState.isUiGlitching = false;
        updateGlitchAudioState(false);
    }
}

function applyBiomeVisualTheme(biome) {
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

    syncBloodRainWeather(biome);

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

    const bgMusic = document.getElementById('bgMusic');
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

        if (rollingSoundEnabled) {
            readyBgMusicForPlayback(bgMusic);
            if (glitchPresentationEnabled) {
                updateGlitchAudioState(shouldEnableGlitchBaseEffect());
            }
        }

        if (rollingSoundEnabled && (shouldUpdateMusic || bgMusic.paused)) {
            startBgMusicPlayback(bgMusic);
        }
    }
}

function assignLuckValue(value, options = {}) {
    baseLuck = value;
    currentLuck = value;
    lastVipMultiplier = 1;
    lastXyzMultiplier = 1;
    lastDaveMultiplier = 1;
    document.getElementById('vip-select').value = "1";
    document.getElementById('xyz-luck').checked = false;
    refreshCustomSelectDisplay('vip-select');
    if (document.getElementById('dave-luck-select')) {
        document.getElementById('dave-luck-select').value = "1";
        refreshCustomSelectDisplay('dave-luck-select');
    }
    document.getElementById('luck').value = value;

    if (typeof processPresetOptionChange === 'function') {
        processPresetOptionChange(options);
    }
}

// Recalculate the combined luck multiplier whenever a control changes
function recalculateLuckValue() {
    const controls = {
        biome: document.getElementById('biome-select'),
        vip: document.getElementById('vip-select'),
        xyz: document.getElementById('xyz-luck'),
        dave: document.getElementById('dave-luck-select'),
        luckInput: document.getElementById('luck')
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
            refreshCustomSelectDisplay('vip-select');
        }
        if (controls.xyz) {
            controls.xyz.checked = false;
        }
        if (controls.dave) {
            controls.dave.value = "1";
            refreshCustomSelectDisplay('dave-luck-select');
        }
        if (typeof processPresetOptionChange === 'function') {
            processPresetOptionChange({});
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

function restoreLuckDefaults() {
    document.getElementById('luck').value = 1;
    emitSoundEffect(document.getElementById('clickSound'), 'ui');
    recalculateLuckValue();
    if (typeof processPresetOptionChange === 'function') {
        processPresetOptionChange({});
    }
}

function clearRollCount() {
    document.getElementById('rolls').value = 1;
    emitSoundEffect(document.getElementById('clickSound'), 'ui');
}

function applyGlitchPreset() {
    document.getElementById('biome-select').value = 'glitch';
    emitSoundEffect(document.getElementById('clickSound'), 'ui');
    handleBiomeInterface();
}

function applyLimboPreset() {
    document.getElementById('biome-select').value = 'limbo';
    emitSoundEffect(document.getElementById('clickSound'), 'ui');
    handleBiomeInterface();
}

function applyRoePreset() {
    document.getElementById('biome-select').value = 'roe';
    emitSoundEffect(document.getElementById('clickSound'), 'ui');
    handleBiomeInterface();
}

function resetBiomeSelection() {
    document.getElementById('biome-select').value = 'normal';
    emitSoundEffect(document.getElementById('clickSound'), 'ui');
    handleBiomeInterface();
}

function handleBiomeInterface() {
    const biome = document.getElementById('biome-select').value;
    const daveLuckContainer = document.getElementById('dave-luck-container');
    const xyzLuckContainer = document.getElementById('xyz-luck-container');
    const luckPresets = document.getElementById('luck-presets');
    const voidHeartBtn = document.getElementById('void-heart-btn');
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
    applyBiomeVisualTheme(biome);
    syncGlitchPresentation();
    recalculateLuckValue();
    refreshCustomSelectDisplay('biome-select');
}

document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('button');
    const inputs = document.querySelectorAll('input');
    const selects = document.querySelectorAll('select');
    const clickSound = document.getElementById('clickSound');
    const hoverSound = document.getElementById('hoverSound');
    buttons.forEach(button => {
        button.addEventListener('click', () => emitSoundEffect(clickSound, 'ui'));
        button.addEventListener('mouseenter', () => emitSoundEffect(hoverSound, 'ui'));
    });
    inputs.forEach(input => {
        input.addEventListener('click', () => emitSoundEffect(clickSound, 'ui'));
        input.addEventListener('mouseenter', () => emitSoundEffect(hoverSound, 'ui'));
    });
    selects.forEach(select => {
        select.addEventListener('change', () => emitSoundEffect(clickSound, 'ui'));
        select.addEventListener('mouseenter', () => emitSoundEffect(hoverSound, 'ui'));
    });
    document.getElementById('vip-select').addEventListener('change', recalculateLuckValue);
    const xyzToggle = document.getElementById('xyz-luck');
    if (xyzToggle) {
        xyzToggle.addEventListener('change', recalculateLuckValue);
    }
    if (document.getElementById('dave-luck-select')) {
        document.getElementById('dave-luck-select').addEventListener('change', recalculateLuckValue);
    }
    document.getElementById('luck').addEventListener('input', function() {
        const value = parseInt(this.value) || 1;
        baseLuck = value;
        currentLuck = value;
        lastVipMultiplier = 1;
        lastXyzMultiplier = 1;
        lastDaveMultiplier = 1;
        document.getElementById('vip-select').value = "1";
        document.getElementById('xyz-luck').checked = false;
        refreshCustomSelectDisplay('vip-select');
        if (document.getElementById('dave-luck-select')) {
            document.getElementById('dave-luck-select').value = "1";
            refreshCustomSelectDisplay('dave-luck-select');
        }
    });
    document.getElementById('biome-select').addEventListener('change', handleBiomeInterface);
    handleBiomeInterface();

    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.textContent = 'Other Sounds: Off';
        soundToggle.setAttribute('aria-pressed', 'false');
    }

    const uiSoundToggle = document.getElementById('uiSoundToggle');
    if (uiSoundToggle) {
        uiSoundToggle.textContent = 'UI Sound: Off';
        uiSoundToggle.setAttribute('aria-pressed', 'false');
    }

    const cutsceneToggle = document.getElementById('cutsceneToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = 'Cutscenes (Fullscreen recommended): Off';
        cutsceneToggle.setAttribute('aria-pressed', 'false');
    }

    const glitchToggle = document.getElementById('glitchToggle');
    if (glitchToggle) {
        glitchToggle.textContent = glitchEffectsEnabled ? 'Glitch Effects: On' : 'Glitch Effects: Off';
        glitchToggle.setAttribute('aria-pressed', glitchEffectsEnabled ? 'true' : 'false');
    }

    const settingsMenu = document.getElementById('settingsMenu');
    const settingsToggleButton = document.getElementById('settingsMenuToggle');
    const settingsPanel = document.getElementById('settingsMenuPanel');
    if (settingsMenu && settingsToggleButton && settingsPanel) {
        const closeSettingsMenu = () => {
            settingsMenu.classList.remove('settings-menu--open');
            settingsToggleButton.setAttribute('aria-expanded', 'false');
        };

        const openSettingsMenu = () => {
            settingsMenu.classList.add('settings-menu--open');
            settingsToggleButton.setAttribute('aria-expanded', 'true');
        };

        settingsToggleButton.addEventListener('click', event => {
            event.stopPropagation();
            if (settingsMenu.classList.contains('settings-menu--open')) {
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

    const yearEl = document.getElementById('year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
});

function presentAuraVideo(videoId) {
    return new Promise(resolve => {
        if (!cutscenesEnabled) {
            resolve();
            return;
        }

        if (detectMobilePlatform()) {
            const bgMusic = document.getElementById('bgMusic');
            if (bgMusic && !bgMusic.paused) {
                bgMusic.pause();
                setTimeout(() => {
                    if (rollingSoundEnabled) bgMusic.play();
                }, 500);
            }
            resolve();
            return;
        }

        let overlay = document.getElementById('video-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'video-overlay';
            overlay.className = 'video-overlay';
            document.body.appendChild(overlay);
        }

        let skipButton = document.getElementById('skip-button');
        if (!skipButton) {
            skipButton = document.createElement('div');
            skipButton.id = 'skip-button';
            skipButton.className = 'skip-button';
            skipButton.textContent = 'Skip cutscene';
            document.body.appendChild(skipButton);
        }

        const video = document.getElementById(videoId);
        if (!video) {
            resolve();
            return;
        }

        if (rollingSoundEnabled) {
            applyMediaElementGainControl(video);
        }

        videoPlaying = true;
        const bgMusic = document.getElementById('bgMusic');
        const wasPlaying = bgMusic && !bgMusic.paused;

        if (bgMusic && wasPlaying) {
            bgMusic.pause();
        }

        overlay.style.display = 'flex';
        video.style.display = 'block';
        skipButton.style.display = 'block';
        if (!scrollLockState && document.body) {
            const body = document.body;
            const previousOverflow = body.style.overflow;
            const previousPadding = body.style.paddingRight;
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            body.style.overflow = 'hidden';
            if (scrollbarWidth > 0) {
                body.style.paddingRight = `${scrollbarWidth}px`;
            }
            scrollLockState = {
                overflow: previousOverflow,
                paddingRight: previousPadding
            };
        }
        video.currentTime = 0;
        video.muted = !rollingSoundEnabled;

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            videoPlaying = false;
            video.pause();
            video.currentTime = 0;
            video.style.display = 'none';
            overlay.style.display = 'none';
            skipButton.style.display = 'none';
            if (scrollLockState && document.body) {
                const body = document.body;
                body.style.overflow = scrollLockState.overflow;
                body.style.paddingRight = scrollLockState.paddingRight;
                scrollLockState = null;
            }
            if (bgMusic && wasPlaying && rollingSoundEnabled) {
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

async function runAuraSequence(queue) {
    if (!Array.isArray(queue) || queue.length === 0) return;

    for (const videoId of queue) {
        if (!cutscenesEnabled) break;
        await presentAuraVideo(videoId);
    }
}

// Decide which rarity CSS class to apply to an aura for display purposes
function determineRarityClass(aura, biome) {
    if (aura && aura.disableRarityClass) return '';
    // Fault always appears with a challenged rarity style to match in-game presentation
    if (aura && aura.name === "Fault") return 'rarity-challenged';
    if (aura && aura.exclusiveTo && (aura.exclusiveTo.includes("limbo") || aura.exclusiveTo.includes("limbo-null"))) {
        if (biome === "limbo") return 'rarity-limbo';
        // Limbo exclusives revert to their standard rarity outside of Limbo
    }
    if (aura && aura.exclusiveTo && !aura.exclusiveTo.includes("limbo-null")) return 'rarity-challenged';
    const chance = aura.chance;
    if (chance >= 1000000000) return 'rarity-transcendent';
    if (chance >= 99999999) return 'rarity-glorious';
    if (chance >= 10000000) return 'rarity-exalted';
    if (chance >= 1000000) return 'rarity-mythic';
    if (chance >= 99999) return 'rarity-legendary';
    if (chance >= 10000) return 'rarity-unique';
    if (chance >= 1000) return 'rarity-epic';
    return 'rarity-basic';
}

const auraOutlineOverrides = new Map([
    ['Prowler', 'aura-outline-prowler'],
    ['Divinus : Love', 'aura-outline-valentine'],
    ['Flushed : Heart Eye', 'aura-outline-valentine'],
    ['Pukeko', 'aura-outline-april'],
    ['Flushed : Troll', 'aura-outline-april'],
    ['Undefined : Defined', 'aura-outline-april'],
    ['Origin : Onion', 'aura-outline-april'],
    ['Chromatic : Kromat1k', 'aura-outline-april'],
    ['Glock : the glock of the sky', 'aura-outline-april'],
    ["Impeached : I'm Peach", 'aura-outline-april'],
    ['Star Rider : Starfish Rider', 'aura-outline-summer'],
    ['Watermelon', 'aura-outline-summer'],
    ['Surfer : Shard Surfer', 'aura-outline-summer'],
    ['Manta', 'aura-outline-summer'],
    ['Aegis : Watergun', 'aura-outline-summer'],
    ['Innovator', 'aura-outline-innovator'],
    ['Wonderland', 'aura-outline-winter'],
    ['Santa Frost', 'aura-outline-winter'],
    ['Winter Fantasy', 'aura-outline-winter'],
    ['Express', 'aura-outline-winter'],
    ['Abominable', 'aura-outline-winter'],
    ['Atlas : Yuletide', 'aura-outline-winter'],
    ['Pump : Trickster', 'aura-outline-blood'],
    ['Headless', 'aura-outline-blood'],
    ['Oni', 'aura-outline-blood'],
    ['Headless : Horseman', 'aura-outline-blood'],
    ['Sinister', 'aura-outline-blood'],
    ['Accursed', 'aura-outline-blood'],
    ['Phantasma', 'aura-outline-blood'],
    ['Apocalypse', 'aura-outline-blood'],
    ['Malediction', 'aura-outline-blood'],
    ['Banshee', 'aura-outline-blood'],
    ['Ravage', 'aura-outline-blood'],
    ['Arachnophobia', 'aura-outline-blood'],
    ['Lamenthyr', 'aura-outline-blood'],
    ['Erebus', 'aura-outline-blood'],
]);

function deriveAuraStyleClass(aura) {
    if (!aura) return '';

    const name = typeof aura === 'string' ? aura : aura.name;
    if (!name) return '';

    const classes = [];
    if (name.startsWith('Oblivion')) classes.push('aura-effect-oblivion');
    if (name.startsWith('Memory')) classes.push('aura-effect-memory');
    if (name.startsWith('Pixelation')) classes.push('aura-effect-pixelation');
    if (name.startsWith('Luminosity')) classes.push('aura-effect-luminosity');
    if (name.startsWith('Equinox')) classes.push('aura-effect-equinox');

    const auraData = typeof aura === 'string' ? null : aura;
    const exclusiveTo = auraData && Array.isArray(auraData.exclusiveTo) ? auraData.exclusiveTo : null;
    if (exclusiveTo && exclusiveTo.some((zone) => zone === 'pumpkinMoon' || zone === 'graveyard')) {
        classes.push('aura-outline-halloween');
    }

    const shortName = name.includes(' - ') ? name.split(' - ')[0].trim() : name.trim();
    const overrideClass = auraOutlineOverrides.get(shortName);
    if (overrideClass) {
        classes.push(overrideClass);
    }

    return classes.join(' ');
}
