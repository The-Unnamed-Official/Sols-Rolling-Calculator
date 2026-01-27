(function (global) {
    'use strict';

    const LARGE_ROLL_WARNING_THRESHOLD = 999999999;
    const OVERLAY_TRANSITION_FALLBACK_MS = 320;

    function revealOverlay(overlay) {
        if (!overlay) {
            return;
        }

        overlay.removeAttribute('hidden');
        overlay.removeAttribute('aria-hidden');
        overlay.style.display = '';
        overlay.removeAttribute('data-closing');

        const makeVisible = () => {
            overlay.setAttribute('data-visible', 'true');
        };

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(makeVisible);
        } else {
            makeVisible();
        }
    }

    function concealOverlay(overlay, { onHidden } = {}) {
        if (!overlay) {
            if (typeof onHidden === 'function') {
                onHidden();
            }
            return;
        }

        let completed = false;

        const finalize = () => {
            if (completed) {
                return;
            }
            completed = true;
            overlay.setAttribute('hidden', '');
            overlay.setAttribute('aria-hidden', 'true');
            overlay.style.display = 'none';
            overlay.removeAttribute('data-visible');
            overlay.removeAttribute('data-closing');
            if (typeof onHidden === 'function') {
                onHidden();
            }
        };

        if (overlay.hasAttribute('hidden')) {
            finalize();
            return;
        }

        if (global.appState && global.appState.reduceMotion) {
            finalize();
            return;
        }

        let fallbackId = null;

        const clearListeners = () => {
            overlay.removeEventListener('transitionend', handleTransitionEnd);
            if (fallbackId !== null && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
                window.clearTimeout(fallbackId);
            }
        };

        const handleTransitionEnd = event => {
            if (event.target === overlay && event.propertyName === 'opacity') {
                clearListeners();
                finalize();
            }
        };

        overlay.addEventListener('transitionend', handleTransitionEnd);

        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            fallbackId = window.setTimeout(() => {
                clearListeners();
                finalize();
            }, OVERLAY_TRANSITION_FALLBACK_MS);
        }

        overlay.setAttribute('data-closing', 'true');
        overlay.removeAttribute('data-visible');
    }

    const largeRollWarningManager = (() => {
        let pendingAction = null;

        const getOverlay = () => document.getElementById('rollWarningOverlay');

        function hideOverlay() {
            const overlay = getOverlay();
            if (!overlay) {
                return;
            }
            concealOverlay(overlay, {
                onHidden: () => {
                    overlay.removeAttribute('data-roll-count');
                }
            });
        }

        function focusPrimaryAction() {
            const confirmButton = document.getElementById('rollWarningConfirm');
            if (!confirmButton || typeof confirmButton.focus !== 'function') {
                return;
            }
            try {
                confirmButton.focus({ preventScroll: true });
            } catch (error) {
                confirmButton.focus();
            }
        }

        return {
            prompt(total, action) {
                pendingAction = typeof action === 'function' ? action : null;
                const overlay = getOverlay();
                if (!overlay) {
                    if (pendingAction) {
                        const next = pendingAction;
                        pendingAction = null;
                        next();
                    }
                    return false;
                }

                overlay.dataset.rollCount = `${total}`;
                const countNode = document.getElementById('rollWarningCount');
                if (countNode) {
                    countNode.textContent = global.formatWithCommas
                        ? global.formatWithCommas(total)
                        : `${total}`;
                }

                revealOverlay(overlay);
                focusPrimaryAction();
                return true;
            },
            confirm() {
                const action = pendingAction;
                pendingAction = null;
                hideOverlay();
                if (typeof action === 'function') {
                    action();
                }
            },
            cancel() {
                pendingAction = null;
                hideOverlay();
            },
            hide: hideOverlay,
            isVisible() {
                const overlay = getOverlay();
                return Boolean(overlay && !overlay.hasAttribute('hidden'));
            }
        };
    })();

    global.LARGE_ROLL_WARNING_THRESHOLD = LARGE_ROLL_WARNING_THRESHOLD;
    global.OVERLAY_TRANSITION_FALLBACK_MS = OVERLAY_TRANSITION_FALLBACK_MS;
    global.revealOverlay = revealOverlay;
    global.concealOverlay = concealOverlay;
    global.largeRollWarningManager = largeRollWarningManager;
})(typeof window !== 'undefined' ? window : globalThis);
