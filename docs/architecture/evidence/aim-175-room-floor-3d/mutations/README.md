<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-125 addendum (#175): room floor fill in 3D, surgical mutation evidence

The change adds the floor fill of coloured or selected rooms in the 3D perspective (`aimRoomFill3d.ts`, drawn through the renderer's IfcAnnotation fill channel 3 cm above the floor covering) and leaves the rooms of the AIM chat lens out of the renderer colours (`aimLensPaint.ts`), so the room volume stays natively translucent instead of a pale opaque mass. The test (`aimRoomFill3d.test.ts`) imports both new modules, so reverting them to the base makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main` (c988e100). The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `covering-ignored.patch` | `aimRoomFill3d.ts` | the fill height ignores the floor covering (stays under it, the bug of #175) | `aimRoomFill3d.test.ts` |
| `ceiling-counted.patch` | `aimRoomFill3d.ts` | a covering high above the room floor (ceiling) or on another storey counts as the floor | `aimRoomFill3d.test.ts` |
| `neighbour-counted.patch` | `aimRoomFill3d.ts` | a covering that only touches the room (neighbouring room) counts | `aimRoomFill3d.test.ts` |
| `above-cut-filled.patch` | `aimRoomFill3d.ts` | a room whose floor is above the horizontal cut is still filled | `aimRoomFill3d.test.ts` |
| `hole-as-outer.patch` | `aimRoomFill3d.ts` | a loop inside the room outline (shaft) becomes a second outline instead of a hole | `aimRoomFill3d.test.ts` |
| `tjunction-unsplit.patch` | `aimRoomFill3d.ts` | triangle edges are not split at T-junctions, so inner edges look like boundary | `aimRoomFill3d.test.ts` |
| `color-channels.patch` | `aimRoomFill3d.ts` | the Lens hex colour is read with red and blue swapped | `aimRoomFill3d.test.ts` |
| `rooms-painted.patch` | `aimLensPaint.ts` | rooms of the `~vol` variant are still sent to the renderer (pale opaque mass) | `aimRoomFill3d.test.ts` |
| `foreign-lens-unpainted.patch` | `aimLensPaint.ts` | a lens that is not the AIM chat lens also loses its room colours | `aimRoomFill3d.test.ts` |

`AimRoomFillLayer.tsx` (the `AimRoomFill3d` component), `aimRoomFill3dStore.ts` and the two `AIM-FORK` blocks (`useLens.ts`, `useViewportSymbolicUploads.ts`) are store and renderer glue with no unit test of their own (the related viewer tests of both upstream files pass, 120/120). They were verified live: local fork viewer embedded in a host page, a synthetic IFC4 model (slab, two IfcSpace 5 x 5 m, an IfcCovering FLOORING 8 cm in each, two walls), full Chromium with WebGPU (SwiftShader) under Xvfb, Playwright posting `APPLY_LENS` (Lobby `#22c55e`, Retail `#3b82f6` by GlobalId). Before: both rooms pale azure, Lens colours indistinguishable, the floor under the covering. After: a green and a blue floor fill at y 0.11 (covering top 0.08 + 0.03), the room volumes translucent, the front wall hides the fill behind it, still visible zoomed out; a selected room gets a blue fill. A fill 3 mm above the covering was hidden by the fill pipeline's negative depth bias, 2 cm was visible, hence the 3 cm lift. The renderer draws on demand, so the upload asks for a frame.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimRoomFill3d.ts \
  --test apps/viewer/src/aim/aimRoomFill3d.test.ts \
  --mutation /tmp/aim175-mut/covering-ignored.patch --ci --json
```

The `aimLensPaint.ts` patches (`rooms-painted`, `foreign-lens-unpainted`) use `--only apps/viewer/src/aim/aimLensPaint.ts`.
