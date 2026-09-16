# Wiki title artwork

Version 2.1.1 adapts the title artwork of **all 391 auras in the simulator's aura registry**, including Nothing (1 in 1), mutations, seasonal auras, and the three separate Dreamspace star titles.

## Sources and attribution

The title templates and animation definitions in `scripts/wiki-title-data.js` and `styles/wiki-title-effects.css` are adapted from **Sol's RNG Wiki contributors**, retrieved September 15, 2026:

- [Auras and their title templates](https://sol-rng.fandom.com/wiki/Auras)
- [Aura animation definitions](https://sol-rng.fandom.com/wiki/MediaWiki:AuraKeyframes.css)
- [Common JavaScript](https://sol-rng.fandom.com/wiki/MediaWiki:Common.js) (gradient strokes, Nyctophobia letters, and Illusionary's letter colors)
- [Item names](https://sol-rng.fandom.com/wiki/Items)
- [Tutorial Potion](https://sol-rng.fandom.com/wiki/Tutorial_Potion)
- [Effects](https://sol-rng.fandom.com/wiki/Effects) (Candy Corn and Godlike! buff references)

Each generated aura/item entry also records its individual source URL. Contributor histories are available using the History tab on each linked Wiki page.

The Wiki identifies its community content as **CC BY-SA unless otherwise noted**; see [Fandom's licensing terms](https://www.fandom.com/licensing). The adapted Wiki title data and effects retain that attribution and license. This notice applies to those adaptations, not unrelated simulator code or media.

Fonts load from Google Fonts and CDNFonts, as on the Wiki. They retain their respective font licenses and are not redistributed in this repository. Image export embeds the font faces required by its rendered titles; if a font provider is unavailable, the browser's fallback font remains usable.

`scripts/vendor/html-to-image.js` is html-to-image **1.11.13**, by Bai Chun and contributors, under the MIT license in `scripts/vendor/html-to-image.LICENSE`. Source: [bubkoo/html-to-image](https://github.com/bubkoo/html-to-image/tree/v1.11.13). It loads only when exporting an image.

## Adaptations

- Aura names/rarities and all simulation rules remain in `scripts/main.js`. The title registry changes presentation only. Explicit aliases map the simulator's existing names to renamed Wiki articles.
- The importer keeps text formatting elements and a small attribute allowlist. It removes links, images, scripts, external CSS resources, and unrelated Wiki layout, and namespaces effect classes and keyframes.
- Gradient stroke attributes are compiled into local CSS. An omitted gradient parenthesis in the Hydrogen template is repaired.
- Illusionary's per-letter color effect uses a single visibility-aware scheduler and separate visual randomness. Motion and glitch preferences are respected. Nyctophobia retains its per-letter shake.
- Illusionary, Cryogenic, and Meta rarity numbers use a separate copy of their title styling. Accessible names are separate from decorative duplicate layers; searching and copying use the canonical names.
- The Full Aura Style Rework switch at the bottom of Preferences is on by default. Turning it off immediately shows simple aura names and rarity numbers across existing and future titles, including changelog entries and image exports. The choice persists across reloads; item styling is independent.
- Item templates cover all potion/device/talisman/rune controls exposed by the simulator. Existing short labels are preserved. Tutorial Potion has a plain Wiki title; Candy Corn and Godlike! use their recognizable buff palettes because the Effects page has no formatted title template for them.
- Shared images snapshot the same DOM artwork and embedded font faces instead of maintaining a second set of approximate canvas styles. The exporter embeds only matching font weights, styles, and Unicode ranges.

## Refreshing the reference

`tools/build-wiki-titles.cjs` accepts a reviewed DOM reference directory and a browser asset bundle directory. This is a development tool, not a runtime dependency. The app never downloads Wiki HTML or executes Wiki JavaScript.

1. From the rendered Auras page, collect each `td.table-cell .aura-text` element's `innerHTML`, its row's article link title, and absolute article URL into `wiki-aura-reference.json` as `{url, titles: [{name, url, markup}], styles: [...]}`. `styles` contains the page's inline style text.
2. From Items, collect styled article links into `wiki-item-reference.json` as `{url, links: [{name, text, markup, url}], styles: [...]}`. Review source changes before importing.
3. Bundle the page's stylesheets with the browser asset tool, including AuraKeyframes.css, TextFonts.css, AuraLinkFonts.css, and site.styles. Pass the bundle's directory containing `manifest.json` to the compiler.
4. Install development parser dependencies with `npm install --prefix test-results/wiki-tools cheerio postcss postcss-selector-parser`, then run `node tools/build-wiki-titles.cjs <reference-directory> <asset-bundle-directory>`. `WIKI_STYLE_DEPS` can point to another dependency directory.
5. Review alias changes, animation dependencies, and `wiki-font-text.json`; update `styles/wiki-title-fonts.css` for new font families. The importer fails if any registered aura is missing.
6. Run the simulation and browser tests, then visually review the complete title range at desktop and phone widths, including reduced-motion mode and image exports.
