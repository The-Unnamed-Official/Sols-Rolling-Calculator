(() => {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const palette = Object.freeze({ cyan: '#83ddeb', gold: '#f4c77e', mint: '#95e0b4', violet: '#c8acf0' });
    const navigationCleanup = new WeakMap();
    function duration(value) {
        const seconds = Math.max(0, Number(value) || 0);
        if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
        const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
        if (seconds < 60) return `${number(seconds)} s`;
        return `${Math.floor(seconds / 60)}m ${number(seconds % 60)}s`;
    }
    function metrics(summary) {
        return [
            { key: 'rolls', label: 'Rolls', value: formatWithCommas(summary.rolls || 0), caption: 'Completed rolls', accent: 'cyan' },
            { key: 'duration', label: 'Execution time', value: duration(summary.executionSeconds), caption: 'Calculation time', accent: 'gold' },
            { key: 'xp', label: 'Total XP', value: formatWithCommas(summary.xpTotal || 0), caption: 'XP earned', accent: 'mint' }
        ];
    }
    function sections(summary) {
        const multiple = summary.potionMode === POTION_SIMULATION_MODE.MULTIPLE;
        const potions = [ { label: 'Potion Mode', value: multiple ? 'Multiple' : 'Single' } ];
        if (multiple) potions.push({ label: 'Compatible Potion Stacking', value: summary.potionStackingEnabled ? 'Enabled' : 'Disabled' });
        if (summary.potionBatches?.length) potions.push({ label: 'Potions', value: formatPotionBatchList(summary.potionBatches, { includeLuck: true }) });
        return [
            { key: 'environment', title: 'Environment & filters', accent: 'cyan', fields: [
                { label: 'Biome', value: summary.biomeLabel || 'Normal' },
                { label: 'Rune', value: summary.runeLabel || 'None' },
                { label: 'Time', value: summary.timeLabel || 'Neutral' },
                { label: 'Events', value: summary.eventLabels?.length ? summary.eventLabels.join(', ') : EVENT_SUMMARY_EMPTY_LABEL },
                { label: 'Included Aura Tiers', value: resolveAuraFilterSummaryText(summary) }
            ] },
            { key: 'loadout', title: 'Luck & equipment', accent: 'gold', fields: [
                { label: 'Luck', value: summary.luckLabel || formatWithCommas(summary.luck || 0) },
                { label: 'Equipment', value: (summary.devicePresetName || 'None').split(' · ').join('\n') },
                { label: 'Roll Cycle', value: summary.bonusDescription || 'Not recorded' },
                ...(summary.buffs?.length ? [{ label: 'Buffs', value: summary.buffs.map(buff => buff.label).join('\n') }] : [])
            ] },
            { key: 'potions', title: 'Potion setup', accent: 'violet', fields: potions }
        ];
    }
    function render(summary) {
        const stats = metrics(summary).map(metric => `<dl class="result-summary__metric result-summary__accent--${metric.accent}" data-result-metric="${metric.key}"><dt>${escape(metric.label)}</dt><dd>${escape(metric.value)}</dd><dd class="result-summary__metric-caption">${escape(metric.caption)}</dd></dl>`).join('');
        const groups = sections(summary).map(section => `<div class="result-summary__group result-summary__accent--${section.accent}" data-result-section="${section.key}"><h3>${escape(section.title)}</h3><dl>${section.fields.map(field => `<div class="result-summary__field"><dt>${escape(field.label)}</dt><dd>${fieldMarkup(field, summary)}</dd></div>`).join('')}</dl></div>`).join('');
        const milestones = summary.xpLines?.length ? `<div class="result-summary__milestones"><h3>Milestones</h3><ul>${summary.xpLines.map(line => `<li>${escape(line)}</li>`).join('')}</ul></div>` : '';
        return `<div class="result-summary" data-result-summary role="region" aria-label="Run summary"><div class="result-summary__heading"><h2>Run summary</h2><span>Setup &amp; rewards</span></div><div class="result-summary__metrics">${stats}</div><div class="result-summary__groups">${groups}</div>${milestones}</div>`;
    }
    function fieldMarkup(field, summary) {
        const badge = (label, className = '') => `<span class="result-summary__badge ${escape(className)}">${escape(label)}</span>`;
        const icon = (source, markup) => `<span class="result-summary__sigil">${source ? `<img src="${escape(source)}" width="24" height="24" alt="">` : ''}${markup}</span>`;
        if (field.label === 'Biome') {
            const id = summary.primaryBiomeId || summary.biomeId;
            const style = BIOME_SIGIL_CLASS_OVERRIDES[id] || '';
            return icon(id && id !== 'normal' ? getBiomeIconSource(id) : '', `<span class="${escape(style)}">${escape(field.value)}</span>`);
        }
        if (field.label === 'Rune' && summary.runeId && summary.runeId !== 'none') {
            const [label, ...note] = String(field.value).split(' (');
            return icon(resolveRuneConfiguration(summary.runeId)?.icon, WikiTitles.item(label)) + (note.length ? `<small class="result-summary__note">(${escape(note.join(' ('))}</small>` : '');
        }
        if (field.label === 'Time') {
            const id = summary.timeId || String(field.value).toLowerCase();
            return badge(field.value, ['day', 'night'].includes(id) ? `sigil-outline-${id}` : '');
        }
        if (field.label === 'Events' && summary.eventLabels?.length) {
            return `<span class="result-summary__items">${summary.eventLabels.map((label, index) => {
                const event = EventData[summary.eventIds?.[index]] || Object.values(EventData).find(event => event.label === label);
                return badge(label, event?.sigilClass);
            }).join('')}</span>`;
        }
        if (field.label === 'Included Aura Tiers') {
            if (['ALL', 'None'].includes(field.value)) return badge(field.value, 'result-summary__filter');
            return `<span class="result-summary__items">${(summary.auraFilterTiers || String(field.value).split(', ')).map(label => {
                const tier = AURA_TIER_FILTERS.find(tier => formatAuraTierLabel(tier) === label);
                return badge(label, tier?.className);
            }).join('')}</span>`;
        }
        if (field.label === 'Luck') return `<span class="equipment-effect equipment-effect--luck result-summary__luck">${escape(field.value)}</span>`;
        if (field.label === 'Buffs') return `<span class="result-summary__buffs">${summary.buffs.map(buff => icon(buff.icon, EquipmentPresentation.format(buff.label))).join('')}</span>`;
        if (field.label === 'Roll Cycle') return EquipmentPresentation.format(field.value);
        if (field.label === 'Equipment' && summary.equipment) {
            return `<span class="result-summary__equipment">${Object.entries(summary.equipment).map(([slot, id]) => `<span><small>${escape(slot === 'pocket' ? 'Pocket' : slot === 'left' ? 'Left' : 'Right')}</small> ${EquipmentPresentation.name(GearLuck.find(slot, id))}${slot === 'pocket' && id !== 'none' && summary.primaryBiomeId === 'limbo' ? ' <small>(inactive in Limbo)</small>' : ''}</span>`).join('')}</span>`;
        }
        if (field.label === 'Potions') {
            return `<span class="result-summary__potions">${summary.potionBatches.map(batch => {
                const labels = batch.potionLabels || (String(batch.id).startsWith('stacked:') ? String(batch.id).slice(8).split('+').map(id => MULTI_POTION_CONFIG_BY_ID.get(id)?.label || id) : [batch.label]);
                return `<span>${labels.map(label => WikiTitles.item(label)).join(' + ')} <span class="equipment-effect equipment-effect--cycle">×${escape(formatWithCommas(batch.count))}</span><small class="equipment-effect equipment-effect--luck">${escape(formatWithCommas(batch.luckValue))} Luck</small></span>`;
            }).join('')}</span>`;
        }
        if (field.label === 'Potion Mode' || field.label === 'Compatible Potion Stacking') return badge(field.value, 'result-summary__mode');
        return escape(field.value);
    }
    function attachFeedNavigation(feed) {
        navigationCleanup.get(feed)?.();
        feed.querySelectorAll('[data-result-navigation], [data-result-scroll-space]').forEach(element => element.remove());
        const summary = feed.querySelector('[data-result-summary]');
        if (!summary) return;
        summary.id = 'simulation-statistics';
        summary.tabIndex = -1;
        const navigation = document.createElement('div');
        navigation.className = 'roll-feed__statistics-nav';
        navigation.dataset.resultNavigation = '';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'interface-button roll-feed__statistics-button';
        button.textContent = 'Statistics ↓';
        button.setAttribute('aria-controls', summary.id);
        button.setAttribute('aria-label', 'Jump to this simulation’s statistics');
        const spacer = document.createElement('div');
        spacer.dataset.resultScrollSpace = '';
        spacer.setAttribute('aria-hidden', 'true');
        const controller = new AbortController();
        let frame = 0;
        const cancel = () => { cancelAnimationFrame(frame); frame = 0; };
        navigationCleanup.set(feed, () => { cancel(); controller.abort(); });
        for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) feed.addEventListener(name, cancel, { passive: true, signal: controller.signal });
        function target() {
            spacer.style.height = '0px';
            const bounds = feed.getBoundingClientRect();
            const heading = summary.querySelector('h2') || summary;
            const scale = bounds.height / feed.offsetHeight || 1;
            const inset = feed.clientTop + parseFloat(getComputedStyle(feed).paddingTop);
            const top = Math.max(0, feed.scrollTop + (heading.getBoundingClientRect().top - bounds.top) / scale - inset);
            spacer.style.height = `${Math.max(0, Math.ceil(top - (feed.scrollHeight - feed.clientHeight)))}px`;
            return top;
        }
        button.addEventListener('click', () => {
            cancel();
            const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('reduce-motion');
            const start = feed.scrollTop;
            const started = performance.now();
            let settled = 0;
            function step(now) {
                if (!navigation.isConnected || !summary.isConnected) return;
                const progress = reduced ? 1 : Math.min(1, (now - started) / 260);
                const top = target();
                feed.scrollTo({ top: start + (top - start) * (1 - (1 - progress) ** 3), behavior: 'instant' });
                settled = progress === 1 && Math.abs(feed.scrollTop - top) < 1 ? settled + 1 : 0;
                if (settled < 3 && now - started < 1000) frame = requestAnimationFrame(step);
                else frame = 0;
            }
            frame = requestAnimationFrame(step);
            summary.focus({ preventScroll: true });
        }, { signal: controller.signal });
        navigation.append(button);
        feed.prepend(navigation);
        feed.append(spacer);
    }
    function text(summary, markdown = false) {
        const heading = value => markdown ? `**${value}**` : value.toUpperCase();
        const field = (label, value) => markdown ? `> **${label}:** ${String(value).replaceAll('\n', ' · ')}` : `${label}: ${String(value).replaceAll('\n', ' · ')}`;
        const lines = [heading('Run summary'), ...metrics(summary).map(metric => field(metric.label, metric.value))];
        for (const section of sections(summary)) {
            lines.push('', heading(section.title), ...section.fields.map(item => field(markdown && item.label === 'Included Aura Tiers' ? 'Included Tiers' : item.label, item.value)));
        }
        if (summary.xpLines?.length) lines.push('', heading('Milestones'), ...summary.xpLines.map(line => markdown ? `* ${line}` : line));
        return lines.join('\n');
    }
    globalThis.ResultSummary = Object.freeze({ palette, duration, metrics, sections, render, text, attachFeedNavigation });
})();
