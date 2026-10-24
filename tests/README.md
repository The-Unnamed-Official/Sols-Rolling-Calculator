Run the regression tests with Node.js 20 or newer:

```sh
pnpm install --frozen-lockfile
pnpm test:browser:install
pnpm test
```

Set `TEST_CHROMIUM_EXECUTABLE_PATH` to test a specific Chromium binary, including
Chromium 138. The fragment test also enforces Chromium 138's `outerHTML`
restriction in newer engines so this compatibility bug stays detectable.

Coverage includes all routed aura title artwork, bounded cache behavior,
failed link recovery, desktop and mobile layouts, repeated rolls in both
simulation methods, calculation workers, and identical seeded calculations
with profile links enabled and bypassed. Mobile settings emulate an Android
browser; they do not replace testing on the physical phone.
