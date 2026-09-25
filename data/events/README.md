# Halloween 2026 staging

`halloween2026.json` is deliberately empty and disabled by default. No future aura
names, rarities or release dates have been assumed.

When confirmed aura data is available:

1. Add aura definitions to `auras`, following `AURA_BLUEPRINT_SOURCE` in
   `scripts/main.js`: `name` includes the displayed rarity, `chance` is its numeric
   denominator, and optional `nativeBiomes`, `breakthroughs`, `ignoreLuck` and
   `cutscene` fields use the existing registry schema. JSON breakthrough values
   are explicit numeric multipliers. Avoid duplicating existing aura definitions.
2. Set `status` to `ready` when the data is reviewed. Keep `defaultEnabled: false`
   until explicitly making this the active event.
3. Run `node tools/build-event-data.cjs`. Commit the JSON and generated bundle.
4. Add reviewed wiki title artwork, cutscene assets and filters as needed.

The registry, event lookup, Halloween title palette, biome selectors, Glitched
access and Vampire Hunter's ×0.8 rarity denominator already recognize
`halloween26`. Upcoming events cannot be enabled in the selector.

Summer 2026 remains available for historical simulations but is no longer selected
by default in v2.2.
