// Reference frequently accessed UI elements at module load
let feedContainer = document.getElementById('simulation-feed');
let luckField = document.getElementById('luck-total');
let simulationActive = false;
let lastSimulationSummary = null;
let shareFeedbackTimerId = null;
let imageShareModeRequester = null;

const randomToolkit = (() => {
    const toUint = value => (value >>> 0) & 0xffffffff;
    const sfc32 = (a, b, c, d) => {
        return () => {
            a = toUint(a);
            b = toUint(b);
            c = toUint(c);
            d = toUint(d);

            const t = (toUint(a + b) + d) | 0;
            d = (d + 1) | 0;
            a = b ^ (b >>> 9);
            b = (c + (c << 3)) | 0;
            c = (c << 21) | (c >>> 11);
            c = (c + t) | 0;

            return (t >>> 0) / 0x100000000;
        };
    };

    const captureSeedWord = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            const buffer = new Uint32Array(1);
            crypto.getRandomValues(buffer);
            return buffer[0];
        }
        const time = Date.now();
        const wobble = Math.floor(Math.random() * 0xffffffff);
        return toUint(time ^ wobble ^ (performance.now() * 1000));
    };

    const seeds = [captureSeedWord(), captureSeedWord(), captureSeedWord(), captureSeedWord()];
    const engine = sfc32(seeds[0], seeds[1], seeds[2], seeds[3]);

    for (let i = 0; i < 12; i++) {
        engine();
    }

    return {
        sample() {
            return engine();
        },
        integer(min, max) {
            const low = Math.ceil(min);
            const high = Math.floor(max);
            if (high <= low) return low;
            const span = (high - low) + 1;
            return low + Math.floor(engine() * span);
        },
        decimal(min, max) {
            return engine() * (max - min) + min;
        }
    };
})();

function drawEntropy() {
    return randomToolkit.sample();
}

function randomIntegerBetween(min, max) {
    return randomToolkit.integer(min, max);
}

function randomDecimalBetween(min, max) {
    return randomToolkit.decimal(min, max);
}

const selectWidgetRegistry = new Map();

const decimalFormatter = new Intl.NumberFormat();
const formatWithCommas = value => decimalFormatter.format(value);

const uiHandles = {
    rollTriggerButton: document.querySelector('.roll-trigger'),
    brandMark: document.querySelector('.banner__emblem'),
    rollCountInput: document.getElementById('roll-total'),
    biomeSelector: document.getElementById('biome-dropdown'),
    progressPanel: document.querySelector('.loading-indicator'),
    progressBarFill: document.querySelector('.loading-indicator__fill'),
    progressLabel: document.querySelector('.loading-indicator__value'),
    audio: {
        roll: document.getElementById('rollLoopSound'),
        k1: document.getElementById('thousandSound'),
        k10: document.getElementById('tenThousandSound'),
        k100: document.getElementById('hundredThousandSound'),
        m10: document.getElementById('tenMillionSound'),
        m100: document.getElementById('hundredMillionSound'),
        limbo99m: document.getElementById('limbo99mSoundFx')
    }
};

const appState = {
    audio: {
        roll: false,
        ui: false,
        context: null,
        bufferCache: new Map(),
        bufferPromises: new Map(),
        gainMap: new WeakMap(),
        fallbackPlayers: new Set()
    },
    cinematic: false,
    glitch: true,
    videoPlaying: false,
    scrollLock: null
};

const glitchUiState = {
    loopTimeoutId: null,
    activeTimeoutId: null,
    distortionNode: null,
    waveShaper: null,
    gainNode: null,
    sourceNode: null,
    isUiGlitching: false
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
            let entry = appState.audio.gainMap.get(element);
            if (!entry) {
                const source = context.createMediaElementSource(element);
                const gainNode = context.createGain();
                source.connect(gainNode).connect(context.destination);
                entry = { gainNode };
                appState.audio.gainMap.set(element, entry);
            }
            entry.gainNode.gain.value = gainValue;
            return;
        } catch (error) {
            console.warn('Unable to configure media element gain', error);
        }
    }

    element.volume = Math.max(0, Math.min(gainValue, 1));
}

function detectTouchFirstPlatform() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.matchMedia('(max-width: 768px)').matches)
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0)
        || (navigator.msMaxTouchPoints > 0);
}

function isSoundChannelActive(category) {
    if (category === 'ui') return appState.audio.ui;
    return appState.audio.roll;
}

function playSoundEffect(audioElement, category = 'rolling') {
    if (!audioElement) return;
    if (!isSoundChannelActive(category)) return;
    if (category !== 'ui' && appState.videoPlaying) return;

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

        const dataset = audioElement.dataset || {};
        const gainValueRaw = dataset.gain ?? dataset.boost ?? dataset.volume;
        if (gainValueRaw !== undefined) {
            const gainValue = Number.parseFloat(gainValueRaw);
            if (Number.isFinite(gainValue) && gainValue > 0) {
                fallbackPlayer.volume = Math.max(0, Math.min(gainValue, 1));
            }
        } else {
            fallbackPlayer.volume = audioElement.volume;
        }

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
        if (category === 'ui') {
            gainNode.gain.value = 0.3;
        }
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
        playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
        if (bgMusic) {
            primeBackgroundMusic(bgMusic);
            if (glitchPresentationEnabled) {
                updateGlitchAudioControls(shouldUseGlitchBaseEffect());
            }
            startBackgroundMusic(bgMusic);
        }
    } else if (bgMusic) {
        bgMusic.muted = true;
        if (typeof bgMusic.setAttribute === 'function') {
            bgMusic.setAttribute('muted', '');
        }
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }

    if (soundToggle) {
        soundToggle.textContent = appState.audio.roll ? 'Other Sounds: On' : 'Other Sounds: Off';
        soundToggle.setAttribute('aria-pressed', appState.audio.roll);
    }
}

