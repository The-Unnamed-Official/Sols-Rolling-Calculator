/* Shared custom selects use the simulator's existing menu styles and motion. */
(() => {
    'use strict';
    const widgets = new Map();
    function populate(target, option) {
        target.replaceChildren();
        if (option.dataset.icon) {
            const icon = document.createElement('img');
            icon.className = 'biome-option__icon';
            icon.src = option.dataset.icon;
            icon.alt = '';
            icon.width = icon.height = 28;
            icon.loading = 'lazy';
            icon.decoding = 'async';
            icon.draggable = false;
            target.append(icon);
        }
        const label = document.createElement('span');
        label.className = 'biome-option__label';
        if (option.dataset.sigil) label.classList.add(option.dataset.sigil);
        label.textContent = option.dataset.label || option.textContent;
        target.append(label);
        if (option.dataset.suffix) target.append(document.createTextNode(option.dataset.suffix));
    }
    function initialize(id) {
        if (widgets.has(id)) return widgets.get(id).update();
        const select = document.getElementById(id);
        const details = document.querySelector(`details[data-select="${id}"]`);
        const summary = details?.querySelector('summary');
        const menu = details?.querySelector('.interface-select__menu');
        if (!select || !summary || !menu) return;
        const multiple = select.multiple;
        const all = [...select.options].find(option => !option.value);
        const selected = () => [...select.selectedOptions].filter(option => option.value);
        const close = () => { details.open = false; summary.setAttribute('aria-expanded', 'false'); };
        const buttons = [...select.options].map(option => {
            const button = document.createElement(multiple ? 'label' : 'button');
            button.className = multiple ? 'interface-select__option interface-select__option--checkbox' : 'interface-select__option-button';
            button.dataset.value = option.value;
            button.setAttribute('role', 'option');
            button.setAttribute('aria-label', option.textContent);
            let control = button;
            if (multiple) {
                control = document.createElement('input');
                control.type = 'checkbox';
                control.value = option.value;
                control.setAttribute('aria-label', option.textContent);
                const content = document.createElement('span');
                content.className = 'interface-select__option-label';
                populate(content, option);
                button.append(control, content);
                control.addEventListener('change', () => {
                    if (!option.value) [...select.options].forEach(item => { item.selected = false; });
                    else option.selected = control.checked;
                    if (all) all.selected = selected().length === 0;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                });
            } else {
                button.type = 'button';
                populate(button, option);
                button.addEventListener('click', () => {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    close();
                    summary.focus();
                });
            }
            return { option, button, control };
        });
        if (multiple) menu.setAttribute('aria-multiselectable', 'true');
        menu.replaceChildren(...buttons.map(({ button }) => button));
        function update() {
            const selection = multiple ? selected() : [...select.selectedOptions];
            const content = document.createElement('span');
            content.className = 'interface-select__value';
            const first = selection[0] || all;
            if (first) populate(content, first);
            else content.textContent = 'Sort by';
            summary.replaceChildren(content);
            if (multiple && selection.length > 1) {
                const extra = document.createElement('span');
                extra.className = 'interface-select__count';
                extra.textContent = `+${selection.length - 1}`;
                summary.append(extra);
            }
            summary.title = selection.length ? selection.map(option => option.textContent).join(', ') : all?.textContent || 'Sort by';
            summary.setAttribute('aria-expanded', String(details.open));
            buttons.forEach(({ option, button, control }) => {
                const active = multiple && !option.value ? selection.length === 0 : option.selected;
                button.hidden = option.hidden;
                control.disabled = select.disabled || option.disabled;
                if (multiple) control.checked = active;
                button.setAttribute('aria-selected', String(active));
                button.classList.toggle(multiple ? 'interface-select__option--active' : 'interface-select__option-button--active', active);
            });
        }
        details.addEventListener('toggle', update);
        summary.addEventListener('click', event => {
            if (select.disabled) { event.preventDefault(); return; }
            if (!details.open) {
                document.querySelectorAll('.interface-select[open]').forEach(other => {
                    if (other !== details) { other.open = false; other.querySelector('summary')?.setAttribute('aria-expanded', 'false'); }
                });
            }
        });
        if (typeof initializeInterfaceSelectMotion === 'function') initializeInterfaceSelectMotion(details);
        else {
            summary.addEventListener('click', () => {
                if (details.open || document.body.matches('.quality-no-ui-animations,.reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                details.dataset.motionCycle = details.dataset.motionCycle === 'primary' ? 'alternate' : 'primary';
                details.classList.add('interface-select--booting');
            });
            details.addEventListener('toggle', () => { if (!details.open) details.classList.remove('interface-select--booting'); });
        }
        details.addEventListener('keydown', event => {
            const available = buttons.filter(({ button, control }) => !button.hidden && !control.disabled).map(({ control }) => control);
            if (event.key === 'Escape') { event.preventDefault(); close(); summary.focus(); return; }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !available.length) return;
            event.preventDefault();
            details.open = true;
            const current = available.indexOf(document.activeElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1
                : current < 0 ? (event.key === 'ArrowDown' ? 0 : available.length - 1)
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + available.length) % available.length;
            available[next].focus();
        });
        // Clicking a label briefly sends focus to the document before the
        // browser focuses its checkbox. Keep the menu open during that step.
        details.addEventListener('focusout', event => {
            if (event.relatedTarget && !details.contains(event.relatedTarget)) close();
        });
        document.addEventListener('click', event => { if (!details.contains(event.target)) close(); });
        select.addEventListener('change', update);
        widgets.set(id, { update });
        update();
    }
    globalThis.InterfaceSelects = Object.freeze({ initialize, refresh: id => widgets.get(id)?.update() });
})();
