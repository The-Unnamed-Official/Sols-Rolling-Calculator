function sfc32(a, b, c, d) {
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

const seedgen = () => (Math.random()*2**32)>>>0;
const getRand = sfc32(seedgen(), seedgen(), seedgen(), seedgen());

function Random(min, max) {
    return Math.floor(getRand() * (max - min + 1)) + min;
}

let rollingSoundEnabled = false;
let uiSoundEnabled = false;
let cutscenesEnabled = false;
let videoPlaying = false;

const audioBufferCache = new Map();
const audioBufferPromises = new Map();
const mediaElementGainMap = new WeakMap();
let audioContextInstance = null;

function ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioContextInstance) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        audioContextInstance = new AudioContextClass();
    }
    return audioContextInstance;
}

function resumeAudioContext() {
    const context = ensureAudioContext();
    if (context && context.state === 'suspended') {
        context.resume().catch(() => {});
    }
    return context;
}

function resolveMediaSourceUrl(element) {
    if (!element) return null;
    const rawSrc = element.getAttribute('src') || element.currentSrc;
    if (!rawSrc) return null;
    try {
        return new URL(rawSrc, window.location.href).href;
    } catch (err) {
        return rawSrc;
    }
}

function configureMediaElementGain(element) {
    if (!element) return;
    const dataset = element.dataset || {};
    const gainValueRaw = dataset.gain ?? dataset.boost ?? dataset.volume;
    if (gainValueRaw === undefined) return;

    let gainValue = Number.parseFloat(gainValueRaw);
    if (!Number.isFinite(gainValue) || gainValue <= 0) return;

    const context = resumeAudioContext();
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

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (window.matchMedia("(max-width: 768px)").matches)
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0)
        || (navigator.msMaxTouchPoints > 0);
}

function isSoundCategoryEnabled(category) {
    if (category === 'ui') return uiSoundEnabled;
    return rollingSoundEnabled;
}

