(() => {
    'use strict';
    const root = new URL('../', document.currentScript.src);
    const normalize = name => String(name || '').replace(/\s+-\s+[\d,]+$/, '').trim().toLowerCase().replace(/[^\p{L}\p{N}★]/gu, '');
    // Cache strings only, with limits for both entry count and retained markup.
    // Repeated runs can reuse titles without reparsing or retaining DOM trees.
    const MAX_CACHE_ENTRIES = 128;
    const MAX_CACHE_CHARACTERS = 500_000;
    const markupCache = new Map();
    let cacheCharacters = 0;
    let warnedAboutLinkFailure = false;
    const href = name => {
        const slug = globalThis.AuraRoutes?.[normalize(name)];
        return slug ? new URL(`auras/${slug}/`, root).href : '';
    };
    const remember = (source, url, label, markup) => {
        const previous = markupCache.get(source);
        if (previous) {
            cacheCharacters -= previous.size;
            markupCache.delete(source);
        }
        const size = source.length + markup.length;
        if (size > MAX_CACHE_CHARACTERS) return markup;
        while (markupCache.size >= MAX_CACHE_ENTRIES || cacheCharacters + size > MAX_CACHE_CHARACTERS) {
            const oldest = markupCache.keys().next().value;
            cacheCharacters -= markupCache.get(oldest).size;
            markupCache.delete(oldest);
        }
        markupCache.set(source, { url, label, markup, size });
        cacheCharacters += size;
        return markup;
    };
    const renderLink = (markup, url, label) => {
        const link = document.createElement('a');
        link.className = 'aura-page-link';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.setAttribute('aria-label', label);
        const content = document.createElement('span');
        content.className = 'aura-link-title';
        link.appendChild(content);
        const template = document.createElement('template');
        template.innerHTML = markup;
        const title = template.content.querySelector('.wiki-title--aura');
        if (title) {
            // Chromium 138 rejects outerHTML assignment on fragment children.
            // Replace the node before moving it into its new link.
            title.parentNode.replaceChild(link, title);
            content.appendChild(title);
        } else {
            content.appendChild(template.content);
            template.content.appendChild(link);
        }
        return template.innerHTML;
    };
    const wrap = (name, markup) => {
        const url = href(name);
        if (!url) return markup;
        const source = String(markup);
        const label = `${String(name).replace(/\s+-\s+[\d,]+$/, '')} aura details (opens in a new tab)`;
        const cached = markupCache.get(source);
        if (cached && cached.url === url && cached.label === label) {
            markupCache.delete(source);
            markupCache.set(source, cached);
            return cached.markup;
        }
        try {
            return remember(source, url, label, renderLink(source, url, label));
        } catch (error) {
            // Optional profile links must never prevent completed rolls showing.
            if (!warnedAboutLinkFailure) {
                warnedAboutLinkFailure = true;
                console.warn('Unable to link an aura title; keeping its original markup.', error);
            }
            return markup;
        }
    };
    globalThis.AuraLinks = Object.freeze({ href, wrap });
})();
