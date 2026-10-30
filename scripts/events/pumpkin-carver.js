(() => {
    'use strict';
    const asset = new URL('../../files/images/events/halloween/pumpkin.png', document.currentScript.src).href;
    const storageKey = 'solsRollingCalculator:pumpkin:2026:v1';
    const dialog = document.getElementById('pumpkin-carver');
    const decoration = document.getElementById('pumpkin-decoration');
    const opener = document.getElementById('open-pumpkin-carver');
    const thumbnail = document.getElementById('pumpkin-thumbnail');
    const canvas = document.getElementById('pumpkin-canvas');
    const status = document.getElementById('pumpkin-status');
    const undo = document.getElementById('pumpkin-undo');
    const reset = document.getElementById('pumpkin-reset');
    const done = document.getElementById('pumpkin-done');
    const width = 900;
    const height = 762;
    const limit = 64;
    let image;
    let imageRequest;
    let pixels;
    let committed = readCuts();
    let cuts = committed.slice();
    let history = [];
    let draft = [];
    let pointer = null;
    let cursor = [0.5, 0.48];
    let keyboard = false;
    let frame = 0;
    let active = false;
    let opening = false;
    const surfaces = new Map();
    if (!dialog || !canvas) return;

    function readCuts() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey));
            if (!Array.isArray(value) || value.length > limit) return [];
            return value.filter(cut => Array.isArray(cut) && cut.length >= 3 && cut.length <= 384
                && cut.every(point => Array.isArray(point) && point.length === 2
                    && point.every(coordinate => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)));
        } catch { return []; }
    }
    function surface(name) {
        if (!surfaces.has(name)) {
            const layer = document.createElement('canvas');
            layer.width = width;
            layer.height = height;
            surfaces.set(name, layer);
        }
        return surfaces.get(name);
    }
    function context(name) {
        const ctx = surface(name).getContext('2d');
        ctx.reset();
        return ctx;
    }
    function trace(ctx, points, close = true) {
        ctx.beginPath();
        points.forEach(([x, y], index) => index ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height));
        if (close) ctx.closePath();
    }
    async function loadImage() {
        if (!imageRequest) {
            imageRequest = (async () => {
                const loaded = new Image();
                loaded.src = asset;
                await loaded.decode();
                image = loaded;
                const hit = context('hit');
                hit.drawImage(image, 0, 0, width, height);
                pixels = hit.getImageData(0, 0, width, height).data;
            })().catch(error => { imageRequest = null; throw error; });
        }
        return imageRequest;
    }
    function renderBase() {
        const base = context('base');
        if (!cuts.length) { base.drawImage(image, 0, 0, width, height); return; }
        const mask = context('mask');
        mask.fillStyle = '#fff';
        mask.lineJoin = 'round';
        for (const cut of cuts) { trace(mask, cut); mask.fill(); }
        mask.globalCompositeOperation = 'destination-in';
        mask.drawImage(image, 0, 0, width, height);
        mask.clearRect(0, 0, width, height * 0.14);
        const inside = context('inside');
        inside.fillStyle = '#b75c16';
        inside.fillRect(0, 0, width, height);
        const light = context('light');
        const gradient = light.createRadialGradient(width * 0.5, height * 0.6, 0, width * 0.5, height * 0.55, width * 0.58);
        gradient.addColorStop(0, '#fff4ad');
        gradient.addColorStop(0.4, '#ffdb55');
        gradient.addColorStop(0.8, '#ffa928');
        gradient.addColorStop(1, '#ed811b');
        light.fillStyle = gradient;
        light.fillRect(0, 0, width, height);
        light.globalCompositeOperation = 'destination-in';
        light.drawImage(surface('mask'), 0, -width * 0.014);
        inside.drawImage(surface('light'), 0, 0);
        inside.globalCompositeOperation = 'destination-in';
        inside.drawImage(surface('mask'), 0, 0);
        base.drawImage(surface('inside'), 0, 0);
        const skin = context('skin');
        skin.drawImage(image, 0, 0, width, height);
        skin.globalCompositeOperation = 'destination-out';
        skin.drawImage(surface('mask'), 0, 0);
        const shaded = context('shaded');
        shaded.shadowColor = 'rgba(74, 25, 0, .82)';
        shaded.shadowBlur = width * 0.011;
        shaded.shadowOffsetY = width * 0.002;
        shaded.drawImage(surface('skin'), 0, 0);
        shaded.shadowColor = 'transparent';
        shaded.globalCompositeOperation = 'destination-in';
        shaded.drawImage(image, 0, 0, width, height);
        base.drawImage(surface('shaded'), 0, 0);
        const glow = context('glow');
        glow.filter = 'blur(9px)';
        glow.drawImage(surface('inside'), 0, 0);
        glow.filter = 'none';
        glow.globalCompositeOperation = 'destination-in';
        glow.drawImage(image, 0, 0, width, height);
        base.globalCompositeOperation = 'screen';
        base.globalAlpha = 0.22;
        base.drawImage(surface('glow'), 0, 0);
    }
    function render() {
        frame = 0;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(surface('base'), 0, 0);
        if (draft.length) {
            trace(ctx, draft, false);
            ctx.strokeStyle = '#1e1008';
            ctx.lineWidth = 2.5;
            ctx.lineCap = ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.strokeStyle = '#ffe7a5';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(draft.at(-1)[0] * width, draft.at(-1)[1] * height);
            ctx.lineTo(draft[0][0] * width, draft[0][1] * height);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        if (keyboard && document.activeElement === canvas) {
            const [x, y] = cursor.map((value, index) => value * (index ? height : width));
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.moveTo(x - 13, y); ctx.lineTo(x + 13, y);
            ctx.moveTo(x, y - 13); ctx.lineTo(x, y + 13);
            ctx.strokeStyle = '#fff4c9';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(render); }
    function controls(message = '') {
        undo.disabled = !history.length;
        reset.disabled = !cuts.length;
        dialog.querySelector('[data-pumpkin-cut-count]').textContent = cuts.length;
        status.textContent = message || 'Your pumpkin, your imagination. Add a freehand shape or try a quick cut.';
    }
    function commit(next, message) {
        if (next.length > limit) { controls('Your pumpkin has 64 cuts. Undo a cut or start over to make room.'); schedule(); return; }
        history.push(cuts);
        if (history.length > limit) history.shift();
        cuts = next;
        draft = [];
        renderBase(); schedule(); controls(message);
    }
    function carve() {
        const points = draft;
        draft = [];
        const area = points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point[0] * next[1] - next[0] * point[1];
        }, 0);
        if (points.length >= 3 && Math.abs(area) > 0.00015) commit([...cuts, points], 'Cut carved. Looking brighter already.');
        else { controls('Draw a larger closed shape to carve a cut.'); schedule(); }
    }
    function hit([x, y]) {
        return y >= 0.14 && x >= 0 && x < 1 && y < 1 && pixels[(Math.floor(y * height) * width + Math.floor(x * width)) * 4 + 3] > 128;
    }
    function point(event) {
        const bounds = canvas.getBoundingClientRect();
        return [Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))];
    }
    function append(value) {
        const last = draft.at(-1);
        if (last && Math.hypot(value[0] - last[0], value[1] - last[1]) < 0.002) return;
        if (draft.length >= 384) draft = draft.filter((_, index) => index % 2 === 0);
        draft.push(value);
        schedule();
    }
    function preview() {
        renderBase();
        const small = document.createElement('canvas');
        small.width = 280; small.height = 237;
        small.getContext('2d').drawImage(surface('base'), 0, 0, small.width, small.height);
        thumbnail.src = small.toDataURL('image/png');
    }
    function release() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const layer of surfaces.values()) layer.width = layer.height = 0;
        surfaces.clear();
    }
    async function open() {
        if (opening || dialog.open || !active) return;
        opening = true;
        try {
            await loadImage();
            if (!active) return;
            cuts = committed.slice(); history = []; draft = [];
            renderBase(); controls();
            opener.querySelector('span').textContent = 'Carve your pumpkin';
            dialog.showModal();
            document.body.classList.add('pumpkin-carver-open');
            canvas.focus(); schedule();
        } catch {
            opener.querySelector('span').textContent = 'Pumpkin unavailable · retry';
        } finally { opening = false; }
    }
    canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0 || pointer !== null || !event.isPrimary) return;
        const start = point(event);
        if (!hit(start)) return;
        event.preventDefault(); keyboard = false;
        canvas.focus(); pointer = event.pointerId;
        draft = [start]; canvas.setPointerCapture(pointer); schedule();
    });
    canvas.addEventListener('pointermove', event => {
        if (event.pointerId !== pointer) return;
        const samples = event.getCoalescedEvents?.();
        for (const sample of samples?.length ? samples : [event]) append(point(sample));
    });
    canvas.addEventListener('pointerup', event => {
        if (event.pointerId !== pointer) return;
        append(point(event)); pointer = null;
        canvas.releasePointerCapture(event.pointerId); carve();
    });
    const cancelPointer = () => { pointer = null; draft = []; schedule(); };
    canvas.addEventListener('pointercancel', cancelPointer);
    canvas.addEventListener('lostpointercapture', () => { if (pointer !== null) cancelPointer(); });
    canvas.addEventListener('keydown', event => {
        const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (movement) {
            event.preventDefault(); keyboard = true;
            cursor = cursor.map((value, index) => Math.max(0.02, Math.min(0.98, value + movement[index] * (event.shiftKey ? 0.03 : 0.01))));
            schedule();
        } else if (event.key === ' ') {
            event.preventDefault(); keyboard = true;
            if (hit(cursor)) { append(cursor.slice()); controls(`${draft.length} points added. Press Enter to carve.`); }
            else controls('Move the cursor onto the pumpkin flesh to add a point.');
        } else if (event.key === 'Enter') { event.preventDefault(); carve(); }
    });
    canvas.addEventListener('focus', schedule);
    canvas.addEventListener('blur', schedule);
    dialog.addEventListener('cancel', event => {
        if (draft.length) { event.preventDefault(); event.stopPropagation(); draft = []; pointer = null; controls('Unfinished cut cancelled.'); schedule(); }
    });
    dialog.addEventListener('close', () => {
        document.body.classList.remove('pumpkin-carver-open');
        draft = []; pointer = null; cuts = committed.slice();
        release(); opener.focus({ preventScroll: true });
    });
    document.getElementById('close-pumpkin-carver').addEventListener('click', () => dialog.close());
    opener.addEventListener('click', open);
    undo.addEventListener('click', () => {
        if (!history.length) return;
        cuts = history.pop(); draft = []; renderBase(); schedule(); controls('Last change undone.');
    });
    reset.addEventListener('click', () => commit([], 'A fresh pumpkin. Undo brings your previous design back.'));
    document.querySelectorAll('[data-pumpkin-shape]').forEach(button => button.addEventListener('click', () => {
        const type = button.dataset.pumpkinShape;
        const shapes = type === 'eyes' ? [[[0.24, 0.39], [0.35, 0.26], [0.4, 0.43]], [[0.6, 0.43], [0.65, 0.26], [0.76, 0.39]]]
            : type === 'smile' ? [[[0.26, 0.57], [0.38, 0.62], [0.5, 0.63], [0.62, 0.62], [0.74, 0.57], [0.7, 0.69], [0.61, 0.77], [0.5, 0.79], [0.39, 0.77], [0.3, 0.69]]]
            : [Array.from({ length: 10 }, (_, index) => { const angle = -Math.PI / 2 + index * Math.PI / 5; const radius = index % 2 ? 0.055 : 0.13; return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * radius * width / height]; })];
        commit([...cuts, ...shapes], `${type === 'eyes' ? 'Triangle eyes' : type === 'smile' ? 'Smile' : 'Star'} carved.`);
    }));
    done.addEventListener('click', () => {
        if (draft.length) carve();
        committed = cuts.slice();
        let saved = true;
        try { localStorage.setItem(storageKey, JSON.stringify(committed)); } catch { saved = false; }
        preview();
        opener.title = saved ? 'Your pumpkin is saved on this device. Click to carve again.' : 'Your pumpkin is applied for this visit; browser storage is unavailable.';
        dialog.close();
    });
    globalThis.PumpkinCarver = Object.freeze({
        async setActive(value) {
            active = value;
            decoration.hidden = !active;
            if (!active) { if (dialog.open) dialog.close(); return; }
            if (!committed.length || dialog.open) return;
            try {
                await loadImage();
                if (!active || dialog.open) return;
                cuts = committed.slice(); preview(); release();
            } catch { thumbnail.src = asset; }
        }
    });
})();