function toggleInterfaceAudio() {
    appState.audio.ui = !appState.audio.ui;
    resumeAudioEngine();

    const uiSoundToggle = document.getElementById('uiAudioToggle');
    if (uiSoundToggle) {
        uiSoundToggle.textContent = appState.audio.ui ? 'UI Sound: On' : 'UI Sound: Off';
        uiSoundToggle.setAttribute('aria-pressed', appState.audio.ui);
    }

    if (appState.audio.ui) {
        playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    }
}

function toggleCinematicMode() {
    appState.cinematic = !appState.cinematic;
    const cutsceneToggle = document.getElementById('cinematicToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = appState.cinematic ? 'Cutscenes (Fullscreen recommended): On' : 'Cutscenes (Fullscreen recommended): Off';
        cutsceneToggle.setAttribute('aria-pressed', appState.cinematic ? 'true' : 'false');
    }

    const clickSound = document.getElementById('clickSoundFx');
    if (clickSound) {
        playSoundEffect(clickSound, 'ui');
    }

    if (!appState.cinematic) {
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
    applyGlitchVisuals(appState.glitch && glitchBiomeActive, { forceTheme: glitchBiomeActive });
}

function toggleGlitchEffects() {
    appState.glitch = !appState.glitch;
    const glitchToggle = document.getElementById('glitchEffectsToggle');
    if (glitchToggle) {
        glitchToggle.textContent = appState.glitch ? 'Glitch Effects: On' : 'Glitch Effects: Off';
        glitchToggle.setAttribute('aria-pressed', appState.glitch ? 'true' : 'false');
    }

    playSoundEffect(document.getElementById('clickSoundFx'), 'ui');
    updateGlitchPresentation();
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

    const baseGain = chain.baseGain ?? computeBackgroundMusicBase(bgMusic);
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
        applyMediaGain(audioElement);
        return null;
    }

    if (!canUseMediaElementSource(audioElement)) {
        applyMediaGain(audioElement);
        return null;
    }

    if (glitchUiState.sourceNode && glitchUiState.sourceNode.mediaElement !== audioElement) {
        glitchUiState.sourceNode.disconnect();
        glitchUiState.sourceNode = null;
    }

    if (!glitchUiState.sourceNode) {
        glitchUiState.sourceNode = context.createMediaElementSource(audioElement);
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
        glitchUiState.gainNode.gain.value = computeBackgroundMusicBase(audioElement);
    }

    glitchUiState.sourceNode
        .connect(glitchUiState.waveShaper)
        .connect(glitchUiState.distortionNode)
        .connect(glitchUiState.gainNode)
        .connect(context.destination);

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
        const baseVolume = chain.baseGain ?? computeBackgroundMusicBase(bgMusic);
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
        executeGlitchBurstSequence();
    }, delay);
}

function executeGlitchBurstSequence() {
    if (!glitchPresentationEnabled || typeof window === 'undefined') return;

    triggerGlitchBurst();

    glitchUiState.activeTimeoutId = window.setTimeout(() => {
        glitchUiState.activeTimeoutId = null;
        completeGlitchBurst();
        const nextDelay = Math.floor(randomDecimalBetween(4800, 8800));
        queueGlitchBurstCycle(nextDelay);
    }, Math.floor(randomDecimalBetween(2200, 3200)));
}

