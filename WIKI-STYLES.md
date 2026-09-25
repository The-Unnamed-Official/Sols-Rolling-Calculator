# Wiki title artwork

Aura and item title templates are adapted from Sol's RNG Wiki contributors under
[CC BY-SA, unless otherwise noted](https://www.fandom.com/licensing).
Each entry in `scripts/wiki-title-data.js` records its source page.

The v2.2 reworks were reviewed on September 25, 2026 against the wiki's live aura
navigation templates. The source markup is retained in
`tools/wiki-title-overrides.json`, and the build tool applies these overrides to
future full-wiki builds. Presentation classes are scoped to `wiki-ref-*`; the
malformed BREAKTHROUGH text-stroke declaration has its missing semicolon repaired.

- [HellFire](https://sol-rng.fandom.com/wiki/HellFire)
- [Virtual : Ultimate](https://sol-rng.fandom.com/wiki/Virtual_:_Ultimate)
- [Volcanic](https://sol-rng.fandom.com/wiki/Volcanic)
- [Hellborn](https://sol-rng.fandom.com/wiki/Hellborn)
- [Undead](https://sol-rng.fandom.com/wiki/Undead)
- [Memory](https://sol-rng.fandom.com/wiki/Memory)
- [Oblivion](https://sol-rng.fandom.com/wiki/Oblivion)
- [Breakthrough](https://sol-rng.fandom.com/wiki/Breakthrough_(Aura))

Hellborn's title background is loaded from the wiki's
[HellbornFireBackground.png](https://static.wikia.nocookie.net/sol-rng/images/8/80/HellbornFireBackground.png/revision/latest?cb=20260922121817)
in the scoped `.wiki-ref-Hellborn-Background` rule.

All 40 equipment title colors come from the [Items](https://sol-rng.fandom.com/wiki/Items)
and [Talismans](https://sol-rng.fandom.com/wiki/Talismans) templates, retrieved on
September 25, 2026. `tools/wiki-equipment-reference.json` retains the individual
page sources and reviewed markup. Neurolyzer uses the wiki's Neuralyzer entry;
Singularity Device uses Singularity Gauntlet. The requested display names are retained.
