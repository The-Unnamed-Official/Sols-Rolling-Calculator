const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const bootstrap = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const buildId = html.match(/<meta name="app-build" content="([^"]+)"/)[1];

function input(value = '') {
    const listeners = {};
    return { value, dataset: {}, addEventListener: (name, callback) => { listeners[name] = callback; },
        fire: (name, event) => listeners[name](event) };
}

test('inputs display two decimals while preserving full calculation precision', () => {
    const context = { performance, crypto: globalThis.crypto };
    vm.runInNewContext(read('scripts/utils.js'), context);
    for (const [value, expected] of [[12.13581, '12.14'], [1.7939999999999998, '1.79'],
        [1.005, '1.01'], [9.999, '10'], [12.1, '12.1'], [1e-7, '0'], [1e21, '1000000000000000000000']]) {
        const field = input();
        context.setNumericInputValue(field, value);
        assert.equal(field.value, expected);
        assert.equal(field.dataset.rawValue, String(value));
        assert.equal(context.getNumericInputValue(field), value);
    }
    const field = input('12.13581');
    context.bindNumericInputFormatting(field, { min: 0 });
    assert.equal(field.value, '12.14');
    field.fire('focus');
    field.value = '1,234.56789';
    field.fire('input');
    assert.equal(field.value, '1234.57');
    assert.equal(context.getNumericInputValue(field), 1234.56789);
    field.fire('blur');
    assert.equal(field.value, '1,234.57');
    field.fire('focus');
    assert.equal(field.value, '1234.57');
    field.value = '';
    for (const digit of '12.13581') {
        field.value += digit;
        field.fire('input', { inputType: 'insertText', data: digit });
        assert.ok((field.value.split('.')[1]?.length || 0) <= 2);
    }
    field.fire('blur');
    assert.equal(field.value, '12.14', 'sequential typing must round only the completed edit');
    assert.equal(context.getNumericInputValue(field), 12.13581);
    field.dataset.rawValue = '12.13581';
    assert.equal(context.getNumericInputValue(field), 12.13581);
    context.setNumericInputValue(field, 1.20000000001);
    field.fire('focus');
    assert.equal(field.value, '1.2', 'focus must not expose floating-point tails');
    field.fire('blur');
    assert.equal(field.value, '1.2');
    assert.equal(context.getNumericInputValue(field), 1.20000000001);
    context.setNumericInputValue(field, 120000000001.13581, { format: true });
    assert.equal(field.value, '120,000,000,001.14');
    assert.equal(context.getNumericInputValue(field), 120000000001.13581);
    assert.equal(context.formatWithCommas(1234.56789), '1,234.57');
    context.setNumericInputValue(field, Infinity);
    assert.equal(field.value, '');
    assert.equal(context.getNumericInputValue(input('')), NaN);
});

async function boot({ build = buildId, modified = null, offline = false, href = 'https://example.test/app/' } = {}) {
    const requests = [], redirects = [], mutations = [];
    const context = {
        URL, AbortController, console: { warn() {} },
        document: { baseURI: href, lastModified: '10/22/2026 10:00:00' },
        window: {
            location: { href, protocol: 'https:', replace: url => redirects.push(url) },
            history: { state: null, replaceState: (...args) => mutations.push(args) },
            setTimeout, clearTimeout, addEventListener() {}
        },
        localStorage: { clear() { throw new Error('Automatic cache reset'); }, removeItem() { throw new Error('Removed settings'); } },
        navigator: { serviceWorker: { getRegistrations() { throw new Error('Automatic worker removal'); } } },
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (offline) throw new Error('Offline');
            return { ok: true, headers: { get: () => modified },
                text: async () => `<meta name="app-build" content="${build}">` };
        }
    };
    vm.runInNewContext(bootstrap, context);
    // A navigation intentionally leaves the old document's metadata promise pending.
    await new Promise(resolve => setImmediate(resolve));
    if (!redirects.length) await context.window.appBuildMetadataPromise;
    return { context, requests, redirects, mutations };
}

test('normal refresh revalidates without clearing caches or saved preferences', async () => {
    const result = await boot({ modified: 'Thu, 22 Oct 2026 20:00:00 GMT', href: 'https://example.test/app/?_app_build=123#section' });
    assert.equal(result.redirects.length, 0, 'timestamps alone must not cause reload loops');
    assert.equal(result.requests[0].options.cache, 'no-cache');
    assert.equal(new URL(result.requests[0].url).searchParams.get('_app_cache_check'), '1');
    assert.equal(result.mutations.length, 1);
    assert.equal(result.context.window.getVersionedAppAssetUrl('scripts/simulation-worker.js?session=1'),
        `https://example.test/app/scripts/simulation-worker.js?session=1&v=${buildId}`);
});

