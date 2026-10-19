<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-098 camera: surgical mutation evidence

The change extends the AIM bridge message `SET_CAMERA` in `apps/viewer/src/aim/`: preset `keep` (direction unchanged) and `section` (upstream's Set view of the active plane), `fit` `visible` (`fitAll`) or `selection` (`frameSelection`), a `selector` target (`resolveSelector` + `flyTo`) and an exact `viewpoint` from the host (`applyViewpoint`). Framing now waits for the direction animation, which fixes "preset front/back with a target does not move the camera" (AIMviewer #65). `view_state` also returns the camera `up`, `fov_deg`, `ortho_size` and `aspect`. The new test (`view-camera.test.ts`) imports `ifcPointToRender` / `ifcDirToRender` / `renderDirToIfc`, which do not exist on the base, so the CI revert oracle reports INCONCLUSIVE. Each main decision of the three tested modules was checked with a surgical mutation instead.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `viewpoint-with-preset.patch` | `view-protocol.ts` | a host pose is accepted together with a preset, so the two would contradict each other | `view-camera.test.ts` |
| `two-targets-allowed.patch` | `view-protocol.ts` | more than one framing target (guids, selector, fit) is accepted | `view-camera.test.ts` |
| `viewpoint-zero-up.patch` | `view-protocol.ts` | a pose with a zero `up` vector is accepted | `view-camera.test.ts` |
| `ifc-point-offset-dropped.patch` | `viewFrame.ts` | an IFC world point goes to the render frame without the world offset | `view-camera.test.ts` |
| `section-step-keeps-direction.patch` | `viewCommands.ts` | preset `section` is treated as `keep`, so the camera does not turn to the cut | `view-camera.test.ts` |

`viewCamera.ts` (lazy, loaded on the first `SET_CAMERA`) and the `viewQueries.ts` camera fields are store and renderer glue with no unit test. They were verified live: local fork viewer embedded in a host page, `apps/viewer/public/_fixtures/AC20-FZK-Haus.ifc`, Playwright posting the bridge messages and reading `QUERY view_state` back (IFC world, m):

| Message | Camera position -> target |
|---|---|
| start | (27.6, -17.6, 20.659) -> (6, 4, 2.659) |
| `preset: front, guids: [stair 38a9vdh9bF5Qg28GWyHhlr]` | (7.517, -3.085, 1.78) -> (7.517, 3.097, 1.78), the stair's centre from -Y |
| `preset: back`, same stair | (7.517, 9.279, 1.78) -> (7.517, 3.097, 1.78), from +Y |
| `SET_SECTION fit=along` on the stair, then `preset: section, fit: visible` | (47.431, 5.006, 2.659) -> (6, 5, 2.659): looking along -X at the cut at X 7.517 (ViewCube: RIGHT) |
| `preset: iso, fit: visible, projection: perspective` | (34.194, -23.177, 26.14) -> (6, 5, 2.659) |
| `preset: keep, viewpoint` = iso pose at distance x 1.15 (host "zoom out 15 %") | (38.423, -27.404, 29.662) -> (6, 5, 2.659), distance ratio 1.15 |
| `preset: keep, selector: {types: [IfcStairFlight, IfcStair]}` | (11.347, -0.731, 4.97) -> (7.517, 3.097, 1.78) |

Headless Chromium (SwiftShader) lost the WebGPU device, so screenshots show no geometry; the poses above come from the renderer's camera through `view_state`. The engine was the published `@ifc-lite/wasm` 10.4.0 package, since `wasm-pack` was not available locally.

Bundle (local build, same method as CI): `viewer-entry-js-bytes` 3,157,487 on `main` -> 3,158,794 (+1,307, inside the +0.10 % tolerance of the 3,157,424 ceiling, no raise); `viewer-eager-js-bytes` +1,269.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/view-protocol.ts \
  --test apps/viewer/src/aim/view-camera.test.ts \
  --mutation /tmp/d098-mut/viewpoint-with-preset.patch --ci --json
```

`--only` is the module named in the table.
