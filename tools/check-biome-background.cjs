// Exercise filename discovery and shared day/night behavior without real assets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const script = read('scripts/biome-background.js');
const main = read('scripts/main.js');
const assetsContext = {};
vm.runInNewContext(main.slice(main.indexOf('const biomeAssets ='), main.indexOf('\nfunction resolveBiomeAssetKey')) + '\nglobalThis.assets = biomeAssets;', assetsContext);
const prefix = 'https://example.com/simulator/';
const absolute = value => new URL(value, prefix).href;
function harness(files, stored = 'day', options = {}) {
    const available = new Set(files.map(absolute));
    const requested = [];
    const listeners = new Map();
    const storage = new Map([['solsRollingCalculator:biomeBackgroundTime', stored]]);
    let now = 0;
    const context = {
        URL, Event, setTimeout, clearTimeout,
        Date: class extends Date { static now() { return now; } },
        document: { currentScript: { src: absolute('scripts/biome-background.js') }, baseURI: absolute('index.html') },
        localStorage: {
            getItem: key => { if (options.blockStorage) throw Error('Storage blocked'); return storage.get(key) || null; },
            setItem: (key, value) => { if (options.blockStorage) throw Error('Storage blocked'); storage.set(key, value); }
        },
        addEventListener: (name, callback) => {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(callback);
        },
        dispatchEvent: event => (listeners.get(event.type) || []).forEach(callback => callback(event)),
        Image: class {
            set src(value) {
                requested.push(value);
                queueMicrotask(() => {
                    this.naturalWidth = available.has(value) ? 100 : 0;
                    (this.naturalWidth ? this.onload : this.onerror)?.();
                });
            }
        }
    };
    context.window = context;
    vm.runInNewContext(script, context);
    return { context, api: context.BiomeBackground, requested, available, storage, advance: value => { now += value; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
    for (const [biome, asset] of Object.entries(assetsContext.assets)) {
        if (/\.webm$/.test(asset.image)) continue;
        const night = asset.image.replace(/N(?=\.[^.]+$)/, '').replace(/(\.[^.]+)$/, 'N$1');
        const fixture = harness([asset.image, night]);
        assert.equal(await fixture.api.resolve(asset.image, { night: false }), absolute(asset.image), `${biome}: main/day artwork`);
        assert.equal(await fixture.api.resolve(asset.image, { night: true }), absolute(night), `${biome}: N artwork`);
        const missingNight = harness([asset.image]);
        assert.equal(await missingNight.api.resolve(asset.image, { night: true }), absolute(asset.image), `${biome}: fall back to its own main artwork`);
    }
    const fixture = harness(['files/images/backgrounds/corruptionBiomeImage.png', 'files/images/backgrounds/corruptionBiomeImageN.webp']);
    fixture.context.document.baseURI = absolute('auras/poseidon/index.html');
    assert.equal(await fixture.api.resolve('../../files/images/backgrounds/corruptionBiomeImage.jpg', { night: true }), absolute('files/images/backgrounds/corruptionBiomeImageN.webp'), 'Find night images with another extension from nested pages');
    assert.equal(await fixture.api.resolve('../../files/images/backgrounds/corruptionBiomeImage.jpg', { night: false }), absolute('files/images/backgrounds/corruptionBiomeImage.png'), 'Find a PNG replacement for a configured JPG');
    assert.equal(await fixture.api.resolve('../../files/images/backgrounds/corruptionBiomeImageN.webp', { night: true }), absolute('files/images/backgrounds/corruptionBiomeImageN.webp'), 'Do not add N twice');
    const replacements = harness(['files/images/backgrounds/rainyBiomeImage.jpg', 'files/images/backgrounds/rainyBiomeImage.png']);
    assert.equal(await replacements.api.resolve(assetsContext.assets.rainy.image, { night: false }), absolute('files/images/backgrounds/rainyBiomeImage.png'), 'New PNG artwork takes priority over an older JPG');
    const normal = 'files/images/backgrounds/normalBiomeImage.png';
    const normalNight = 'files/images/backgrounds/normalBiomeImageN.png';
    const defaults = harness([normal, normalNight]);
    assert.equal(defaults.api.defaultAsset('day'), absolute(normal));
    assert.equal(defaults.api.defaultAsset('night'), absolute(normalNight));
    assert.equal(await defaults.api.resolve('', { night: false }), absolute(normal), 'Daytime default uses the normal main image');
    assert.equal(await defaults.api.resolve('', { night: true }), absolute(normalNight), 'Nighttime default uses the normal N image');
    assert.equal(await harness([normal]).api.resolve(normalNight), absolute(normal), 'An explicit default night image falls back to the normal main image');
    assert(defaults.requested.every(source => /normalBiomeImageN?\.png$/.test(source)), 'Default lookups only use the normal image pair');
    const missing = harness([normal, normalNight]);
    assert.equal(await missing.api.resolve(assetsContext.assets.corruption.image, { night: true }), absolute(normalNight), 'Pending main artwork uses the default night scene');
    missing.available.add(absolute('files/images/backgrounds/corruptionBiomeImageN.png'));
    missing.advance(30001);
    assert.equal(await missing.api.resolve(assetsContext.assets.corruption.image, { night: true }), absolute('files/images/backgrounds/corruptionBiomeImageN.png'), 'Newly added artwork becomes available after the missing-image cache expires');
    const glitch = harness(['files/images/backgrounds/glitchBiomeImageN.png']);
    assert.equal(await glitch.api.resolve(assetsContext.assets.glitch.image, { night: true }), absolute('files/images/backgrounds/glitchBiomeImageN.png'), 'Night images also work for animated biomes');
    assert.equal(await glitch.api.resolve(assetsContext.assets.glitch.image, { night: false }), absolute(assetsContext.assets.glitch.image));
    assert.equal(await harness([]).api.resolve(assetsContext.assets.glitch.image, { night: true }), absolute(assetsContext.assets.glitch.image), 'Missing night image retains the original animation');
    const staticGlitch = harness(['files/images/backgrounds/glitchBiomeImage.png']);
    assert.equal(await staticGlitch.api.resolve(assetsContext.assets.glitch.image, { night: false }), absolute('files/images/backgrounds/glitchBiomeImage.png'), 'An uploaded main image replaces the legacy animation');
    assert.equal(await staticGlitch.api.resolve(assetsContext.assets.glitch.image, { night: true }), absolute('files/images/backgrounds/glitchBiomeImage.png'), 'An animated biome falls back to its uploaded main image when night artwork is missing');
    assert.equal(await harness([]).api.resolve('files/images/backgrounds/notAdded.jpg', { night: true }), absolute(normal), 'Absent default artwork must not recurse forever');
    fixture.api.setTime('night');
    assert.equal(fixture.storage.get('solsRollingCalculator:biomeBackgroundTime'), 'night');
    assert.equal(await fixture.api.resolve(absolute(assetsContext.assets.corruption.image)), absolute('files/images/backgrounds/corruptionBiomeImageN.webp'));
    fixture.storage.set('solsRollingCalculator:biomeBackgroundTime', 'day');
    fixture.context.dispatchEvent({ type: 'storage', key: 'solsRollingCalculator:biomeBackgroundTime' });
    assert.equal(fixture.api.getTime(), 'day', 'Observe time changes from other pages');
    const blocked = harness([], 'night', { blockStorage: true });
    blocked.api.setTime('night');
    assert.equal(blocked.api.getTime(), 'night', 'Artwork still works when storage is unavailable');

    const commits = [], pending = [];
    const context = {
        biomeAssets: assetsContext.assets,
        document: { getElementById: () => null },
        resolveBiomeAssetKey: biome => biome,
        BiomeBackground: { setTime: value => { context.phase = value; }, resolve: () => new Promise(resolve => pending.push(resolve)) }
    };
    // Keep the same context so function calls share the request counter.
    const integration = vm.createContext({ ...context, commits });
    vm.runInContext(main.slice(main.indexOf('let biomeBackgroundRequestId ='), main.indexOf('\nlet baseLuck =')) + '\napplyBiomeBackdrop = image => commits.push(image);', integration);
    integration.applyBiomeTheme('rainy', { timeBiome: 'night', activeBiomes: ['rainy', 'night'] });
    integration.applyBiomeTheme('rainy', { timeBiome: 'day', activeBiomes: ['rainy', 'day'] });
    pending[1]('day-image');
    await tick();
    pending[0]('slow-night-image');
    await tick();
    assert.deepEqual(commits, ['day-image'], 'A stale nighttime load must not replace the latest daytime selection');
    integration.applyBiomeTheme('rainy', { timeBiome: 'none', activeBiomes: ['rainy', 'day', 'night'] });
    assert.equal(context.phase, 'night', 'Eclipse rune night activation uses nighttime artwork');
    console.log(`Passed: all ${Object.keys(assetsContext.assets).length} biome mappings, N discovery, mixed formats, missing artwork, animated biomes, shared time, storage restrictions, and stale-load protection.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
