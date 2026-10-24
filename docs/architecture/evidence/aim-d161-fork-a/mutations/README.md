<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-161 Fork A: surgical mutation evidence

The change (Menezeris/ifc-lite#145) adds new modules in `apps/viewer/src/aim/`: `storeyViews.ts` (saved view of a storey for `mode=2d`), `underlayAtCut.ts` (PDF underlay under a horizontal cut), and the lazy saved-views bridge `views-protocol.ts`, `viewsCodec.ts`, `viewsBridge.ts`. Their tests import exports that do not exist on `main`, so reverting production to the base makes the test files fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE; the PR carries the `revert-oracle-exempt` label. Each main decision of these modules was instead checked with a surgical mutation.

Each patch is written mutant to fixed (the orientation of `git diff -R` of the mutated file); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main` (30b048050) and head 16fc2f765. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `activate-without-target.patch` | `views-protocol.ts` | VIEW_ACTIVATE without id and name is accepted | `views-protocol.test.ts` |
| `basket-all-unchecked.patch` | `viewsCodec.ts` | any basket with source "visible" is stored as scope "all" even when edited | `viewsCodec.test.ts` |
| `camera-offset-dropped.patch` | `viewsCodec.ts` | the camera is written to the wire without the model frame offset | `viewsCodec.test.ts` |
| `cut-offset-dropped.patch` | `underlayAtCut.ts` | the frame offset is not added, the cut height is in render instead of IFC Z | `underlayAtCut.test.ts` |
| `fingerprint-includes-name.patch` | `viewsCodec.ts` | a rename changes the content fingerprint, so VIEW_SAVE is sent instead of VIEW_RENAME | `viewsCodec.test.ts` |
| `hydrate-echoes-to-host.patch` | `viewsBridge.ts` | views loaded from the host are sent back as VIEW_SAVE | `viewsBridge.test.ts` |
| `mass-removal-guard-dropped.patch` | `viewsBridge.ts` | three or more views removed at once are sent to the host as deletes | `viewsBridge.test.ts` |
| `next-level-same-level.patch` | `storeyViews.ts` | a storey at the same level (federated model) counts as the next higher storey | `storeyViews.test.ts` |
| `plane-coordinate-ignored.patch` | `viewsCodec.ts` | the section is restored from the percentage, not the exact IFC coordinate | `viewsCodec.test.ts` |
| `reset-detection-dropped.patch` | `viewsBridge.ts` | a new file (session-reset) does not re-fill the views from the last host list | `viewsBridge.test.ts` |
| `session-restarted-per-message.patch` | `viewsBridge.ts` | the bridge session restarts with every message and forgets which views the host owns | `viewsBridge.test.ts` |
| `storey-upper-bound-inclusive.patch` | `storeyViews.ts` | a cut exactly at the next storey level still belongs to the lower storey | `storeyViews.test.ts` |
| `storey-view-name-ignored.patch` | `storeyViews.ts` | several saved views match, the one named after the storey is no longer preferred | `storeyViews.test.ts` |
| `underlay-flipped-ignored.patch` | `underlayAtCut.ts` | a flipped cut (view from below) is treated as an unflipped one | `underlayAtCut.test.ts` |
| `underlay-nearest-lowest.patch` | `underlayAtCut.ts` | the farthest storey below the cut is drawn instead of the nearest | `underlayAtCut.test.ts` |
| `views-load-some-valid.patch` | `views-protocol.ts` | a VIEWS_LOAD with one valid row is accepted although another row is invalid | `views-protocol.test.ts` |

Not covered by a unit test (store and renderer glue, checked live in an embedded viewer with Playwright, FZK-Haus): `useAimViewCommands.ts` (`mode=2d` camera and cut), `useAimCalibrationExit.ts` apart from its pure `calibrationEndedLocked`, `useDrawingUnderlay.ts` wiring, `AimRoomFillLayer.tsx`.

## Replay

Use a clean checkout of the branch with dependencies installed and the prebuilt WASM (`node scripts/fetch-prebuilt-wasm.mjs`). Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/underlayAtCut.ts \
  --test apps/viewer/src/aim/underlayAtCut.test.ts \
  --mutation /tmp/d161-mut/cut-offset-dropped.patch --ci --json
```

Each patch uses `--only` of its module and `--test` of its test (`viewsBridge.ts` with `apps/viewer/src/aim/integration/viewsBridge.test.ts`).
