'use strict';

// Shared deferred source hydration and cutscene preparation lifecycle.
const CUTSCENE_LOAD_TIMEOUT_MS = 30000;

function ensureDeferredMediaSource(element) {
    if (!element) {
        return false;
    }

    let hydrated = false;
    if (element.dataset?.src && !element.getAttribute('src')) {
        element.setAttribute('src', element.dataset.src);
        hydrated = true;
    }

    if (typeof element.querySelectorAll === 'function') {
        element.querySelectorAll('source[data-src]').forEach(source => {
            if (!source.getAttribute('src')) {
                source.setAttribute('src', source.dataset.src);
                hydrated = true;
            }
        });
    }

    if (hydrated && typeof element.load === 'function') {
        element.load();
    }

    return hydrated;
}

const cutscenePreparationRequests = new WeakMap();
function prepareCutsceneVideo(video, { forceReload = false } = {}) {
    if (!forceReload && video && cutscenePreparationRequests.has(video)) {
        return cutscenePreparationRequests.get(video);
    }
    const request = loadCutsceneVideo(video, { forceReload });
    if (video) {
        cutscenePreparationRequests.set(video, request);
        const release = () => {
            if (cutscenePreparationRequests.get(video) === request) cutscenePreparationRequests.delete(video);
        };
        request.then(release, release);
    }
    return request;
}

function loadCutsceneVideo(video, { forceReload = false } = {}) {
    return new Promise((resolve, reject) => {
        if (!video) {
            reject(new Error('Cutscene video element was not found.'));
            return;
        }

        video.preload = 'auto';
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.disablePictureInPicture = true;

        const sourceElements = Array.from(video.querySelectorAll('source'));
        const failedSources = new Set();
        let settled = false;
        let timeoutId = null;

        const removeListeners = () => {
            video.removeEventListener('loadeddata', handleReady);
            video.removeEventListener('canplay', handleReady);
            video.removeEventListener('error', handleVideoError);
            sourceElements.forEach(source => source.removeEventListener('error', handleSourceError));
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
                timeoutId = null;
            }
        };

        const finish = (error = null) => {
            if (settled) return;
            settled = true;
            removeListeners();
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        function handleReady() {
            if (video.readyState >= 2) {
                finish();
            }
        }

        function handleVideoError() {
            finish(new Error(`The cutscene media failed to load (code ${video.error?.code || 'unknown'}).`));
        }

        function handleSourceError(event) {
            failedSources.add(event.currentTarget);
            if (sourceElements.length > 0 && failedSources.size >= sourceElements.length) {
                finish(new Error('No cutscene media source could be loaded.'));
            }
        }

        video.addEventListener('loadeddata', handleReady);
        video.addEventListener('canplay', handleReady);
        video.addEventListener('error', handleVideoError);
        sourceElements.forEach(source => source.addEventListener('error', handleSourceError));

        timeoutId = window.setTimeout(() => {
            finish(new Error('The cutscene took too long to load.'));
        }, CUTSCENE_LOAD_TIMEOUT_MS);

        const hydrated = ensureDeferredMediaSource(video);
        if (forceReload || (!hydrated && video.readyState < 2)) {
            video.load();
        }
        handleReady();
    });
}

