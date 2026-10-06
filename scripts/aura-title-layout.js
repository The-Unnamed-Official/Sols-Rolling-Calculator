/* Keep layered wiki titles together and reserve room for their floating text. */
(() => {
    'use strict';
    const titles = new Set();
    const containerSelector = '.aura-card .resource-link__content, .aura-detail__hero h1, [data-roll-feed-entry], .aura-mutation-link .aura-link-title';
    const pending = new Set();
    const containerWidths = new WeakMap();
    const containerTitles = new WeakMap();
    const visible = new WeakSet();
    const fontRequests = new Map();
    const visibility = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) visible.add(target);
        else visible.delete(target);
        containerTitles.get(target)?.forEach(title => {
            title.parentElement.dataset.auraTitleVisibility = isIntersecting ? 'visible' : 'paused';
            if (isIntersecting) queue(title);
        });
    }), { rootMargin: '350px' });
    let scheduled = false;
    const resize = new ResizeObserver(entries => entries.forEach(({ target, contentRect }) => {
        if (containerWidths.get(target) === contentRect.width) return;
        containerWidths.set(target, contentRect.width);
        containerTitles.get(target)?.forEach(queue);
    }));
    function queue(title) {
        pending.add(title);
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            const batch = [...pending];
            pending.clear();
            batch.forEach(title => fit(title));
        });
    }
    function fit(title, eager = false) {
        if (!title.isConnected) {
            titles.delete(title);
            const formerContainer = title.closest(containerSelector);
            const formerTitles = formerContainer && containerTitles.get(formerContainer);
            formerTitles?.delete(title);
            if (formerTitles && !formerTitles.size) {
                resize.unobserve(formerContainer);
                visibility.unobserve(formerContainer);
                containerTitles.delete(formerContainer);
            }
            return;
        }
        const frame = title.parentElement;
        const container = title.closest(containerSelector);
        if (!container || (!eager && !visible.has(container) && !container.closest('[data-aura-title-preload]')) || !container.getBoundingClientRect().width) return;
        title.style.transform = 'none';
        title.style.left = '0px';
        title.style.top = '0px';
        const origin = title.getBoundingClientRect();
        const zoom = origin.width / title.offsetWidth || 1;
        let left = 0, top = 0, right = origin.width / zoom, bottom = origin.height / zoom;
        title.querySelectorAll('span').forEach(layer => {
            const rect = layer.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            left = Math.min(left, (rect.left - origin.left) / zoom);
            top = Math.min(top, (rect.top - origin.top) / zoom);
            right = Math.max(right, (rect.right - origin.left) / zoom);
            bottom = Math.max(bottom, (rect.bottom - origin.top) / zoom);
        });
        const padding = container.closest('.aura-mutations') ? 8 : 3;
        const width = right - left + padding * 2;
        const height = bottom - top + padding * 2;
        const available = container.getBoundingClientRect().width / zoom;
        const scale = Math.min(1, available / width);
        frame.style.width = `${width * scale}px`;
        frame.style.height = `${height * scale}px`;
        title.style.left = `${(padding - left) * scale}px`;
        title.style.top = `${(padding - top) * scale}px`;
        title.style.transform = `scale(${scale})`;
    }
    function initialize(root = document) {
        const found = [...root.querySelectorAll?.('.wiki-title--aura') || []];
        if (root.matches?.('.wiki-title--aura')) found.unshift(root);
        found.forEach(title => {
            const container = title.closest(containerSelector);
            if (!container || titles.has(title)) return;
            if (!titles.has(title)) {
                const existingFrame = title.parentElement.matches('.aura-title-frame');
                const frame = existingFrame ? title.parentElement : document.createElement('span');
                frame.className = 'aura-title-frame';
                frame.dataset.auraTitleVisibility = visible.has(container) ? 'visible' : 'paused';
                if (!existingFrame) { title.before(frame); frame.append(title); }
                titles.add(title);
                if (!containerTitles.has(container)) { containerTitles.set(container, new Set()); resize.observe(container); visibility.observe(container); }
                containerTitles.get(container).add(title);
            }
            queue(title);
        });
    }
    function prepare(root) {
        initialize(root);
        root.querySelectorAll('.wiki-title--aura').forEach(title => fit(title, true));
    }
    async function preload(root = document) {
        prepare(root);
        await globalThis.AuraPageLayout?.titleAssetsReady;
        if (!document.fonts?.load) return;
        const fonts = new Map();
        root.querySelectorAll('.wiki-title--aura').forEach(title => {
            [title, ...title.querySelectorAll('span')].forEach(layer => {
                const style = getComputedStyle(layer);
                if (style.display === 'none' || !layer.textContent.trim()) return;
                const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                if (!fonts.has(font)) fonts.set(font, new Set());
                for (const letter of layer.textContent) fonts.get(font).add(letter);
            });
        });
        await Promise.all([...fonts].map(([font, letters]) => {
            const text = [...letters].sort().join('');
            const key = `${font}\n${text}`;
            if (!fontRequests.has(key)) fontRequests.set(key, document.fonts.load(font, text).catch(()=>[]));
            return fontRequests.get(key);
        }));
        prepare(root);
    }
    function refresh() { titles.forEach(queue); }
    function observeTitles() {
        initialize();
        new MutationObserver(records => records.forEach(record => {
            record.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) initialize(node); });
            record.removedNodes.forEach(node => {
                if (node.nodeType !== Node.ELEMENT_NODE || node.isConnected) return;
                if (node.matches('.wiki-title--aura')) queue(node);
                node.querySelectorAll('.wiki-title--aura').forEach(queue);
            });
        })).observe(document.body, { childList: true, subtree: true });
        new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        document.fonts?.ready.then(refresh);
        document.fonts?.addEventListener('loadingdone', refresh);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeTitles, { once: true });
    else observeTitles();
    globalThis.AuraTitleLayout = Object.freeze({ initialize, refresh, prepare, preload });
})();
