// Interaction checks for moon collection art, buff choices, fades and audio access.
// Run with Playwright available on NODE_PATH, using an installed Chrome browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webm': 'video/webm' };
const server = http.createServer((request, response) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return response.writeHead(404).end();
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    fs.mkdirSync(output, { recursive: true });
    const errors = [];
    async function open(options = {}) {
        const page = await browser.newPage(options);
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        // Exercise real decoding/playback without downloading several large videos.
        await page.route('**/files/videos/cutscenes/*.webm', route => route.fulfill({
            path: path.join(root, 'files/videos/cutscenes/pukekoGodCutscene.webm'), contentType: 'video/webm'
        }));
        await page.addInitScript(() => localStorage.setItem('solsRollingCalculator:lastSeenChangelogVersion', 'v2.210'));
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            document.querySelectorAll('.modal-overlay, .cutscene-warning-overlay, #introOverlay').forEach(element => element.hidden = true);
            appState.audio.roll = false;
        });
        return page;
    }
    async function play(page, id) {
        await page.mouse.move(0, 300);
        await page.evaluate(id => {
            window.testCutsceneDone = false;
            window.testPlaybackAt = 0;
            window.testCutsceneStartedAt = performance.now();
            playAuraVideo(id, { force: true, onPlaying: () => window.testPlaybackAt = performance.now() })
                .then(() => window.testCutsceneDone = true);
        }, id);
    }
    async function stopDesktop(page) {
        await page.mouse.move(page.viewportSize().width - 20, 25);
        await page.locator('#skip-cinematic-button').click();
        await page.waitForFunction(() => window.testCutsceneDone);
        assert.equal(await page.evaluate(() => appState.videoPlaying), false);
        assert.equal(await page.locator('#cinematic-overlay').isVisible(), false);
    }
    try {
        const page = await open({ viewport: { width: 1365, height: 900 } });
        await page.evaluate(() => setRadiantForestPreset());
        assert.equal(await page.locator('#radiantMoons').isVisible(), true);
        assert.equal(await page.locator('[data-moon-index]').count(), 7);
        assert.equal(await page.locator('.radiant-moons__moon--collected').count(), 0);
        await page.locator('#radiantMoons').screenshot({ path: path.join(output, 'v2210-moons-unrolled.png') });
        for (let index = 0; index < 7; index++) {
            await page.evaluate(index => { radiantForestState.moons = 1 << index; syncBiomeBuffs(); }, index);
            assert.equal(await page.locator('.radiant-moons__moon--collected').count(), 1);
            assert.equal(await page.locator(`[data-moon-index="${index}"]`).getAttribute('aria-label').then(label => label.endsWith(': collected')), true);
        }
        await page.evaluate(() => { radiantForestState.moons = 127; syncBiomeBuffs(); });
        const moonAnimation = await page.locator('[data-moon-index="0"]').evaluate(element => {
            const animation = element.getAnimations()[0];
            return { duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes().map(frame => frame.transform) };
        });
        assert.equal(moonAnimation.duration, 5000);
        assert(moonAnimation.frames.includes('translateY(-20px)') && moonAnimation.frames.includes('translateY(20px)'));
        const colorAnimation = await page.locator('[data-moon-index="0"] .radiant-moons__phase').evaluate(element => {
            const animation = element.getAnimations().find(animation => animation.animationName === 'radiant-moon-color');
            return { duration: animation.effect.getTiming().duration, colors: animation.effect.getKeyframes().map(frame => frame.color) };
        });
        assert.equal(colorAnimation.duration, 12000);
        assert.deepEqual(colorAnimation.colors, ['rgb(185, 162, 255)', 'rgb(143, 191, 255)', 'rgb(240, 168, 220)', 'rgb(185, 162, 255)', 'rgb(240, 168, 220)', 'rgb(143, 191, 255)', 'rgb(185, 162, 255)']);
        assert.equal(await page.locator('.roll-trigger').textContent(), 'Remember');
        assert.equal(await page.locator('.roll-trigger__memory').count(), 1);
        assert.equal(await page.locator('.roll-trigger').evaluate(element => getComputedStyle(element).animationName), 'remember-gradient');
        await page.waitForTimeout(800);
        await page.locator('#radiantMoons').screenshot({ path: path.join(output, 'v2210-moons-collected.png') });
        await page.locator('.roll-trigger').screenshot({ path: path.join(output, 'v2210-remember.png') });
        assert.equal(await page.evaluate(() => currentLuck), 1);
        assert.equal(await page.locator('#luck-total').isDisabled(), true);
        assert.equal(await page.locator('#luck-preset-panel button:enabled, [data-multi-potion]:enabled, [data-potion-mode]:enabled').count(), 0);
        const savedLuck = await page.evaluate(() => baseLuck);
        await page.evaluate(() => {
            applyLuckValue(600000, { luckSource: 'standard-preset', activateOblivionPreset: true });
            applyLuckDelta(50000, { luckSource: 'standard-preset' });
        });
        assert.equal(await page.evaluate(() => baseLuck), savedLuck, 'Potions cannot be applied during Remember');
        assert.equal(await page.evaluate(() => currentLuck), 1);
        await page.locator('[data-biome-buff="moons"]').click();
        await page.locator('[data-radiant-refresh]').click();
        assert.equal(await page.evaluate(() => radiantForestState.moons), 0);
        assert.equal(await page.locator('.radiant-moons__moon--collected').count(), 0);
        assert.equal(await page.locator('[data-radiant-unlock]:visible').count(), 0);
        assert.equal(await page.locator('#luck-total').isDisabled(), false);
        assert.equal(await page.locator('[data-potion-mode="multiple"]').isDisabled(), false);
        assert.equal(await page.evaluate(() => currentLuck), 1.2, 'Refreshing restores the biome luck');
        await page.locator('#biomeBuffTooltip').screenshot({ path: path.join(output, 'radiant-refresh-buffs.png') });
        await page.keyboard.press('Escape');
        await page.locator('[data-biome-buff="moonCatch"]').click();
        for (let step = 1; step <= 10; step++) {
            await page.locator('[data-lunae-choice]').selectOption(String(step));
            assert.equal(await page.evaluate(() => currentLuck), (100 + step * 2) / 100, 'Selected blessing changes actual luck');
            assert.equal(await page.locator('[data-biome-buff="moonCatch"] [data-lunae-multiplier]').textContent(), `×${(100 + step * 2) / 100}`);
        }
        await page.keyboard.press('Escape');
        await page.evaluate(() => resetBiomeChoice());
        assert.equal(await page.locator('#radiantMoons').isVisible(), false);
        assert.equal(await page.evaluate(() => radiantForestState.moons), 0);
        for (const key of ['dorcelessness', 'sorry', 'yg', 'astrald']) {
            await page.evaluate(key => {
                Object.values(EVENT_BUFF_TOGGLES).forEach(id => document.getElementById(id).checked = false);
                const input = document.getElementById(EVENT_BUFF_TOGGLES[key]);
                input.checked = true;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }, key);
            assert.equal(await page.locator(`[data-biome-buff="${key}"]`).isVisible(), true, key + ' has an active buff');
            await page.locator(`[data-biome-buff="${key}"] img`).evaluate(image => image.decode());
        }
        await page.evaluate(() => {
            Object.values(EVENT_BUFF_TOGGLES).forEach(id => document.getElementById(id).checked = false);
            recomputeLuckValue();
            setChannelVolume('music', 0.5); setChannelVolume('cutscene', 0.6);
            setChannelVolume('obtain', 0.7); setChannelVolume('ui', 0.2);
            document.activeElement.blur();
        });
        await page.keyboard.press('Alt+ArrowUp');
        assert.deepEqual(await page.evaluate(() => ['music','cutscene','obtain','ui'].map(key => appState.audio[key + 'Volume'])), [0.55, 0.65, 0.75, 0.25]);
        assert.equal(await page.locator('#audioMusicVolume').inputValue(), '55');
        assert((await page.locator('#appNotifications').textContent()).includes('Volume up'));
        await page.keyboard.press('Alt+KeyM');
        assert.equal(await page.evaluate(() => appState.audio.masterMuted), true);
        await page.keyboard.press('Alt+ArrowUp');
        assert.equal(await page.evaluate(() => appState.audio.masterMuted), false);
        await page.locator('#luck-total').focus();
        const volume = await page.evaluate(() => appState.audio.musicVolume);
        await page.keyboard.press('Alt+ArrowDown');
        assert.equal(await page.evaluate(() => appState.audio.musicVolume), volume, 'Typing fields keep their keys');
        await page.locator('#luck-total').blur();
        await page.screenshot({ path: path.join(output, 'v2210-volume-notification.png') });
        console.log('Passed: moon phases, Remember, all ten blessing values, event buff icons, volume keys and notifications.');

        for (const [id, duration] of [['tomorrow-cutscene',2000], ['breakthrough-cutscene',5000], ['pukekoGod-cutscene',1000]]) {
            await page.evaluate(() => { appState.audio.roll = false; });
            await play(page, id);
            assert.equal(await page.locator('#cinematic-overlay').getAttribute('data-fade-duration'), String(duration));
            await page.waitForTimeout(Math.min(450, duration / 3));
            const duringFade = await page.evaluate(id => ({
                opacity: Number(getComputedStyle(document.getElementById('cinematic-overlay')).opacity),
                paused: document.getElementById(id).paused,
                controlsBottom: document.getElementById('skip-cinematic-actions').getBoundingClientRect().bottom
            }), id);
            assert(duringFade.opacity > 0 && duringFade.opacity < 1, 'Website fades gradually');
            assert(duringFade.paused, 'Cutscene waits until black');
            assert(duringFade.controlsBottom <= 0, 'Skip buttons begin off-screen');
            await page.waitForFunction(() => window.testPlaybackAt > 0);
            assert(await page.evaluate(duration => window.testPlaybackAt - window.testCutsceneStartedAt >= duration - 80, duration));
            await page.keyboard.press('Tab');
            assert.equal(await page.locator('#skip-cinematic-button').evaluate(button => button === document.activeElement), true, 'Tab reaches hidden controls directly');
            await page.waitForFunction(() => document.getElementById('skip-cinematic-actions').getBoundingClientRect().top >= 0);
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => document.getElementById('skip-cinematic-actions').getBoundingClientRect().bottom <= 0);
            await stopDesktop(page);
        }
        // A skip during the fade must cancel delayed playback and restore the page.
        await play(page, 'breakthrough-cutscene');
        await stopDesktop(page);
        await page.waitForTimeout(550);
        assert.equal(await page.evaluate(() => window.testPlaybackAt), 0);
        for (const name of ['True Jade','True Kyawthuite','True Twilight']) {
            assert.equal(await page.evaluate(name => Boolean(AURA_REGISTRY.find(aura => aura.name.startsWith(name)).cutscene), name), false);
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => setRadiantForestPreset());
        assert.equal(await page.locator('[data-moon-index="0"]').evaluate(element => getComputedStyle(element).animationName), 'none');
        console.log('Passed: actual 2s/5s/1s fades before real playback, keyboard/hover controls, skip during fade, no True Aura cutscenes, and reduced motion.');

        const mobile = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        for (const viewport of [{ width:390,height:844 }, { width:844,height:390 }]) {
            await mobile.setViewportSize(viewport);
            await play(mobile, 'tomorrow-cutscene');
            const eye = mobile.locator('#reveal-cinematic-controls');
            assert.equal(await eye.isVisible(), true);
            assert.equal(await eye.textContent(), '');
            assert.equal(await eye.evaluate(element => getComputedStyle(element).opacity), '0.7');
            await eye.tap();
            assert.equal(await eye.getAttribute('aria-expanded'), 'true');
            await mobile.waitForFunction(() => document.getElementById('skip-cinematic-actions').getBoundingClientRect().top >= 0);
            await mobile.screenshot({ path: path.join(output, `v2210-controls-${viewport.width}.png`) });
            await eye.tap();
            assert.equal(await eye.getAttribute('aria-expanded'), 'false');
            await mobile.waitForFunction(() => document.getElementById('skip-cinematic-actions').getBoundingClientRect().bottom <= 0);
            await eye.tap();
            await mobile.locator('#skip-cinematic-button').tap();
            await mobile.waitForFunction(() => window.testCutsceneDone);
            assert.equal(await mobile.evaluate(() => appState.videoPlaying), false);
        }
        await mobile.evaluate(() => { setRadiantForestPreset(); radiantForestState.moons = 127; syncBiomeBuffs(); });
        await mobile.setViewportSize({ width: 320, height: 740 });
        const sky = await mobile.locator('#radiantMoons').boundingBox();
        assert(sky.x >= 0 && sky.x + sky.width <= 320);
        assert(await mobile.locator('body').evaluate(element => element.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        console.log('Passed: mobile eye controls in portrait/landscape and narrow moon layout, without browser errors.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
