(function (global) {
    'use strict';

    function createFrameCommit(commit) {
        let handle = null;
        let latest;
        let disposed = false;
        const flush = () => {
            handle = null;
            if (!disposed) commit(latest);
        };
        return {
            schedule(value) {
                if (disposed) return;
                latest = value;
                if (handle === null) handle = global.requestAnimationFrame(flush);
            },
            dispose() {
                disposed = true;
                if (handle !== null) global.cancelAnimationFrame(handle);
                handle = null;
            }
        };
    }

    const scriptRequests = new Map();
    function loadScript(path) {
        if (scriptRequests.has(path)) return scriptRequests.get(path);
        const request = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = global.getVersionedAppAssetUrl?.(path) || path;
            script.onload = resolve;
            script.onerror = () => {
                script.remove();
                scriptRequests.delete(path);
                reject(new Error(`Unable to load ${path}`));
            };
            document.head.appendChild(script);
        });
        scriptRequests.set(path, request);
        return request;
    }

    function abortable(promise, signal) {
        if (!signal) return Promise.resolve(promise);
        return new Promise((resolve, reject) => {
            const abort = () => reject(signal.reason || new DOMException('Operation cancelled', 'AbortError'));
            const cleanup = () => signal.removeEventListener('abort', abort);
            signal.addEventListener('abort', abort, { once: true });
            Promise.resolve(promise).then(value => { cleanup(); signal.aborted ? abort() : resolve(value); }, error => { cleanup(); reject(error); });
            if (signal.aborted) { cleanup(); abort(); }
        });
    }

    global.AppRuntime = Object.freeze({ createFrameCommit, loadScript, abortable });
})(globalThis);
