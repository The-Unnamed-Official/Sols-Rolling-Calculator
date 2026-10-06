/* Local profile links shared by the live and aggregated roll feeds. */
(() => {
    'use strict';
    const normalize = name => String(name || '').replace(/\s+-\s+[\d,]+$/, '').trim().toLowerCase().replace(/[^\p{L}\p{N}★]/gu, '');
    const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const href = name => {
        const slug = globalThis.AuraRoutes?.[normalize(name)];
        return slug ? new URL(`auras/${slug}/index.html`, document.baseURI).href : '';
    };
    const wrap = (name, markup) => {
        const url = href(name);
        if (!url) return markup;
        const link = content => `<a class="aura-page-link" href="${escape(url)}" target="_blank" rel="noopener" aria-label="${escape(String(name).replace(/\s+-\s+[\d,]+$/, ''))} aura details (opens in a new tab)"><span class="aura-link-title">${content}</span></a>`;
        const template = document.createElement('template');
        template.innerHTML = markup;
        const title = template.content.querySelector('.wiki-title--aura');
        if (title) {
            // Rarity and subtitle markup remain beside the linked aura name.
            title.outerHTML = link(title.outerHTML);
            return template.innerHTML;
        }
        return link(markup);
    };
    globalThis.AuraLinks = Object.freeze({ href, wrap });
})();
