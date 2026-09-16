/* Export the same DOM title artwork, including pseudo-element outlines and fonts. */
(() => {
    'use strict';
    const requests = new Map();
    const get = (url, binary = false) => {
        if (!requests.has(url)) requests.set(url, fetch(url, { signal: AbortSignal.timeout(15000) }).then(async response => {
            if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
            if (!binary) return response.text();
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }).catch(error => { requests.delete(url); throw error; }));
        return requests.get(url);
    };
    function coversText(range, text) {
        if (!range) return true;
        const ranges = range.split(',').map(value => {
            const [first, last = first] = value.trim().replace(/^U\+/i, '').split('-');
            return [parseInt(first.replaceAll('?', '0'), 16), parseInt(last.replaceAll('?', 'F'), 16)];
        });
        return [...text].some(char => ranges.some(([start, end]) => char.codePointAt(0) >= start && char.codePointAt(0) <= end));
    }
    async function fontCssFor(root) {
        const used = new Map();
        for (const element of [root, ...root.querySelectorAll('*')]) {
            if (!element.getClientRects().length) continue;
            for (const pseudo of [null, '::before', '::after']) {
                const style = getComputedStyle(element, pseudo);
                if (pseudo && (!style.content || ['none', 'normal'].includes(style.content))) continue;
                const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
                const key = `${family}|${style.fontStyle}|${style.fontWeight}`;
                const existing = used.get(key) || { family, style: style.fontStyle, weight: Number(style.fontWeight), text: '' };
                existing.text += pseudo ? style.content : element.textContent;
                used.set(key, existing);
            }
        }
        const sheet = [...document.styleSheets].find(sheet => sheet.href?.includes('/wiki-title-fonts.css'));
        const urls = sheet ? [...sheet.cssRules].filter(rule => rule.type === CSSRule.IMPORT_RULE).map(rule => rule.href) : [];
        const responses = await Promise.allSettled(urls.map(url => get(url)));
        const css = responses.filter(response => response.status === 'fulfilled').map(response => response.value).join('\n');
        const rules = (css.match(/@font-face\s*\{[^}]*\}/g) || []).map(rule => {
            const value = property => new RegExp(`${property}:\\s*([^;}]*)`, 'i').exec(rule)?.[1].trim() || '';
            const weights = value('font-weight').split(/\s+/).map(Number);
            return { rule, family: value('font-family').replace(/["']/g, ''), style: value('font-style'),
                min: weights[0] || 400, max: weights[1] || weights[0] || 400, range: value('unicode-range') };
        });
        const selected = new Set();
        for (const font of used.values()) {
            let candidates = rules.filter(rule => rule.family === font.family && rule.style === font.style && coversText(rule.range, font.text));
            if (!candidates.length) candidates = rules.filter(rule => rule.family === font.family && coversText(rule.range, font.text));
            const distance = rule => Math.max(rule.min - font.weight, font.weight - rule.max, 0);
            const closest = Math.min(...candidates.map(distance));
            candidates.filter(rule => distance(rule) === closest).forEach(rule => selected.add(rule.rule));
        }
        const embedded = await Promise.allSettled([...selected].map(async rule => {
            // A font face can offer multiple formats; embedding the first URL is sufficient.
            const url = /url\(['"]?([^)'"\s]+)['"]?\)/.exec(rule)?.[1];
            if (!url) return '';
            const data = await get(url, true);
            return rule.replace(/src:[^;}]+/i, `src:url("${data}")`);
        }));
        return embedded.filter(response => response.status === 'fulfilled').map(response => response.value).join('\n');
    }
    async function blocks(records, maxWidth) {
        await AppRuntime.loadScript('scripts/vendor/html-to-image.js');
        const holder = document.createElement('div');
        holder.setAttribute('aria-hidden', 'true');
        holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${maxWidth}px;pointer-events:none;color:#f5f8ff;font:28px Sarpanch,sans-serif;`;
        const rows = records.map(record => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:12px 10px;line-height:1.65;box-sizing:border-box;';
            if (record.prefix) row.append(document.createTextNode(`${record.prefix} `));
            const name = document.createElement('span');
            const displayName = record.displayName.split(' | Times Rolled:')[0];
            name.innerHTML = formatAuraNameMarkup({ ...record.aura, subtitle: null }, displayName);
            row.append(name);
            const count = document.createElement('span');
            count.style.cssText = 'margin-left:20px;font:500 22px Sarpanch,sans-serif;color:#cfe7ff;white-space:nowrap;display:inline-block;';
            count.textContent = record.countLabel || `Times Rolled: ${formatWithCommas(record.count)}`;
            row.append(count);
            if (record.subtitle) {
                const subtitle = document.createElement('div');
                subtitle.style.cssText = 'font:italic 20px Sarpanch,sans-serif;color:#cfe7ff';
                subtitle.textContent = record.subtitle;
                row.append(subtitle);
            }
            holder.append(row);
            return row;
        });
        document.body.append(holder);
        try {
            await document.fonts.ready;
            const fontEmbedCSS = await fontCssFor(holder);
            const result = [];
            for (const row of rows) {
                const height = Math.ceil(row.getBoundingClientRect().height);
                const canvas = await htmlToImage.toCanvas(row, { fontEmbedCSS, pixelRatio: 1, width: maxWidth, height });
                result.push({ contentHeight: height, gapAfter: 8, draw: (context, x, y) => context.drawImage(canvas, x, y) });
            }
            return result;
        } finally {
            holder.remove();
        }
    }
    globalThis.WikiTitleExport = Object.freeze({ blocks });
})();
