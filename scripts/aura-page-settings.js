/* Aura pages share the home page's preference storage and quality controls. */
(() => {
    'use strict';
    const key = 'solsRollingCalculator:visualSettings';
    const classes = { disableUiAnimations: 'quality-no-ui-animations', disableRollAndSigilAnimations: 'quality-no-roll-sigil-animations', disableWikiAuraStyles: 'quality-simple-auras' };
    function stored() {
        try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return value && typeof value === 'object' ? value : {}; }
        catch { return {}; }
    }
    let currentSettings = stored();
    function apply() {
        const settings = currentSettings;
        const preferences = settings.qualityPreferences || {};
        document.body.classList.toggle('reduce-motion', Boolean(settings.reduceMotion));
        Object.entries(classes).forEach(([option, className]) => {
            const disabled = Boolean(preferences[option] ?? (option === 'disableUiAnimations' ? preferences.disableButtonAnimations : false));
            document.body.classList.toggle(className, disabled);
            const button = document.querySelector(`[data-quality-option="${option}"]`);
            if (button) {
                button.setAttribute('aria-checked', String(button.hasAttribute('data-quality-inverted') ? !disabled : disabled));
                button.classList.toggle('quality-settings__item--active', button.hasAttribute('data-quality-inverted') ? !disabled : disabled);
            }
        });
    }
    apply();
    window.addEventListener('storage', event => { if (event.key === key) { currentSettings = stored(); apply(); } });
    document.querySelectorAll('[data-quality-option]').forEach(button => button.addEventListener('click', () => {
        const saved = stored();
        const settings = { ...currentSettings, ...saved, qualityPreferences: { ...currentSettings.qualityPreferences, ...saved.qualityPreferences } };
        settings.qualityPreferences = { ...settings.qualityPreferences, [button.dataset.qualityOption]: button.getAttribute('aria-checked') === (button.hasAttribute('data-quality-inverted') ? 'true' : 'false') };
        try { localStorage.setItem(key, JSON.stringify(settings)); } catch {}
        currentSettings = settings;
        apply();
    }));
    const menu = document.getElementById('optionsMenu');
    const trigger = document.getElementById('optionsMenuToggle');
    const overlay = document.getElementById('qualityPreferencesOverlay');
    const opener = document.getElementById('qualityPreferencesToggle');
    const closer = document.getElementById('qualityPreferencesClose');
    let previousFocus;
    function closeMenu() { menu.classList.remove('options-menu--open'); trigger.setAttribute('aria-expanded', 'false'); }
    function closeDialog() {
        opener.setAttribute('aria-expanded', 'false');
        globalThis.concealOverlay(overlay, { onHidden: () => { document.body.classList.remove('modal-open'); previousFocus?.focus(); } });
    }
    trigger.addEventListener('click', () => {
        const open = menu.classList.toggle('options-menu--open');
        trigger.setAttribute('aria-expanded', String(open));
    });
    opener.addEventListener('click', () => {
        previousFocus = trigger;
        closeMenu();
        globalThis.revealOverlay(overlay);
        opener.setAttribute('aria-expanded', 'true');
        document.body.classList.add('modal-open');
        overlay.querySelector('button')?.focus();
    });
    closer.addEventListener('click', closeDialog);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
    document.addEventListener('click', event => { if (!menu.contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!overlay.hidden) closeDialog();
            else if (menu.classList.contains('options-menu--open')) { closeMenu(); trigger.focus(); }
        }
        if (event.key !== 'Tab' || overlay.hidden) return;
        const buttons = [...overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    const time = document.getElementById('latestDeploymentTime');
    const deployed = new Date(globalThis.AuraPageLayout?.publishedAt || document.lastModified);
    if (time && !Number.isNaN(deployed.getTime())) {
        const formatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
        time.dateTime = deployed.toISOString();
        time.textContent = formatter.format(deployed);
        time.title = `Latest published build, shown in your local timezone (${formatter.resolvedOptions().timeZone})`;
    }
})();
