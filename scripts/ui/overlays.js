(function (global) {
    'use strict';

    const LARGE_ROLL_WARNING_THRESHOLD = 999999999;
    const OVERLAY_TRANSITION_FALLBACK_MS = 320;

    function initializePopupConsoleChrome(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') {
            return;
        }

        const popupConfigs = {
            settings: { code: 'CONFIG', label: 'Settings interface', icon: 'fa-sliders' },
            filter: { code: 'FILTER', label: 'Result controls', icon: 'fa-filter' },
            archive: { code: 'ARCHIVE', label: 'Update records', icon: 'fa-clock-rotate-left' },
            notice: { code: 'NOTICE', label: 'System prompt', icon: 'fa-triangle-exclamation' }
        };

        root.querySelectorAll('.surface--modal').forEach((modal, index) => {
            if (modal.querySelector(':scope > .popup-console__rail')) {
                return;
            }

            const overlayId = modal.closest('.modal-overlay, .cutscene-warning-overlay')?.id || '';
            let kind = 'notice';
            if (modal.classList.contains('changelog-modal')) {
                kind = 'archive';
            } else if (/audioSettings|qualityPreferences|rollingSettings/i.test(overlayId)) {
                kind = 'settings';
            } else if (/Filter/i.test(overlayId)) {
                kind = 'filter';
            }

            const config = popupConfigs[kind];
            const rail = document.createElement('div');
            const railCode = document.createElement('span');
            const railState = document.createElement('span');
            const railIcon = document.createElement('i');

            modal.dataset.popupKind = kind;
            rail.className = 'popup-console__rail';
            rail.setAttribute('aria-hidden', 'true');
            railCode.className = 'popup-console__rail-code';
            railCode.textContent = `${config.code} // ${String(index + 1).padStart(2, '0')}`;
            railState.className = 'popup-console__rail-state';
            railIcon.className = `fa-solid ${config.icon}`;
            railState.appendChild(railIcon);
            railState.append(` ${config.label}`);
            rail.append(railCode, railState);
            modal.prepend(rail);
        });
    }

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
    global.initializePopupConsoleChrome = initializePopupConsoleChrome;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => initializePopupConsoleChrome(), { once: true });
        } else {
            initializePopupConsoleChrome();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
