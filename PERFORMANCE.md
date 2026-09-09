# v2.1.0 runtime rework

The browser runtime now separates simulation execution, scheduling, media loading,
and optional image export. No server is required. The CSS, aura artwork, fonts,
RNG source, and game probability rules are unchanged.

## Runtime changes

- `scripts/simulation-core.js` owns the shared selection and counting engine.
  A 256-bucket index narrows the existing binary search over the original cumulative
  probabilities. It does not approximate weights, change comparisons, or consume
  extra random draws. Floating-point counts continue to support totals above 2³².
- The worker validates aura mappings outside the roll loop and processes 12 ms
  slices. MessageChannel continuations yield to cancellation without nested timer
  delays. Completion still transfers typed count buffers. The local fallback uses
  the same runner with an 8 ms budget. Runs of up to 4,096 rolls avoid worker startup.
- Progress writes are coalesced and disposed when a run ends, preventing a queued
  update from modifying a subsequent run. Fractional roll quantities are normalized
  to whole rolls consistently across execution modes.
- Sol's-Like keeps the selected rolls-per-second cadence and per-roll cutscene
  boundaries. History stores roll numbers and shared presentations keyed by batch,
  aura, native state, and true-chance preference. Only the current 100-entry window
  is mounted; leaving entries are removed and unobserved. Previous/Next navigate
  history, and Latest resumes following. Reviewing a window keeps it stationary
  while new rolls arrive. Search and post-run sorting operate on the full history,
  including cancelled runs, without mounting all matches. Counts, XP, and sharing
  still use full-run results. Starting another run releases the previous history.
- Sigil visibility is tracked incrementally; the flicker loop no longer queries
  the entire document. Removed sigils are unobserved. Feed entries are observed
  once, so appending a summary cannot accidentally re-pause a visible animation.
  Hidden tabs stop polling for glitch text effects.
- `scripts/media-loader.js` shares pending cutscene preparation, cleans up load
  listeners on success/failure, and permits forced recovery. Once playback starts,
  only the next queued cutscene is warmed. Finished Web Audio effects disconnect
  their audio nodes.
- Static, versioned asset tags replace `document.write`, allowing early browser
  asset discovery and cache reuse. Legacy worker cleanup runs once and is scoped
  to this application's directory. Other applications' registrations and caches
  are left alone. `scripts/share-image.js` loads on image-export demand and preserves
  the previous renderer and styles.

## Measurements

Local headless Chrome, comparison against v2.030 (`08e799b`), median of three
10,000,000-roll worker runs using the application's own candidate tables. Timings
include worker startup and completion; they are not guarantees for other devices.

| Luck | v2.030 | v2.1.0 | Throughput improvement |
| --- | ---: | ---: | ---: |
| 1 | 1,167 ms | 583 ms | 2.00× |
| 1,000 | 1,208 ms | 606 ms | 1.99× |
| 1,000,000 | 1,418 ms | 755 ms | 1.88× |

Cancellation acknowledgement measured approximately 6–13 ms. Startup JavaScript
fell from 662,199 to approximately 615,000 decoded bytes (about 7%). A 12,000-roll
Sol's-Like check retained the full history while mounting at most 100 entries,
with 49 markup builds in the measured run (the exact number depends on randomly
selected auras). The previous implementation kept a DOM entry for every roll.

A separate 50,001-entry history stress check at a 390px viewport stayed at 100
mounted rows. Median append time for 500-record batches was 8.5 ms for the first
ten batches and 6.8 ms for the last ten. This isolates feed updates in headless
Chrome; it is not a physical mobile-device benchmark. Review position, an old-only
search match, all sort modes, and returning to the latest roll passed.

The feed still retains lightweight roll history. Extremely long live runs therefore
still consume memory, but live DOM size and append work no longer grow with the
run length. Media/network speed still affects first-time cutscene loading.
No unbounded performance or memory claim is made.

## Verification

Run the dependency-free deterministic checks:

```sh
node --test tests/simulation.test.cjs
```

Browser checks require Playwright and Chrome. Point `PLAYWRIGHT_PATH` at an existing
Playwright package if it is not installed locally, then run:

```sh
node tests/browser.cjs
```

`BROWSER_CHANNEL` can select another installed Chromium channel; `BASELINE_REF`
selects the comparison commit. Set `SKIP_BENCHMARK=1` for functional checks only.
The script starts an ephemeral loopback server, closes it and the browser on exit,
and writes screenshots, an image export, and results into ignored `test-results/`.

Coverage includes exact legacy selection thresholds and seeded samples, combined
potion groups, batch/native counts, frame cancellation, all 391 aura markups,
42 biome/luck/potion contexts, real workers, cancellation, simulated worker failure,
local-file fallback, fractional quantities, 12,000 live rolls with bounded DOM,
50,000-entry history stress at mobile width, review/follow/search/order, actual
PNG export, cutscene preparation/error/skip-all, observer cleanup, and changelog.

For the next release, update the release cache key and static asset query strings
in `index.html` together. Worker imports and lazy scripts inherit that identity.
