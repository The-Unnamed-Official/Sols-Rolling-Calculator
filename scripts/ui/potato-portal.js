(() => {
    'use strict';
    const minimalMode = document.documentElement.dataset.simulatorMode === 'minimal';
    const syncSwitches = () => document.querySelectorAll('[data-potato-switch]').forEach(control => {
        control.checked = minimalMode;
    });
    syncSwitches();
    window.addEventListener('pageshow', syncSwitches);
    document.addEventListener('change', event => {
        const control = event.target.closest('[data-potato-switch]');
        if (!control || control.checked === minimalMode) return;
        window.location.assign(new URL(control.dataset.potatoTarget, document.baseURI).href);
    });
    if (minimalMode) return;
    const root = new URL('../../', document.currentScript.src);
    let preview, frame, active = null, ticket = 0, cleanupTimer, loading = null;

    async function bounded(promise) {
        let timeout;
        try { await Promise.race([promise, new Promise(resolve => { timeout = setTimeout(resolve, 1500); })]); }
        finally { clearTimeout(timeout); }
    }

    async function snapshot() {
        if (!preview) {
            preview = document.createElement('div');
            preview.className = 'potato-preview';
            preview.setAttribute('aria-hidden', 'true');
            frame = document.createElement('iframe');
            frame.className = 'potato-preview__frame';
            frame.title = 'Rotato Simulator appearance preview';
            frame.setAttribute('sandbox', 'allow-same-origin');
            frame.setAttribute('inert', '');
            frame.tabIndex = -1;
            preview.append(frame);
            document.body.append(preview);
        }
        const currentFrame = frame;
        const target = currentFrame.contentDocument;
        target.open();
        target.write('<!doctype html><html data-simulator-mode="minimal"><head></head><body></body></html>');
        target.close();
        target.documentElement.className = document.documentElement.className;
        target.documentElement.classList.remove('is-glitching', 'glitch-effects-enabled');
        target.documentElement.style.cssText = document.documentElement.style.cssText;
        const base = target.createElement('base');
        base.href = document.baseURI;
        target.head.append(base);
        const loads = [];
        document.querySelectorAll('link[rel="stylesheet"],style').forEach(source => {
            const copy = source.cloneNode(true);
            copy.removeAttribute('onload');
            if (copy.tagName === 'LINK') {
                copy.href = source.href;
                copy.media = 'all';
                loads.push(new Promise(resolve => { copy.onload = copy.onerror = resolve; }));
            }
            target.head.append(copy);
        });
        const minimal = target.createElement('link');
        minimal.rel = 'stylesheet';
        minimal.href = new URL('styles/core/minimal.css?v=2.218.layout2', root).href;
        loads.push(new Promise(resolve => { minimal.onload = minimal.onerror = resolve; }));
        target.head.append(minimal);
        const body = document.body.cloneNode(true);
        body.querySelectorAll('script,audio,video,iframe,.potato-preview,.glitch-signal,.glitch-entry-errors,.event-atmosphere,.snow-field,.pumpkin-decoration,#pumpkin-carver').forEach(element => element.remove());
        body.querySelectorAll('[data-quality-option]:not([data-quality-option="disableWikiAuraStyles"])').forEach(element => element.remove());
        body.querySelectorAll('*').forEach(element => {
            for (const attribute of [...element.attributes]) if (attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
        });
        body.querySelectorAll('img[src$="theUnnamed-flipped.gif"]').forEach(image => { image.src = new URL('files/images/other/theUnnamed.png', root).href; });
        body.classList.add('reduce-motion', 'quality-no-ui-animations', 'quality-no-particles', 'quality-no-shakes', 'quality-no-roll-sigil-animations', 'quality-no-glitch');
        body.classList.remove('is-glitching', 'glitch-effects-enabled', 'singularity-summon-active');
        const backdrop = body.querySelector('.interface-backdrop');
        if (backdrop?.classList.contains('interface-backdrop--video-active')) {
            const still = new URL('files/images/backgrounds/minimal/glitchBiomeImage.webp', root).href;
            backdrop.style.backgroundImage = `url("${still}")`;
            target.documentElement.style.setProperty('--biome-background', `url("${still}")`);
        }
        target.body.replaceWith(body);
        await bounded(Promise.all(loads));
        if (!currentFrame.isConnected) return;
        target.body.getBoundingClientRect();
        await bounded(target.fonts?.ready);
        if (currentFrame.isConnected) currentFrame.contentWindow?.scrollTo(window.scrollX, window.scrollY);
    }

    async function show(button, event) {
        clearTimeout(cleanupTimer);
        const current = ++ticket;
        active = button;
        const bounds = button.getBoundingClientRect();
        const x = event?.clientX ?? bounds.left + bounds.width / 2;
        const y = event?.clientY ?? bounds.top + bounds.height / 2;
        if (!loading) loading = snapshot().finally(() => { loading = null; });
        await loading;
        if (current !== ticket || active !== button) return;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 80;
        preview.style.setProperty('--potato-preview-x', `${x}px`);
        preview.style.setProperty('--potato-preview-y', `${y}px`);
        preview.style.setProperty('--potato-preview-target', `${radius}px`);
        preview.getBoundingClientRect();
        preview.classList.add('potato-preview--visible');
    }
    function hide() {
        if (!active) return;
        active = null;
        ticket++;
        preview?.classList.remove('potato-preview--visible');
        cleanupTimer = setTimeout(() => { preview?.remove(); preview = frame = loading = null; }, 1000);
    }
    document.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        const button = event.target.closest('[data-potato-portal]');
        if (button && button !== active) void show(button, event);
        else if (!button) hide();
    });
    document.addEventListener('pointerout', event => { if (active && !event.relatedTarget) hide(); });
    document.addEventListener('focusin', event => {
        const button = event.target.closest('[data-potato-portal]');
        if (button && event.target.matches(':focus-visible')) void show(button);
    });
    document.addEventListener('focusout', event => { if (active && !active.contains(event.relatedTarget)) hide(); });
    window.addEventListener('scroll', () => {
        if (active && frame?.isConnected) frame.contentWindow?.scrollTo(window.scrollX, window.scrollY);
    }, { passive: true });
    window.addEventListener('resize', hide, { passive: true });
    window.addEventListener('blur', hide);
})();
