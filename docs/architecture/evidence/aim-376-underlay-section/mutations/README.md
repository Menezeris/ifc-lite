<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIMviewer #376 PDF underlays under a section cut: surgical mutation evidence

Symptom: turning on the section cut made the calibrated PDF underlays disappear for a while, and sometimes they never came back. Cause, in `apps/viewer/src/hooks/useDrawingUnderlay.ts`: under a horizontal cut the underlays of the other storeys were removed from the `PdfPlanePipeline` together with their GPU textures, and every sync (every cut change, every drag step) invalidated all in-flight rasterizations through one global token and started them again. Dragging the cut ran dozens of 4096 px pdf.js rasters at once, none landed in time, turning the cut off rasterized every storey again, and a failed raster (canvas memory) was never retried.

The fix: an underlay off the cut only gets `visible: false` (`underlaysVisibleAtCut` in `aim/underlayAtCut.ts`), its texture stays; `aim/underlayRasterGate.ts` keeps one rasterization per drawing and page across syncs, a landed raster is applied with the latest placement, and a failure frees the slot for the next sync. The page raster is injectable (`rasterize` parameter, pdf.js by default), so `underlaySectionSync.test.ts` drives the real hook and the real `PdfPlanePipeline` over a fake GPU device.

The tests import exports that do not exist on `main` (`underlaysVisibleAtCut`, `UnderlayRasterGate`, the `rasterize` parameter), so reverting production makes them fail to load or call pdf.js: the CI revert oracle reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation. Each patch is written mutant to fixed; the oracle reverse-applies it. Every run ended `OBSERVED` with restoration verified, against base `origin/main`. Records in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `cut-drops-plane.patch` | `useDrawingUnderlay.ts` | the cut removes the underlays off the cut again (old behaviour) | `underlaySectionSync.test.ts` |
| `gate-restarts-raster.patch` | `underlayRasterGate.ts` | the same page is rasterized again on every sync | `underlayRasterGate.test.ts` (also `underlaySectionSync.test.ts`) |
| `gate-fail-keeps-slot.patch` | `underlayRasterGate.ts` | a failed raster keeps its slot, so it is never retried | `underlayRasterGate.test.ts` (also `underlaySectionSync.test.ts`) |
| `gate-settles-superseded.patch` | `underlayRasterGate.ts` | a raster replaced by a newer page still lands | `underlayRasterGate.test.ts` |
| `visible-at-cut-keeps-all.patch` | `underlayAtCut.ts` | the cut leaves every underlay visible | `underlayAtCut.test.ts` |

## Replay

Clean checkout of the branch with dependencies installed and packages built; copy the patches outside the tree (the oracle refuses a dirty tree):

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/underlayRasterGate.ts \
  --test apps/viewer/src/aim/underlayRasterGate.test.ts \
  --mutation /tmp/376-mut/gate-fail-keeps-slot.patch --ci --json
```

`cut-drops-plane` uses `--only apps/viewer/src/hooks/useDrawingUnderlay.ts --test apps/viewer/src/aim/underlaySectionSync.test.ts`, `visible-at-cut-keeps-all` uses `--only apps/viewer/src/aim/underlayAtCut.ts --test apps/viewer/src/aim/underlayAtCut.test.ts`.
