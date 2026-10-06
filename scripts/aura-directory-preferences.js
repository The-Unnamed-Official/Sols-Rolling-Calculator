/* The directory page-size slider is shared by home and aura Settings. */
(() => {
    'use strict';
    const key = 'solsRollingCalculator:auraDirectoryPageSize';
    const minimum = 9, maximum = 90, defaultSize = 18, step = 3;
    const inRange = value => Number.isInteger(value) && value >= minimum && value <= maximum;
    const valid = value => inRange(value) && (value - minimum) % step === 0;
    let pageSize = defaultSize;
    function read() {
        try { const raw = localStorage.getItem(key); const value = Number(raw); return raw !== null && inRange(value) ? minimum + Math.round((value - minimum) / step) * step : defaultSize; }
        catch { return defaultSize; }
    }
    function reflect() {
        document.querySelectorAll('[data-aura-page-size]').forEach(slider => {
            slider.value = String(pageSize);
            slider.setAttribute('aria-valuetext', `${pageSize} auras per page`);
            const percent = 100 * (pageSize - minimum) / (maximum - minimum);
            slider.style.setProperty('--audio-slider-progress', `${percent}%`);
            slider.closest('.audio-slider__control')?.style.setProperty('--audio-slider-thumb-progress', `${percent}%`);
        });
        document.querySelectorAll('[data-aura-page-size-value]').forEach(output => { output.textContent = `${pageSize} auras`; });
    }
    function change(value, persist = true) {
        if (!valid(value)) return;
        pageSize = value;
        if (persist) try { localStorage.setItem(key, String(value)); } catch {}
        reflect();
        document.dispatchEvent(new CustomEvent('aura-page-size-change', { detail: { pageSize } }));
    }
    pageSize = read();
    reflect();
    document.querySelectorAll('[data-aura-page-size]').forEach(slider => slider.addEventListener('input', () => change(Number(slider.value))));
    window.addEventListener('storage', event => { if (event.key === key) change(read(), false); });
    globalThis.AuraDirectoryPreferences = Object.freeze({ getPageSize: () => pageSize, usePageSize: value => change(value, false), minimum, maximum, defaultSize, step });
})();
