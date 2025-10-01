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

function jsRandom(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

let soundEnabled = false;
let videoPlaying = false;

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.matchMedia("(max-width: 768px)").matches)
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0)
        || (navigator.msMaxTouchPoints > 0);
}

function playSound(audioElement) {
    if (!soundEnabled || videoPlaying) return;
    
    const newAudio = audioElement.cloneNode();
    newAudio.muted = false;
    newAudio.volume = 0.1;
    newAudio.loop = false;
    newAudio.play();

    newAudio.onended = () => newAudio.remove();
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const bgMusic = document.getElementById('bgMusic');
    const soundToggle = document.getElementById('soundToggle');
    bgMusic.volume = 0.02;
    
    if (soundEnabled) {
        playSound(document.getElementById('clickSound'));
        bgMusic.muted = false;
        bgMusic.play();
    } else {
        bgMusic.muted = true;
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
}

let baseLuck = 1;
let currentLuck = 1;
let lastVipMultiplier = 1;
let lastXyzMultiplier = 1;
let lastDaveMultiplier = 1;

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
    playSound(document.getElementById('clickSound'));
    updateLuckValue();
}

function resetRolls() {
    document.getElementById('rolls').value = 1;
    playSound(document.getElementById('clickSound'));
}

function setGlitch() {
    document.getElementById('biome-select').value = 'glitch';
    playSound(document.getElementById('clickSound'));
    handleBiomeUI();
}

function setLimbo() {
    document.getElementById('biome-select').value = 'limbo';
    playSound(document.getElementById('clickSound'));
    handleBiomeUI();
}

function resetBiome() {
    document.getElementById('biome-select').value = 'normal';
    playSound(document.getElementById('clickSound'));
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
    updateLuckValue();
}

document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('button');
    const inputs = document.querySelectorAll('input');
    const backButton = document.querySelector('.back-button');
    const clickSound = document.getElementById('clickSound');
    const hoverSound = document.getElementById('hoverSound');
    buttons.forEach(button => {
        button.addEventListener('click', () => playSound(clickSound));
        button.addEventListener('mouseenter', () => playSound(hoverSound));
    });
    inputs.forEach(input => {
        input.addEventListener('click', () => playSound(clickSound));
        input.addEventListener('mouseenter', () => playSound(hoverSound));
    });
    backButton.addEventListener('click', () => playSound(clickSound));
    backButton.addEventListener('mouseenter', () => playSound(hoverSound));
    document.getElementById('vip-select').addEventListener('change', updateLuckValue);
    document.getElementById('xyz-luck').addEventListener('change', updateLuckValue);
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
});

function playAuraVideo(videoId) {
    if (isMobileDevice()) {
        const bgMusic = document.getElementById('bgMusic');
        if (bgMusic && !bgMusic.paused) {
            bgMusic.pause();
            setTimeout(() => {
                if (soundEnabled) bgMusic.play();
            }, 500);
        }
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
        skipButton.textContent = 'Click to skip';
        document.body.appendChild(skipButton);
    }
    
    const video = document.getElementById(videoId);
    if (!video) return;
    
    videoPlaying = true;
    const bgMusic = document.getElementById('bgMusic');
    const wasPlaying = !bgMusic.paused;
    
    if (wasPlaying) {
        bgMusic.pause();
    }
    
    overlay.style.display = 'block';
    video.style.display = 'block';
    skipButton.style.display = 'block';
    video.currentTime = 0;
    video.muted = !soundEnabled;
    
    const videoDuration = video.duration;
    let endProtectionActive = false;
    
    video.play().catch(error => {
        console.error("Video play error:", error);
    });
    
    const restoreAudio = () => {
        videoPlaying = false;
        
        if (wasPlaying && soundEnabled) {
            bgMusic.play();
        }
        video.style.display = 'none';
        overlay.style.display = 'none';
        skipButton.style.display = 'none';
    };
    
    skipButton.onclick = () => {
        video.pause();
        restoreAudio();
    };
    
    overlay.onclick = null;
    
    video.onended = () => {
        if (!endProtectionActive) {
            restoreAudio();
        }
    };
    
    video.ontimeupdate = () => {
        if (Math.round(video.currentTime * 10) % 10 === 0) {
            console.log(`Video time: ${video.currentTime.toFixed(1)}s / ${videoDuration.toFixed(1)}s`);
        }
        
        if (videoDuration > 0 && video.currentTime < (videoDuration * 0.9)) {
            endProtectionActive = true;
        } else {
            endProtectionActive = false;
        }
    };
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

