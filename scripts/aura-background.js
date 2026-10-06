/* Biome artwork shared by directory filters and individual aura profiles. */
(() => {
    'use strict';
    const backdrop = document.querySelector('.interface-backdrop');
    if (!backdrop) return;
    const video = backdrop.querySelector('video');
    let current = null;
    let requestedAsset = document.body.dataset.auraBackground || '';
    let requestedMusic = document.body.dataset.auraMusic || '';
    let request = 0;
    const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.matches('.reduce-motion,.quality-no-ui-animations,.quality-no-roll-sigil-animations');
    function playback() {
        if (!video?.getAttribute('src')) return;
        if (reduceMotion() || document.hidden) video.pause();
        else video.play().catch(() => {});
    }
    async function show(asset = '', music = '', time = '') {
        requestedAsset = asset;
        requestedMusic = music;
        if (time) BiomeBackground.setTime(time);
        globalThis.AuraAudio?.setMusic(music);
        const ticket = ++request;
        const source = await BiomeBackground.resolve(asset);
        if (ticket !== request) return;
        if (source === current) return;
        current = source;
        const animated = BiomeBackground.isVideo(source);
        document.documentElement.style.setProperty('--biome-background', animated ? 'none' : `url("${source}")`);
        backdrop.classList.remove('interface-backdrop--video-active');
        if (video?.getAttribute('src')) { video.pause(); video.removeAttribute('src'); video.load(); }
        if (animated && video) {
            backdrop.style.backgroundImage = 'none';
            video.src = source; video.preload = 'auto'; video.load();
        } else if (source) backdrop.style.backgroundImage = `url("${source}")`;
    }
    video?.addEventListener('loadeddata', () => { if (video.getAttribute('src')) { backdrop.classList.add('interface-backdrop--video-active'); playback(); } });
    video?.addEventListener('error', () => {
        if (!BiomeBackground.isVideo(current || '')) return;
        backdrop.classList.remove('interface-backdrop--video-active');
        const fallback = BiomeBackground.defaultAsset();
        document.documentElement.style.setProperty('--biome-background', `url("${fallback}")`);
        backdrop.style.backgroundImage = `url("${fallback}")`;
    });
    window.addEventListener('biome-background-time-change', () => show(requestedAsset, requestedMusic));
    document.addEventListener('visibilitychange', playback);
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', playback);
    new MutationObserver(playback).observe(document.body, {attributes:true,attributeFilter:['class']});
    globalThis.AuraBackground = Object.freeze({ show });
    show(requestedAsset, requestedMusic);
})();
