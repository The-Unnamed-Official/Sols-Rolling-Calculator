const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRichText } = require('../lib/aura-rich-text.cjs');

test('wiki emphasis preserves nested safe HTML without exposing formatting tags', () => {
    const rich = createRichText({});
    const html = rich.markup(`<center>Long ago, ''<b><span style="color: rgb(189,228,253); font-family: 'Playfair Display';">a Knight</span></b>'' swore an oath.</center>`);
    assert.match(html, /<em><strong><span style="color:rgb\(189,228,253\);font-family:&#39;Playfair Display&#39;">a Knight<\/span><\/strong><\/em>/);
    assert.doesNotMatch(html, /&lt;|&gt;/);
});

test('wiki descriptions continue to strip active content and unsafe styles', () => {
    const html = createRichText({}).markup(`'''<span onclick="alert(1)" style="color:red;background:url(https://example.com/image);position:fixed">safe</span>'''<script>alert(2)</script>`);
    assert.equal(html, '<strong><span style="color:red">safe</span></strong>');
});
