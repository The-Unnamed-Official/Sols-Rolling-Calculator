(() => {
    'use strict';
    const requests = new Map();
    const get = (url, binary = false, signal) => {
        signal?.throwIfAborted();
        const key = `${binary ? 'font' : 'css'}:${url}`;
        const cached = requests.get(key);
        if (cached && !cached.signal?.aborted) return AppRuntime.abortable(cached.promise, signal);
        const request = { signal };
        const timeout = AbortSignal.timeout(15000);
        request.promise = fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout }).then(async response => {
            if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
            if (!binary) return response.text();
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }).then(value => { request.signal = null; return value; }).catch(error => {
            if (requests.get(key) === request) requests.delete(key);
            throw error;
        });
        requests.set(key, request);
        return AppRuntime.abortable(request.promise, signal);
    };
    function coversText(range, text) {
        if (!range) return true;
        const ranges = range.split(',').map(value => {
            const [first, last = first] = value.trim().replace(/^U\+/i, '').split('-');
            return [parseInt(first.replaceAll('?', '0'), 16), parseInt(last.replaceAll('?', 'F'), 16)];
        });
        return [...text].some(char => ranges.some(([start, end]) => char.codePointAt(0) >= start && char.codePointAt(0) <= end));
    }
    async function fontCssFor(root, signal) {
        signal?.throwIfAborted();
        const used = new Map();
        for (const element of [root, ...root.querySelectorAll('*')]) {
            if (!element.getClientRects().length) continue;
            for (const pseudo of [null, '::before', '::after']) {
                const style = getComputedStyle(element, pseudo);
                if (pseudo && (!style.content || ['none', 'normal'].includes(style.content))) continue;
                const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
                const key = `${family}|${style.fontStyle}|${style.fontWeight}`;
                const existing = used.get(key) || { family, style: style.fontStyle, weight: Number(style.fontWeight) || 400, text: '' };
                existing.text += pseudo ? style.content : element.textContent;
                used.set(key, existing);
            }
        }
        const sources = [];
        const visited = new Set();
        async function collect(url) {
            signal?.throwIfAborted();
            const resolved = new URL(url, document.baseURI);
            if (!['http:', 'https:', 'data:'].includes(resolved.protocol) || visited.has(resolved.href)) return;
            visited.add(resolved.href);
            const css = await get(resolved.href, false, signal);
            for (const rule of css.match(/@font-face\s*\{[^}]*\}/gi) || []) sources.push({ rule, base: resolved.href });
            const imports = [...css.matchAll(/@import\s+(?:url\(\s*)?["']?([^\s"'();]+)["']?\s*\)?[^;]*;/gi)];
            await AppRuntime.abortable(Promise.allSettled(imports.map(match => collect(new URL(match[1], resolved.href).href))), signal);
        }
        const pending = [];
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    if (rule.type === CSSRule.IMPORT_RULE) pending.push(collect(rule.href));
                    else if (rule.type === CSSRule.FONT_FACE_RULE) sources.push({ rule: rule.cssText, base: sheet.href || document.baseURI });
                }
            } catch {
                if (sheet.href) pending.push(collect(sheet.href));
            }
        }
        await AppRuntime.abortable(Promise.allSettled(pending), signal);
        signal?.throwIfAborted();
        const rules = sources.map(({ rule, base }) => {
            const value = property => new RegExp(`${property}:\\s*([^;}]*)`, 'i').exec(rule)?.[1].trim() || '';
            const weights = value('font-weight').split(/\s+/).map(Number);
            return { rule, base, family: value('font-family').replace(/["']/g, '').trim(), style: value('font-style') || 'normal',
                min: weights[0] || 400, max: weights[1] || weights[0] || 400, range: value('unicode-range') };
        });
        const selected = new Set();
        for (const font of used.values()) {
            let candidates = rules.filter(rule => rule.family === font.family && rule.style === font.style && coversText(rule.range, font.text));
            if (!candidates.length) candidates = rules.filter(rule => rule.family === font.family && coversText(rule.range, font.text));
            const distance = rule => Math.max(rule.min - font.weight, font.weight - rule.max, 0);
            const closest = Math.min(...candidates.map(distance));
            candidates.filter(rule => distance(rule) === closest).forEach(rule => selected.add(rule));
        }
        const embedded = await AppRuntime.abortable(Promise.allSettled([...selected].map(async ({ rule, base, family }) => {
            const url = /url\(['"]?([^)'"\s]+)['"]?\)/.exec(rule)?.[1];
            if (!url) return null;
            const data = await get(new URL(url, base).href, true, signal);
            return { css: rule.replace(/src:[^;}]+/i, `src:url("${data}")`), family };
        })), signal);
        const faces = embedded.filter(response => response.status === 'fulfilled' && response.value).map(response => response.value);
        return { css: faces.map(face => face.css).join('\n'), families: new Set(faces.map(face => face.family.toLowerCase())) };
    }
    async function prepare(holder, signal) {
        signal?.throwIfAborted();
        holder.querySelectorAll('.rarity-tier-challenged,.rarity-tier-challenged-plus').forEach(element => {
            element.style.animation = 'none';
            element.style.backgroundPosition = '50% 50%';
        });
        let fontTimeout;
        try {
            await AppRuntime.abortable(Promise.race([document.fonts.ready, new Promise(resolve => { fontTimeout = setTimeout(resolve, 3000); })]), signal);
        } finally { clearTimeout(fontTimeout); }
        const fonts = await fontCssFor(holder, signal);
        if (fonts.css) {
            const embeddedStyle = document.createElement('style');
            embeddedStyle.textContent = fonts.css;
            holder.prepend(embeddedStyle);
            const needed = new Map();
            for (const element of holder.querySelectorAll('*')) {
                if (!element.getClientRects().length) continue;
                const style = getComputedStyle(element);
                const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
                if (!fonts.families.has(family) || !element.textContent) continue;
                const spec = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                const request = needed.get(spec) || { family, text: '' };
                request.text += element.textContent;
                needed.set(spec, request);
            }
            await AppRuntime.abortable(Promise.all([...needed].map(async ([spec, request]) => {
                let timeout;
                try {
                    const loaded = await AppRuntime.abortable(Promise.race([document.fonts.load(spec, request.text), new Promise((_, reject) => {
                        timeout = setTimeout(() => reject(new Error('Export font timed out')), 3000);
                    })]), signal);
                    if (!loaded.length) fonts.families.delete(request.family);
                } catch { signal?.throwIfAborted(); fonts.families.delete(request.family); }
                finally { clearTimeout(timeout); }
            })), signal);
        }
        const systemFonts = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'arial', 'times new roman', 'courier new']);
        for (const element of [holder, ...holder.querySelectorAll('*')]) {
            if (!element.getClientRects().length) continue;
            const family = getComputedStyle(element).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
            if (!fonts.families.has(family) && !systemFonts.has(family)) element.style.setProperty('font-family', 'Arial, sans-serif', 'important');
        }
        globalThis.AuraTitleLayout?.prepare(holder);
        return fonts.css;
    }
    async function capture(element, width, { signal } = {}) {
        signal?.throwIfAborted();
        await AppRuntime.abortable(AppRuntime.loadScript('scripts/vendor/html-to-image.js'), signal);
        const holder = document.createElement('div');
        holder.dataset.imageExport = '';
        holder.setAttribute('aria-hidden', 'true');
        holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;pointer-events:none;`;
        holder.append(element);
        document.body.append(holder);
        try {
            const fontEmbedCSS = await prepare(holder, signal);
            const height = Math.ceil(element.getBoundingClientRect().height);
            const canvas = await AppRuntime.abortable(htmlToImage.toCanvas(element, { fontEmbedCSS, skipFonts: true, pixelRatio: 1, width, height }), signal);
            signal?.throwIfAborted();
            canvas.getContext('2d').getImageData(0, 0, 1, 1);
            return { contentHeight: height, gapAfter: 0, draw: (context, x, y) => context.drawImage(canvas, x, y) };
        } finally { holder.remove(); }
    }
    async function blocks(records, maxWidth, { onProgress = () => {}, signal } = {}) {
        signal?.throwIfAborted();
        await AppRuntime.abortable(AppRuntime.loadScript('scripts/vendor/html-to-image.js'), signal);
        const holder = document.createElement('div');
        holder.dataset.imageExport = '';
        holder.setAttribute('aria-hidden', 'true');
        holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${maxWidth}px;pointer-events:none;color:#f5f8ff;font:28px Sarpanch,sans-serif;`;
        let previousTier = null;
        const rows = records.map(record => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:12px 10px;line-height:1.65;box-sizing:border-box;';
            const tierKey = record.tierKey || resolveAuraDisplayTierKey(record.aura, record.biome ?? null);
            const tierClass = `rarity-tier-${tierKey}`;
            const eventSigilClass = typeof resolveEventAuraSigilClass === 'function'
                ? resolveEventAuraSigilClass(record.aura)
                : '';
            const countClass = [tierClass, eventSigilClass].filter(Boolean).join(' ');
            if (tierKey !== previousTier) {
                const heading = createAuraTierHeading(tierKey);
                if (heading) { heading.style.fontSize = '20px'; row.append(heading); }
            }
            previousTier = tierKey;
            const statistics = document.createElement('div');
            statistics.style.cssText = 'display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 20px;margin-top:8px;font:500 22px Sarpanch,sans-serif;';
            if (record.prefix) {
                const prefix = document.createElement('span');
                prefix.className = `aura-tier-detail aura-native ${countClass}`;
                prefix.textContent = `${record.prefix} `;
                statistics.append(prefix);
            }
            const name = document.createElement('div');
            name.dataset.shareAuraTitle = '';
            name.style.cssText = 'display:block;width:100%;min-width:0;padding:8px 12px;box-sizing:border-box;';
            const displayName = record.displayName.split(' | Times Rolled:')[0];
            name.innerHTML = formatAuraNameMarkup({ ...record.aura, subtitle: null }, displayName, record.biome ?? null);
            name.querySelectorAll('.aura-rarity').forEach(rarity => {
                rarity.style.cssText = 'font:500 22px Sarpanch,sans-serif;';
                statistics.append(rarity);
            });
            row.append(name);
            const count = document.createElement('span');
            count.className = `aura-tier-detail aura-count ${countClass}`;
            count.style.cssText = 'font:500 22px Sarpanch,sans-serif;white-space:normal;display:inline-block;';
            count.textContent = record.countLabel || `Times Rolled: ${formatWithCommas(record.count)}`;
            statistics.append(count);
            row.append(statistics);
            if (record.subtitle) {
                const subtitle = document.createElement('div');
                subtitle.className = `aura-tier-detail ${tierClass}`;
                subtitle.style.cssText = 'font:italic 20px Sarpanch,sans-serif';
                subtitle.textContent = record.subtitle;
                row.append(subtitle);
            }
            if (record.potionSource) {
                const details = document.createElement('div');
                details.style.cssText = 'font:500 20px Sarpanch,sans-serif;color:#cfe7ff;';
                details.textContent = record.potionSource;
                row.append(details);
            }
            holder.append(row);
            return row;
        });
        document.body.append(holder);
        try {
            const fontEmbedCSS = await prepare(holder, signal);
            const result = [];
            for (const row of rows) {
                signal?.throwIfAborted();
                const height = Math.ceil(row.getBoundingClientRect().height);
                const canvas = await AppRuntime.abortable(htmlToImage.toCanvas(row, { fontEmbedCSS, skipFonts: true, pixelRatio: 1, width: maxWidth, height }), signal);
                signal?.throwIfAborted();
                canvas.getContext('2d').getImageData(0, 0, 1, 1);
                result.push({ contentHeight: height, gapAfter: 8, draw: (context, x, y) => context.drawImage(canvas, x, y) });
                onProgress(result.length / rows.length);
            }
            return result;
        } finally {
            holder.remove();
        }
    }
    globalThis.WikiTitleExport = Object.freeze({ blocks, capture });
})();