function startGlitchLoop(forceImmediate = false) {
    if (!glitchPresentationEnabled || typeof window === 'undefined') return;
    if (forceImmediate) {
        executeGlitchBurstSequence();
        return;
    }
    const initialDelay = Math.floor(randomDecimalBetween(2400, 5200));
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
            startGlitchLoop(true);
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
        } else {
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
let lastDaveMultiplier = 1;

function applyLuckValue(value, options = {}) {
    baseLuck = value;
    currentLuck = value;
    lastVipMultiplier = 1;
    lastXyzMultiplier = 1;
    lastDaveMultiplier = 1;
    document.getElementById('vip-dropdown').value = '1';
    document.getElementById('xyz-luck-toggle').checked = false;
    refreshCustomSelect('vip-dropdown');
    if (document.getElementById('dave-luck-dropdown')) {
        document.getElementById('dave-luck-dropdown').value = '1';
        refreshCustomSelect('dave-luck-dropdown');
    }
    document.getElementById('luck-total').value = value;

    if (typeof applyOblivionPresetOptions === 'function') {
        applyOblivionPresetOptions(options);
    }
}

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
        xyz: controls.xyz && controls.xyz.checked ? 2 : 1,
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
            controls.vip.value = '1';
            refreshCustomSelect('vip-dropdown');
        }
        if (controls.xyz) {
            controls.xyz.checked = false;
        }
        if (controls.dave) {
            controls.dave.value = '1';
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

function setDreamspacePreset() {
    document.getElementById('biome-dropdown').value = 'dreamspace';
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
    if (biome === 'limbo') {
        if (daveLuckContainer) daveLuckContainer.style.display = '';
        if (xyzLuckContainer) xyzLuckContainer.style.display = '';
        if (luckPresets) {
            Array.from(luckPresets.children).forEach(btn => {
                if (btn === voidHeartBtn) {
                    btn.style.display = '';
                } else if (btn.textContent.includes('VIP') || btn.textContent.includes('Dave') || btn === voidHeartBtn) {
                    btn.style.display = '';
                } else {
                    btn.style.display = 'none';
                }
            });
        }
    } else {
        if (daveLuckContainer) daveLuckContainer.style.display = 'none';
        if (xyzLuckContainer) xyzLuckContainer.style.display = '';
        if (luckPresets) {
            Array.from(luckPresets.children).forEach(btn => {
                if (btn === voidHeartBtn) {
                    btn.style.display = 'none';
                } else {
                    btn.style.display = '';
                }
            });
        }
    }
    applyBiomeTheme(biome);
    updateGlitchPresentation();
    recomputeLuckValue();
    refreshCustomSelect('biome-dropdown');
}

function playAuraVideo(videoId, options = {}) {
    const manageAmbient = options.manageAmbient !== false;
    return new Promise(resolve => {
        if (!appState.cinematic) {
            resolve();
            return;
        }

        if (detectTouchFirstPlatform()) {
            const bgMusic = document.getElementById('ambientMusic');
            if (bgMusic && !bgMusic.paused) {
                bgMusic.pause();
                window.setTimeout(() => {
                    if (appState.audio.roll) bgMusic.play();
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

        if (appState.audio.roll) {
            applyMediaGain(video);
        }

        appState.videoPlaying = true;
        const bgMusic = manageAmbient ? document.getElementById('ambientMusic') : null;
        const wasPlaying = !!(bgMusic && !bgMusic.paused);
        if (bgMusic && wasPlaying) {
            bgMusic.pause();
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
    if (aura && aura.nativeBiomes && !aura.nativeBiomes.has('limbo-null')) return 'rarity-tier-challenged';
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
    ['Erebus', 'sigil-outline-blood']
]);

const glitchOutlineNames = new Set(['Fault', 'Glitch', 'Oppression']);
const dreamspaceOutlineNames = new Set(['Dreammetric', '★★★', '★★', '★']);

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

let oblivionPresetEnabled = false;
let currentOblivionPresetLabel = 'Select preset';
let oblivionAuraData = null;
let memoryAuraData = null;

function handleOblivionPresetSelection(presetKey) {
    const options = {};
    if (presetKey === OBLIVION_PRESET_IDENTIFIER) {
        options.activateOblivionPreset = true;
        options.presetLabel = 'Oblivion Potion Preset';
    } else {
        options.activateOblivionPreset = false;
        options.presetLabel = 'Godlike + Heavenly + Bound';
    }

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

function updateOblivionPresetDisplay() {
    const selection = document.getElementById('oblivion-preset-label');
    if (selection) {
        selection.textContent = currentOblivionPresetLabel;
        selection.classList.toggle('preset-toggle__selection--placeholder', currentOblivionPresetLabel === 'Select preset');
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
    return baseChance;
}

const AURA_BLUEPRINT_SOURCE = Object.freeze([
    { name: "Oblivion", chance: 2000, requiresOblivionPreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Truth Seeker", cutscene: "oblivion-cutscene", disableRarityClass: true },
    { name: "Memory", chance: 200000, requiresOblivionPreset: true, ignoreLuck: true, fixedRollThreshold: 1, subtitle: "The Fallen", cutscene: "memory-cutscene", disableRarityClass: true },
    { name: "Equinox - 2,500,000,000", chance: 2500000000, cutscene: "equinox-cutscene" },
    { name: "Luminosity - 1,200,000,000", chance: 1200000000, cutscene: "luminosity-cutscene" },
    { name: "Erebus - 1,200,000,000", chance: 1200000000, nativeBiomes: ["glitch", "bloodRain"], cutscene: "erebus-cutscene" },
    { name: "Pixelation - 1,073,741,824", chance: 1073741824, cutscene: "pixelation-cutscene" },
    { name: "Lamenthyr - 1,000,000,000", chance: 1000000000, nativeBiomes: ["glitch", "bloodRain"], cutscene: "lamenthyr-cutscene" },
    { name: "Arachnophobia - 940,000,000", chance: 940000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Ravage - 930,000,000", chance: 930000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Dreamscape - 850,000,000", chance: 850000000, nativeBiomes: ["limbo"] },
    { name: "Aegis - 825,000,000", chance: 825000000 },
    { name: "Aegis : Watergun - 825,000,000", chance: 825000000, breakthroughs: { blazing: 2 }},
    { name: "Apostolos : Veil - 800,000,000", chance: 800000000, nativeBiomes: ["graveyard", "pumpkinMoon"] },
    { name: "Ruins : Withered - 800,000,000", chance: 800000000 },
    { name: "Sovereign - 750,000,000", chance: 750000000 },
    { name: "Malediction - 730,000,000", chance: 730000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Banshee - 730,000,000", chance: 730000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "PROLOGUE - 666,616,111", chance: 666616111, nativeBiomes: ["limbo"] },
    { name: "Harvester - 666,000,000", chance: 666000000, nativeBiomes: ["graveyard"] },
    { name: "Apocalypse - 624,000,000", chance: 624000000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Matrix : Reality - 601,020,102", chance: 601020102 },
    { name: "Sophyra - 570,000,000", chance: 570000000 },
    { name: "Elude - 555,555,555", chance: 555555555, nativeBiomes: ["limbo"] },
    { name: "Dreammetric - 520,000,000", chance: 520000000, nativeBiomes: ["glitch", "dreamspace"], cutscene: "dreammetric-cutscene" },
    { name: "Atlas : Yuletide - 510,000,000", chance: 510000000, breakthroughs: { snowy: 3 } },
    { name: "Matrix : Overdrive - 503,000,000", chance: 503000000 },
    { name: "Ruins - 500,000,000", chance: 500000000 },
    { name: "Phantasma - 462,600,000", chance: 462600000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Kyawthuite : Remembrance - 450,000,000", chance: 450000000 },
    { name: "unknown - 444,444,444", chance: 444444444, nativeBiomes: ["limbo"] },
    { name: "Apostolos - 444,000,000", chance: 444000000 },
    { name: "Gargantua - 430,000,000", chance: 430000000, breakthroughs: { starfall: 5 } },
    { name: "Abyssal Hunter - 400,000,000", chance: 400000000, breakthroughs: { rainy: 4 } },
    { name: "Impeached : I'm Peach - 400,000,000", chance: 400000000 },
    { name: "CHILLSEAR - 375,000,000", chance: 375000000, breakthroughs: { snowy: 3 } },
    { name: "Flora : Evergreen - 370,073,730", chance: 370073730 },
    { name: "Atlas - 360,000,000", chance: 360000000, breakthroughs: { sandstorm: 4 } },
    { name: "Jazz : Orchestra - 336,870,912", chance: 336870912 },
    { name: "LOTUSFALL - 320,000,000", chance: 320000000 },
    { name: "Maelstrom - 309,999,999", chance: 309999999, breakthroughs: { windy: 3 } },
    { name: "Manta - 300,000,000", chance: 300000000, breakthroughs: { blazing: 2 } },
    { name: "Overture : History - 300,000,000", chance: 300000000 },
    { name: "Bloodlust - 300,000,000", chance: 300000000, breakthroughs: { hell: 6 } },
    { name: "Exotic : Void - 299,999,999", chance: 299999999 },
    { name: "Astral : Legendarium - 267,200,000", chance: 267200000, breakthroughs: { starfall: 5 } },
    { name: "Archangel - 250,000,000", chance: 250000000 },
    { name: "Surfer : Shard Surfer - 225,000,000", chance: 225000000, breakthroughs: { snowy: 3 } },
    { name: "HYPER-VOLT : EVER-STORM - 225,000,000", chance: 225000000 },
    { name: "Oppression - 220,000,000", chance: 220000000, nativeBiomes: ["glitch"], cutscene: "oppression-cutscene" },
    { name: "Impeached - 200,000,000", chance: 200000000, breakthroughs: { corruption: 5 } },
    { name: "Nightmare Sky - 190,000,000", chance: 190000000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Twilight : Withering Grace - 180,000,000", chance: 180000000, breakthroughs: { night: 10 } },
    { name: "Symphony - 175,000,000", chance: 175000000 },
    { name: "Glock : the glock of the sky - 170,000,000", chance: 170000000 },
    { name: "Overture - 150,000,000", chance: 150000000 },
    { name: "Abominable - 120,000,000", chance: 120000000, breakthroughs: { snowy: 3 } },
    { name: "Starscourge : Radiant - 100,000,000", chance: 100000000, breakthroughs: { starfall: 5 } },
    { name: "Chromatic : GENESIS - 99,999,999", chance: 99999999 },
    { name: "Express - 90,000,000", chance: 90000000, breakthroughs: { snowy: 3 } },
    { name: "Virtual : Worldwide - 87,500,000", chance: 87500000 },
    { name: "Harnessed : Elements - 85,000,000", chance: 85000000 },
    { name: "Accursed - 82,000,000", chance: 82000000, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Sailor : Flying Dutchman - 80,000,000", chance: 80000000, breakthroughs: { rainy: 4 } },
    { name: "Carriage - 80,000,000", chance: 80000000 },
    { name: "Winter Fantasy - 72,000,000", chance: 72000000, breakthroughs: { snowy: 3 } },
    { name: "Dullahan - 72,000,000", chance: 72000000, nativeBiomes: ["graveyard"] },
    { name: "Twilight : Iridescent Memory - 60,000,000", chance: 60000000, breakthroughs: { night: 10 } },
    { name: "SENTINEL - 60,000,000", chance: 60000000 },
    { name: "Matrix - 50,000,000", chance: 50000000 },
    { name: "Runic - 50,000,000", chance: 50000000 },
    { name: "Exotic : APEX - 49,999,500", chance: 49999500 },
    { name: "Overseer - 45,000,000", chance: 45000000 },
    { name: "Santa Frost - 45,000,000", chance: 45000000, breakthroughs: { snowy: 3 } },
    { name: "{J u x t a p o s i t i o n} - 40,440,400", chance: 40440400, nativeBiomes: ["limbo"] },
    { name: "Virtual : Fatal Error - 40,413,000", chance: 40413000 },
    { name: "Chromatic : Kromat1k - 40,000,000", chance: 40000000 },
    { name: "Soul Hunter - 40,000,000", chance: 40000000, nativeBiomes: ["graveyard"] },
    { name: "Ethereal - 35,000,000", chance: 35000000 },
    { name: "Headless : Horseman - 32,000,000", chance: 32000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Innovator - 30,000,000", chance: 30000000 },
    { name: "Arcane : Dark - 30,000,000", chance: 30000000 },
    { name: "Aviator - 24,000,000", chance: 24000000 },
    { name: "Cryptfire - 21,000,000", chance: 21000000, nativeBiomes: ["graveyard"] },
    { name: "Chromatic - 20,000,000", chance: 20000000 },
    { name: "Blizzard - 27,315,000", chance: 27315000, breakthroughs: { snowy: 3 } },
    { name: "Lullaby - 17,000,000", chance: 17000000, breakthroughs: { night: 10 } },
    { name: "Sinister - 15,000,000", chance: 15000000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Arcane : Legacy - 15,000,000", chance: 15000000 },
    { name: "Sirius - 14,000,000", chance: 14000000, breakthroughs: { starfall: 5 } },
    { name: "Stormal : Hurricane - 13,500,000", chance: 13500000, breakthroughs: { windy: 3 } },
    { name: "Glitch - 12,210,110", chance: 12210110, nativeBiomes: ["glitch"] },
    { name: "Wonderland - 12,000,000", chance: 12000000, breakthroughs: { snowy: 3 } },
    { name: "Sailor - 12,000,000", chance: 12000000, breakthroughs: { rainy: 4 } },
    { name: "Moonflower - 10,000,000", chance: 10000000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Starscourge - 10,000,000", chance: 10000000, breakthroughs: { starfall: 5 } },
    { name: "Stargazer - 9,200,000", chance: 9200000, breakthroughs: { starfall: 5 } },
    { name: "Helios - 9,000,000", chance: 9000000 },
    { name: "Nihility - 9,000,000", chance: 9000000, breakthroughs: { null: 1000, limbo: 1000 }, nativeBiomes: ["limbo-null"] },
    { name: "Harnessed - 8,500,000", chance: 85000000 },
    { name: "Origin : Onion - 8,000,000", chance: 80000000 },
    { name: "Nautilus : Lost - 7,700,000", chance: 7700000 },
    { name: "Velocity - 7,630,000", chance: 7630000 },
    { name: "HYPER-VOLT - 7,500,000", chance: 7500000 },
    { name: "Anubis - 7,200,000", chance: 7200000, breakthroughs: { sandstorm: 4 } },
    { name: "Hades - 6,666,666", chance: 6666666, breakthroughs: { hell: 6 } },
    { name: "Oni - 6,666,666", chance: 6666666, nativeBiomes: ["glitch", "bloodRain"] },
    { name: "Origin - 6,500,000", chance: 6500000 },
    { name: "Twilight - 6,000,000", chance: 6000000, breakthroughs: { night: 10 } },
    { name: "Vital - 6,000,000", chance: 6000000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Anima - 5,730,000", chance: 5730000, nativeBiomes: ["limbo"] },
    { name: "Galaxy - 5,000,000", chance: 5000000, breakthroughs: { starfall: 5 } },
    { name: "Lunar : Full Moon - 5,000,000", chance: 5000000, breakthroughs: { night: 10 } },
    { name: "Solar : Solstice - 5,000,000", chance: 5000000, breakthroughs: { day: 10 } },
    { name: "Aquatic : Flame - 4,000,000", chance: 4000000 },
    { name: "Poseidon - 4,000,000", chance: 4000000, breakthroughs: { rainy: 4 } },
    { name: "Shiftlock - 3,325,000", chance: 3325000, breakthroughs: { null: 1000, limbo: 1000 }, nativeBiomes: ["limbo-null"] },
    { name: "Savior - 3,200,000", chance: 3200000 },
    { name: "Headless - 3,200,000", chance: 3200000, nativeBiomes: ["glitch", "graveyard"] },
    { name: "Lunar : Nightfall - 3,000,000", chance: 3000000, nativeBiomes: ["graveyard"] },
    { name: "Parasite - 3,000,000", chance: 3000000, breakthroughs: { corruption: 5 } },
    { name: "Virtual - 2,500,000", chance: 2500000 },
    { name: "Undefined : Defined - 2,222,000", chance: 2222000, breakthroughs: { null: 1000 } },
    { name: "Bounded : Unbound - 2,000,000", chance: 2000000 },
    { name: "Gravitational - 2,000,000", chance: 2000000 },
    { name: "Cosmos - 1,520,000", chance: 1520000 },
    { name: "Astral - 1,336,000", chance: 1336000, breakthroughs: { starfall: 5 } },
    { name: "Rage : Brawler - 1,280,000", chance: 1280000 },
    { name: "Undefined - 1,111,000", chance: 1111000, breakthroughs: { null: 1000, limbo: 1000 }, nativeBiomes: ["limbo-null"] },
    { name: "Magnetic : Reverse Polarity - 1,024,000", chance: 1024000 },
    { name: "Flushed : Troll - 1,000,000", chance: 1000000 },
    { name: "Arcane - 1,000,000", chance: 1000000 },
    { name: "Kyawthuite - 850,000", chance: 850000 },
    { name: "Warlock - 666,000", chance: 666000 },
    { name: "Pump : Trickster - 600,000", chance: 600000, nativeBiomes: ["glitch", "pumpkinMoon"] },
    { name: "Prowler - 540,000", chance: 540000, nativeBiomes: ["anotherRealm"] },
    { name: "Raven - 500,000", chance: 500000, nativeBiomes: ["limbo"] },
    { name: "Terror - 400,000", chance: 400000 },
    { name: "Celestial - 350,000", chance: 350000 },
    { name: "Watermelon - 320,000", chance: 320000 },
    { name: "Star Rider : Starfish Rider - 250,000", chance: 250000, breakthroughs: { starfall: 10 } },
    { name: "Bounded - 200,000", chance: 200000 },
    { name: "Pump - 200,000", chance: 200000, nativeBiomes: ["pumpkinMoon"] },
    { name: "Aether - 180,000", chance: 180000 },
    { name: "Jade - 125,000", chance: 125000 },
    { name: "Divinus : Angel - 120,000", chance: 120000 },
    { name: "Comet - 120,000", chance: 120000, breakthroughs: { starfall: 5 } },
    { name: "Undead : Devil - 120,000", chance: 120000, breakthroughs: { hell: 6 } },
    { name: "Diaboli : Void - 100,400", chance: 100400 },
    { name: "Exotic - 99,999", chance: 99999 },
    { name: "Stormal - 90,000", chance: 90000, breakthroughs: { windy: 3 } },
    { name: "Flow - 87,000", chance: 87000 , breakthroughs: { windy: 3 } },
    { name: "Permafrost - 73,500", chance: 73500, breakthroughs: { snowy: 3 } },
    { name: "Nautilus - 70,000", chance: 70000 },
    { name: "Hazard : Rays - 70,000", chance: 70000, breakthroughs: { corruption: 5 } },
    { name: "Flushed : Lobotomy - 69,000", chance: 69000 },
    { name: "Solar - 50,000", chance: 50000, breakthroughs: { day: 10 } },
    { name: "Lunar - 50,000", chance: 50000, breakthroughs: { night: 10 } },
    { name: "Starlight - 50,000", chance: 50000, breakthroughs: { starfall: 5 } },
    { name: "Star Rider - 50,000", chance: 50000, breakthroughs: { starfall: 5 } },
    { name: "Aquatic - 40,000", chance: 40000 },
    { name: "Watt - 32,768", chance: 32768 },
    { name: "Copper - 29,000", chance: 29000 },
    { name: "Powered - 16,384", chance: 16384 },
    { name: "LEAK - 14,000", chance: 14000 },
    { name: "Rage : Heated - 12,800", chance: 12800 },
    { name: "Corrosive - 12,000", chance: 12000, breakthroughs: { corruption: 5 } },
    { name: "Undead - 12,000", chance: 12000, breakthroughs: { hell: 6 } },
    { name: "★★★ - 10,000", chance: 10000, nativeBiomes: ["glitch", "dreamspace"] },
    { name: "Atomic : Riboneucleic - 9876", chance: 9876 },
    { name: "Lost Soul - 9,200", chance: 9200 },
    { name: "Honey - 8,335", chance: 8335 },
    { name: "Quartz - 8,192", chance: 8192 },
    { name: "Hazard - 7,000", chance: 7000, breakthroughs: { corruption: 5 } },
    { name: "Flushed : Heart Eye - 6,900", chance: 6900 },
    { name: "Flushed - 6,900", chance: 6900 },
    { name: "Megaphone - 5,000", chance: 5000 },
    { name: "Bleeding - 4,444", chance: 4444 },
    { name: "Sidereum - 4,096", chance: 4096 },
    { name: "Flora - 3,700", chance: 3700 },
    { name: "Cola - 3,999", chance: 3999 },
    { name: "Pukeko - 3,198", chance: 3198 },
    { name: "Player - 3,000", chance: 3000 },
    { name: "Fault - 3,000", chance: 3000, nativeBiomes: ["glitch"] },
    { name: "Glacier - 2,304", chance: 2304, breakthroughs: { snowy: 3 } },
    { name: "Ash - 2,300", chance: 2300 },
    { name: "Magnetic - 2,048", chance: 2048 },
    { name: "Glock - 1,700", chance: 1700 },
    { name: "Atomic - 1,180", chance: 1180 },
    { name: "Precious - 1,024", chance: 1024 },
    { name: "Diaboli - 1,004", chance: 1004 },
    { name: "★★ - 1,000", chance: 1000, nativeBiomes: ["glitch", "dreamspace"] },
    { name: "Wind - 900", chance: 900, breakthroughs: { windy: 3 } },
    { name: "Aquamarine - 900", chance: 900 },
    { name: "Sapphire - 800", chance: 800 },
    { name: "Jackpot - 777", chance: 777, breakthroughs: { sandstorm: 4 } },
    { name: "Ink - 700", chance: 700 },
    { name: "Gilded - 512", chance: 512, breakthroughs: { sandstorm: 4 } },
    { name: "Emerald - 500", chance: 500 },
    { name: "Forbidden - 404", chance: 404 },
    { name: "Ruby - 350", chance: 350 },
    { name: "Topaz - 150", chance: 150 },
    { name: "Rage - 128", chance: 128 },
    { name: "★ - 100", chance: 100, nativeBiomes: ["glitch", "dreamspace"] },
    { name: "Crystallized - 64", chance: 64 },
    { name: "Divinus : Love - 32", chance: 32 },
    { name: "Divinus - 32", chance: 32 },
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
        "Malediction - 730,000,000",
        "Banshee - 730,000,000",
        "Ravage - 930,000,000",
        "Arachnophobia - 940,000,000",
        "Lamenthyr - 1,000,000,000",
        "Erebus - 1,200,000,000",
    ],
};

const BIOME_EVENT_CONSTRAINTS = {
    graveyard: ["halloween24", "halloween25"],
    pumpkinMoon: ["halloween24", "halloween25"],
    bloodRain: ["halloween25"],
    blazing: "summer25",
};

const enabledEvents = new Set(["halloween25"]);
const auraEventIndex = new Map();

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

const CUTSCENE_PRIORITY_SEQUENCE = ["oblivion-cutscene", "memory-cutscene", "equinox-cutscene", "erebus-cutscene", "luminosity-cutscene", "pixelation-cutscene", "lamenthyr-cutscene", "dreammetric-cutscene", "oppression-cutscene"];

oblivionAuraData = AURA_REGISTRY.find(aura => aura.name === OBLIVION_AURA_LABEL) || null;
memoryAuraData = AURA_REGISTRY.find(aura => aura.name === MEMORY_AURA_LABEL) || null;

const ROE_EXCLUSION_SET = new Set([
    "Apostolos : Veil - 800,000,000",
    "Harvester - 666,000,000",
    "Apocalypse - 624,000,000",
    "Dreammetric - 520,000,000",
    "Phantasma - 462,600,000",
    "Oppression - 220,000,000",
    "Nightmare Sky - 190,000,000",
    "Malediction - 730,000,000",
    "Banshee - 730,000,000",
    "Ravage - 930,000,000",
    "Arachnophobia - 940,000,000",
    "Lamenthyr - 1,000,000,000",
    "Erebus - 1,200,000,000",
    "Accursed - 82,000,000",
    "Dullahan - 72,000,000",
    "Soul Hunter - 40,000,000",
    "Cryptfire - 21,000,000",
    "Glitch - 12,210,110",
    "Moonflower - 10,000,000",
    "Vital - 6,000,000",
    "Oni - 6,666,666",
    "Lunar : Nightfall - 3,000,000",
    "Headless - 3,200,000",
    "Prowler - 540,000",
    "Headless : Horseman - 32,000,000",
    "Sinister - 15,000,000",
    "Pump - 200,000",
    "Pump : Trickster - 600,000",
    "Fault - 3,000",
    "★★★ - 10,000",
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
        closeOpenSelectMenus(null, { focusSummary: true });
    }
});

function enforceBiomeEventRestrictions() {
    const biomeSelector = document.getElementById('biome-dropdown');
    if (!biomeSelector) return;

    const currentValue = biomeSelector.value;
    let resetToDefault = false;

    Array.from(biomeSelector.options).forEach(option => {
        const requiredEvent = BIOME_EVENT_CONSTRAINTS[option.value];
        if (!requiredEvent) {
            option.disabled = false;
            option.removeAttribute('title');
            return;
        }
        const requiredEvents = Array.isArray(requiredEvent) ? requiredEvent : [requiredEvent];
        const enabled = requiredEvents.some(eventId => enabledEvents.has(eventId));
        option.disabled = !enabled;
        if (!enabled) {
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
                option.title = `${labelText} must be enabled to access this biome.`;
            } else {
                option.removeAttribute('title');
            }
        } else {
            option.removeAttribute('title');
        }
        if (!enabled && option.value === currentValue) {
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

document.addEventListener('DOMContentLoaded', initializeEventSelector);
document.addEventListener('DOMContentLoaded', updateOblivionPresetDisplay);

function initializeSingleSelectControl(selectId) {
    const select = document.getElementById(selectId);
    const details = document.querySelector(`details[data-select="${selectId}"]`);
    if (!select || !details) return;

    const summary = details.querySelector('.interface-select__summary');
    const menu = details.querySelector('.interface-select__menu');
    if (!summary || !menu) return;

    const placeholder = summary.dataset.placeholder || summary.textContent.trim();
    menu.innerHTML = '';

    const optionButtons = Array.from(select.options).map(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'interface-select__option-button';
        button.dataset.value = option.value;
        button.textContent = option.textContent;
        button.setAttribute('role', 'option');
        button.addEventListener('click', () => {
            if (option.disabled) return;
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
        const label = selectedOption ? selectedOption.textContent : placeholder;
        summary.textContent = label;
        summary.classList.toggle('form-field__input--placeholder', !selectedOption);
        summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');

        optionButtons.forEach(({ button, option }) => {
            const isActive = option.value === select.value;
            button.classList.toggle('interface-select__option-button--active', isActive);
            button.classList.toggle('interface-select__option-button--disabled', option.disabled);
            button.disabled = !!option.disabled;
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

document.addEventListener('DOMContentLoaded', () => {
    initializeSingleSelectControl('vip-dropdown');
    initializeSingleSelectControl('dave-luck-dropdown');
    initializeSingleSelectControl('biome-dropdown');
});

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
    const daveDropdown = document.getElementById('dave-luck-dropdown');
    if (daveDropdown) {
        daveDropdown.addEventListener('change', recomputeLuckValue);
    }

    const luckField = document.getElementById('luck-total');
    if (luckField) {
        luckField.addEventListener('input', () => {
            const value = parseInt(luckField.value, 10) || 1;
            baseLuck = value;
            currentLuck = value;
            lastVipMultiplier = 1;
            lastXyzMultiplier = 1;
            lastDaveMultiplier = 1;
            document.getElementById('vip-dropdown').value = '1';
            document.getElementById('xyz-luck-toggle').checked = false;
            refreshCustomSelect('vip-dropdown');
            if (daveDropdown) {
                daveDropdown.value = '1';
                refreshCustomSelect('dave-luck-dropdown');
            }
        });
    }

    const biomeDropdown = document.getElementById('biome-dropdown');
    biomeDropdown.addEventListener('change', initializeBiomeInterface);
    initializeBiomeInterface();

    setupShareInterface();

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
        glitchToggle.textContent = appState.glitch ? 'Glitch Effects: On' : 'Glitch Effects: Off';
        glitchToggle.setAttribute('aria-pressed', appState.glitch ? 'true' : 'false');
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

function createAuraEvaluationContext(biome, { eventChecker }) {
    const isRoe = biome === 'roe';
    return {
        biome,
        isRoe,
        glitchLikeBiome: biome === 'glitch' || isRoe,
        exclusivityBiome: isRoe ? 'glitch' : biome,
        eventChecker
    };
}

function computeLimboEffectiveChance(aura, context) {
    if (aura.requiresOblivionPreset) return Infinity;
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
    const { biome, exclusivityBiome, glitchLikeBiome, isRoe } = context;
    if (aura.requiresOblivionPreset) return Infinity;

    const eventId = getAuraEventId(aura);
    const eventEnabled = context.eventChecker(aura);
    if (!eventEnabled) return Infinity;

    if (isRoe && ROE_EXCLUSION_SET.has(aura.name)) return Infinity;

    if (aura.nativeBiomes) {
        if (isAuraNativeTo(aura, 'limbo') && !isAuraNativeTo(aura, 'limbo-null')) {
            return Infinity;
        }

        const allowEventGlitchAccess = glitchLikeBiome
            && eventId
            && eventEnabled
            && GLITCH_EVENT_WHITELIST.has(eventId);

        if (!isAuraNativeTo(aura, 'limbo-null') && !isAuraNativeTo(aura, exclusivityBiome) && !allowEventGlitchAccess) {
            return Infinity;
        }
    }

    let effectiveChance = aura.chance;
    if (aura.breakthroughs) {
        if (glitchLikeBiome && (!isRoe || !ROE_BREAKTHROUGH_BLOCKLIST.has(aura.name))) {
            let minChance = aura.chance;
            for (const multiplier of aura.breakthroughs.values()) {
                const scaled = Math.floor(aura.chance / multiplier);
                if (scaled < minChance) {
                    minChance = scaled;
                }
            }
            effectiveChance = minChance;
        } else {
            const targetBiome = exclusivityBiome;
            let multiplier = readBreakthroughMultiplier(aura, targetBiome);
            if (!multiplier && targetBiome !== biome) {
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
        const specialClass = typeof resolveAuraStyleClass === 'function' ? resolveAuraStyleClass(aura) : '';
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

// Run the roll simulation while keeping the UI responsive
function runRollSimulation() {
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

    const {
        rollTriggerButton,
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

    simulationActive = true;
    rollTriggerButton.disabled = true;
    rollTriggerButton.style.opacity = '0.5';
    if (brandMark) {
        brandMark.classList.add('banner__emblem--spinning');
    }

    playSoundEffect(audio.roll);

    let total = Number.parseInt(rollCountInput.value, 10);
    if (!Number.isFinite(total) || total <= 0) {
        total = 1;
        rollCountInput.value = '1';
    }

    let parsedLuck = Number.parseFloat(luckField.value);
    if (!Number.isFinite(parsedLuck)) {
        parsedLuck = 1;
        luckField.value = '1';
    }
    const luckValue = Math.max(0, parsedLuck);
    const biome = biomeSelector ? biomeSelector.value : '';

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

    const evaluationContext = createAuraEvaluationContext(biome, { eventChecker: isEventAuraEnabled, eventSnapshot });
    const computedAuras = buildComputedAuraEntries(AURA_REGISTRY, evaluationContext, luckValue, breakthroughStatsMap);

    const activeOblivionAura = (oblivionPresetEnabled && luckValue >= OBLIVION_LUCK_TARGET) ? oblivionAuraData : null;
    const activeMemoryAura = (oblivionPresetEnabled && luckValue >= OBLIVION_LUCK_TARGET) ? memoryAuraData : null;
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

    function performSingleRollCheck() {
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
        simulationActive = false;

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
                playSoundEffect(audio.limbo99m);
            } else {
                playSoundEffect(audio.m100);
            }
        } else if (highestChance >= 10000000) {
            playSoundEffect(audio.m10);
        } else if (highestChance >= 1000000) {
            playSoundEffect(audio.k100);
        } else if (highestChance >= 100000) {
            playSoundEffect(audio.k10);
        } else if (highestChance >= 1000) {
            playSoundEffect(audio.k1);
        }

        let biomeLabel = biome;
        if (biomeSelector) {
            const selectedOption = (biomeSelector.selectedOptions && biomeSelector.selectedOptions.length > 0)
                ? biomeSelector.selectedOptions[0]
                : biomeSelector.options[biomeSelector.selectedIndex];
            if (selectedOption && selectedOption.textContent) {
                biomeLabel = selectedOption.textContent.trim();
            }
        }
        if (!biomeLabel) {
            biomeLabel = biome || 'Unknown';
        }

        const usedEventIds = eventSnapshot ? Array.from(eventSnapshot) : [];
        const eventLabels = usedEventIds.map(id => EVENT_LABEL_MAP.get(id) || id);
        const eventSummaryText = eventLabels.length > 0 ? eventLabels.join(', ') : EVENT_SUMMARY_EMPTY_LABEL;

        const resultChunks = [
            `Execution time: ${executionTime} seconds.<br>`,
            `Rolls: ${formatWithCommas(rolls)}<br>`,
            `Luck: ${formatWithCommas(luckValue)}<br>`,
            `Biome: ${biomeLabel}<br>`,
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

        const executionSeconds = Number.parseFloat(executionTime);
        lastSimulationSummary = {
            rolls,
            luck: luckValue,
            biomeId: biome,
            biomeLabel,
            eventIds: usedEventIds,
            eventLabels,
            shareRecords,
            shareVisuals: shareVisualRecords,
            xpTotal: totalXp,
            xpLines,
            executionSeconds: Number.isFinite(executionSeconds) ? executionSeconds : 0
        };
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