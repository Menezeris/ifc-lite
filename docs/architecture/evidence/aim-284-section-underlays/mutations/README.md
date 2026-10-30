<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIMviewer #284 section underlays: surgical mutation evidence

The change reads the host's `georefV2.calibrations[]` (AIM D-179): an entry with `plane = {origin, u, v}` (IFC metres, Z up) is a vertical underlay of one PDF page. The maths lives in the new `packages/drawing-underlay/src/section-plane.ts` (parse, page -> plane -> world corners, region, save shape) plus the back-side flag in `pdf-plane-pipeline.ts`; the viewer side in the new `apps/viewer/src/aim/sectionUnderlays.ts` (one store record per calibration, wire id = document id, `UNDERLAY_SAVE` with `source: manual` after a move) and in `underlaysPlan.ts` / `underlayAtCut.ts` (wire `document_id` -> all records of the document, saved views, no section under a horizontal cut). The tests (`section-plane.test.ts`, `sectionUnderlays.test.ts`) import modules that do not exist on `main`, so a blunt revert makes them fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `plane-ignored.patch` | `section-plane.ts` | the `plane` of a calibration is ignored, so no section underlay is created | `section-plane.test.ts` |
| `s-along-v.patch` | `section-plane.ts` | page s runs along v and t along u | `section-plane.test.ts` |
| `region-ignored.patch` | `section-plane.ts` | a page `region` does not crop the quad and texture | `section-plane.test.ts` |
| `lift-dropped.patch` | `section-plane.ts` | the quad is not lifted off the cut faces along `u x v` | `section-plane.test.ts` |
| `source-from-placement.patch` | `section-plane.ts` | a save takes `source` from the parsed placement, so a second save after a manual move says `auto` again | `section-plane.test.ts` |
| `winding-flip-inverted.patch` | `section-plane.ts` (`windingFlip`, used by `pdf-plane-pipeline.ts`) | the reading side and the faint back side swap | `section-plane.test.ts` |
| `plan-of-section-doc-kept.patch` | `sectionUnderlays.ts` | a section document keeps its v1 placement, drawn as a floor plan | `sectionUnderlays.test.ts` |
| `ids-without-index.patch` | `sectionUnderlays.ts` | several calibrations of one document share one store key | `sectionUnderlays.test.ts` |
| `save-never-manual.patch` | `sectionUnderlays.ts` | a moved section is saved without `source: manual` | `sectionUnderlays.test.ts` |
| `documents-override-underlays.patch` | `sectionUnderlays.ts` | a section from DOCUMENTS_LOAD replaces the same one from UNDERLAYS_LOAD | `sectionUnderlays.test.ts` |
| `wire-id-exact-only.patch` | `underlaysPlan.ts` | a wire `document_id` matches only a record with the same key, not the calibrations of the document | `sectionUnderlays.test.ts` |
| `snapshot-per-record.patch` | `underlaysPlan.ts` | a saved view stores one item per record, the same `document_id` twice | `sectionUnderlays.test.ts` |
| `kind-dropped.patch` | `underlaysPlan.ts` | `get_viewer_state.underlays` reports a section as a plan | `sectionUnderlays.test.ts` |
| `section-under-cut.patch` | `underlayAtCut.ts` | a section underlay is drawn under a horizontal storey cut | `sectionUnderlays.test.ts` |

`docBridge.ts`, `underlaysApply.ts` and the `AIM-FORK` blocks in `useDrawingUnderlay.ts`, `DrawingUnderlayPanel.tsx`, `DrawingPlanPane.tsx` and `DrawingLocationOverlay3D.tsx` are store and renderer glue. They were run live: local fork viewer in an iframe of a stub host page, `tests/models/ara3d/AC20-FZK-Haus.ifc`, a generated A3 PDF "REZ A", Playwright posting `UNDERLAYS_LOAD` with `georefV2.calibrations[0].plane = {origin: [0, 4, 0], u: [1, 0, 0], v: [0, 0, 1]}` (the model's centre line) and `SET_UNDERLAYS_3D show`. `QUERY view_state` returned the underlay as `{document_id: "rez-a", kind: "section", storey_guid: null, visible: true, opacity: 0.8}`; `SET_UNDERLAYS_3D {underlays: [{document_id: "rez-a", opacity: 0.3}], persist: true}` sent `UNDERLAY_SAVE {documentId: "rez-a", page: 1, calibrationIndex: 0, georef: {version: 2, plane, opacity: 0.3, source: "auto", mark: "A", ...}}` (host field `mark` kept, `source` unchanged by an opacity change). The same run with the built `section-plane.js` mutated to ignore `plane` (and the message without `plane`) left `underlays: []` and no save. The modified WGSL validates with naga 30 (`Validation successful`). The 3D picture itself could not be taken in that container: swiftshader WebGPU lost the device on every run, also with no underlay and on a floor plan, so the front / back view of the plane is for the "Ako vyskúšať" check on the PR preview.

## Replay

Use a clean checkout of the branch with dependencies installed and `packages/drawing-underlay` built. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only packages/drawing-underlay/src/section-plane.ts \
  --test packages/drawing-underlay/src/section-plane.test.ts \
  --mutation /tmp/284-mut/plane-ignored.patch --ci --json
```

`--only` is the module in the table; `--test` is `packages/drawing-underlay/src/section-plane.test.ts` for the package patches and `apps/viewer/src/aim/sectionUnderlays.test.ts` for the viewer patches.
