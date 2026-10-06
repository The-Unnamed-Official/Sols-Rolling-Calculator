/* Shared day/night artwork lookup for the simulator and every aura page. */
(() => {
    'use strict';
    const root = new URL('../', document.currentScript.src);
    const timeKey = 'solsRollingCalculator:biomeBackgroundTime';
    const loads = new Map();
    const formats = ['png', 'jpg', 'jpeg', 'webp', 'avif'];
    let time = 'day';
    try { if (localStorage.getItem(timeKey) === 'night') time = 'night'; } catch {}

    function setTime(value) {
        const next = value === 'night' ? 'night' : 'day';
        if (next === time) return;
        time = next;
        try { localStorage.setItem(timeKey, time); } catch {}
        window.dispatchEvent(new Event('biome-background-time-change'));
    }
    window.addEventListener('storage', event => {
        if (event.key !== timeKey && event.key !== null) return;
        let next = 'day';
        try { if (localStorage.getItem(timeKey) === 'night') next = 'night'; } catch {}
        if (next !== time) {
            time = next;
            window.dispatchEvent(new Event('biome-background-time-change'));
        }
    });

    const isVideo = source => /\.(?:webm|mp4|ogv|ogg)(?:[?#]|$)/i.test(source);
    const defaultAsset = (phase = time) => new URL(`files/images/backgrounds/normalBiomeImage${phase === 'night' ? 'N' : ''}.png`, root).href;

    function available(source) {
        const cached = loads.get(source);
        // Retry missing artwork after a short interval so newly added files can load.
        if (cached && cached.expires > Date.now()) return cached.promise;
        const entry = { expires: Infinity, promise: null };
        entry.promise = new Promise(resolve => {
            const img = new Image();
            const finish = success => {
                clearTimeout(timeout);
                img.onload = img.onerror = null;
                if (!success) entry.expires = Date.now() + 30000;
                resolve(success);
            };
            const timeout = setTimeout(() => finish(false), 3000);
            img.onload = () => finish(img.naturalWidth > 0);
            img.onerror = () => finish(false);
            img.src = source;
        });
        loads.set(source, entry);
        return entry.promise;
    }

    function candidates(source, night) {
        const url = new URL(source, document.baseURI);
        const match = /^(.*)\.(png|jpe?g|webp|avif)$/i.exec(url.pathname);
        if (!match) return night ? [] : [url.href];
        const stem = match[1] + (night && !match[1].endsWith('N') ? 'N' : '');
        // PNG replacements take priority over legacy JPGs still in the folder.
        return [...new Set(['png', match[2], ...formats])].map(extension => {
            const candidate = new URL(url);
            candidate.pathname = `${stem}.${extension}`;
            return candidate.href;
        });
    }

    async function resolve(asset, { night = time === 'night' } = {}) {
        const source = new URL(asset || defaultAsset(night ? 'night' : 'day'), document.baseURI).href;
        // Uploaded artwork also works for animated biomes. Keep the original
        // video when neither a night image nor a main image has been added.
        if (isVideo(source)) {
            const filename = new URL(source).pathname.split('/').pop().replace(/\.[^.]+$/, '.png');
            const image = new URL(`files/images/backgrounds/${filename}`, root).href;
            const choices = [...(night ? candidates(image, true) : []), ...candidates(image, false)];
            for (const candidate of choices) {
                if (await available(candidate)) return candidate;
            }
            return source;
        }
        // Explicit night paths (such as the Nighttime aura filter) still fall
        // back to the same biome's main image, rather than looking for NN.
        const main = new URL(source);
        const image = /^(.*)\.(png|jpe?g|webp|avif)$/i.exec(main.pathname);
        if (image && image[1].endsWith('N')) {
            main.pathname = `${image[1].slice(0, -1)}.${image[2]}`;
            night = true;
        }
        const choices = [...(night ? candidates(main.href, true) : []), ...candidates(main.href, false)];
        for (const candidate of choices) {
            if (await available(candidate)) return candidate;
        }
        // Keep a valid scene even while a biome's main artwork is still pending.
        const fallback = defaultAsset('day');
        return main.href === fallback ? fallback : resolve(fallback, { night });
    }

    globalThis.BiomeBackground = Object.freeze({ resolve, isVideo, defaultAsset, setTime, getTime: () => time });
})();
