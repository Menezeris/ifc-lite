<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIMviewer#324 preset=top orientation: surgical mutation evidence

`SET_CAMERA` with a face preset used `Camera.setPresetView` directly, which turns a repeated face by 90 degrees (ViewCube cycle). The new `presetFresh.ts` ends that cycle with a diagonal preset just before the face. The test (`presetFresh.test.ts`) imports the new module, so reverting production makes it fail to load (INCONCLUSIVE); the one decision of the module was checked with a mutation instead.

The patch is written mutant to fixed; the oracle reverse-applies it. The run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `cycle-break-removed.patch` | `presetFresh.ts` | the diagonal preset before the face is not called, so a repeated `top` advances the cycle | `presetFresh.test.ts` |

The real-camera behaviour is pinned in `packages/renderer/src/camera-preset-cycle-break.test.ts`. The one-line call in `viewCamera.ts` is lazy store glue without a unit test.

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/presetFresh.ts \
  --test apps/viewer/src/aim/presetFresh.test.ts \
  --mutation <copy of cycle-break-removed.patch outside the tree> --ci --json
```
