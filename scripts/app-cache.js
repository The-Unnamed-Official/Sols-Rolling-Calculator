(function (global) {
    'use strict';

    const root = new URL('../', document.currentScript.src);
    const isAppUrl = value => {
        const url = new URL(value, root);
        return url.origin === root.origin && url.pathname.startsWith(root.pathname);
    };

    async function reset() {
        global.SessionReturn?.save();

        // Cache Storage and service workers can be shared with other sites on
        // the same host. Only remove entries and registrations for this app.
        if (global.caches) {
            for (const name of await global.caches.keys()) {
                const cache = await global.caches.open(name);
                for (const request of await cache.keys()) {
                    if (isAppUrl(request.url)) await cache.delete(request);
                }
            }
        }
        if (navigator.serviceWorker) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.filter(registration => registration.scope === root.href)
                .map(registration => registration.unregister()));
        }

        // Refresh the HTTP cache as well: deleting Cache Storage alone does not
        // replace stale scripts or styles in the browser's normal asset cache.
        const reloadAsset = async (url, asText = false) => {
            const controller = new AbortController();
            const timeout = global.setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch(url, { cache: 'reload', credentials: 'same-origin', signal: controller.signal });
                if (!response.ok) throw new Error(`Unable to reload ${new URL(url).pathname}.`);
                return await (asText ? response.text() : response.arrayBuffer());
            } finally {
                global.clearTimeout(timeout);
            }
        };
        // Read the simulator's assets too, so resetting from an aura page also
        // refreshes the rolling code and its worker dependencies.
        const latestHtml = await reloadAsset(new URL('index.html', root).href, true);
        const latestDocument = new DOMParser().parseFromString(latestHtml, 'text/html');
        const latestBuild = latestDocument.querySelector('meta[name="app-build"]')?.content;
        const assetSelector = 'script[src], link[rel="stylesheet"][href]';
        const assets = new Set([...document.querySelectorAll(assetSelector)]
            .map(element => element.src || element.href).filter(isAppUrl));
        latestDocument.querySelectorAll(assetSelector).forEach(element => {
            const url = new URL(element.getAttribute('src') || element.getAttribute('href'), root);
            if (isAppUrl(url)) assets.add(url.href);
        });
        ['scripts/simulation-worker.js?session=1', 'scripts/utils.js?session=1', 'scripts/simulation-core.js?session=1']
            .forEach(path => {
                const url = new URL(path, root);
                if (latestBuild) url.searchParams.set('v', latestBuild);
                assets.add(url.href);
            });
        await Promise.all([...assets].map(url => reloadAsset(url)));

        const freshUrl = new URL(global.location.href);
        freshUrl.searchParams.delete('_app_cache_check');
        freshUrl.searchParams.set('_app_build', String(Date.now()));
        global.location.replace(freshUrl.href);
    }

    const button = document.getElementById('resetAppCacheButton');
    const status = document.getElementById('resetAppCacheStatus');
    button?.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = 'Resetting Cache…';
        if (status) status.textContent = 'Reloading app files. Your saved preferences and session will be kept.';
        try {
            await reset();
        } catch (error) {
            console.warn('Unable to reset the app cache.', error);
            if (status) status.textContent = 'Cache reset could not finish. Check your connection and try again. Your saved preferences are unchanged.';
            button.disabled = false;
            button.textContent = 'Reset Cache';
        }
    });
})(globalThis);
