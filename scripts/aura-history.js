/* Version tabs and a preloaded image viewer shared by every aura profile. */
(() => {
    'use strict';
    const profile = document.querySelector('[data-aura-profile]');
    if (!profile) return;
    const tabs = [...profile.querySelectorAll('[role="tab"]')];
    const panels = [...profile.querySelectorAll('[data-aura-panel]')];
    const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.matches('.reduce-motion,.quality-no-ui-animations');
    const viewers = new Map();
    function makeViewer(viewer) {
        const frames = [...viewer.querySelectorAll('[data-image-frame]')];
        const choices = [...viewer.querySelectorAll('[data-image-choice]')];
        const stage = viewer.querySelector('[data-image-stage]');
        const loading = viewer.querySelector('[data-image-loading]');
        let selected = 0, desired = 0, request = 0, transitionTimer;
        const loads = new Map();
        function load(frame) {
            if (loads.has(frame)) return loads.get(frame);
            const media = frame.querySelector('img,video');
            frame.dataset.imageState = 'loading';
            if (media.tagName === 'IMG') {
                media.loading = 'eager';
                media.fetchPriority = frame.hidden || viewer.closest('[hidden]') ? 'low' : 'high';
            }
            const promise = new Promise(resolve => {
                const success = async () => {
                    // Decode hidden previews too, so the transition can paint immediately.
                    if (media.tagName === 'IMG' && media.decode) await media.decode().catch(()=>{});
                    finish(true);
                };
                const error = () => {
                    if (media.dataset.historyFallbackSrc) {
                        media.src = media.dataset.historyFallbackSrc;
                        delete media.dataset.historyFallbackSrc;
                    } else finish(false);
                };
                const finish = ok => {
                    media.removeEventListener('load', success);
                    media.removeEventListener('loadeddata', success);
                    media.removeEventListener('error', error);
                    media.hidden = !ok;
                    frame.querySelector('.aura-media-error').hidden = ok;
                    frame.dataset.imageState = ok ? 'ready' : 'error';
                    resolve(ok);
                };
                media.addEventListener('load', success);
                media.addEventListener('loadeddata', success);
                media.addEventListener('error', error);
                const source = media.dataset.historySrc || media.getAttribute('src');
                if (media.getAttribute('src') !== source) media.src = source;
                delete media.dataset.historySrc;
                if (media.tagName === 'VIDEO') { media.preload = 'auto'; media.load(); }
                else if (media.complete) {
                    if (media.naturalWidth) success();
                    else error();
                }
            });
            loads.set(frame, promise);
            return promise;
        }
        function settle() {
            clearTimeout(transitionTimer);
            stage.classList.remove('is-transitioning');
            frames.forEach((frame, index) => {
                frame.hidden = index !== selected;
                frame.classList.remove('is-entering', 'is-leaving');
                frame.removeAttribute('aria-hidden');
                if (index !== selected) frame.querySelector('video')?.pause();
            });
        }
        async function show(index, animate = true) {
            const next = (index + frames.length) % frames.length;
            desired = next;
            const ticket = ++request;
            loading.hidden = false;
            stage.setAttribute('aria-busy', 'true');
            await load(frames[next]);
            if (ticket !== request) return;
            loading.hidden = true;
            stage.setAttribute('aria-busy', 'false');
            settle();
            const previous = selected;
            selected = next;
            frames[next].hidden = false;
            choices.forEach((choice, position) => choice.setAttribute('aria-pressed', String(position === next)));
            viewer.querySelector('[data-image-counter]').textContent = `${String(next+1).padStart(2,'0')} / ${String(frames.length).padStart(2,'0')}`;
            if (animate && previous !== next && !reducedMotion()) {
                stage.style.setProperty('--image-direction', next > previous ? 1 : -1);
                frames[previous].hidden = false;
                frames[previous].setAttribute('aria-hidden', 'true');
                frames[previous].classList.add('is-leaving');
                frames[next].classList.add('is-entering');
                stage.classList.add('is-transitioning');
                transitionTimer = setTimeout(settle, 620);
            } else settle();
        }
        choices.forEach((choice, index) => choice.addEventListener('click', () => show(index)));
        viewer.querySelectorAll('[data-image-step]').forEach(button => button.addEventListener('click', () => show(desired + Number(button.dataset.imageStep))));
        viewer.addEventListener('keydown', event => {
            if (event.defaultPrevented || event.target.closest('[data-aura-video-player]')) return;
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            show(desired + (event.key === 'ArrowRight' ? 1 : -1));
        });
        frames.forEach(frame => frame.querySelector('[data-image-retry]').addEventListener('click', () => {
            loads.delete(frame);
            const media = frame.querySelector('img,video');
            media.hidden = false;
            frame.querySelector('.aura-media-error').hidden = true;
            show(frames.indexOf(frame));
        }));
        return { show: () => show(selected, false), preload: () => Promise.all(frames.map(load)), stop: () => { ++request; desired = selected; loading.hidden = true; stage.setAttribute('aria-busy','false'); settle(); viewer.querySelectorAll('video').forEach(video=>video.pause()); } };
    }
    profile.querySelectorAll('[data-aura-viewer]').forEach(viewer => viewers.set(viewer, makeViewer(viewer)));
    function activate(index, focus = false) {
        let currentReady = Promise.resolve();
        tabs.forEach((tab, position) => {
            tab.setAttribute('aria-selected', String(position === index));
            tab.tabIndex = position === index ? 0 : -1;
        });
        panels.forEach((panel, position) => {
            panel.hidden = position !== index;
            const viewer = viewers.get(panel.querySelector('[data-aura-viewer]'));
            if (position === index) currentReady = viewer?.show() || currentReady;
            else viewer?.stop();
        });
        if (focus) tabs[index].focus();
        globalThis.AuraBackground?.show(panels[index].dataset.auraBackground || '', panels[index].dataset.auraMusic || '');
        panels[index].dispatchEvent(new CustomEvent('aura-version-change', { bubbles: true }));
        return currentReady;
    }
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activate(index));
        tab.addEventListener('keydown', event => {
            let next;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            if (next === undefined) return;
            event.preventDefault();
            activate(next, true);
        });
    });
    // Reserve bandwidth for the first visible preview, then warm every version.
    activate(0).then(() => viewers.forEach(viewer => viewer.preload()));
})();
