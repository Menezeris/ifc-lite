<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-124 host dimensions (`MEASURE_SHOW`): surgical mutation evidence

The change adds the bridge message `MEASURE_SHOW { segments: [{ a, b }], keep? }`: segments in IFC world coordinates (Z up, metres) that the host measured (`ifc_measure` in AIMviewer) are put into the upstream Measure tool as finished measurements, the same way two clicks would (`addMeasurePoint` + `completeMeasurement`). The upstream `MeasurementSceneLayer` draws them, with the viewer's units, even while the Measure tool is closed; nothing new is rendered. The new module `hostMeasurements.ts` (no store import, so the test runs in the fast CI lane without WASM; the lazy `measureShow.ts` binds it to the viewer store) converts the points to the render frame like the host camera pose (`ifcPointToRender`, `bcfWorldOffset`) and remembers the measurements it added, so the next message without `keep` replaces them while the user's own measurements and a half-done user pick stay. `view-protocol.ts` validates the message (1 to 12 segments, finite coordinates, boolean `keep`).

The test (`measure-show.test.ts`) imports `addHostMeasurements` from the new module and drives it with a small store that behaves like `measurementSlice` (whose imports pull in WASM), so reverting it to the base (deleting `hostMeasurements.ts`) makes the test file fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each decision of the two tested modules was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `offset-ignored.patch` | `hostMeasurements.ts` | the render frame offset is not applied to the first point | `measure-show.test.ts` |
| `keep-ignored.patch` | `hostMeasurements.ts` | `keep` is ignored, every message replaces the host dimensions | `measure-show.test.ts` |
| `host-never-replaced.patch` | `hostMeasurements.ts` | a message without `keep` does not remove the previous host dimensions | `measure-show.test.ts` |
| `user-measurements-deleted.patch` | `hostMeasurements.ts` | replacing also deletes the user's own measurements | `measure-show.test.ts` |
| `pending-dropped.patch` | `hostMeasurements.ts` | the user's half-done pick (`pendingMeasurePoint`) is lost | `measure-show.test.ts` |
| `segment-limit-dropped.patch` | `view-protocol.ts` | more than 12 segments are accepted | `measure-show.test.ts` |
| `keep-any-type.patch` | `view-protocol.ts` | `keep` of any type is accepted | `measure-show.test.ts` |

The `measureShow.ts` store binding and the `useAimViewCommands.ts` wiring (lazy import, `MEASURE_SHOW` case) have no unit test; it was verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting the bridge messages and reading `APPLIED` and the overlay labels in the viewer frame. One segment showed `3.000 m`; a second message with three segments replaced it (`5.000 m`, `4.000 m`, `2.500 m`); a third with `keep` added `1.200 m` (the scene chip read "4 measured"); a message with 13 segments changed nothing. Bundle: `viewer-entry-js-bytes` and `viewer-eager-js-bytes` stay under their ceilings (the module loads on first use).

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/hostMeasurements.ts \
  --test apps/viewer/src/aim/measure-show.test.ts \
  --mutation /tmp/d124-mut/offset-ignored.patch --ci --json
```

The `view-protocol.ts` patches use `--only apps/viewer/src/aim/view-protocol.ts`.
