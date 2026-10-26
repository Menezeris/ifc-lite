<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM PDF underlays off at startup: surgical mutation evidence

The change makes the PDF underlays start switched off in 3D (`hidden: true` in `apps/viewer/src/aim/aimUnderlays3d.ts`) and adds `skipUnderlayRaster`, which `useDrawingUnderlay` uses to skip fetching and rasterizing a hidden underlay that has no texture yet. The test (`aimUnderlays3d.test.ts`) imports `skipUnderlayRaster`, which does not exist on `main`, so reverting production makes the test file fail to load and the CI revert oracle (`Changed tests observe production`) reports `REVERT-BROKE-BUILD`. Each decision of the tested module was instead checked with a surgical mutation.

Each patch is written mutant to fixed (the orientation of `git diff -R` of the mutated file); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `default-shown.patch` | the store starts with `hidden: false`, so the PDFs are fetched at startup again | `aimUnderlays3d.test.ts` |
| `skip-ignores-texture.patch` | `skipUnderlayRaster` ignores `hasTexture`, so an underlay that already has a texture stops updating | `aimUnderlays3d.test.ts` |
| `skip-ignores-visible.patch` | `skipUnderlayRaster` ignores `visible`, so a shown underlay without a texture is never rasterized | `aimUnderlays3d.test.ts` |

The wiring in `useDrawingUnderlay.ts`, `AimMapSection.tsx` and `GeoreferencingPanel.tsx` is store and renderer glue with no unit test.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimUnderlays3d.ts \
  --test apps/viewer/src/aim/aimUnderlays3d.test.ts \
  --mutation /tmp/underlays-mut/default-shown.patch --ci --json
```