function playSound(audioElement, category = 'rolling') {
    if (!audioElement) return;

    if (!isSoundCategoryEnabled(category)) return;

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

    const context = resumeAudioContext();
    const sourceUrl = resolveMediaSourceUrl(audioElement);

    const playViaElement = () => {
        if (!isSoundCategoryEnabled(category)) return;
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
            if (!buffer || !isSoundCategoryEnabled(category)) return;
            if (category !== 'ui' && videoPlaying) return;
            const activeContext = resumeAudioContext();
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

function toggleSound() {
    rollingSoundEnabled = !rollingSoundEnabled;
    const bgMusic = document.getElementById('bgMusic');
    const soundToggle = document.getElementById('soundToggle');
    bgMusic.volume = 0.02;
    if (bgMusic && !bgMusic.getAttribute('data-current-src')) {
        bgMusic.setAttribute('data-current-src', bgMusic.src);
    }

    if (rollingSoundEnabled) {
        resumeAudioContext();
        playSound(document.getElementById('clickSound'), 'ui');
        bgMusic.muted = false;
        bgMusic.play();
    } else {
        bgMusic.muted = true;
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }

    if (soundToggle) {
        soundToggle.textContent = rollingSoundEnabled ? 'Rolling Sound: On' : 'Rolling Sound: Off';
        soundToggle.setAttribute('aria-pressed', rollingSoundEnabled);
    }
}

function toggleUiSound() {
    uiSoundEnabled = !uiSoundEnabled;
    resumeAudioContext();

    const uiSoundToggle = document.getElementById('uiSoundToggle');
    if (uiSoundToggle) {
        uiSoundToggle.textContent = uiSoundEnabled ? 'UI Sound: On' : 'UI Sound: Off';
        uiSoundToggle.setAttribute('aria-pressed', uiSoundEnabled);
    }

    if (uiSoundEnabled) {
        playSound(document.getElementById('clickSound'), 'ui');
    }
}

function toggleCutscenes() {
    cutscenesEnabled = !cutscenesEnabled;
    const cutsceneToggle = document.getElementById('cutsceneToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = cutscenesEnabled ? 'Cutscenes: On' : 'Cutscenes: Off';
        cutsceneToggle.setAttribute('aria-pressed', cutscenesEnabled ? 'true' : 'false');
    }

    const clickSound = document.getElementById('clickSound');
    if (clickSound) {
        playSound(clickSound, 'ui');
    }

    if (!cutscenesEnabled) {
        const skipButton = document.getElementById('skip-button');
        if (skipButton && skipButton.style.display !== 'none') {
            skipButton.click();
        }
    }
}

let baseLuck = 1;
let currentLuck = 1;
let lastVipMultiplier = 1;
let lastXyzMultiplier = 1;
let lastDaveMultiplier = 1;

const biomeAssets = {
    normal: { image: 'files/normalBiomeImage.jpg', music: 'files/normalBiomeMusic.mp3' },
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
    glitch: { image: 'files/glitchBiomeImage.jpg', music: 'files/glitchBiomeMusic.mp3' },
    limbo: { image: 'files/limboImage.jpg', music: 'files/limboMusic.mp3' },
    blazing: { image: 'files/blazingBiomeImage.jpg', music: 'files/blazingBiomeMusic.mp3' }
};

function applyBiomeTheme(biome) {
    const assetKey = Object.prototype.hasOwnProperty.call(biomeAssets, biome) ? biome : 'normal';
    const assets = biomeAssets[assetKey];

    const root = document.documentElement;
    if (root) {
        root.style.setProperty('--biome-background', `url("${assets.image}")`);
    }

    const backdrop = document.querySelector('.ui-backdrop');
    if (backdrop) {
        backdrop.style.backgroundImage = `url("${assets.image}")`;
    }

    const bgMusic = document.getElementById('bgMusic');
    if (bgMusic) {
        const currentSrc = bgMusic.getAttribute('data-current-src');
        const shouldUpdateMusic = currentSrc !== assets.music;
        const wasPlaying = rollingSoundEnabled && !bgMusic.paused;

        if (shouldUpdateMusic) {
            bgMusic.pause();
            bgMusic.currentTime = 0;
            bgMusic.src = assets.music;
            bgMusic.setAttribute('data-current-src', assets.music);
            bgMusic.load();
        }

        if (wasPlaying && (shouldUpdateMusic || bgMusic.paused)) {
            bgMusic.muted = false;
            const playPromise = bgMusic.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
            }
        }
    }
}

function setLuck(value) {
    baseLuck = value;
    currentLuck = value;
    lastVipMultiplier = 1;
    lastXyzMultiplier = 1;
    lastDaveMultiplier = 1;
    document.getElementById('vip-select').value = "1";
    document.getElementById('xyz-luck').checked = false;
    if (document.getElementById('dave-luck-select')) document.getElementById('dave-luck-select').value = "1";
    document.getElementById('luck').value = value;
}

function updateLuckValue() {
    const biome = document.getElementById('biome-select').value;
    const vipMultiplier = parseFloat(document.getElementById('vip-select').value);
    let xyzMultiplier = 1;
    let daveMultiplier = 1;
    if (biome === "limbo") {
        daveMultiplier = parseFloat(document.getElementById('dave-luck-select').value);
    } else {
        xyzMultiplier = document.getElementById('xyz-luck').checked ? 2 : 1;
    }
    const luckInput = document.getElementById('luck');
    if (luckInput.value && parseFloat(luckInput.value) !== currentLuck) {
        baseLuck = parseFloat(luckInput.value);
        currentLuck = baseLuck;
        lastVipMultiplier = 1;
        lastXyzMultiplier = 1;
        lastDaveMultiplier = 1;
        document.getElementById('vip-select').value = "1";
        document.getElementById('xyz-luck').checked = false;
        if (document.getElementById('dave-luck-select')) document.getElementById('dave-luck-select').value = "1";
        return;
    }
    currentLuck = baseLuck * vipMultiplier * xyzMultiplier * daveMultiplier;
    lastVipMultiplier = vipMultiplier;
    lastXyzMultiplier = xyzMultiplier;
    lastDaveMultiplier = daveMultiplier;
    luckInput.value = currentLuck;
}

function resetLuck() {
    document.getElementById('luck').value = 1;
    playSound(document.getElementById('clickSound'), 'ui');
    updateLuckValue();
}

function resetRolls() {
    document.getElementById('rolls').value = 1;
    playSound(document.getElementById('clickSound'), 'ui');
}

function setGlitch() {
    document.getElementById('biome-select').value = 'glitch';
    playSound(document.getElementById('clickSound'), 'ui');
    handleBiomeUI();
}

function setLimbo() {
    document.getElementById('biome-select').value = 'limbo';
    playSound(document.getElementById('clickSound'), 'ui');
    handleBiomeUI();
}

function resetBiome() {
    document.getElementById('biome-select').value = 'normal';
    playSound(document.getElementById('clickSound'), 'ui');
    handleBiomeUI();
}

function handleBiomeUI() {
    const biome = document.getElementById('biome-select').value;
    const daveLuckContainer = document.getElementById('dave-luck-container');
    const xyzLuckContainer = document.getElementById('xyz-luck-container');
    const luckPresets = document.getElementById('luck-presets');
    const voidHeartBtn = document.getElementById('void-heart-btn');
    const vipSelect = document.getElementById('vip-select');
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
    updateLuckValue();
}

document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('button');
    const inputs = document.querySelectorAll('input');
    const selects = document.querySelectorAll('select');
    const clickSound = document.getElementById('clickSound');
    const hoverSound = document.getElementById('hoverSound');
    buttons.forEach(button => {
        button.addEventListener('click', () => playSound(clickSound, 'ui'));
        button.addEventListener('mouseenter', () => playSound(hoverSound, 'ui'));
    });
    inputs.forEach(input => {
        input.addEventListener('click', () => playSound(clickSound, 'ui'));
        input.addEventListener('mouseenter', () => playSound(hoverSound, 'ui'));
    });
    selects.forEach(select => {
        select.addEventListener('change', () => playSound(clickSound, 'ui'));
        select.addEventListener('mouseenter', () => playSound(hoverSound, 'ui'));
    });
    document.getElementById('vip-select').addEventListener('change', updateLuckValue);
    const xyzToggle = document.getElementById('xyz-luck');
    if (xyzToggle) {
        xyzToggle.addEventListener('change', updateLuckValue);
    }
    if (document.getElementById('dave-luck-select')) {
        document.getElementById('dave-luck-select').addEventListener('change', updateLuckValue);
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
        if (document.getElementById('dave-luck-select')) document.getElementById('dave-luck-select').value = "1";
    });
    document.getElementById('biome-select').addEventListener('change', handleBiomeUI);
    handleBiomeUI();

    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
        soundToggle.textContent = 'Rolling Sound: Off';
        soundToggle.setAttribute('aria-pressed', 'false');
    }

    const uiSoundToggle = document.getElementById('uiSoundToggle');
    if (uiSoundToggle) {
        uiSoundToggle.textContent = 'UI Sound: Off';
        uiSoundToggle.setAttribute('aria-pressed', 'false');
    }

    const cutsceneToggle = document.getElementById('cutsceneToggle');
    if (cutsceneToggle) {
        cutsceneToggle.textContent = 'Cutscenes: Off';
        cutsceneToggle.setAttribute('aria-pressed', 'false');
    }

    const yearEl = document.getElementById('year');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
});

function playAuraVideo(videoId) {
    return new Promise(resolve => {
        if (!cutscenesEnabled) {
            resolve();
            return;
        }

        if (isMobileDevice()) {
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
            configureMediaElementGain(video);
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

async function playAuraSequence(queue) {
    if (!Array.isArray(queue) || queue.length === 0) return;

    for (const videoId of queue) {
        if (!cutscenesEnabled) break;
        await playAuraVideo(videoId);
    }
}

function getRarityClass(aura, biome) {
    // Special case for Fault
    if (aura && aura.name === "Fault") return 'rarity-challenged';
    if (aura && aura.exclusiveTo && (aura.exclusiveTo.includes("limbo") || aura.exclusiveTo.includes("limbo-null"))) {
        if (biome === "limbo") return 'rarity-limbo';
        // fallback to normal rarity if not in limbo biome
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

function getAuraStyleClass(aura) {
    if (!aura) return '';
    const name = typeof aura === 'string' ? aura : aura.name;
    if (!name) return '';
    if (name.startsWith('Pixelation')) return 'aura-effect-pixelation';
    if (name.startsWith('Luminosity')) return 'aura-effect-luminosity';
    if (name.startsWith('Equinox')) return 'aura-effect-equinox';
    return '';
}