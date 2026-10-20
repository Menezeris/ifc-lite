<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-120 section cap: surgical mutation evidence

The change adds the AIM bridge message `SET_SECTION_CAP` (AIMviewer#138): the host switches the section cut surface between hatch, solid fill and none, optionally with a fill colour. It is a new module, `apps/viewer/src/aim/sectionCap.ts`, that calls the same store setters as upstream's Fill slice button and Cap popover (`setSectionShowCap`, `setSectionCapStyle`); `AimBridge.tsx` only routes the message through the command gate. The new test (`sectionCap.test.ts`) imports a module that does not exist on the base, so the CI revert oracle reports INCONCLUSIVE. Each main decision of the module was checked with a surgical mutation instead.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `unknown-cap-accepted.patch` | any string is accepted as the cap look | `sectionCap.test.ts` |
| `color-unchecked.patch` | the fill colour is not checked for `#rrggbb` | `sectionCap.test.ts` |
| `none-forgets-hatch.patch` | `none` does not remember the hatch it hides | `sectionCap.test.ts` |
| `hatch-stays-solid.patch` | `hatch` after a solid fill stays solid instead of returning to the remembered hatch | `sectionCap.test.ts` |
| `fill-alpha-dropped.patch` | a new fill colour drops the current fill opacity | `sectionCap.test.ts` |
| `show-toggle-skipped.patch` | the cut surfaces are never switched on or off | `sectionCap.test.ts` |

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/sectionCap.ts --test apps/viewer/src/aim/sectionCap.test.ts \
  --mutation /tmp/hatch-stays-solid.patch --ci --json
```
