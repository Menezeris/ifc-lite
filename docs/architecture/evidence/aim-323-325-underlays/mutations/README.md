<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #323 / #325 PDF underlays one by one in 3D and in saved views: surgical mutation evidence

The change lets the AIM host control single PDF underlays in 3D (`SET_UNDERLAYS_3D.underlays`, `only`, `persist`), reports them in `get_viewer_state.underlays` and stores their 3D state with a saved view (`ViewWire.underlays`, restored when the view is activated). The pure logic lives in the new `underlaysPlan.ts`; the message checks in `view-protocol.ts` and `views-protocol.ts`; the saved view encoding in `viewsCodec.ts`. `underlaysPlan.test.ts` and `aimUnderlays3d.test.ts` import the new module, so reverting production to the base makes them fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `override-ignored.patch` | `underlaysPlan.ts` | the per-underlay override is ignored in 3D | `underlaysPlan.test.ts` |
| `hide-all-loses.patch` | `underlaysPlan.ts` | an override wins over the global "underlays off in 3D" | `underlaysPlan.test.ts` |
| `only-hides-named.patch` | `underlaysPlan.ts` | `only` also hides the underlay it should show | `underlaysPlan.test.ts` |
| `unknown-written.patch` | `underlaysPlan.ts` | an id that is not a calibrated drawing still gets an override | `underlaysPlan.test.ts` |
| `snapshot-saved-only.patch` | `underlaysPlan.ts` | the saved view takes the calibration's `visible`, not the state shown in 3D | `underlaysPlan.test.ts` |
| `view-opacity-unbounded.patch` | `underlaysPlan.ts` | a saved view accepts opacity outside 0..1 | `underlaysPlan.test.ts` |
| `only-without-items.patch` | `view-protocol.ts` | `only` is accepted without `underlays` | `aimUnderlays3d.test.ts` |
| `codec-drops-underlays.patch` | `viewsCodec.ts` | the underlay state is not written into the view wire | `viewsCodec.test.ts` |
| `view-wire-unchecked.patch` | `views-protocol.ts` | `VIEWS_LOAD` does not validate `underlays` | `views-protocol.test.ts` |

`underlaysApply.ts` (store glue), the `viewsBridge.ts` capture and restore, the `useAimViewCommands.ts` / `viewQueries.ts` wiring and the `useDrawingUnderlay.ts` AIM-FORK block have no unit test; they were verified live in an embedded viewer (see the PR).

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/underlaysPlan.ts \
  --test apps/viewer/src/aim/underlaysPlan.test.ts \
  --mutation /tmp/u-mut/override-ignored.patch --ci --json
```

`only-without-items` uses `--only apps/viewer/src/aim/view-protocol.ts --test apps/viewer/src/aim/aimUnderlays3d.test.ts`, `codec-drops-underlays` `--only .../viewsCodec.ts --test .../viewsCodec.test.ts`, `view-wire-unchecked` `--only .../views-protocol.ts --test .../views-protocol.test.ts`.
