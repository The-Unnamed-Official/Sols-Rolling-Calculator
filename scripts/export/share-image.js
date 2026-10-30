async function ensureShareFontsLoaded(signal) {
    if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') {
        return;
    }
    const requests = [
        document.fonts.load('700 48px "Sarpanch"'),
        document.fonts.load('600 28px "Sarpanch"'),
        document.fonts.load('500 22px "Sarpanch"'),
        document.fonts.load('italic 500 20px "Sarpanch"'),
        document.fonts.load('600 28px "Playfair Display"'),
        document.fonts.load('700 26px "Noto Serif TC"'),
        document.fonts.load('700 22px "Press Start 2P"'),
        document.fonts.load('600 35px "Parisienne"'),
        document.fonts.load('700 italic 35px "Jura"'),
        document.fonts.load('600 34px "Kings"')
    ];
    let timeout;
    try {
        await AppRuntime.abortable(Promise.race([Promise.allSettled(requests), new Promise(resolve => { timeout = setTimeout(resolve, 3000); })]), signal);
    } catch (error) {
        signal?.throwIfAborted();
        console.warn('Font loading for share image failed', error);
    } finally { clearTimeout(timeout); }
}


async function generateShareImage(summary, mode = 'download', { onProgress = () => {}, onCommit = () => {}, signal } = {}) {
    signal?.throwIfAborted();
    if (getImageShareEntryCount(summary) > MAX_IMAGE_SHARE_ENTRIES) return 'limit-exceeded';
    if (typeof document === 'undefined') {
        return false;
    }

    onProgress(0);
    await ensureShareFontsLoaded(signal);
    signal?.throwIfAborted();
    onProgress(.06);

    const canvas = document.createElement('canvas');
    const width = 1260;
    canvas.width = width;
    let context = canvas.getContext('2d');
    if (!context) {
        return false;
    }

    const margin = 64;
    const maxWidth = width - margin * 2;
    const headerFont = '700 48px "Sarpanch", sans-serif';
    const detailFont = '500 26px "Sarpanch", sans-serif';
    const auraFont = '400 22px "Noto Serif TC", serif';

    const auraVisuals = Array.isArray(summary.shareVisuals) && summary.shareVisuals.length > 0
        ? summary.shareVisuals.slice()
        : null;

    const drawQueue = [];
    drawQueue.push({ type: 'text', text: 'Sols Roll Result', font: headerFont, color: '#f6fbff', lineHeight: 58 });
    drawQueue.push({ type: 'spacer', size: 22 });

    drawQueue.push({ type: 'text', text: 'Auras Rolled', font: detailFont, color: '#f6c361', lineHeight: 36 });

    const auraBlocks = [];
    if (auraVisuals && auraVisuals.length > 0) {
        try {
            await AppRuntime.abortable(AppRuntime.loadScript('scripts/titles/wiki-title-export.js'), signal);
            onProgress(.12);
            auraBlocks.push(...await AppRuntime.abortable(WikiTitleExport.blocks(auraVisuals, maxWidth, { signal, onProgress: progress => {
                signal?.throwIfAborted();
                onProgress(.12 + progress * .66);
            } }), signal));
        } catch (error) {
            signal?.throwIfAborted();
            console.warn('Styled aura export unavailable; using text for this image.', error);
        }
    }
    if (auraBlocks.length > 0) {
        auraBlocks[auraBlocks.length - 1].gapAfter = 0;
        auraBlocks.forEach(block => { drawQueue.push({ type: 'aura', block }); });
    } else {
        const fallbackAuras = summary.shareRecords && summary.shareRecords.length > 0
            ? summary.shareRecords.slice()
            : auraVisuals?.length ? auraVisuals.map(record => [record.prefix, record.displayName,
                record.displayName.includes('| Times Rolled:') ? '' : record.countLabel || `Times Rolled: ${formatWithCommas(record.count)}`,
                record.subtitle, record.potionSource].filter(Boolean).join(' · '))
            : ['No auras were rolled.'];
        context.font = auraFont;
        fallbackAuras.forEach(entry => {
            wrapTextLines(context, entry, maxWidth).forEach(line => {
                drawQueue.push({ type: 'text', text: line, font: auraFont, color: '#ffffff', lineHeight: 32 });
            });
        });
    }

    signal?.throwIfAborted();
    drawQueue.push({ type: 'spacer', size: 38 });
    onProgress(.8);
    drawQueue.push({ type: 'text', text: 'Run summary', font: detailFont, color: '#83ddeb', lineHeight: 46 });
    let summaryBlocks;
    try {
        await AppRuntime.abortable(AppRuntime.loadScript('scripts/titles/wiki-title-export.js'), signal);
        const template = document.createElement('template');
        template.innerHTML = ResultSummary.render(summary);
        const element = template.content.firstElementChild;
        element.dataset.resultExport = '';
        summaryBlocks = [await AppRuntime.abortable(WikiTitleExport.capture(element, maxWidth, { signal }), signal)];
    } catch (error) {
        signal?.throwIfAborted();
        console.warn('Styled statistics export unavailable; using canvas panels for this image.', error);
        summaryBlocks = createShareSummaryBlocks(summary, maxWidth);
    }
    signal?.throwIfAborted();
    for (const block of summaryBlocks) drawQueue.push({ type: 'aura', block });
    onProgress(.92);

    let totalHeight = margin;
    drawQueue.forEach(command => {
        if (command.type === 'spacer') {
            totalHeight += command.size;
        } else if (command.type === 'aura') {
            totalHeight += command.block.contentHeight + command.block.gapAfter;
        } else {
            totalHeight += command.lineHeight;
        }
    });
    totalHeight += margin;

    canvas.height = Math.max(560, Math.ceil(totalHeight));
    context = canvas.getContext('2d');
    if (!context) {
        return false;
    }

    const gradient = context.createLinearGradient(0, 0, width, canvas.height);
    gradient.addColorStop(0, '#050a18');
    gradient.addColorStop(1, '#0b1530');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, canvas.height);

    context.strokeStyle = 'rgba(127, 227, 255, 0.45)';
    context.lineWidth = 2;
    context.strokeRect(margin - 30, margin - 30, width - (margin - 30) * 2, canvas.height - (margin - 30) * 2);

    context.textBaseline = 'top';

    let cursorY = margin;
    drawQueue.forEach(command => {
        if (command.type === 'spacer') {
            cursorY += command.size;
            return;
        }
        if (command.type === 'aura') {
            command.block.draw(context, margin, cursorY);
            cursorY += command.block.contentHeight + command.block.gapAfter;
            return;
        }
        context.font = command.font;
        context.fillStyle = command.color;
        context.fillText(command.text, margin, cursorY);
        cursorY += command.lineHeight;
    });

    const blob = await AppRuntime.abortable(new Promise(resolve => canvas.toBlob(resolve, 'image/png')), signal);
    signal?.throwIfAborted();
    onProgress(.97);
    if (!blob) {
        return 'failed';
    }

    let fallbackFromCopy = false;
    signal?.throwIfAborted();
    onCommit();
    if (mode === 'copy') {
        const copied = await copyImageBlobToClipboard(blob);
        if (copied) {
            onProgress(1);
            return 'copied';
        }
        mode = 'download';
        fallbackFromCopy = true;
    }

    signal?.throwIfAborted();
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'sols-roll-result.png';
        document.body.appendChild(anchor);
        anchor.click();
        onProgress(1);
        document.body.removeChild(anchor);
    } finally {
        if (typeof window !== 'undefined') {
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
            URL.revokeObjectURL(url);
        }
    }

    if (mode === 'download') {
        return fallbackFromCopy ? 'downloaded-fallback' : 'downloaded';
    }
    return 'failed';
}

