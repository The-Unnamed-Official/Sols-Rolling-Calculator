const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '../../scripts/simulator/main.js'), 'utf8');
const source = main.slice(main.indexOf('function resetGlitchWarbleTimer()'), main.indexOf('\nconst GLITCH_BURST_TRIGGER_CHANCE'));

function fixture({ reduced = false, webAudio = false } = {}) {
    const timers = new Map();
    const delays = [];
    const gains = [];
    let timerId = 0, randomIndex = 0, seeks = 0, now = 0, volume = 0.18;
    const math = Object.create(Math);
    math.random = () => [0.01, 0.99, 0.6, 0.01, 0.99, 0.6][randomIndex++ % 6];
    const bgMusic = { playbackRate: 1, preservesPitch: true, volume: 0.18, paused: false, readyState: 4 };
    Object.defineProperty(bgMusic, 'currentTime', { get: () => 30, set: () => { seeks++; } });
    const state = { isUiGlitching: true, warbleTimeoutId: null, pitchTimeoutId: null, pitchTargetRate: null, mediaPlaybackSnapshot: null };
    const context = vm.createContext({
        Math: math, glitchUiState: state,
        performance: { now: () => now },
        appState: { qualityPreferences: { reduceGlitchEffects: reduced } },
        clamp01: value => Math.max(0, Math.min(1, value)),
        computeEffectiveBackgroundVolume: () => volume,
        randomDecimalBetween: (min, max) => (min + max) / 2,
        window: {
            setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay }); delays.push(delay); return id; },
            clearTimeout(id) { timers.delete(id); }
        }
    });
    vm.runInContext(source, context);
    const chain = webAudio ? {
        context: { currentTime: 0 }, baseGain: 0.18,
        gainNode: { gain: { cancelScheduledValues() {}, setTargetAtTime: value => gains.push(value) } }
    } : null;
    return { context, state, bgMusic, chain, delays, gains, timers, seeks: () => seeks,
        setVolume(value) { volume = value; },
        step() {
            const pending = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
            if (pending) { timers.delete(pending[0]); now = pending[1].due; pending[1].callback(); }
            else context.scheduleGlitchWarbleCycle(bgMusic, chain);
        }
    };
}

for (const webAudio of [false, true]) {
    test(`Glitch audio alternates wide pitches without seeking or volume cuts (${webAudio ? 'Web Audio' : 'media fallback'})`, () => {
        const f = fixture({ webAudio });
        const rates = [];
        for (let i = 0; i < 240; i++) { f.step(); rates.push(f.bgMusic.playbackRate); }
        assert.ok(Math.min(...rates) <= 0.25);
        assert.ok(Math.max(...rates) >= 4);
        assert.ok(rates.some(rate => rate > 0.5 && rate < 2), 'glides include intermediate pitches');
        assert.ok(rates.every((rate, index) => !index || Math.abs(Math.log2(rate / rates[index - 1])) < 2), 'pitch eases between octave extremes');
        assert.ok(f.delays.filter(delay => delay > 4).every(delay => delay >= 24 && delay <= 40));
        assert.equal(f.seeks(), 0);
        assert.equal(f.bgMusic.volume, 0.18);
        assert.ok(f.gains.every(gain => gain === 0.18));
        assert.equal(f.bgMusic.preservesPitch, false);
        f.context.resetGlitchWarbleTimer();
        f.context.restoreGlitchMediaPlayback(f.bgMusic, 0.18);
        assert.equal(f.timers.size, 0);
        assert.equal(f.bgMusic.playbackRate, 1);
        assert.equal(f.bgMusic.preservesPitch, true);
        assert.equal(f.state.mediaPlaybackSnapshot, null);
        assert.equal(f.state.pitchTargetRate, null);
    });
}

test('Reduced Glitch audio keeps continuous playback with a gentler pitch range', () => {
    const f = fixture({ reduced: true });
    const rates = [];
    for (let i = 0; i < 120; i++) { f.step(); rates.push(f.bgMusic.playbackRate); }
    assert.ok(rates.every(rate => rate > 0.75 && rate < 1.3));
    assert.ok(rates.some(rate => rate < 1) && rates.some(rate => rate > 1));
    assert.ok(f.delays.filter(delay => delay > 4).every(delay => delay >= 55 && delay <= 85));
    assert.equal(f.seeks(), 0);
    assert.equal(f.bgMusic.volume, 0.18);
    f.state.isUiGlitching = false;
    while (f.timers.size) f.step();
    assert.equal(f.timers.size, 0);
});

test('Glitch pitch effects keep music muted when audio settings change during a glide', () => {
    const f = fixture({ webAudio: true });
    for (let i = 0; i < 12; i++) f.step();
    f.setVolume(0);
    for (let i = 0; i < 24; i++) f.step();
    const firstMuted = f.gains.indexOf(0);
    assert.ok(firstMuted >= 0);
    assert.ok(f.gains.slice(firstMuted).every(gain => gain === 0));
    f.context.resetGlitchWarbleTimer();
});
