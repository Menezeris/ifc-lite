<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-137 route line: surgical mutation evidence

The change adds the `ROUTE_SHOW` bridge message (AIM #223): the host sends the points of an escape or shortest route in IFC world (computed by the host 1.6 m above the floor, the floor covering and every stair tread, through the centre of each door) and the fork draws them as a solid coloured polyline over the scene (`AimRouteLayer`, mounted in `CapturePinLayer` next to `AimRoomFillLayer`). The pure maths lives in the new `aimRoute.ts` (IFC world to render frame, SVG path from projected points) and the message check in `view-protocol.ts`. The test (`route-show.test.ts`) imports the new module, so reverting it to the base makes the test file fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `world-offset-dropped.patch` | `aimRoute.ts` | the render frame offset is ignored on X and Y, so the line drifts off a model with an RTC offset | `route-show.test.ts` |
| `path-not-broken.patch` | `aimRoute.ts` | a point that cannot be projected (behind the camera) does not break the line, so it joins across the gap | `route-show.test.ts` |
| `lone-point-drawn.patch` | `aimRoute.ts` | a single projected point yields an `M` without a segment instead of nothing | `route-show.test.ts` |
| `single-point-accepted.patch` | `view-protocol.ts` | a one-point route (not a line) is accepted | `route-show.test.ts` |
| `color-unchecked.patch` | `view-protocol.ts` | any string passes as the colour, not only `#rrggbb` | `route-show.test.ts` |

`aimRouteStore.ts`, `routeShow.ts`, `AimRouteLayer.tsx`, the `useAimViewCommands.ts` case and the `CapturePinLayer.tsx` mount are store and renderer glue with no unit test. `routeShow.ts` loads on first use (dynamic import from `useAimViewCommands.ts`); the layer sits in the lazy `CapturePinLayer` chunk.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimRoute.ts \
  --test apps/viewer/src/aim/route-show.test.ts \
  --mutation /tmp/d137-mut/path-not-broken.patch --ci --json
```

The `view-protocol.ts` patches use `--only apps/viewer/src/aim/view-protocol.ts`, the others `--only apps/viewer/src/aim/aimRoute.ts`.
