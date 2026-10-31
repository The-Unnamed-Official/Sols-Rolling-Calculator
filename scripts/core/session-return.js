(() => {
    'use strict';
    const storageKey = 'solsRollingCalculator:recentSession:v1';
    const lifetime = 15 * 60 * 1000;
    const controls = ['biome-primary-dropdown', 'biome-other-dropdown', 'biome-time-dropdown',
        'vip-dropdown', 'dave-luck-dropdown', 'dev-biomes-toggle', 'multiPotionStackToggle',
        ...Object.values(EVENT_BUFF_TOGGLES)];
    const sessionId = globalThis.crypto?.randomUUID?.() || String(Date.now());
    let active = false;
    let restoring = false;
    let pending = null;
    let saveTimer = null;
    let expiryTimer = null;
    let runProgress = { completed: 0, total: 0 };
    const finite = (value, fallback = 0, maximum = Number.MAX_VALUE) =>
        Number.isFinite(value) && value >= 0 ? Math.min(value, maximum) : fallback;
    const read = () => {
        try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; }
    };
    function isRecent(snapshot) {
        const age = Date.now() - snapshot?.savedAt;
        return snapshot?.version === 1 && snapshot.setup && typeof snapshot.setup === 'object'
            && snapshot.setup.controls && typeof snapshot.setup.controls === 'object'
            && Number.isFinite(age) && age >= 0 && age < lifetime;
    }
    function hidePrompt() {
        document.getElementById('sessionReturnPrompt').hidden = true;
        clearTimeout(expiryTimer);
    }
    function discard() {
        const stored = read();
        if (pending && stored?.sessionId === pending.sessionId && stored.savedAt === pending.savedAt) {
            try { localStorage.removeItem(storageKey); } catch {}
        }
        pending = null;
        hidePrompt();
    }
    function capture() {
        const feed = document.getElementById('simulation-feed');
        return {
            version: 1, sessionId, savedAt: Date.now(),
            setup: {
                controls: Object.fromEntries(controls.map(id => {
                    const element = document.getElementById(id);
                    return [id, element?.type === 'checkbox' ? element.checked : element?.value];
                })),
                events: [...enabledEvents], gear: { ...equippedGear },
                baseLuck, singleSpecialLuck, additionalBasicBuffs, currentLuckSelectionSource,
                potionMode: potionSimulationMode, method: simulationMethod,
                rolls: getNumericInputValue(document.getElementById('roll-total'), { min: 0 }),
                singleRolls: singlePotionRollValue,
                potions: Object.fromEntries([...document.querySelectorAll('[data-multi-potion]')]
                    .map(input => [input.dataset.multiPotion, getNumericInputValue(input, { min: 0 })])),
                presets: { oblivion: oblivionPresetEnabled, pumpkin: pumpKingsBloodPresetEnabled,
                    tutorial: tutorialPotionPresetEnabled, dune: dunePresetEnabled, blood: activeBloodPresetIdentifier },
                devVariants: { ...devAdminAbuseVariantSelections }, blessing: corLunaeBlessingMultiplier,
                radiant: { ...radiantForestState }
            },
            results: {
                html: feed?.innerHTML.length <= 1200000 ? feed.innerHTML : '',
                counts: AURA_REGISTRY.filter(aura => readAuraWinCount(aura) > 0)
                    .map(aura => [aura.name, readAuraWinCount(aura)]),
                summary: simulationActive ? null : lastSimulationSummary, scroll: feed?.scrollTop || 0
            },
            run: { ...runProgress, active: simulationActive }, scroll: window.scrollY
        };
    }
    function save() {
        if (!active || restoring || pending) return;
        try {
            const snapshot = capture();
            try { localStorage.setItem(storageKey, JSON.stringify(snapshot)); }
            catch {
                snapshot.results.summary = null;
                try { localStorage.setItem(storageKey, JSON.stringify(snapshot)); }
                catch {
                    snapshot.results.html = '';
                    localStorage.setItem(storageKey, JSON.stringify(snapshot));
                }
            }
        } catch {}
    }
    function safeMarkup(value) {
        const template = document.createElement('template');
        template.innerHTML = typeof value === 'string' ? value.slice(0, 1200000) : '';
        const allowed = new Set(['SPAN', 'DIV', 'P', 'BR', 'STRONG', 'B', 'I', 'EM', 'SMALL',
            'A', 'IMG', 'UL', 'OL', 'LI', 'H2', 'H3', 'DL', 'DT', 'DD']);
        const root = new URL('./', location.href);
        for (const element of [...template.content.querySelectorAll('*')]) {
            if (!allowed.has(element.tagName)) { element.remove(); continue; }
            for (const attribute of [...element.attributes]) {
                const name = attribute.name;
                if (name === 'style') {
                    for (const property of [...element.style]) {
                        const value = element.style.getPropertyValue(property);
                        const supported = /^(?:color|background(?:-clip|-image|-size|-position)?|font(?:-family|-size|-weight|-style)?|text-(?:align|shadow|transform|decoration)|-webkit-(?:text-fill-color|text-stroke(?:-width|-color)?|background-clip)|letter-spacing|line-height|display|position|top|left|right|bottom|width|height|transform|transform-origin|filter|opacity|animation(?:-name|-duration|-delay|-iteration-count|-timing-function)?)$/.test(property);
                        if (!supported || /url\s*\(|expression|javascript:|@import|\\/i.test(value)
                            || (property === 'position' && !['relative', 'absolute', 'static'].includes(value))) {
                            element.style.removeProperty(property);
                        }
                    }
                } else if (name === 'href' || name === 'src') {
                    try {
                        const url = new URL(attribute.value, root);
                        if (!url.href.startsWith(root.href) || url.username || url.password
                            || (name === 'src' && !url.pathname.includes('/files/images/'))) element.removeAttribute(name);
                    } catch { element.removeAttribute(name); }
                } else if (!['class', 'title', 'role', 'alt', 'width', 'height', 'hidden'].includes(name)
                    && !/^(?:aria-|data-aura-|data-roll-feed-|data-result-|data-text|data-gradient|data-color|data-width)/.test(name)) {
                    element.removeAttribute(name);
                }
            }
        }
        return template;
    }
    function cleanSummary(value, depth = 0) {
        if (depth > 8) return null;
        if (typeof value === 'string') return value.includes('<') ? safeMarkup(value).innerHTML : value.slice(0, 20000);
        if (Array.isArray(value)) return value.slice(0, 1000).map(item => cleanSummary(item, depth + 1));
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key))
            .map(([key, item]) => [key, cleanSummary(item, depth + 1)]));
        return value;
    }
    function restore() {
        if (!isRecent(pending)) { discard(); return; }
        if (simulationActive || isAuraCutscenePlaybackActive()) return;
        const snapshot = pending;
        const setup = snapshot.setup;
        restoring = true;
        try {
            hidePrompt();
            radiantForestState = SimulationCore.createRadiantState();
            resetRadiantMoonSounds();
            syncBiomeBuffs();
            const dev = document.getElementById('dev-biomes-toggle');
            dev.checked = setup.controls['dev-biomes-toggle'] === true;
            dev.dispatchEvent(new Event('change', { bubbles: true }));
            document.querySelectorAll('[data-event-id]').forEach(input => {
                setEventToggleState(input.dataset.eventId, Array.isArray(setup.events) && setup.events.includes(input.dataset.eventId));
            });
            for (const [slot, items] of Object.entries(GearLuck.catalog)) {
                equippedGear[slot] = items.some(item => item.id === setup.gear?.[slot]) ? setup.gear[slot] : 'none';
            }
            baseLuck = finite(setup.baseLuck, 1);
            singleSpecialLuck = Math.min(baseLuck, finite(setup.singleSpecialLuck));
            additionalBasicBuffs = finite(setup.additionalBasicBuffs);
            setNumericInputValue(document.getElementById('equipment-basic-buffs'), additionalBasicBuffs, { format: true, min: 0 });
            setLuckSelectionSource(setup.currentLuckSelectionSource);
            const presets = setup.presets || {};
            oblivionPresetEnabled = presets.oblivion === true;
            pumpKingsBloodPresetEnabled = presets.pumpkin === true;
            tutorialPotionPresetEnabled = presets.tutorial === true;
            dunePresetEnabled = presets.dune === true;
            activeBloodPresetIdentifier = getBloodPresetConfig(presets.blood) ? presets.blood : null;
            syncLuckPotionButtonState('luck-preset-oblivion', oblivionPresetEnabled);
            syncLuckPotionButtonState('luck-preset-pump-kings-blood', pumpKingsBloodPresetEnabled);
            syncLuckPotionButtonState('luck-preset-tutorial-potion', tutorialPotionPresetEnabled);
            syncLuckPotionButtonState('luck-preset-dune', dunePresetEnabled);
            Object.values(BLOOD_PRESET_CONFIGS).forEach(config => syncLuckPotionButtonState(config.buttonId, config.identifier === activeBloodPresetIdentifier));
            for (const id of controls) {
                if (id.startsWith('biome-') || id === 'dev-biomes-toggle') continue;
                const element = document.getElementById(id);
                const value = setup.controls[id];
                if (!element) continue;
                if (element.type === 'checkbox') element.checked = value === true;
                else if ([...element.options].some(option => option.value === value)) element.value = value;
                refreshCustomSelect(id);
            }
            for (const [biome, variant] of Object.entries(setup.devVariants || {})) {
                if (DEV_ADMIN_ABUSE_CONFIGS[biome]?.variants?.[variant]) devAdminAbuseVariantSelections[biome] = variant;
            }
            setPrimaryBiomeSelection(setup.controls['biome-primary-dropdown']);
            setOtherBiomeSelection(setup.controls['biome-other-dropdown']);
            setTimeBiomeSelection(setup.controls['biome-time-dropdown']);
            updateBiomeControlConstraints({ source: null });
            document.querySelectorAll('[data-multi-potion]').forEach(input => {
                setNumericInputValue(input, Math.floor(finite(setup.potions?.[input.dataset.multiPotion], 0, 1e12)), { format: true, min: 0 });
            });
            setSimulationMethod(setup.method, { playAudio: false });
            setPotionSimulationMode(setup.potionMode, { playAudio: false });
            singlePotionRollValue = Math.max(1, Math.floor(finite(setup.singleRolls, 1, 1e12)));
            setNumericInputValue(document.getElementById('roll-total'), Math.floor(finite(setup.rolls, 1, 1e12)), { format: true, min: 0 });
            const blessing = document.getElementById('cor-lunae-blessing-dropdown');
            const option = [...blessing.options].find(option => Number(option.value) === setup.blessing);
            if (option) { blessing.value = option.value; corLunaeBlessingMultiplier = Number(option.value); refreshCustomSelect(blessing.id); }
            if (document.getElementById(BIOME_PRIMARY_SELECT_ID).value === 'radiantForest') {
                const moons = Math.floor(finite(setup.radiant?.moons, 0, 127));
                radiantForestState = { moons, rewardClaimed: moons === 127 && setup.radiant?.rewardClaimed === true };
                resetRadiantMoonSounds(moons);
            }
            recomputeLuckValue();
            auraWinCounts.fill(0);
            for (const entry of Array.isArray(snapshot.results?.counts) ? snapshot.results.counts : []) {
                if (!Array.isArray(entry)) continue;
                const aura = AURA_BY_NAME.get(entry[0]);
                if (aura) auraWinCounts[aura.index] = Math.floor(finite(entry[1], 0, 1e12));
            }
            const feed = document.getElementById('simulation-feed');
            feed.replaceChildren(safeMarkup(snapshot.results?.html).content);
            if (!feed.textContent.trim() && auraWinCounts.some(count => count > 0)) {
                const biome = collectBiomeSelectionState().canonicalBiome;
                const entries = buildResultEntries(AURA_REGISTRY, biome, new Map(), currentLuck,
                    { allowTrueChance: false, winCounts: auraWinCounts });
                feed.append(safeMarkup(entries.feedRecords.map(record => record.markup).join('<br>')).content);
            }
            if (snapshot.run?.active) {
                const status = document.createElement('p');
                status.className = 'live-roll-feed__status';
                status.textContent = 'Your previous rolling session stopped when the page closed. Your setup, moon progress and recorded results are restored.';
                feed.append(status);
            }
            lastSimulationSummary = snapshot.results?.summary && typeof snapshot.results.summary === 'object'
                ? cleanSummary(snapshot.results.summary) : null;
            ResultSummary.attachFeedNavigation(feed);
            updateLayeredSigilText(feed);
            setRollFeedSortingAvailable(Boolean(feed.querySelector('[data-roll-feed-entry]')), { supportsRecent: false });
            runProgress = { completed: finite(snapshot.run?.completed), total: finite(snapshot.run?.total) };
            requestAnimationFrame(() => {
                window.scrollTo({ top: finite(snapshot.scroll), behavior: 'instant' });
                feed.scrollTop = finite(snapshot.results?.scroll);
            });
            pending = null;
            active = true;
            showAppNotification('Previous session restored.', { id: 'session-return' });
        } catch {
            showAppNotification('The saved session could not be restored completely.', { id: 'session-return' });
            discard();
        } finally {
            restoring = false;
            save();
        }
    }
    function recordActivity(event) {
        if (restoring || !event.isTrusted || !(event.target instanceof Element)
            || !event.target.closest('.roll-console,.parameter-console,.preset-console,.feed-console,#biomeBuffs')
            || event.target.closest('#sessionReturnPrompt')) return;
        if (pending) discard();
        active = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 350);
    }
    function initialize() {
        pending = read();
        if (isRecent(pending)) {
            document.getElementById('sessionReturnPrompt').hidden = false;
            expiryTimer = setTimeout(discard, lifetime - (Date.now() - pending.savedAt));
        } else { pending = null; hidePrompt(); }
        document.getElementById('sessionReturnButton').addEventListener('click', restore);
        document.getElementById('sessionReturnDismiss').addEventListener('click', discard);
        for (const event of ['click', 'input', 'change']) document.addEventListener(event, recordActivity);
        window.addEventListener('pagehide', save);
        document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
        window.addEventListener('pageshow', event => { if (event.persisted && pending && !isRecent(pending)) discard(); });
        setInterval(() => { if (simulationActive) save(); }, 2000);
    }
    globalThis.SessionReturn = Object.freeze({
        save: () => { active = true; save(); },
        progress: (completed, total) => {
            if (pending) discard();
            active = true;
            runProgress = { completed: finite(completed), total: finite(total) };
        }
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
})();
