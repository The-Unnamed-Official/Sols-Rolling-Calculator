const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let browser, server, origin;

before(async () => {
    server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname === '/__test__') {
            response.setHeader('Content-Type', 'text/html');
            response.end('<!doctype html><html><body></body></html>');
            return;
        }
        const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
        const relative = path.relative(root, filename);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            response.writeHead(403).end();
            return;
        }
        fs.readFile(filename, (error, data) => {
            if (error) {
                response.writeHead(404).end();
                return;
            }
            const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(filename)];
            if (type) response.setHeader('Content-Type', type);
            response.end(data);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_CHROMIUM_EXECUTABLE_PATH });
});

after(async () => {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
});

async function linkPage(t) {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.goto(`${origin}/__test__`);
    for (const script of ['wiki-title-data', 'wiki-titles', 'aura-routes', 'aura-links']) {
        await page.addScriptTag({ url: `${origin}/scripts/${script}.js` });
    }
    return page;
}

async function appPage(t, mobile = false) {
    const context = await browser.newContext(mobile ? {
        viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36'
    } : {});
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (/Rolling could not|Unable to start rolling/.test(message.text())) errors.push(message.text());
    });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin
        ? route.continue() : route.abort());
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof runRollSimulation === 'function');
    return { page, errors };
}

async function roll(page, method, rolls, luck = 1) {
    await page.evaluate(async ({ method, rolls, luck }) => {
        appState.cinematic = false;
        appState.audio.masterMuted = true;
        appState.backgroundRolling = true;
        setSimulationMethod(method, { playAudio: false });
        setNumericInputValue(document.getElementById('luck-total'), luck);
        setNumericInputValue(document.getElementById('roll-total'), rolls);
        await runRollSimulation({ bypassRotationPrompt: true, bypassRollWarning: true });
    }, { method, rolls, luck });
    const formattedRolls = rolls.toLocaleString('en-US');
    await page.waitForFunction(formattedRolls => {
        const text = document.getElementById('simulation-feed').textContent;
        return text.includes('could not') || text.includes(`Rolls: ${formattedRolls}`) && text.includes('Total XP Earned:');
    }, formattedRolls, { timeout: 15000 });
    const feed = await page.locator('#simulation-feed').innerText();
    assert.doesNotMatch(feed, /could not|NoModificationAllowedError/);
    assert.match(feed, new RegExp(`Rolls: ${formattedRolls}\\b`));
    assert.equal(await page.locator('.roll-trigger').isEnabled(), true);
    return page.evaluate(() => ({ counts: Array.from(auraWinCounts),
        rolls: lastSimulationSummary.rolls, luck: lastSimulationSummary.luckLabel,
        records: lastSimulationSummary.shareRecords, xp: lastSimulationSummary.xpTotal }));
}

test('fragment titles retain their artwork, siblings and accessible profile links', async t => {
    const page = await linkPage(t);
    const result = await page.evaluate(() => {
        // Enforce Chromium 138's restriction even when running a newer engine.
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
        Object.defineProperty(Element.prototype, 'outerHTML', { ...descriptor, set(value) {
            if (this.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                throw new DOMException('Cannot replace fragment children using outerHTML.', 'NoModificationAllowedError');
            }
            descriptor.set.call(this, value);
        } });
        const markup = WikiTitles.aura('Common', '2');
        const input = document.createElement('template');
        input.innerHTML = markup;
        const title = input.content.querySelector('.wiki-title--aura');
        const output = document.createElement('template');
        output.innerHTML = AuraLinks.wrap('Common - 2', markup);
        const link = output.content.querySelector('.aura-page-link');
        return { parentType: title.parentNode.nodeType,
            titleIntact: link?.querySelector('.wiki-title--aura')?.isEqualNode(title),
            rarityIntact: link?.nextElementSibling?.isEqualNode(title.nextElementSibling),
            href: link?.href, target: link?.target, rel: link?.rel, label: link?.getAttribute('aria-label'),
            links: output.content.querySelectorAll('a').length };
    });
    assert.equal(result.parentType, 11);
    assert.equal(result.titleIntact, true);
    assert.equal(result.rarityIntact, true);
    assert.equal(result.href, `${origin}/auras/common/`);
    assert.equal(result.target, '_blank');
    assert.equal(result.rel, 'noopener');
    assert.equal(result.label, 'Common aura details (opens in a new tab)');
    assert.equal(result.links, 1);
    t.diagnostic(`Browser engine: ${browser.version()}`);
});

