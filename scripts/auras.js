/* Progressive enhancement for the static aura directory and profile pages. */
(() => {
    'use strict';
    function styleTitles(root) { root.querySelectorAll('[data-aura-title]:not([data-aura-title-rendered])').forEach(element => {
        const tier = globalThis.AuraTiers?.resolve(element.dataset.auraTier, Number(element.dataset.auraRarity)) || 'basic';
        const markup = globalThis.WikiTitles?.aura(element.dataset.auraTitle, '', `rarity-tier-${tier}`);
        if (markup) element.innerHTML = markup;
        element.dataset.auraTitleRendered = 'true';
    }); globalThis.WikiTitles?.initializeEffects(root); }
    document.querySelectorAll('[data-aura-description]').forEach(description => {
        const toggle = description.closest('.aura-description')?.querySelector('[data-description-toggle]');
        if (!toggle) return;
        let expanded = false;
        function sizeDescription() {
            if (description.closest('[hidden]')) return;
            description.classList.remove('aura-description__text--collapsed');
            const fullHeight = description.getBoundingClientRect().height;
            const collapsedHeight = Number.parseFloat(getComputedStyle(description).lineHeight) * 3;
            toggle.hidden = fullHeight <= collapsedHeight + 1;
            description.classList.toggle('aura-description__text--collapsed', !expanded && !toggle.hidden);
        }
        toggle.addEventListener('click', () => {
            expanded = !expanded;
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.textContent = expanded ? 'Show Less' : 'Show More';
            sizeDescription();
        });
        let lastWidth = 0;
        new ResizeObserver(([entry]) => {
            if (entry.contentRect.width === lastWidth) return;
            lastWidth = entry.contentRect.width;
            sizeDescription();
        }).observe(description);
        document.fonts?.ready.then(sizeDescription);
        description.closest('.aura-version-panel')?.addEventListener('aura-version-change', sizeDescription);
        sizeDescription();
    });
    const list = document.getElementById('aura-list');
    if (!list) {
        styleTitles(document);
        if (globalThis.AuraPageLayout) globalThis.AuraPageLayout.titlesReady = globalThis.AuraTitleLayout?.preload(document);
        return;
    }
    const rows = [...list.querySelectorAll('[data-aura-row]')];
    const titlePreload = document.createElement('ol');
    titlePreload.className = `${list.className} aura-title-preload`;
    titlePreload.dataset.auraTitlePreload = '';
    titlePreload.setAttribute('aria-hidden', 'true');
    titlePreload.inert = true;
    list.after(titlePreload);
    new ResizeObserver(([entry]) => { titlePreload.style.width = `${entry.contentRect.width}px`; }).observe(list);
    let preloadRequest = 0;
    const sort = document.getElementById('aura-sort');
    const search = document.getElementById('aura-search');
    const count = document.getElementById('aura-result-count');
    const empty = document.getElementById('aura-empty');
    const filters = [...document.querySelectorAll('[data-aura-filter]')];
    const parameters = new URL(location.href).searchParams;
    const filterParameters = {'aura-biome':'biome','aura-kind':'type','aura-event':'event','aura-tier':'tier'};
    const pagination = [...document.querySelectorAll('[data-aura-pagination]')];
    let pageSize = globalThis.AuraDirectoryPreferences?.getPageSize() || 18;
    const requestedPage = Number(parameters.get('page'));
    let page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    let totalPages = 1;
    const requestedSize = Number(parameters.get('size'));
    if (Number.isInteger(requestedSize) && requestedSize >= 9 && requestedSize <= 90 && requestedSize % 3 === 0) {
        pageSize = requestedSize;
        globalThis.AuraDirectoryPreferences?.usePageSize(pageSize);
    }
    const requestedScroll = Number(parameters.get('scroll'));
    const savedScroll = Number.isFinite(requestedScroll) && requestedScroll > 0 ? requestedScroll : 0;
    search.value = parameters.get('q') || '';
    if ([...sort.options].some(option => option.value === parameters.get('sort'))) sort.value = parameters.get('sort');
    filters.forEach(select => {
        const values = parameters.getAll(filterParameters[select.id]);
        const validValues = values.filter(value => value && [...select.options].some(option => option.value === value));
        [...select.options].forEach(option => { option.selected = option.value ? validValues.includes(option.value) : !validValues.length; });
    });
    // Remove the previous global session cache; plain directory links always start fresh.
    try { sessionStorage.removeItem('solsRollingCalculator:auraDirectory'); } catch {}
    globalThis.InterfaceSelects?.initialize('aura-sort');
    filters.forEach(select => globalThis.InterfaceSelects?.initialize(select.id));
    const metadata = new Map(rows.map(row => [row, { biomes: JSON.parse(row.dataset.biomes), events: JSON.parse(row.dataset.events) }]));
    const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true, ignorePunctuation: true });
    const alphabetical = (a, b) => collator.compare(a.dataset.name, b.dataset.name);
    const rarity = row => row.dataset.rarity ? Number(row.dataset.rarity) : -1;
    function syncURL(scroll = 0) {
        const url = new URL(location.href);
        const set = (key,value) => { if(value) url.searchParams.set(key,String(value)); else url.searchParams.delete(key); };
        set('q',search.value); set('sort',sort.value==='rarity-ascending'?'':sort.value);
        set('page',page>1?page:''); set('size',pageSize);
        set('scroll',scroll>0?Math.round(scroll):'');
        filters.forEach(select => {
            const key=filterParameters[select.id];url.searchParams.delete(key);
            [...select.selectedOptions].forEach(option=>{if(option.value)url.searchParams.append(key,option.value);});
        });
        try { history.replaceState(history.state,'',url.href); } catch {}
        globalThis.AuraVideoPlayer?.syncAddress(url.href);
        return url.pathname+url.search;
    }
    function update({restore=false} = {}) {
        const selections = new Map(filters.map(select => [select.id, [...select.selectedOptions].map(option => option.value).filter(Boolean)]));
        const biomes = [...document.getElementById('aura-biome').selectedOptions].filter(option => option.value);
        // A biome plus Daytime/Nighttime is one visual combination. Other
        // multi-biome filters use the shared day/night scene.
        const timeOptions = biomes.filter(option => /^(?:Daytime|Nighttime)$/i.test(option.value));
        const biomeOptions = biomes.filter(option => !timeOptions.includes(option));
        const backgroundOption = biomeOptions.length === 1 ? biomeOptions[0]
            : !biomeOptions.length && timeOptions.length === 1 ? timeOptions[0] : null;
        const time = timeOptions.length === 1 ? (/^Nighttime$/i.test(timeOptions[0].value) ? 'night' : 'day') : '';
        globalThis.AuraBackground?.show(backgroundOption?.dataset.background || '', backgroundOption?.dataset.music || '', time);
        rows.sort((a, b) => {
            if (sort.value === 'alphabetical') return alphabetical(a, b);
            if (sort.value === 'alphabetical-descending') return alphabetical(b, a);
            const groupDifference = Number(a.dataset.sortGroup) - Number(b.dataset.sortGroup);
            if (groupDifference) return sort.value === 'rarity-ascending' ? groupDifference : -groupDifference;
            // Auras without numerical odds stay at the end in either direction.
            if (!a.dataset.rarity || !b.dataset.rarity) return Boolean(b.dataset.rarity) - Boolean(a.dataset.rarity) || alphabetical(a, b);
            const difference = sort.value === 'rarity-ascending' ? rarity(a) - rarity(b) : rarity(b) - rarity(a);
            return difference || alphabetical(a, b);
        });
        const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const matches = rows.filter(row => {
            const info = metadata.get(row);
            return terms.every(term => row.dataset.search.includes(term)) && filters.every(select => {
                const values = selections.get(select.id);
                return !values.length || values.some(value => {
                    if (select.id === 'aura-biome') return info.biomes.includes(value);
                    if (select.id === 'aura-kind') return row.dataset.kind === value;
                    if (select.id === 'aura-event') return value === 'none' ? !info.events.length : info.events.includes(value);
                    return row.dataset.tier === value;
                });
            });
        });
        totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
        page = Math.min(page, totalPages);
        const offset = (page - 1) * pageSize;
        const visible = matches.slice(offset, offset + pageSize);
        const neighbors = matches.slice(Math.max(0, offset - pageSize), offset + 2 * pageSize).filter(row => !visible.includes(row));
        titlePreload.style.width = `${list.getBoundingClientRect().width}px`;
        titlePreload.replaceChildren(...neighbors);
        visible.forEach((row, index) => {
            row.querySelector('.aura-row__index').textContent = String(offset + index + 1).padStart(3, '0');
        });
        list.replaceChildren(...visible);
        list.start = offset + 1;
        styleTitles(list);
        styleTitles(titlePreload);
        const ticket = ++preloadRequest;
        const currentReady = globalThis.AuraTitleLayout?.preload(list);
        if (globalThis.AuraPageLayout) globalThis.AuraPageLayout.titlesReady = currentReady;
        titlePreload.dataset.preloadState = 'loading';
        Promise.all([currentReady, globalThis.AuraTitleLayout?.preload(titlePreload)]).then(() => {
            if (ticket === preloadRequest) titlePreload.dataset.preloadState = 'ready';
        });
        count.textContent = matches.length ? `Showing ${offset + 1}–${offset + visible.length} of ${matches.length} auras${matches.length < rows.length ? ` (${rows.length} total)` : ''}` : `0 of ${rows.length} auras`;
        empty.hidden = matches.length !== 0;
        pagination.forEach(nav => {
            nav.hidden = totalPages <= 1;
            nav.querySelector('[data-page-step="-1"]').disabled = page === 1;
            nav.querySelector('[data-page-step="1"]').disabled = page === totalPages;
            nav.querySelector('[data-page-status]').textContent = `Page ${page} of ${totalPages} · ${pageSize} per page`;
            const numbers = [...new Set([1, page - 1, page, page + 1, totalPages])].filter(number => number >= 1 && number <= totalPages).sort((a, b) => a - b);
            const buttons = [];
            numbers.forEach((number, index) => {
                if (index && number - numbers[index - 1] > 1) {
                    const gap = document.createElement('span');
                    gap.className = 'directory-page-gap'; gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true'); buttons.push(gap);
                }
                const button = document.createElement('button');
                button.className = 'interface-button interface-button--ghost'; button.type = 'button';
                button.dataset.pageNumber = number; button.textContent = number;
                button.setAttribute('aria-label', `Aura page ${number}`);
                if (number === page) button.setAttribute('aria-current', 'page');
                buttons.push(button);
            });
            nav.querySelector('[data-page-buttons]').replaceChildren(...buttons);
        });
        const returnURL=syncURL(restore?savedScroll:0);
        visible.forEach(row=>{
            const link=row.querySelector('a.aura-page-link'),target=new URL(link.href);
            target.searchParams.set('return',returnURL);link.href=target.href;
        });
    }
    function resetPage() { page = 1; update(); }
    sort.addEventListener('change', resetPage);
    search.addEventListener('input', resetPage);
    filters.forEach(select => select.addEventListener('change', resetPage));
    pagination.forEach(nav => nav.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        const next = button.dataset.pageNumber ? Number(button.dataset.pageNumber) : page + Number(button.dataset.pageStep);
        if (!Number.isInteger(next) || next === page || next < 1 || next > totalPages) return;
        page = next; update();
        count.focus({ preventScroll: true }); count.scrollIntoView({ block: 'start' });
    }));
    document.addEventListener('aura-page-size-change', event => {
        if (event.detail.pageSize === pageSize) return;
        pageSize = event.detail.pageSize; resetPage();
    });
    document.getElementById('aura-clear-filters').addEventListener('click', () => {
        search.value = '';
        filters.forEach(select => { select.value = ''; globalThis.InterfaceSelects?.refresh(select.id); });
        resetPage();
    });
    function rememberReturn(event) {
        const link=event.target.closest('a.aura-page-link');
        if(!link||!list.contains(link)) return;
        const target=new URL(link.href);target.searchParams.set('return',syncURL(window.scrollY));link.href=target.href;
    }
    list.addEventListener('pointerdown',rememberReturn);
    list.addEventListener('click',rememberReturn);
    list.addEventListener('auxclick',rememberReturn);
    window.addEventListener('pagehide',()=>syncURL(window.scrollY));
    update({restore:true});
    if (savedScroll > 0) {
        let cancelled=false;
        const cancel=()=>{cancelled=true;};
        const cancelKey=event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancel();};
        window.addEventListener('wheel',cancel,{once:true,passive:true});
        window.addEventListener('touchstart',cancel,{once:true,passive:true});
        window.addEventListener('pointerdown',cancel,{once:true});
        window.addEventListener('keydown',cancelKey);
        const restore=()=>{if(!cancelled)window.scrollTo(0,savedScroll);};
        Promise.resolve(globalThis.AuraPageLayout?.ready).then(()=>requestAnimationFrame(restore));
        // Font fitting can change card heights after the initial styled paint.
        Promise.all([globalThis.AuraPageLayout?.ready,globalThis.AuraPageLayout?.titlesReady]).then(()=>requestAnimationFrame(()=>{
            restore();
            window.removeEventListener('wheel',cancel);window.removeEventListener('touchstart',cancel);
            window.removeEventListener('pointerdown',cancel);window.removeEventListener('keydown',cancelKey);
        }));
    }
})();
