const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const seedScript = `globalThis.drawEntropy = (() => { let seed = 19313; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); })();`;
let server, browser, origin;

test.before(async () => {
    const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webm':'video/webm', '.mp3':'audio/mpeg', '.ogg':'audio/ogg'};
    server = http.createServer((request, response) => {
        let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://local').pathname));
        if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end();
        try {
            if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            const stat = fs.statSync(file), range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
            const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
            const headers = {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Content-Length':end-start+1, 'Accept-Ranges':'bytes'};
            if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
            response.writeHead(range ? 206 : 200, headers);
            if (request.method === 'HEAD') response.end();
            else fs.createReadStream(file, {start, end}).pipe(response);
        } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless:true, args:['--autoplay-policy=no-user-gesture-required']});
});
test.after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function open(route, { fallback = false } = {}) {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, request => request.abort());
    await page.route('**/scripts/core/utils.js?*', async request => {
        await request.fulfill({contentType:'text/javascript', body:fs.readFileSync(path.join(root,'scripts/core/utils.js'),'utf8')+'\n'+seedScript});
    });
    await page.addInitScript(({fallback}) => {
        localStorage.setItem('solsRollingCalculator:lastSeenChangelogVersion','v2.218');
        localStorage.setItem('solsRollingCalculator:fullscreenCutscenePrompt:v2.216','true');
        localStorage.setItem('solsRollingCalculator:audioSettings', JSON.stringify({masterMuted:true}));
        if (fallback) globalThis.Worker = undefined;
    }, {fallback});
    await page.goto(origin + route);
    if (route.startsWith('/auras')) await page.waitForFunction(() => document.documentElement.dataset.auraLayout === 'ready');
    else await page.waitForFunction(() => typeof simulationActive !== 'undefined');
    return {page, context, errors};
}
async function simulate(page, {gear='none', biome='normal', multiple=false, method='unnamed', total=20003} = {}) {
    await page.evaluate(({gear,biome,multiple,method,total,seedScript}) => {
        (0,eval)(seedScript);
        // Cutscene playback is verified separately; isolate numeric comparisons.
        playAuraSequence = async () => {};
        equippedGear.left = gear;
        equippedGear.right = 'singularity';
        const select = document.getElementById('biome-primary-dropdown');
        select.value = biome; select.dispatchEvent(new Event('change', {bubbles:true}));
        applyLuckValue(17);
        setSimulationMethod(method, {playAudio:false});
        rollingSettingsPreference.solsLikeRollsPerSecond = 1000;
        setPotionSimulationMode(multiple?'multiple':'single', {playAudio:false});
        if (multiple) {
            for (const input of document.querySelectorAll('[data-multi-potion]')) setNumericInputValue(input, 0);
            setNumericInputValue(document.querySelector('[data-multi-potion="heavenly"]'), 37);
            setNumericInputValue(document.querySelector('[data-multi-potion="bound"]'), 43);
            syncMultiplePotionTotal();
        }
        startRollSimulation({totalOverride:total,bypassRotationPrompt:true,bypassRollWarning:true});
    }, {gear,biome,multiple,method,total,seedScript});
    await page.waitForFunction(() => !simulationActive, null, {timeout:15000});
    return page.evaluate(() => ({counts:Array.from(auraWinCounts), rolls:lastSimulationSummary?.rolls,
        luck:lastSimulationSummary?.luckLabel, xp:lastSimulationSummary?.xpTotal, biome:lastSimulationSummary?.biomeId}));
}

