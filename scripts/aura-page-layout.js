/* Load the aura pages' common HTML from one editable set of partials. */
(() => {
    'use strict';
    // Resolve from this script so nested aura URLs and subdirectory hosting work.
    const root = new URL('../', document.currentScript.src);
    const layout = { publishedAt: null };
    globalThis.AuraPageLayout = layout;
    document.documentElement.dataset.auraLayout = 'loading';

    function fragment(markup, version = '') {
        const template = document.createElement('template');
        template.innerHTML = markup.replaceAll('{{assetPrefix}}', root.href).replaceAll('{{appVersion}}', version);
        return template.content;
    }
    function replaceSlot(name, content) {
        document.querySelector(`[data-aura-fragment="${name}"]`)?.replaceWith(content);
    }
    async function loadScript(source) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = source.src;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Unable to load ${source.src}`));
            document.head.append(script);
        });
    }
    async function initialize() {
        const files = {
            head: 'aura-head.html',
            body: 'aura-body.html',
            header: 'header.html',
            controls: 'aura-header-controls.html',
            footer: 'aura-footer.html',
            quality: 'quality-preferences.html',
            audio: 'aura-audio.html'
        };
        if (document.querySelector('[data-aura-fragment="navigation"]')) files.navigation = 'aura-profile-navigation.html';
        // Classic script includes work in file:// previews, where fetch is blocked.
        // A missing HTML fragment must not prevent the rest of the UI from loading.
        const entries = await Promise.all(Object.entries(files).map(async ([name, file]) => {
            if (root.protocol === 'file:') return [name, null];
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            try {
                const response = await fetch(new URL(`partials/${file}`, root), { cache: 'no-cache', signal: controller.signal });
                if (!response.ok) return [name, null];
                if (name === 'header') layout.publishedAt = response.headers.get('Last-Modified');
                return [name, await response.text()];
            } catch { return [name, null]; }
            finally { clearTimeout(timeout); }
        }));
        const missing = entries.filter(([, content]) => content === null);
        layout.source = missing.length ? (missing.length === entries.length ? 'bundled' : 'mixed') : 'html';
        if (missing.length) {
            await loadScript({ src: new URL('scripts/aura-layout-fragments.js', root).href });
            missing.forEach(entry => {
                entry[1] = globalThis.AuraLayoutFragments?.[files[entry[0]]];
                if (typeof entry[1] !== 'string') throw new Error(`Missing shared fragment: ${files[entry[0]]}`);
            });
        }
        const markup = Object.fromEntries(entries);
        const header = fragment(markup.header.replace('{{pageControls}}', markup.controls));
        const versionButton = header.querySelector('#versionInfoButton');
        const version = versionButton?.dataset.versionId?.replace(/^v/, '') || '';
        if (versionButton) {
            const link = document.createElement('a');
            for (const { name, value } of versionButton.attributes) {
                if (!['type', 'aria-haspopup', 'aria-expanded'].includes(name)) link.setAttribute(name, value);
            }
            link.href = new URL('index.html#versionInfoButton', root).href;
            link.append(...versionButton.childNodes);
            versionButton.replaceWith(link);
        }
        const body = fragment(markup.body);
        const bodyTemplate = body.querySelector('[data-aura-body]');
        const shellTemplate = body.querySelector('[data-aura-shell]');
        document.body.classList.add(...bodyTemplate.classList);
        document.body.prepend(bodyTemplate.content);
        const shell = document.querySelector('[data-aura-shell]');
        shell.classList.add(...shellTemplate.classList);
        if (document.body.dataset.auraPage === 'profile') shell.classList.add(shellTemplate.dataset.detailClass);
        replaceSlot('header', header);
        replaceSlot('footer', fragment(markup.footer, version));
        if (markup.navigation) replaceSlot('navigation', fragment(markup.navigation, version));
        const quality = fragment(markup.quality);
        quality.querySelectorAll('[data-quality-option]').forEach(button => {
            if (!['disableUiAnimations', 'disableRollAndSigilAnimations', 'disableWikiAuraStyles'].includes(button.dataset.qualityOption)) button.remove();
        });
        replaceSlot('quality', quality);
        document.body.append(fragment(markup.audio));

        const profileTitle = document.querySelector('[data-aura-title-reference]');
        if (profileTitle) globalThis.WikiTitleData = { auras: JSON.parse(profileTitle.textContent), items: {} };
        const head = fragment(markup.head, version);
        head.querySelectorAll('[data-aura-page]').forEach(asset => {
            if (asset.dataset.auraPage !== document.body.dataset.auraPage) asset.remove();
        });
        const scripts = [...head.querySelectorAll('script[src]')];
        // Fetch scripts alongside styles, then execute in the listed dependency order.
        scripts.forEach(script => {
            const preload = document.createElement('link');
            preload.rel = 'preload';
            preload.as = 'script';
            preload.href = script.src;
            document.head.append(preload);
            script.remove();
        });
        // Font imports can be slow or unavailable. Only structural styles block
        // revealing the page; scripts and the remaining styles load alongside them.
        const stylesReady = [...head.querySelectorAll('link[data-layout-critical]')]
            .map(link => new Promise(resolve => {
                link.onload = resolve;
                link.onerror = () => { console.warn(`Unable to load stylesheet ${link.href}`); resolve(); };
            }));
        layout.titleAssetsReady = Promise.all([...head.querySelectorAll('link[data-aura-title-assets]')].map(link => new Promise(resolve => {
            link.addEventListener('load', resolve, {once:true});
            link.addEventListener('error', resolve, {once:true});
        })));
        document.head.append(head);
        const scriptsReady = (async () => {
            for (const script of scripts) await loadScript(script);
        })();
        await Promise.all([...stylesReady, scriptsReady]);
        // Neighboring titles warm in the background. Profiles reveal immediately
        // after structural assets, while their first image is already downloading.
        if (document.body.dataset.auraPage === 'directory') await new Promise(resolve => {
            const timeout = setTimeout(resolve, 500);
            Promise.resolve(layout.titlesReady).then(() => { clearTimeout(timeout); resolve(); });
        });
        document.documentElement.dataset.auraLayout = 'ready';
        return true;
    }
    layout.ready = initialize().catch(error => {
        document.documentElement.dataset.auraLayout = 'error';
        const message = document.createElement('p');
        message.setAttribute('role', 'alert');
        message.textContent = 'Some interface elements could not load. Reload the page to try again.';
        document.querySelector('[data-aura-shell]')?.prepend(message);
        console.error('Unable to initialize the aura page layout.', error);
        return false;
    });
})();
