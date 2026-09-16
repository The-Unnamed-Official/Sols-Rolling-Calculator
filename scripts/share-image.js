async function ensureShareFontsLoaded() {
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
    try {
        await Promise.allSettled(requests);
    } catch (error) {
        console.warn('Font loading for share image failed', error);
    }
}



async function generateShareImage(summary, mode = 'download') {
    if (typeof document === 'undefined') {
        return false;
    }

    await ensureShareFontsLoaded();

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
    const milestoneFont = '500 22px "Sarpanch", sans-serif';

    const eventSummary = summary.eventLabels && summary.eventLabels.length > 0
        ? summary.eventLabels.join(', ')
        : EVENT_SUMMARY_EMPTY_LABEL;
    const auraFilterSummary = summary.auraFilterSummary || getAuraFilterSummaryText();
    const luckSummary = summary.luckLabel || formatWithCommas(summary.luck);
    const potionSummary = Array.isArray(summary.potionBatches) && summary.potionBatches.length > 0
        ? formatPotionBatchList(summary.potionBatches, { includeLuck: true })
        : null;

    const detailEntries = [
        `Rolls: ${formatWithCommas(summary.rolls)}`,
        `Potion Mode: ${summary.potionMode === POTION_SIMULATION_MODE.MULTIPLE ? 'Multiple' : 'Single'}`,
        ...(summary.potionMode === POTION_SIMULATION_MODE.MULTIPLE
            ? [`Compatible Potion Stacking: ${summary.potionStackingEnabled ? 'Enabled' : 'Disabled'}`]
            : []),
        ...(summary.potionMode === POTION_SIMULATION_MODE.MULTIPLE
            ? [`Device Preset: ${summary.devicePresetName || 'None'}`]
            : []),
        ...(potionSummary ? [`Potions: ${potionSummary}`] : []),
        `Luck: ${luckSummary}`,
        `Biome: ${summary.biomeLabel}`,
        `Rune: ${summary.runeLabel || 'None'}`,
        `Time: ${summary.timeLabel || 'Neutral'}`,
        `Events: ${eventSummary}`,
        `Included Aura Tiers: ${auraFilterSummary}`,
        `Duration: ${Math.max(0, Math.round(summary.executionSeconds))}s`,
        `Total XP: ${formatWithCommas(summary.xpTotal)}`
    ];

    const milestoneEntries = summary.xpLines && summary.xpLines.length > 0
        ? summary.xpLines.slice()
        : [];

    const auraVisuals = Array.isArray(summary.shareVisuals) && summary.shareVisuals.length > 0
        ? summary.shareVisuals.slice()
        : null;

    const drawQueue = [];
    drawQueue.push({ type: 'text', text: 'Sols Roll Result', font: headerFont, color: '#f6fbff', lineHeight: 58 });
    drawQueue.push({ type: 'spacer', size: 22 });

    context.font = detailFont;
    detailEntries.forEach(entry => {
        wrapTextLines(context, entry, maxWidth).forEach(line => {
            drawQueue.push({ type: 'text', text: line, font: detailFont, color: '#cfe7ff', lineHeight: 36 });
        });
    });

    drawQueue.push({ type: 'spacer', size: 30 });
    drawQueue.push({ type: 'text', text: 'Auras Rolled', font: detailFont, color: '#f6c361', lineHeight: 36 });

    const auraBlocks = [];
    if (auraVisuals && auraVisuals.length > 0) {
        await AppRuntime.loadScript('scripts/wiki-title-export.js');
        auraBlocks.push(...await WikiTitleExport.blocks(auraVisuals, maxWidth));
        if (auraBlocks.length > 0) {
            auraBlocks[auraBlocks.length - 1].gapAfter = 0;
            auraBlocks.forEach(block => {
                drawQueue.push({ type: 'aura', block });
            });
        }
    } else {
        const fallbackAuras = summary.shareRecords && summary.shareRecords.length > 0
            ? summary.shareRecords.slice()
            : ['No auras were rolled.'];
        context.font = auraFont;
        fallbackAuras.forEach(entry => {
            wrapTextLines(context, entry, maxWidth).forEach(line => {
                drawQueue.push({ type: 'text', text: line, font: auraFont, color: '#ffffff', lineHeight: 32 });
            });
        });
    }

    if (milestoneEntries.length > 0) {
        drawQueue.push({ type: 'spacer', size: 30 });
        drawQueue.push({ type: 'text', text: 'Milestones', font: detailFont, color: '#7fe3ff', lineHeight: 36 });
        context.font = milestoneFont;
        milestoneEntries.forEach(entry => {
            wrapTextLines(context, entry, maxWidth).forEach(line => {
                drawQueue.push({ type: 'text', text: line, font: milestoneFont, color: '#dbefff', lineHeight: 32 });
            });
        });
    }

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

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
        return 'failed';
    }

    let fallbackFromCopy = false;
    if (mode === 'copy') {
        const copied = await copyImageBlobToClipboard(blob);
        if (copied) {
            return 'copied';
        }
        mode = 'download';
        fallbackFromCopy = true;
    }

    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'sols-roll-result.png';
        document.body.appendChild(anchor);
        anchor.click();
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