test('Potato Land shares the simulator styles, keeps custom controls, and disables effects', async () => {
    const {page,context,errors} = await open('/rotatosimulator');
    const info = await page.evaluate(() => ({mode:MINIMAL_SIMULATOR, animations:document.getAnimations().length,
        styles:[...document.styleSheets].map(sheet=>new URL(sheet.href).pathname),
        resources:performance.getEntriesByType('resource').map(entry=>entry.name),
        motion:appState.reduceMotion, quality:appState.qualityPreferences,
        primaryVisible:document.getElementById('biome-primary-dropdown').getAttribute('aria-hidden') !== 'true'}));
    assert.equal(info.mode,true); assert.equal(info.motion,true); assert.equal(info.animations,0);
    assert.equal(info.primaryVisible,true);
    for (const stylesheet of ['/styles/core/base.css','/styles/core/layout.css','/styles/components/components.css','/styles/core/minimal.css']) assert.ok(info.styles.includes(stylesheet));
    assert.equal(info.resources.some(url=>/theUnnamed-flipped\.gif|videos\/biomes/.test(url)),false);
    assert.equal(await page.locator('details[data-select="biome-primary-dropdown"] summary').isVisible(),true);
    assert.equal(await page.locator('#qualityPreferencesOverlay [data-quality-option]').count(),1);
    assert.equal(await page.locator('#qualityPreferencesOverlay [data-quality-option]').getAttribute('data-quality-option'),'disableWikiAuraStyles');
    assert.equal(await page.locator('#stickyRollButtonToggle').count(),1);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.interface-backdrop')).backgroundImage.includes('normalBiomeImage'));
    assert.equal(await page.locator('.interface-backdrop video').count(),0);
    assert.equal(await page.locator('.surface').first().evaluate(element=>getComputedStyle(element).borderRadius),'0px');
    assert.ok((await page.locator('.surface').first().evaluate(element=>getComputedStyle(element).backgroundImage)).includes('linear-gradient'));
    await page.selectOption('#biome-primary-dropdown','glitch');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.interface-backdrop')).backgroundImage.includes('/minimal/glitchBiomeImage.webp'));
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    const fullSettingsBefore = await page.evaluate(()=>localStorage.getItem('solsRollingCalculator:visualSettings'));
    await page.evaluate(()=>{toggleReducedMotion(); applyQualityPreferencesState();});
    assert.equal(await page.evaluate(()=>appState.reduceMotion),true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('solsRollingCalculator:visualSettings')),fullSettingsBefore);
    for (const width of [390, 1440]) {
        await page.setViewportSize({width,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
    }
    assert.deepEqual(errors,[]);
    await context.close();
});
test('full and minimal simulators return identical seeded results in workers and fallback, including equipment and potions', async () => {
    const full = await open('/');
    const minimal = await open('/rotatosimulator/', {fallback:true});
    for (const scenario of [
        {gear:'none'}, {gear:'gravitational'}, {gear:'darkshader'}, {gear:'gemstone'},
        {gear:'unfathomable'}, {gear:'tide',biome:'rainy'}, {gear:'gemstone',multiple:true},
        {gear:'tide',biome:'glitch'}, {gear:'gemstone',biome:'radiantForest'}, {gear:'darkshader',biome:'limbo'},
        {gear:'darkshader',method:'sols-like',total:25}
    ]) {
        const expected = await simulate(full.page,scenario), actual = await simulate(minimal.page,scenario);
        assert.ok(expected.rolls>0,JSON.stringify(scenario));
        assert.deepEqual(actual,expected,JSON.stringify(scenario));
    }
    assert.deepEqual(full.errors,[]); assert.deepEqual(minimal.errors,[]);
    await full.context.close(); await minimal.context.close();
});
test('minimal cutscenes load, play, and skip using root media paths', async () => {
    const {page,context,errors} = await open('/rotatosimulator/');
    await page.evaluate(() => {globalThis.cutsceneFinished=false; void playAuraVideo('trolled-cutscene',{force:true}).then(()=>{globalThis.cutsceneFinished=true;});});
    await page.waitForFunction(()=>{const video=document.getElementById('trolled-cutscene');return !video.paused && video.currentTime>0;},null,{timeout:10000});
    assert.ok((await page.locator('#trolled-cutscene').evaluate(video=>video.currentSrc)).includes('/files/videos/cutscenes/'));
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    if (await page.locator('#reveal-cinematic-controls').isVisible()) await page.locator('#reveal-cinematic-controls').click();
    else await page.locator('#skip-cinematic-controls').hover();
    await page.locator('#skip-cinematic-button').click();
    await page.waitForFunction(()=>cutsceneFinished);
    assert.equal(await page.locator('#trolled-cutscene').evaluate(video=>video.paused),true);
    assert.deepEqual(errors,[]);
    await context.close();
});
test('minimal controls support parameter navigation, potion inputs, pause, resume and cancellation', async () => {
    const {page,context,errors} = await open('/rotatosimulator/', {fallback:true});
    await page.locator('.parameter-console').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.control-section--cta--floating'));
    await page.locator('#rollDockParametersButton').click();
    assert.ok(await page.evaluate(()=>scrollY)>0);
    await page.locator('[data-potion-mode="multiple"]').click();
    assert.equal(await page.locator('[data-multi-potion="heavenly"]').isVisible(),true);
    await page.locator('[data-potion-mode="single"]').click();
    await page.locator('[data-simulation-method="sols-like"]').click();
    await page.evaluate(()=>{playAuraSequence=async()=>{}; rollingSettingsPreference.solsLikeRollsPerSecond=10; setNumericInputValue(document.getElementById('roll-total'),1000);});
    await page.locator('.roll-trigger').click();
    await page.locator('#rollPauseButton').click();
    assert.equal(await page.locator('#rollPauseButton').getAttribute('aria-label'),'Resume rolling');
    assert.equal(await page.locator('#rollPauseButton i').getAttribute('class'),'fa-solid fa-play');
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    await page.locator('#rollPauseButton').click();
    assert.equal(await page.locator('#rollPauseButton').getAttribute('aria-label'),'Pause rolling');
    await page.locator('#rollCancelButton').click();
    await page.waitForFunction(()=>!simulationActive);
    assert.deepEqual(errors,[]);
    await context.close();
});
test('Potato Land matches panel placement, button sizes, dropdowns and settings at desktop and mobile sizes', async () => {
    const full=await open('/'), minimal=await open('/rotatosimulator/');
    const selectors=['.interface-header','.interface-layout','.feed-console','.roll-console','.parameter-console','.preset-console',
        '.roll-trigger','#optionsMenuToggle','#helpCenterToggle','details[data-select="biome-primary-dropdown"] summary',
        'details[data-select="vip-dropdown"] summary','[data-potion-mode="single"]','[data-simulation-method="sols-like"]'];
    const geometry=page=>page.evaluate(selectors=>Object.fromEntries(selectors.map(selector=>{
        const element=document.querySelector(selector),rect=element.getBoundingClientRect();
        return [selector,{x:rect.x,y:rect.y,width:rect.width,height:rect.height}];
    })),selectors);
    for(const width of [1440,768,390]) {
        await full.page.setViewportSize({width,height:1000}); await minimal.page.setViewportSize({width,height:1000});
        for(const page of [full.page,minimal.page]) await page.evaluate(()=>scrollTo(0,0));
        await full.page.waitForTimeout(350);
        const expected=await geometry(full.page),actual=await geometry(minimal.page);
        for(const selector of selectors) for(const dimension of ['x','y','width','height']) {
            assert.ok(Math.abs(actual[selector][dimension]-expected[selector][dimension])<1,`${width}px ${selector} ${dimension}: ${actual[selector][dimension]} vs ${expected[selector][dimension]}`);
        }
    }
    await full.page.setViewportSize({width:1440,height:1000}); await minimal.page.setViewportSize({width:1440,height:1000});
    for(const page of [full.page,minimal.page]) {
        await page.locator('#optionsMenuToggle').click();
        await page.locator('#audioSettingsButton').click();
        await page.waitForTimeout(350);
    }
    const rect=page=>page.locator('#audioSettingsOverlay [role="dialog"]').boundingBox();
    const expected=await rect(full.page),actual=await rect(minimal.page);
    for(const dimension of ['x','y','width','height']) assert.ok(Math.abs(actual[dimension]-expected[dimension])<1,`Audio settings ${dimension}`);
    assert.deepEqual(full.errors,[]); assert.deepEqual(minimal.errors,[]);
    await full.context.close(); await minimal.context.close();
});
test('returning to the last session restores current aura artwork across both pages and repairs old text-only sessions', async()=>{
    const {page,context,errors}=await open('/');
    const expected=await page.evaluate(()=>{
        const aura=AURA_REGISTRY.find(aura=>aura.name.startsWith('Sovereign'));
        auraWinCounts.fill(0); auraWinCounts[aura.index]=3;
        feedContainer.innerHTML=`<span data-roll-feed-entry data-aura-name="${encodeURIComponent(aura.name)}">${formatRollFeedAuraNameMarkup(aura)}<span class="aura-count"> | Times Rolled: 3</span></span>`;
        const artwork=feedContainer.querySelector('.wiki-title__art').innerHTML;
        SessionReturn.save();
        return {name:aura.name,artwork};
    });
    for(const route of ['/rotatosimulator/','/']) {
        await page.goto(origin+route);
        await page.locator('#sessionReturnButton').click();
        await page.waitForFunction(()=>document.querySelector('#simulation-feed .wiki-title__art'));
        assert.equal(await page.locator('#simulation-feed .wiki-title__art').first().innerHTML(),expected.artwork);
        assert.equal(await page.locator('#simulation-feed .aura-count').textContent(),' | Times Rolled: 3');
        assert.equal(await page.evaluate(name=>auraWinCounts[AURA_BY_NAME.get(name).index],expected.name),3);
        await page.evaluate(()=>SessionReturn.save());
    }
    await page.evaluate(()=>{
        feedContainer.querySelectorAll('.wiki-title').forEach(title=>title.replaceWith(document.createTextNode(title.getAttribute('aria-label'))));
        SessionReturn.save();
    });
    await page.reload();
    await page.locator('#sessionReturnButton').click();
    await page.waitForFunction(()=>document.querySelector('#simulation-feed .wiki-title__art'));
    assert.equal(await page.locator('#simulation-feed .wiki-title__art').first().innerHTML(),expected.artwork);
    assert.deepEqual(errors,[]);
    await context.close();
});
test('Potato Land buttons are centered and reveal a full-screen static Potato Land preview', async()=>{
    const {page,context,errors}=await open('/');
    const button=page.locator('.resource-panel [data-potato-portal]');
    const portalBox=await button.boundingBox(), hubBox=await page.locator('.resource-panel').boundingBox();
    assert.ok(Math.abs(portalBox.x+portalBox.width/2-hubBox.x-hubBox.width/2)<1);
    const styling=await button.evaluate(element=>({font:getComputedStyle(element).fontFamily,decoration:getComputedStyle(element).textDecorationLine}));
    assert.ok(styling.font.includes('Sarpanch')); assert.equal(styling.decoration,'none');
    await button.hover();
    await page.waitForSelector('.potato-preview--visible');
    await page.waitForTimeout(1000);
    const lens=await page.locator('.potato-preview').evaluate(element=>{
        const style=getComputedStyle(element),rect=element.getBoundingClientRect();
        const frame=element.querySelector('iframe'),target=frame.contentDocument;
        return {width:rect.width,height:rect.height,filter:style.backdropFilter,mask:style.maskImage,opacity:style.opacity,
            mode:target.documentElement.dataset.simulatorMode,animations:target.getAnimations().length,
            shadow:target.defaultView.getComputedStyle(target.querySelector('.surface')).boxShadow,
            scripts:target.querySelectorAll('script,audio,video').length};
    });
    assert.equal(lens.width,1440); assert.equal(lens.height,1000); assert.equal(lens.filter,'none');
    assert.equal(lens.mode,'minimal'); assert.equal(lens.animations,0); assert.equal(lens.scripts,0); assert.equal(lens.shadow,'none');
    assert.ok(lens.mask.includes('radial-gradient')); assert.equal(lens.opacity,'1');
    await page.mouse.move(0,0);
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.potato-preview').count(),0);
    assert.deepEqual(errors,[]);
    await context.close();
});
test('directory search, sorting, filters, page size and pagination remain functional', async () => {
    const {page,context,errors} = await open('/auras/');
    await page.locator('#aura-search').fill('star');
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('q')==='star');
    assert.ok(await page.locator('#aura-list [data-aura-row]').count()>0);
    assert.equal(await page.locator('#aura-list [data-aura-row]').evaluateAll(rows=>rows.every(row=>row.dataset.search.includes('star'))),true);
    await page.selectOption('#aura-sort','alphabetical-descending');
    await page.locator('#aura-clear-filters').click();
    await page.evaluate(()=>AuraDirectoryPreferences.usePageSize(9));
    assert.equal(await page.locator('#aura-list [data-aura-row]').count(),9);
    await page.locator('[data-aura-pagination] [data-page-step="1"]').first().click();
    assert.equal(new URL(page.url()).searchParams.get('page'),'2');
    const href = await page.locator('#aura-list a.aura-page-link').first().getAttribute('href');
    assert.equal(new URL(new URL(href).searchParams.get('return'),origin).searchParams.get('page'),'2');
    assert.deepEqual(errors,[]);
    await context.close();
});
test('Tomorrow has its full current profile, gallery, soundtrack history, and directory return state', async () => {
    const {page,context,errors} = await open('/auras/?q=Tomorrow');
    await page.route('https://static.wikia.nocookie.net/**', async route => {
        if (route.request().resourceType() === 'image') await route.fulfill({contentType:'image/gif', body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
        else await route.abort();
    });
    assert.equal(await page.locator('#aura-list [data-aura-row]').count(),1);
    await page.locator('#aura-list a.aura-page-link').click();
    await page.waitForFunction(()=>document.documentElement.dataset.auraLayout==='ready');
    const current=page.locator('#aura-version-panel-0');
    assert.ok((await current.locator('[data-aura-description]').textContent()).includes('[Cycle 8,128]'));
    assert.ok((await current.locator('[data-aura-description]').textContent()).length>1000);
    assert.ok((await current.textContent()).includes('After collecting The 7 Radiant Moons'));
    assert.equal(await current.locator('[data-image-frame]').count(),2);
    await current.locator('[data-image-choice="1"]').click();
    await page.waitForFunction(()=>document.querySelector('#aura-version-panel-0 [data-image-choice="1"]').getAttribute('aria-pressed')==='true');
    assert.ok(await current.locator('[data-showcase-src]').count()>0);
    assert.ok((await current.locator('audio').getAttribute('data-soundtrack-src')).includes('Piano'));
    await current.locator('[data-description-toggle]').click();
    assert.equal(await current.locator('[data-description-toggle]').getAttribute('aria-expanded'),'true');
    await page.getByRole('tab',{name:'Previous soundtrack',exact:true}).click();
    assert.equal(await current.isVisible(),false);
    assert.ok((await page.locator('#aura-version-panel-1 audio').getAttribute('data-soundtrack-src')).includes('Firefly'));
    await page.locator('[data-aura-directory-return]').click();
    await page.waitForFunction(()=>document.querySelector('#aura-search')?.value==='Tomorrow');
    assert.equal(new URL(page.url()).searchParams.get('q'),'Tomorrow');
    assert.deepEqual(errors,[]);
    await context.close();
});

test('published Radiant and new event profiles show current requirements and replace pending records', async () => {
    const catalogue=JSON.parse(fs.readFileSync(path.join(root,'data/auras/catalogue.json'),'utf8'));
    for(const name of ['Tomorrow','True Jade','True Twilight','True Kyawthuite','Cor Lunae','Moonchild','Watcher','Rekindle','Nightshade','Withered','Butcher','Duke']) {
        const entry=catalogue.find(entry=>entry.title===name);
        assert.ok(entry, name); assert.ok(!entry.wikiPending&&!entry.mediaPending,name);
    }
    const {page,context,errors}=await open('/auras/true-jade/');
    assert.ok((await page.locator('.aura-facts').textContent()).includes('After rolling all Jade variants'));
    assert.ok((await page.locator('.aura-facts').textContent()).includes('10,250,000'));
    assert.ok((await page.locator('[data-aura-details]').first().textContent()).includes('Biome exclusive'));
    const cor=catalogue.find(entry=>entry.title==='Cor Lunae'),moonchild=catalogue.find(entry=>entry.title==='Moonchild');
    assert.equal(cor.tier,'Exalted'); assert.equal(moonchild.tier,'Mythic');
    assert.equal(catalogue.find(entry=>entry.title==='Withered').kind,'Event');
    assert.equal(catalogue.find(entry=>entry.title==='Butcher').kind,'Event');
    assert.deepEqual(errors,[]);
    await context.close();
});

test('Tomorrow waits for the remaining staggered moon reveals, without delaying settled or reduced-motion moons', async()=>{
    const {page,context,errors}=await open('/');
    await page.selectOption('#biome-primary-dropdown','radiantForest');
    await page.evaluate(()=>document.getElementById('radiantMoons').getBoundingClientRect());
    const queue=async({existing=0,reduced=false}={})=>page.evaluate(({existing,reduced})=>{
        globalThis.tomorrowObserved=null;
        playAuraSequence=async queue=>{
            if(queue.includes('tomorrow-cutscene')) globalThis.tomorrowObserved={at:performance.now(),pending:document.getElementById('radiantMoons').getAnimations({subtree:true}).filter(animation=>animation.playState==='running'&&Number.isFinite(animation.effect.getComputedTiming().endTime)).length};
        };
        if(existing) {
            appState.reduceMotion=true; applyReducedMotionState(true);
            radiantForestState={moons:existing,rewardClaimed:false}; syncBiomeBuffs();
            document.getElementById('radiantMoons').getBoundingClientRect();
            resetRadiantMoonSounds(existing);
        }
        appState.reduceMotion=reduced; applyReducedMotionState(reduced);
        document.getElementById('radiantMoons').getBoundingClientRect();
        radiantForestState={moons:127,rewardClaimed:false};
        syncBiomeBuffs();
        const start=performance.now(),deadline=radiantMoonRevealEndsAt;
        void waitForRadiantMoonReveals().then(()=>playAuraSequence(['tomorrow-cutscene']));
        return {start,deadline};
    },{existing,reduced});
    const all=await queue();
    assert.ok(all.deadline-all.start>3500,'Seven new moons reserve the 500ms stagger and final reveal');
    await page.waitForFunction(()=>tomorrowObserved!==null,null,{timeout:8000});
    let observed=await page.evaluate(()=>tomorrowObserved);
    assert.ok(observed.at>=all.deadline-40,'Tomorrow cannot fade before the final reveal completes');
    assert.equal(observed.pending,0);
    await page.waitForFunction(()=>!simulationActive);
    const settled=await queue();
    await page.waitForFunction(()=>tomorrowObserved!==null,null,{timeout:1500});
    observed=await page.evaluate(()=>tomorrowObserved);
    assert.ok(observed.at-settled.start<800,'Already revealed moons add no artificial delay');
    await page.waitForFunction(()=>!simulationActive);
    const last=await queue({existing:63});
    assert.ok(last.deadline-last.start>600&&last.deadline-last.start<1000,'Only the final new moon remains');
    await page.waitForFunction(()=>tomorrowObserved!==null,null,{timeout:2500});
    observed=await page.evaluate(()=>tomorrowObserved);
    assert.ok(observed.at>=last.deadline-40);
    assert.equal(observed.pending,0);
    await page.waitForFunction(()=>!simulationActive);
    const reduced=await queue({existing:63,reduced:true});
    await page.waitForFunction(()=>tomorrowObserved!==null,null,{timeout:1500});
    observed=await page.evaluate(()=>tomorrowObserved);
    assert.ok(observed.at-reduced.start<800,'Reduced motion does not wait for disabled animations');
    assert.deepEqual(errors,[]);
    await context.close();
});
test('Radiant Moon sounds start at 500ms intervals and overlap instead of waiting for ended', async()=>{
    const {page,context,errors}=await open('/');
    await page.selectOption('#biome-primary-dropdown','radiantForest');
    await page.evaluate(()=>{
        globalThis.moonStarts=[];
        isSoundChannelActive=category=>category==='effects';
        for(let ordinal=1;ordinal<=7;ordinal++) {
            const audio=document.getElementById(`radiantMoonSound${ordinal}`);
            audio.play=()=>{moonStarts.push({ordinal,at:performance.now()});return Promise.resolve();};
        }
        resetRadiantMoonSounds(0);
        radiantForestState={moons:7,rewardClaimed:false};
        syncBiomeBuffs();
    });
    await page.waitForFunction(()=>moonStarts.length===3,null,{timeout:2500});
    const sound=await page.evaluate(()=>({starts:moonStarts,active:activeRadiantMoonSounds.size}));
    assert.equal(sound.active,3,'Earlier moon sounds are still active when later sounds start');
    for(let index=1;index<3;index++) assert.ok(Math.abs(sound.starts[index].at-sound.starts[index-1].at-500)<120);
    await page.evaluate(()=>resetRadiantMoonSounds(0));
    assert.equal(await page.evaluate(()=>activeRadiantMoonSounds.size),0);
    assert.deepEqual(errors,[]);
    await context.close();
});
test('Challenged aura wrappers do not paint a second clipped copy of their title artwork', async()=>{
    const {page,context,errors}=await open('/');
    const result=await page.evaluate(()=>{
        const rows=[];
        for(const tier of ['challenged','challenged-plus']) {
            const aura=AURA_REGISTRY.find(aura=>resolveAuraDisplayTierKey(aura)===tier&&WikiTitles.resolveAuraName(aura.name.split(' - ')[0]));
            if(!aura) throw new Error(`Missing styled ${tier} fixture`);
            rows.push(`<span class="aura-tier-detail rarity-tier-${tier}" data-roll-feed-entry>${formatAuraNameMarkup(aura)}<span class="aura-count rarity-tier-${tier}"> | Times Rolled: 1</span></span>`);
        }
        feedContainer.innerHTML=rows.join('');
        return [...feedContainer.querySelectorAll('[data-roll-feed-entry]')].map(row=>({
            wrapper:getComputedStyle(row).backgroundImage,
            titles:row.querySelectorAll('.wiki-title--aura').length,
            fallbackHidden:row.querySelector('.wiki-title__plain').hidden,
            count:getComputedStyle(row.querySelector('.aura-count')).backgroundImage
        }));
    });
    for(const row of result) {assert.equal(row.wrapper,'none');assert.equal(row.titles,1);assert.equal(row.fallbackHidden,true);assert.ok(row.count.includes('linear-gradient'));}
    assert.deepEqual(errors,[]);
    await context.close();
});
test('a completed Radiant run waits for manual Remember, enforces five seconds, and preserves the session with Tomorrow pinned first', async()=>{
    const {page,context,errors}=await open('/',{fallback:true});
    await page.selectOption('#biome-primary-dropdown','radiantForest');
    await page.evaluate(()=>{
        playAuraSequence=async queue=>{if(queue.includes('tomorrow-cutscene')) globalThis.tomorrowPlayed=true;};
        globalThis.tomorrowPlayed=false;
        const selection=collectBiomeSelectionState();
        const prepared=prepareEquipmentSimulation([{count:1000000,baseLuck,label:'Test run'}],selection,{
            eventChecker:aura=>!getAuraEventIds(aura).length||getAuraEventIds(aura).some(id=>enabledEvents.has(id)),enabledEventsSet:enabledEvents
        },false);
        const first=prepared.batches[prepared.sequencePlan[0].pattern[0]],samples=[];
        let moons=0;
        for(const auraIndex of RADIANT_FOREST_CONFIG.moonIndices) {
            const combined=first.radiantSelections[SimulationCore.radiantUnlockMask({moons})];
            const index=combined.auraIndices.indexOf(auraIndex);
            if(index<0) throw new Error('Moon is missing from the test selection');
            const low=index?combined.selection.cumulativeWeights[index-1]:0;
            samples.push((low+combined.selection.cumulativeWeights[index])/2);
            moons|=1<<RADIANT_FOREST_CONFIG.moonIndices.indexOf(auraIndex);
        }
        drawEntropy=()=>samples.length?samples.shift():.999999999;
        globalThis.midRunMoons=null;
        const original=SimulationCore;
        globalThis.SimulationCore={...original,createRunner(...args){
            const runner=original.createRunner(...args),radiant=args[5];
            return {
                get currentRoll(){return runner.currentRoll;},get done(){return runner.done;},get checkpoint(){return runner.checkpoint;},
                runSlice(...sliceArgs){
                    const count=runner.runSlice(...sliceArgs);
                    if(radiant?.state.moons===127&&!runner.done&&!midRunMoons) globalThis.midRunMoons={display:radiantForestState.moons,sounds:radiantMoonSoundTimers.size,cooldown:radiantRememberReadyAt};
                    return count;
                }
            };
        }};
        startRollSimulation({totalOverride:1000000,bypassRotationPrompt:true,bypassRollWarning:true});
    });
    await page.waitForFunction(()=>!simulationActive&&radiantForestState.moons===127,null,{timeout:10000});
    const before=await page.evaluate(()=>({rolls:lastSimulationSummary.rolls,counts:Array.from(auraWinCounts),claimed:radiantForestState.rewardClaimed,played:tomorrowPlayed,
        remaining:radiantRememberReadyAt-Date.now(),color:getComputedStyle(document.querySelector('.roll-trigger__remember-cooldown')).backgroundColor,
        opacity:getComputedStyle(document.querySelector('.roll-trigger__remember-cooldown')).opacity}));
    assert.equal(before.rolls,1000000); assert.equal(before.claimed,false); assert.equal(before.played,false);
    assert.deepEqual(await page.evaluate(()=>midRunMoons),{display:0,sounds:0,cooldown:0},'Bulk moon visuals, sounds and Remember must remain unregistered before completion');
    assert.ok(before.remaining>0&&before.remaining<=5000); assert.equal(before.color,'rgb(51, 51, 51)'); assert.equal(before.opacity,'0.6');
    assert.equal(await page.locator('.roll-trigger').isDisabled(),true);
    await page.keyboard.press('Control+Enter');
    assert.equal(await page.evaluate(()=>radiantForestState.rewardClaimed),false);
    await page.waitForFunction(()=>!document.querySelector('.roll-trigger').disabled,null,{timeout:7000});
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(()=>radiantForestState.rewardClaimed);
    const after=await page.evaluate(()=>({rolls:lastSimulationSummary.rolls,counts:Array.from(auraWinCounts),index:AURA_BY_NAME.get(RADIANT_REWARD_AURA_NAME).index,played:tomorrowPlayed}));
    assert.equal(after.rolls,1000001); assert.equal(after.played,true); assert.equal(after.counts[after.index],1);
    after.counts.forEach((count,index)=>{if(index!==after.index)assert.equal(count,before.counts[index]);});
    for(const mode of ['rarity','rarity-ascending','alphabetical','alphabetical-descending']) {
        await page.evaluate(mode=>applyRollFeedSort(mode),mode);
        assert.equal(await page.locator('#simulation-feed [data-roll-feed-entry]').first().getAttribute('data-aura-name'),'Tomorrow');
    }
    assert.deepEqual(errors,[]);
    await context.close();
});