test('every routed wiki aura retains its title artwork', async t => {
    const page = await linkPage(t);
    const checked = await page.evaluate(() => {
        let count = 0;
        for (const name of Object.keys(WikiTitleData.auras)) {
            if (!AuraLinks.href(name)) continue;
            const markup = WikiTitles.aura(name);
            const input = document.createElement('template');
            input.innerHTML = markup;
            const output = document.createElement('template');
            output.innerHTML = AuraLinks.wrap(name, markup);
            if (!output.content.querySelector('a .wiki-title--aura')?.isEqualNode(input.content.firstElementChild)) {
                throw new Error(`Lost title artwork for ${name}`);
            }
            count++;
        }
        return count;
    });
    assert.ok(checked > 100);
    t.diagnostic(`Verified all ${checked} routed aura titles.`);
});

test('nested and plain titles preserve details, escaping and unknown routes', async t => {
    const page = await linkPage(t);
    const result = await page.evaluate(() => {
        const parse = markup => {
            const template = document.createElement('template');
            template.innerHTML = markup;
            return template.content;
        };
        const nested = parse(AuraLinks.wrap('Common', '<span class="outer">before '
            + WikiTitles.aura('Common') + '<span class="sigil-subtitle">after</span></span>'));
        const plainMarkup = '<span class="sigil-effect-glitch__title">GLITCH</span> - 12,345';
        const plain = parse(AuraLinks.wrap('Glitch - 12,345', plainMarkup));
        const unknown = '<span>Unknown &amp; unchanged</span>';
        globalThis.AuraRoutes = { ab: 'special' };
        const special = parse(AuraLinks.wrap('A & "B"', '<b>A &amp; &quot;B&quot;</b>'));
        return { nestedTitle: Boolean(nested.querySelector('.outer > a > .aura-link-title > .wiki-title--aura')),
            subtitle: nested.querySelector('.sigil-subtitle').textContent,
            plain: plain.querySelector('.aura-link-title').innerHTML, plainMarkup,
            label: special.querySelector('a').getAttribute('aria-label'), text: special.querySelector('b').textContent,
            unknown: AuraLinks.wrap('No matching route', unknown), original: unknown };
    });
    assert.equal(result.nestedTitle, true);
    assert.equal(result.subtitle, 'after');
    assert.equal(result.plain, result.plainMarkup);
    assert.equal(result.label, 'A & "B" aura details (opens in a new tab)');
    assert.equal(result.text, 'A & "B"');
    assert.equal(result.unknown, result.original);
});

test('repeated titles avoid DOM parsing without reusing stale titles or links', async t => {
    const page = await linkPage(t);
    const result = await page.evaluate(() => {
        const create = document.createElement;
        let templates = 0;
        document.createElement = function (tag, ...args) {
            if (tag === 'template') templates++;
            return create.call(this, tag, ...args);
        };
        const markup = WikiTitles.aura('Common');
        const first = AuraLinks.wrap('Common', markup);
        const initialParses = templates;
        const started = performance.now();
        let identical = true;
        for (let i = 0; i < 10000; i++) identical = identical && AuraLinks.wrap('Common', markup) === first;
        const repeatedMs = performance.now() - started;
        const repeatedParses = templates - initialParses;
        const changed = AuraLinks.wrap('Common', markup + '<span>new odds</span>');
        globalThis.AuraRoutes = { common: 'new-profile', uncommon: 'uncommon' };
        const rerouted = AuraLinks.wrap('Common', markup);
        const renamed = AuraLinks.wrap('Uncommon', markup);
        document.createElement = create;
        return { identical, initialParses, repeatedParses, repeatedMs,
            changed: changed.includes('new odds'), rerouted: rerouted.includes('/auras/new-profile/'),
            renamed: renamed.includes('Uncommon aura details') && renamed.includes('/auras/uncommon/') };
    });
    assert.equal(result.identical, true);
    assert.equal(result.initialParses, 1);
    assert.equal(result.repeatedParses, 0);
    assert.equal(result.changed, true);
    assert.equal(result.rerouted, true);
    assert.equal(result.renamed, true);
    t.diagnostic(`10,000 cached title links: ${result.repeatedMs.toFixed(1)} ms, zero DOM parses.`);
});

test('the title cache evicts older entries and does not retain oversized markup', async t => {
    const page = await linkPage(t);
    const result = await page.evaluate(() => {
        const create = document.createElement;
        let templates = 0;
        document.createElement = function (tag, ...args) {
            if (tag === 'template') templates++;
            return create.call(this, tag, ...args);
        };
        const first = '<span class="wiki-title--aura">first</span>';
        AuraLinks.wrap('Common', first);
        for (let i = 0; i < 512; i++) AuraLinks.wrap('Common', `<span class="wiki-title--aura">${i}</span>`);
        let before = templates;
        AuraLinks.wrap('Common', first);
        const evictedByCount = templates > before;
        const large = i => `<span class="wiki-title--aura">${i}${'x'.repeat(20000)}</span>`;
        AuraLinks.wrap('Common', large(0));
        for (let i = 1; i < 30; i++) AuraLinks.wrap('Common', large(i));
        before = templates;
        AuraLinks.wrap('Common', large(0));
        const evictedBySize = templates > before;
        const oversized = `<span class="wiki-title--aura">${'x'.repeat(300000)}</span>`;
        AuraLinks.wrap('Common', oversized);
        before = templates;
        AuraLinks.wrap('Common', oversized);
        const oversizedNotCached = templates > before;
        document.createElement = create;
        return { evictedByCount, evictedBySize, oversizedNotCached };
    });
    assert.deepEqual(result, { evictedByCount: true, evictedBySize: true, oversizedNotCached: true });
});

