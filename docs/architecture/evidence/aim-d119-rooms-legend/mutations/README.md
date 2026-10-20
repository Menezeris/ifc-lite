<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-119 rooms and colours from chat: surgical mutation evidence

Three AIM host requests (AIMviewer #135, #136, #137): chat Lens and `SHOW` / `ISOLATE` turn on the hidden IfcSpace / IfcSpatialZone class they target; `aim/AimRoomFillLayer.tsx` fills and labels Lens-coloured rooms in the 2D plan (the room's floor face z-fights with the slab, so the Lens colour showed only in stripes); `APPLY_LENS` carries `autoColorScope` (colour-by limited to the call's filter through upstream `Lens.capturedScope`, or to the visible elements when the view is narrowed) and `legend: 'large' | 'normal'` (Lens panel as a large floating window, legend not capped). The pure parts are the new `aimRoomFill.ts` and new exports of `aimLensPlan.ts`; their tests (`aimRoomFill.test.ts`, `aimLensLegend.test.ts`) import exports that do not exist on `main`, so reverting production makes the tests fail to load (`REVERT-BROKE-BUILD`). Each behavioural decision was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `origin-ignored.patch` | `aimRoomFill.ts` | the per-element `MeshData.origin` is not added, so the fill lands away from the room | `aimRoomFill.test.ts` |
| `walls-in-footprint.patch` | `aimRoomFill.ts` | every triangle (walls, ceiling) goes into the footprint, not only the floor face | `aimRoomFill.test.ts` |
| `mixed-winding.patch` | `aimRoomFill.ts` | triangles keep their own winding, so `nonzero` fill cancels overlapping ones | `aimRoomFill.test.ts` |
| `diagonal-in-outline.patch` | `aimRoomFill.ts` | the outline also draws the inner triangulation edges | `aimRoomFill.test.ts` |
| `scope-without-autocolor.patch` | `aimLensPlan.ts` | `autoColorScope` is accepted on a rule lens without `autoColor` | `aimLensLegend.test.ts` |
| `scope-guid-cap.patch` | `aimLensPlan.ts` | the bridge GlobalId cap is not applied to the scope | `aimLensLegend.test.ts` |
| `legend-only-rejected.patch` | `aimLensPlan.ts` | a message that only resizes the legend is rejected | `aimLensLegend.test.ts` |
| `legend-replace-accepted.patch` | `aimLensPlan.ts` | `replace` with only a legend size is accepted (it would delete the chat lens) | `aimLensLegend.test.ts` |
| `legend-panel-uncapped.patch` | `aimLensPlan.ts` | the large-legend window is not capped at 960 px | `aimLensLegend.test.ts` |

`aimLensScope.ts`, `AimRoomFillLayer.tsx` and the `aimLens.ts` / `visibility-commands.ts` glue have no unit test. They were verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting bridge messages (Chromium with WebGPU over SwiftShader under Xvfb). Lens `isolate` on `IfcSpace`: 7 rooms visible (before: matched 7, empty scene). 2D Erdgeschoss with three rooms coloured: filled and labelled in place (before: stripes, one room invisible). `autoColor material` with an `IfcWall` scope: 1 material / 13 walls (whole model: 6); without a scope after isolating 4 slabs: 2 materials / 4 elements. `legend: 'large'`: 960 px floating window scrolled to a 52-value legend, not capped; `normal` docks it again.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimRoomFill.ts \
  --test apps/viewer/src/aim/aimRoomFill.test.ts \
  --mutation /tmp/d119-mut/origin-ignored.patch --ci --json
```

For the `aimLensPlan.ts` patches use `--only apps/viewer/src/aim/aimLensPlan.ts --test apps/viewer/src/aim/aimLensLegend.test.ts`.