test('a new published build reloads even without Last-Modified', async () => {
    const result = await boot({ build: '2.212' });
    assert.equal(result.redirects.length, 1);
    assert.equal(new URL(result.redirects[0]).searchParams.get('_app_build'), '2.212');
});

test('offline refresh uses the available build and failed navigation cannot loop', async () => {
    assert.equal((await boot({ offline: true })).redirects.length, 0);
    assert.equal((await boot({ build: '2.212', href: 'https://example.test/app/?_app_build=2.212' })).redirects.length, 0);
});

async function cacheReset(failDownload = false) {
    const deleted = [], unregistered = [], requests = [], redirects = [];
    let saved = 0, listener;
    const button = { disabled: false, textContent: 'Reset Cache', addEventListener: (_, callback) => { listener = callback; } };
    const status = { textContent: '' };
    const context = {
        URL, AbortController, setTimeout, clearTimeout, console: { warn() {} },
        DOMParser: class {
            parseFromString(source) {
                assert.ok(source.includes('app-build'));
                return {
                    querySelector: () => ({ content: '2.211' }),
                    querySelectorAll: () => [{ getAttribute: name => name === 'src' ? 'scripts/main.js?v=2.211' : null }]
                };
            }
        },
        location: { href: 'https://example.test/app/?filter=kept', replace: url => redirects.push(url) },
        SessionReturn: { save() { saved++; } },
        document: {
            currentScript: { src: 'https://example.test/app/scripts/app-cache.js?v=2.211' },
            getElementById: id => id === 'resetAppCacheButton' ? button : status,
            querySelectorAll: () => [{ src: 'https://example.test/app/scripts/main.js?v=2.211' },
                { href: 'https://example.test/app/styles/base.css?v=2.211' }, { src: 'https://cdn.test/library.js' }]
        },
        localStorage: { clear() { throw new Error('Removed preferences'); }, removeItem() { throw new Error('Removed session'); } },
        caches: {
            keys: async () => ['shared-cache'],
            open: async () => ({ keys: async () => [{ url: 'https://example.test/app/old.js' },
                { url: 'https://example.test/another-app/keep.js' }, { url: 'https://cdn.test/keep.js' }],
            delete: async request => deleted.push(request.url) })
        },
        navigator: { serviceWorker: { getRegistrations: async () => ['https://example.test/app/', 'https://example.test/another-app/']
            .map(scope => ({ scope, unregister: async () => unregistered.push(scope) })) } },
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (failDownload) throw new Error('Network failure');
            return { ok: true, text: async () => html, arrayBuffer: async () => new ArrayBuffer(0) };
        }
    };
    vm.runInNewContext(read('scripts/app-cache.js'), context);
    assert.equal(deleted.length, 0, 'cache changes must require the explicit button');
    assert.equal(requests.length, 0);
    await listener();
    return { deleted, unregistered, requests, redirects, saved, button, status };
}

test('Reset Cache affects only app files, refreshes HTTP assets and keeps the session', async () => {
    const result = await cacheReset();
    assert.deepEqual(result.deleted, ['https://example.test/app/old.js']);
    assert.deepEqual(result.unregistered, ['https://example.test/app/']);
    assert.equal(result.saved, 1);
    assert.ok(result.requests.length >= 6);
    assert.ok(result.requests.every(request => request.options.cache === 'reload' && request.url.startsWith('https://example.test/app/')));
    assert.equal(new URL(result.redirects[0]).searchParams.get('filter'), 'kept');
});

test('a failed cache reset offers retry without erasing preferences', async () => {
    const result = await cacheReset(true);
    assert.equal(result.redirects.length, 0);
    assert.equal(result.button.disabled, false);
    assert.equal(result.button.textContent, 'Reset Cache');
    assert.match(result.status.textContent, /try again/);
});

test('release assets and shared Preferences markup are synchronized', () => {
    const assets = [...html.matchAll(/(?:src|href)="((?:scripts|styles)\/[^"?]+)\?v=([^"?]+)"/g)];
    assert.ok(assets.length > 20);
    assert.ok(assets.every(([, , version]) => version.startsWith('2.211')));
    assert.ok(html.includes('data-version-id="v2.211"'));
    assert.ok(html.includes('class="changelog-subupdate-card__version">v2.211'));
    assert.ok(html.includes('https://discord.com/users/1327300393226604630'));
    assert.equal(html.match(/id="resetAppCacheButton"/g).length, 1);
    assert.ok(html.includes(read('partials/quality-preferences.html').trim()));
});