test('link failures preserve original markup, warn once and recover on retry', async t => {
    const page = await linkPage(t);
    const result = await page.evaluate(() => {
        const create = document.createElement;
        const warn = console.warn;
        let warnings = 0;
        console.warn = () => warnings++;
        document.createElement = () => { throw new Error('Simulated DOM failure'); };
        const markup = WikiTitles.aura('Common');
        const first = AuraLinks.wrap('Common', markup);
        const second = AuraLinks.wrap('Common', markup);
        document.createElement = create;
        console.warn = warn;
        return { intact: first === markup && second === markup, warnings,
            recovered: AuraLinks.wrap('Common', markup).includes('aura-page-link') };
    });
    assert.deepEqual(result, { intact: true, warnings: 1, recovered: true });
});

for (const mobile of [false, true]) {
    for (const method of ['unnamed', 'sols-like']) {
        test(`${method} finishes repeat rolls on ${mobile ? 'mobile' : 'desktop'}, including worker runs where applicable`, async t => {
            const { page, errors } = await appPage(t, mobile);
            const workers = [];
            page.on('worker', worker => workers.push(worker.url()));
            for (const rolls of method === 'unnamed' ? [1, 100, 5000] : [1, 100]) {
                await roll(page, method, rolls);
                assert.ok(await page.locator('#simulation-feed .aura-page-link .wiki-title--aura').count());
            }
            if (method === 'unnamed') assert.ok(workers.some(url => url.includes('simulation-worker.js')));
            assert.deepEqual(errors, []);
        });
    }
}

for (const method of ['unnamed', 'sols-like']) {
    test(`${method} produces identical counts, odds, luck and XP with title linking enabled or bypassed`, async t => {
        const { page, errors } = await appPage(t);
        await page.evaluate(() => { globalThis.testOriginalLinks = AuraLinks; });
        for (const luck of [1, 100, 100000]) {
            const results = [];
            for (const linked of [false, true]) {
                await page.evaluate(linked => {
                    globalThis.AuraLinks = linked ? testOriginalLinks : { wrap: (_name, markup) => markup };
                    let state = 123456789;
                    globalThis.testEntropyCalls = 0;
                    globalThis.drawEntropy = () => {
                        testEntropyCalls++;
                        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
                        return state / 0x100000000;
                    };
                }, linked);
                results.push({ ...await roll(page, method, method === 'unnamed' ? 1000 : 25, luck),
                    entropyCalls: await page.evaluate(() => testEntropyCalls) });
            }
            assert.deepEqual(results[1], results[0], `linking changed calculated results at luck ${luck}`);
        }
        assert.deepEqual(errors, []);
    });
}

test('a title-link DOM failure cannot abort completed rolls', async t => {
    const { page, errors } = await appPage(t, true);
    await page.evaluate(() => {
        const create = document.createElement;
        document.createElement = function (tag, ...args) {
            if (tag === 'a') throw new Error('Simulated profile-link failure');
            return create.call(this, tag, ...args);
        };
    });
    const result = await roll(page, 'unnamed', 100);
    assert.equal(result.rolls, 100);
    assert.ok(await page.locator('#simulation-feed .wiki-title--aura').count());
    assert.deepEqual(errors, []);
});

test('published build metadata and the changed script share a new cache identifier', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const build = html.match(/<meta name="app-build" content="([^"]+)"/)[1];
    assert.equal(build, '2.213');
    assert.ok(html.includes(`const buildCacheKey = '${build}'`));
    assert.ok(html.includes(`scripts/aura-links.js?v=${build}`));
    assert.ok(html.includes(`data-version-id="v${build}"`));
    assert.ok(html.includes(`class="changelog-subupdate-card__version">v${build}`));
    const assets = [...html.matchAll(/(?:src|href)="(?:scripts|styles)\/[^"?]+\?v=([^"]+)"/g)];
    assert.ok(assets.length > 20);
    assert.ok(assets.every(([, version]) => version === build));
    const header = fs.readFileSync(path.join(root, 'partials/header.html'), 'utf8');
    assert.ok(header.includes(`data-version-id="v${build}"`));
    const fragments = fs.readFileSync(path.join(root, 'scripts/aura-layout-fragments.js'), 'utf8');
    const data = JSON.parse(fragments.slice(fragments.indexOf('(') + 1, fragments.lastIndexOf(')')));
    assert.equal(data['header.html'], header);
});
