const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const main = fs.readFileSync(path.join(__dirname, '../scripts/main.js'), 'utf8');
const playback = main.slice(main.indexOf('function playAuraVideo('), main.indexOf('\nfunction getFullscreenElement('));
const duration = main.slice(main.indexOf('function getAuraCutsceneFadeDuration('), main.indexOf('\nfunction startPreparedCutscenePlayback('));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup() {
    const events = [], media = deferred(), animations = [];
    function node(id) {
        const classes = new Set(), listeners = new Map();
        const style = new Proxy({}, { set(target, key, value) {
            if (id === 'cinematic-overlay' && key === 'display' && value === 'flex') {
                events.push({ type: 'reveal', opacity: target.opacity });
            }
            target[key] = value;
            return true;
        } });
        return { id, style, dataset: {}, currentTime: 0, parentElement: null,
            classList: { add: (...values) => values.forEach(value => classes.add(value)),
                remove: (...values) => values.forEach(value => classes.delete(value)),
                contains: value => classes.has(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value) },
            setAttribute() {}, addEventListener: (name, callback) => listeners.set(name, callback),
            removeEventListener: name => listeners.delete(name), emit: name => listeners.get(name)?.(),
            contains: () => false, pause() {}, querySelector: () => null,
            appendChild(child) { child.parentElement = this; },
            animate(keyframes, options) {
                const finished = deferred();
                const animation = { finished: finished.promise, complete: finished.resolve,
                    cancel() { finished.reject(new Error('Animation cancelled')); } };
                animations.push({ animation, keyframes, options });
                events.push({ type: 'fade', opacity: style.opacity });
                return animation;
            }
        };
    }
    const ids = ['cinematic-overlay', 'skip-cinematic-controls', 'reveal-cinematic-controls',
        'skip-cinematic-actions', 'skip-cinematic-button', 'skip-all-cinematic-button', 'test-cutscene'];
    const nodes = Object.fromEntries(ids.map(id => [id, node(id)]));
    const overlay = nodes['cinematic-overlay'], video = nodes['test-cutscene'];
    overlay.querySelector = () => node('loading');
    const state = { cinematic: true, videoPlaying: false, audio: { roll: false } };
    const context = {
        console: { warn() {} }, appState: state,
        FIRST_PERSON_CUTSCENES: new Set(), ALWAYS_ON_CUTSCENES: new Set(),
        CUTSCENE_WATCHDOG_INTERVAL_MS: 500,
        window: { innerWidth: 1200, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
        document: { getElementById: id => nodes[id] || null, body: node('body'), documentElement: { clientWidth: 1200 },
            addEventListener() {}, removeEventListener() {}, activeElement: null },
        hasCutsceneMediaSource: () => true, ensureDeferredMediaSource() {}, applyMediaGain() {},
        isSoundChannelActive: () => false, rollingSettingsPreference: { fullscreenCutscenes: false },
        getFullscreenElement: () => null,
        prepareCutsceneVideo: () => { events.push({ type: 'prepare' }); return media.promise; },
        enterCutsceneFullscreen: async () => {
            events.push({ type: 'fullscreen', opacity: overlay.style.opacity });
            return false;
        },
        startPreparedCutscenePlayback: async () => {
            events.push({ type: 'play', opacity: overlay.style.opacity });
            video.emit('playing');
        }
    };
    vm.runInNewContext(duration + '\n' + playback, context);
    return { context, events, media, animations, overlay, video, state, nodes,
        play: options => context.playAuraVideo('test-cutscene', options) };
}

test('cutscenes start transparent and fade before fullscreen or playback, even with cached media', async () => {
    const run = setup();
    const result = run.play();
    assert.equal(run.state.videoPlaying, true);
    assert.deepEqual(run.events.map(event => event.type), ['reveal', 'fade', 'prepare']);
    assert.equal(run.events[0].opacity, '0');
    assert.equal(run.events[1].opacity, '0');
    assert.equal(run.video.style.display, 'none');
    assert.equal(run.animations[0].options.duration, 1000);
    run.media.resolve();
    await flush();
    assert.ok(!run.events.some(event => event.type === 'fullscreen' || event.type === 'play'));
    run.animations[0].animation.complete();
    await flush();
    assert.deepEqual(run.events.slice(-2), [{ type: 'fullscreen', opacity: '1' }, { type: 'play', opacity: '1' }]);
    assert.equal(run.video.style.display, 'block');
    run.video.emit('ended');
    assert.equal(await result, 'finished');
    assert.equal(run.overlay.style.display, 'none');
    assert.equal(run.overlay.style.opacity, '0');
    assert.equal(run.state.videoPlaying, false);
});

test('slow media loads behind a completed fade without revealing the page again', async () => {
    const run = setup();
    const result = run.play();
    run.animations[0].animation.complete();
    await flush();
    assert.equal(run.overlay.style.opacity, '1');
    assert.equal(run.overlay.classList.contains('cinematic-overlay--fading'), false);
    assert.equal(run.overlay.classList.contains('cinematic-overlay--loading'), true);
    assert.equal(run.video.style.display, 'none');
    assert.ok(!run.events.some(event => event.type === 'fullscreen'));
    run.media.resolve();
    await flush();
    assert.equal(run.events.at(-1).type, 'play');
    run.video.emit('ended');
    await result;
});

test('skipping during the fade cancels it and cannot start playback later', async () => {
    const run = setup();
    const result = run.play();
    run.nodes['skip-cinematic-button'].onclick();
    assert.equal(await result, 'skipped');
    run.media.resolve();
    await flush();
    assert.ok(!run.events.some(event => event.type === 'fullscreen' || event.type === 'play'));
    assert.equal(run.overlay.style.display, 'none');
    assert.equal(run.overlay.style.opacity, '0');
    assert.equal(run.state.videoPlaying, false);
});

test('failed loading removes the fade and releases rolling', async () => {
    const run = setup();
    const result = run.play();
    run.media.reject(new Error('Unavailable video'));
    assert.equal(await result, 'failed');
    await flush();
    assert.equal(run.state.videoPlaying, false);
    assert.equal(run.overlay.style.display, 'none');
    assert.equal(run.overlay.style.opacity, '0');
    assert.ok(!run.events.some(event => event.type === 'play'));
});

test('special cutscenes keep their longer fades', () => {
    const run = setup();
    assert.equal(run.context.getAuraCutsceneFadeDuration('oblivion-cutscene'), 1000);
    assert.equal(run.context.getAuraCutsceneFadeDuration('tomorrow-cutscene'), 2000);
    assert.equal(run.context.getAuraCutsceneFadeDuration('breakthrough-cutscene'), 5000);
});
