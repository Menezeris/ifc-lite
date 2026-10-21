<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-128 camera margin and area, section hatch: surgical mutation evidence

The change extends two AIM bridge messages in `apps/viewer/src/aim/`. `SET_CAMERA` carries `padding` and `area`: the viewer frames the target or the selection with the existing `cameraCallbacks.frameBounds(min, max, {padding})`, and `area` keeps only the elements whose centre lies in the outer third of the view (left/right, top/bottom, front/back), computed by the new pure module `cameraArea.ts`. Framing is now awaited, so `APPLIED` reports the final camera instead of the preset pose (AIMviewer#172). `SET_SECTION_CAP` carries `pattern`, `angleDeg`, `secondaryAngleDeg`, `spacingPx` and `widthPx`, written with `setSectionCapStyle`, the setter of the Cap popover (AIMviewer#173). No change to `packages/renderer`.

`cameraArea.test.ts` imports the new module, so reverting production makes it fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision of the tested modules was checked with a surgical mutation instead. Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. Full records: `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `area-half-not-third.patch` | `cameraArea.ts` | the area is the half instead of the outer third, so a parapet across the full width counts as left | `cameraArea.test.ts` |
| `area-fallback-first.patch` | `cameraArea.ts` | with an empty third the first element is framed, not the one nearest the edge | `cameraArea.test.ts` |
| `area-front-is-far.patch` | `cameraArea.ts` | `front` picks the elements far from the camera | `cameraArea.test.ts` |
| `axes-degenerate-accepted.patch` | `cameraArea.ts` | an `up` along the view direction gives screen axes instead of null | `cameraArea.test.ts` |
| `cap-pattern-ignored.patch` | `sectionCap.ts` | the host pattern is ignored and the stored hatch comes back (the vertical hatch of #173) | `sectionCap.test.ts` |
| `cap-angle-degrees.patch` | `sectionCap.ts` | the angle is written in degrees where the store keeps radians | `sectionCap.test.ts` |
| `cap-pattern-on-solid.patch` | `sectionCap.ts` | a pattern is accepted with `cap: 'solid'` | `sectionCap.test.ts` |
| `padding-unbounded.patch` | `view-protocol.ts` | `SET_CAMERA.padding` is not bounded to 1..4 | `view-camera.test.ts` |

`viewCamera.ts` is store and renderer glue with no unit test. It was driven live: local fork viewer embedded in a host page, `tests/models/ara3d/AC20-FZK-Haus.ifc`, Playwright posting bridge messages. After `SET_SECTION axis=z position=50` and `SET_CAMERA preset=section` (orthographic, target X 6), `SET_CAMERA preset=section selector=IfcWall padding=1.4 area=left` came back in `APPLIED` with target X 3.705 and `ortho_size` 4.689, `area=right` with X 9.705; a following `QUERY view_state` returned the same pose, so `APPLIED` carries the final camera. `SET_SECTION_CAP` with `pattern=diagonal angleDeg=45 spacingPx=12` replaced a stored `vertical` hatch in the persisted cap style (`angleRad` 0.785, `spacingPx` 12), `crossHatch 0/-90` and `concrete` likewise. The container's software WebGPU lost the device, so there are no rendered screenshots; check the hatch picture with the "Ako vyskúšať" link.

## Replay

Use a clean checkout of the branch with dependencies installed and copy the patches outside the tree (the oracle refuses a dirty tree), for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/cameraArea.ts \
  --test apps/viewer/src/aim/cameraArea.test.ts \
  --mutation /tmp/d128-mut/area-half-not-third.patch --ci --json
```

`sectionCap.ts` patches use `--test apps/viewer/src/aim/sectionCap.test.ts`, `padding-unbounded.patch` uses `--only apps/viewer/src/aim/view-protocol.ts --test apps/viewer/src/aim/view-camera.test.ts`.