function createShareSummaryBlocks(summary, width) {
    const palette = ResultSummary.palette;
    const measure = document.createElement('canvas').getContext('2d');
    const blocks = [];
    const gutter = 20;
    const cardWidth = (width - gutter * 2) / 3;
    blocks.push({ contentHeight: 136, gapAfter: 18, draw(context, x, y) {
        ResultSummary.metrics(summary).forEach((metric, index) => {
            const left = x + index * (cardWidth + gutter);
            const color = palette[metric.accent];
            context.fillStyle = '#102033';
            context.fillRect(left, y, cardWidth, 136);
            context.strokeStyle = color + '55';
            context.lineWidth = 1;
            context.strokeRect(left, y, cardWidth, 136);
            context.fillStyle = color;
            context.fillRect(left, y, cardWidth, 3);
            context.font = '600 17px Sarpanch,sans-serif';
            context.fillStyle = '#a5b9c9';
            context.fillText(metric.label.toUpperCase(), left + 22, y + 18);
            let size = 38;
            context.font = `700 ${size}px Sarpanch,sans-serif`;
            while (size > 20 && context.measureText(metric.value).width > cardWidth - 44) context.font = `700 ${--size}px Sarpanch,sans-serif`;
            context.fillStyle = color;
            context.fillText(metric.value, left + 22, y + 49);
            context.font = '400 16px Sarpanch,sans-serif';
            context.fillStyle = '#93aabc';
            context.fillText(metric.caption, left + 22, y + 106);
        });
    } });
    function group(section, panelWidth) {
        const columns = Math.min(section.fields.length, section.key === 'environment' ? 5 : 3);
        const fieldWidth = (panelWidth - 48 - (columns - 1) * 24) / columns;
        const fields = section.fields.map(field => {
            measure.font = '500 17px Sarpanch,sans-serif';
            const labels = wrapTextLines(measure, field.label, fieldWidth);
            measure.font = '500 24px Sarpanch,sans-serif';
            const lines = wrapTextLines(measure, field.value, fieldWidth);
            return { labels, lines };
        });
        const rows = [];
        for (let index = 0; index < fields.length; index += columns) {
            const entries = fields.slice(index, index + columns);
            rows.push({ entries, height: Math.max(...entries.map(field => field.labels.length * 22 + 12 + field.lines.length * 31)) + 20 });
        }
        const height = 84 + rows.reduce((sum, row) => sum + row.height, 0);
        return { contentHeight: height, gapAfter: 18, draw(context, x, y) {
            const color = palette[section.accent];
            context.fillStyle = '#0d1b2d'; context.fillRect(x, y, panelWidth, height);
            context.strokeStyle = color + '40'; context.lineWidth = 1; context.strokeRect(x, y, panelWidth, height);
            context.fillStyle = color; context.fillRect(x, y, 3, height);
            context.font = '700 21px Sarpanch,sans-serif'; context.fillText(section.title, x + 24, y + 20);
            context.strokeStyle = color + '30'; context.beginPath(); context.moveTo(x + 24, y + 54); context.lineTo(x + panelWidth - 24, y + 54); context.stroke();
            let top = y + 74;
            for (const row of rows) {
                row.entries.forEach((field, index) => {
                    const left = x + 24 + index * (fieldWidth + 24);
                    let cursor = top;
                    context.font = '500 17px Sarpanch,sans-serif'; context.fillStyle = '#9ab0c2';
                    for (const label of field.labels) { context.fillText(label, left, cursor); cursor += 22; }
                    cursor += 12;
                    context.font = '500 24px Sarpanch,sans-serif'; context.fillStyle = color;
                    for (const line of field.lines) { context.fillText(line, left, cursor); cursor += 31; }
                });
                top += row.height;
            }
        } };
    }
    for (const section of ResultSummary.sections(summary)) blocks.push(group(section, width));
    if (summary.xpLines?.length) {
        blocks.push(group({ title: 'Milestones', accent: 'mint', fields: summary.xpLines.map(value => ({ label: 'XP milestone', value })) }, width));
    }
    return blocks;
}

function wrapTextLines(context, text, maxWidth) {
    const sanitized = typeof text === 'string' ? text : String(text ?? '');
    const baseLines = sanitized.split(/\n/);
    const lines = [];

    baseLines.forEach(segment => {
        const words = segment.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines.push('');
            return;
        }

        let currentLine = '';
        words.forEach(word => {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (context.measureText(candidate).width <= maxWidth) {
                currentLine = candidate;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = word;
            }
        });

        if (currentLine) {
            lines.push(currentLine);
        }
    });

    return lines;
}
