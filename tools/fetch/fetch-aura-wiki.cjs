function templateBody(text, start) {
    let depth = 0;
    for (let index = start; index < text.length - 1; index++) {
        const token = text.slice(index, index + 2);
        if (token === '{{') { depth++; index++; }
        else if (token === '}}') { depth--; index++; if (!depth) return text.slice(start + 2, index - 1); }
    }
    return '';
}
function templates(text, name) {
    return [...text.matchAll(new RegExp('\\{\\{\\s*' + name + '\\s*(?=\\||\\n|\\})', 'gi'))]
        .map(match => templateBody(text, match.index));
}
function fields(body) {
    const parts = [];
    let depth = 0, links = 0, block = 0, start = 0;
    for (let index = 0; index < body.length; index++) {
        const rest = body.slice(index);
        if (/^<(tabber|gallery)\b/i.test(rest)) block++;
        if (/^<\/(tabber|gallery)>/i.test(rest)) block--;
        const token = body.slice(index, index + 2);
        if (token === '{{') { depth++; index++; }
        else if (token === '}}') { depth--; index++; }
        else if (token === '[[') { links++; index++; }
        else if (token === ']]') { links--; index++; }
        else if (body[index] === '|' && !depth && !links && !block) { parts.push(body.slice(start, index)); start = index + 1; }
    }
    parts.push(body.slice(start));
    const result = {};
    let positional = 1;
    for (const part of parts.slice(1)) {
        const named = /^\s*([\w() ]+)\s*=([\s\S]*)$/.exec(part);
        if (named) result[named[1].trim().toLowerCase()] = named[2].trim();
        else result[positional++] = part.trim();
    }
    return result;
}
function plainText(text = '') {
    text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');
    text = text.replace(/<tabber>([\s\S]*?)<\/tabber>/gi, (_, tabs) => {
        const sections = tabs.split(/\|-\|/).filter(part => part.trim());
        return (sections.find(part => /^Description\s*=/i.test(part.trim())) || sections[0] || '').replace(/^[^=]*=/, '');
    });
    for (let count = 0; count < 20 && /\{\{[^{}]*\}\}/.test(text); count++) {
        text = text.replace(/\{\{([^{}]*)\}\}/g, (_, body) => {
            const parts = body.split('|');
            if (/^!$/.test(parts[0].trim())) return '|';
            return parts.slice(1).filter(part => !/^\w+\s*=/.test(part)).pop() || '';
        });
    }
    return text.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '')
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
        .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1')
        .replace(/<br\s*\/?\s*>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
        .replace(/'{2,5}/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
        .replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
}
function extract(page, { fullDescription = false } = {}) {
    const revision = page.revisions?.[0];
    const text = revision?.slots.main.content || '';
    const infobox = fields(templates(text, '(?:New)?Aura[ _]?Infobox')[0] || '');
    const quotes = templates(text, 'Quote').map(body => fields(body))
        .filter(quote => /description/i.test(plainText(quote[2] || '')));
    let descriptionMarkup = quotes[0]?.[1] || infobox.description || '';
    let description = plainText(descriptionMarkup);
    if (description && description.replace(/[.\-\/\s]/g, '').length < description.length / 5) {
        const translated = quotes.find(quote => /translated/i.test(quote[2] || ''));
        if (translated) { descriptionMarkup = translated[1]; description = plainText(descriptionMarkup); }
    }
    const words = description.split(/\s+/).filter(Boolean);
    const excerpt = words.slice(0, 25).join(' ');
    const profile = text.split(/==\s*Profile\s*==/i)[1]?.split(/===|\n==/)[0] || '';
    const categories = [...text.matchAll(/\[\[Category:([^\]|]+)/gi)].map(match => match[1].trim());
    const notices = templates(text, 'Aura Notice').map(body => fields(body));
    const rarity = plainText(infobox.aura_rarity || infobox.chance);
    const prerequisite = /^(?:Obtainable|Obtained)\s+after\s+(.+?)(?=\s+1\s*(?:in|\/)|$)/i.exec(rarity)?.[1];
    const biomeTemplates = [infobox.required || '', infobox.aura_rarity || ''].flatMap(value => templates(value, 'Biome').map(body => plainText(fields(body)[1] || ''))).filter(Boolean);
    const required = biomeTemplates.length ? [...new Set(biomeTemplates)].join(' or ') : plainText(infobox.required || infobox.biome);
    const eventText = (profile || text.slice(0, 5000)) + ' ' + notices.map(notice => notice.reason || '').join(' ') + ' ' + categories.join(' ');
    const eventNames = "(?:Halloween|Summer|Winter|Christmas|Valentine(?:'s|s)?(?:\\s+Day)?|April Fool'?s?|Easter|Innovat(?:ion|or)|RIA)";
    const eventMatches = [...eventText.replace(/_/g, ' ').replace(/[’‘]/g, "'").matchAll(new RegExp(eventNames + '\\s*(?:Event\\s*)?20\\d{2}|20\\d{2}\\s*' + eventNames + '(?:\\s*Event)?', 'gi'))];
    const events = [...new Set(eventMatches.map(match => {
        const year = match[0].match(/20\d{2}/)[0];
        const name = match[0].replace(/20\d{2}|Event/gi, '').trim().replace(/Valentine(?:'s|s)?(?:\s+Day)?/i, 'Valentine');
        return name[0].toUpperCase() + name.slice(1) + ' ' + year;
    }))];
    return {
        title: page.title,
        source: 'https://sol-rng.fandom.com/wiki/' + encodeURI(page.title.replace(/ /g, '_')).replace(/#/g, '%23'),
        revisionId: revision?.revid || null,
        description: fullDescription ? description : excerpt,
        ...(fullDescription ? {descriptionMarkup} : {}),
        descriptionTruncated: !fullDescription && words.length > 25,
        rarity,
        nativeRarity: plainText(infobox.native_rarity),
        tier: plainText(infobox.rarity_name),
        required,
        obtainment: plainText(infobox.obtainment) || (prerequisite ? 'After ' + prerequisite : ''),
        categories,
        notice: plainText(notices[0]?.reason || ''),
        status: notices[0]?.type || '',
        exclusive: categories.includes('Biome-Exclusive') || /unobtainable outside/i.test(rarity) || /cannot be rolled (?:via|through) .{0,20}breakthrough|only.{0,30}(?:rolled|obtained).{0,30}biome/i.test(plainText(profile)),
        events
    };
}
module.exports = { templates, fields, plainText, extract };
if (require.main === module) require('./refresh-aura-directory.cjs').refreshDirectory({
    reviewedOn: process.argv.find(argument => argument.startsWith('--reviewed-on='))?.slice(14),
    fromCache: process.argv.includes('--from-cache')
}).catch(error => { console.error(error); process.exitCode = 1; });
