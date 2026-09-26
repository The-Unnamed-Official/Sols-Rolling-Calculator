/* Shared presentation for wiki title art. Probability data stays in main.js. */
(() => {
    'use strict';
    const escape = value => String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const data = globalThis.WikiTitleData;
    const normalize = name => String(name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || String(name || '').trim();
    const auraNames = new Map(Object.keys(data.auras).map(name => [normalize(name), name]));
    const resolveAuraName = name => data.auras[name] ? name : auraNames.get(normalize(name));
    const wrap = (markup, label, kind, tierClass = '') => {
        const art = markup.replace(/(class="wiki-ref-ColorChange-Illusionary"[^>]*>)([^<]+)(<\/span>)/g,
            (_, open, text, close) => open + [...text].map(letter => `<span>${letter}</span>`).join('') + close);
        const simple = kind === 'item' ? '' : `<span class="wiki-title__plain ${escape(tierClass)}" aria-hidden="true">${escape(label)}</span>`;
        return `<span class="sigil-wiki wiki-title wiki-title--${kind}" role="img" aria-label="${escape(label)}"><span class="wiki-title__art" aria-hidden="true">${art}</span>${simple}</span>`;
    };
    const itemAliases = {
        Heavenly: 'Heavenly Potion', Oblivion: 'Oblivion Potion', Godlike: 'Godlike Potion',
        'Red Moon I': 'Red Moon Potion I', 'Red Moon II': 'Red Moon Potion II',
        'Bound Potion': 'Potion of Bound', Bound: 'Potion of Bound', Popping: 'Popping Potion',
        'PLC Device': 'Pole Light Core Device', 'Singularity Device': 'Singularity Gauntlet',
        'Archangel Device': 'Heavenly Device', 'Rune of Heavens': 'Rune of Heaven'
    };
    function aura(name, rarity = '', tierClass = 'rarity-tier-basic') {
        name = resolveAuraName(name);
        const title = data.auras[name];
        if (!title) return '';
        const markup = wrap(title.markup, name, 'aura', tierClass);
        if (!rarity) return markup;
        return `${markup}<span class="aura-tier-detail aura-rarity ${escape(tierClass)}"> - ${escape(rarity)}</span>`;
    }
    function item(name, label = name) {
        const title = data.items[itemAliases[name] || name];
        if (!title) return escape(label);
        // Item references contain styled text only; retain short UI labels inside the same style.
        const template = document.createElement('template');
        template.innerHTML = title.markup;
        const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
        if (nodes.length === 1) nodes[0].textContent = label;
        return wrap(template.innerHTML, label, 'item');
    }
    function initializeItems(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        const elements = [...root.querySelectorAll('[data-wiki-item]')];
        if (root.matches?.('[data-wiki-item]')) {
            elements.unshift(root);
        }
        elements.forEach(element => {
            if (element.dataset.wikiItemRendered) return;
            const label = element.textContent.trim();
            element.innerHTML = item(element.dataset.wikiItem, label);
            element.classList.add('wiki-item-label');
            element.dataset.wikiItemRendered = 'true';
        });
    }
    const visibleLetters = new Set();
    const observedLetters = new WeakSet();
    const effectSelector = '.wiki-ref-ColorChange-Illusionary';
    let timer = null;
    let visualSeed = 761;
    function tick() {
        timer = null;
        const disabled = document.hidden || document.body.matches('.quality-no-roll-sigil-animations,.quality-simple-auras');
        visibleLetters.forEach(element => {
            if (!element.isConnected) { visibility?.unobserve(element); visibleLetters.delete(element); return; }
            const letters = [...element.children];
            letters.forEach(letter => { letter.style.color = ''; });
            if (disabled || Math.floor(performance.now() / 320) % 2) return;
            // Separate visual randomness keeps the simulation's random draws untouched.
            visualSeed = (Math.imul(visualSeed, 1664525) + 1013904223) >>> 0;
            const letter = letters[visualSeed % letters.length];
            if (letter) letter.style.color = element.dataset.color || '#0302d2';
        });
        if (visibleLetters.size && !document.hidden) timer = setTimeout(tick, 100);
    }
    const visibility = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
        entries.forEach(({ target, isIntersecting }) => {
            if (!target.isConnected) { visibility.unobserve(target); observedLetters.delete(target); visibleLetters.delete(target); return; }
            if (isIntersecting) visibleLetters.add(target);
            else { visibleLetters.delete(target); [...target.children].forEach(letter => { letter.style.color = ''; }); }
        });
        if (visibleLetters.size && timer === null) tick();
    }) : null;
    function initializeEffects(root = document) {
        const elements = [...root.querySelectorAll(effectSelector)];
        if (root.matches?.(effectSelector)) elements.push(root);
        elements.forEach(element => {
            if (observedLetters.has(element)) return;
            observedLetters.add(element);
            if (visibility) visibility.observe(element);
        });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && timer === null && visibleLetters.size) tick(); });
    globalThis.WikiTitles = Object.freeze({ aura, item, resolveAuraName, initializeItems, initializeEffects });
})();
