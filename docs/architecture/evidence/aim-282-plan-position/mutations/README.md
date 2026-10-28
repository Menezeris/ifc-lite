<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #282 / D-161 step 3: camera position on a calibrated PDF plan, surgical mutation evidence

The change adds the pure module `apps/viewer/src/aim/planPosition.ts` (page position and heading of the live camera on a calibrated plan, and the `plan_position` state), the switch store `aimPlanPosition.ts`, the `SET_PLAN_POSITION` bridge message and the marker / switch components. The test (`planPosition.test.ts`) imports modules that do not exist on `main`, so reverting production makes it fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant to fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `top-unflipped.patch` | `planPosition.ts` | the page y axis is not flipped, so the dot lands mirrored top to bottom | `planPosition.test.ts` |
| `edge-unbounded.patch` | `planPosition.ts` | a camera far outside the page still gets a marker | `planPosition.test.ts` |
| `up-fallback-dropped.patch` | `planPosition.ts` | a top-down camera (target above position) takes no heading from `up` | `planPosition.test.ts` |
| `forward-z-unnegated.patch` | `planPosition.ts` | the world Z (render) forward is not negated into IFC Y, so north and south swap | `planPosition.test.ts` |
| `heading-not-wrapped.patch` | `planPosition.ts` | `heading_deg` of a marker can be negative instead of 0..359 |
| `first-marker-only.patch` | `planPosition.ts` | `plan_position.markers` keeps only the first marker, so a second tile with a PDF is invisible to the chat |
| `markers-unsorted.patch` | `planPosition.ts` | `markers` come in insertion order instead of by document and page, so the state flips between reads | `planPosition.test.ts` |
| `message-unchecked.patch` | `view-protocol.ts` | `SET_PLAN_POSITION` is not validated (a non-boolean `show` passes) | `planPosition.test.ts` |

`AimPlanMarker.tsx`, `AimPlanPositionToggle.tsx` and the `PdfPage` / `DocumentPane` / `AimTileGrid` wiring are store and renderer glue with no unit test; they were verified live (Playwright, local fork viewer in an iframe of a stub host page, `packages/cli/examples/delivery/clean-model.ifc`, a generated one-page PDF calibrated so the default camera lands at the page centre): the marker sits at 50 % / 50 %, moves to 70 % / 50 % after `SET_CAMERA` +2 m in IFC x (heading 0 looking north), `SET_PLAN_POSITION false` removes it and sets `enabled:false`, the "Position" button brings it back, and it works in a tab beside 3D and in a `split_h` tile.
