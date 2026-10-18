<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-085 view queries: surgical mutation evidence

The change extends the AIM view bridge in `apps/viewer/src/aim/`: `SET_SECTION` through the bounds of target elements (`guids` + `fit` along / across / center) or at an exact IFC world coordinate, and a `QUERY` / `QUERY_RESULT` pair for element and model bounds and the current view state. The pure maths lives in the new `viewFrame.ts` and the message checks in `view-protocol.ts`. The test (`view-protocol.test.ts`) imports both, so reverting them to the base (deleting `viewFrame.ts`) makes the test file fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision of the two tested modules was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `fit-accepts-axis.patch` | `view-protocol.ts` | an along/across cut also accepts an explicit axis, so the host could contradict the axis the viewer picks | `view-protocol.test.ts` |
| `query-id-unbounded.patch` | `view-protocol.ts` | the `QUERY` id is not bounded in length | `view-protocol.test.ts` |
| `along-across-swapped.patch` | `viewFrame.ts` | along and across pick each other's axis | `view-protocol.test.ts` |
| `coordinate-axis-unflipped.patch` | `viewFrame.ts` | an IFC coordinate is mapped to the render frame without the Z-up to Y-up swap | `view-protocol.test.ts` |
| `ifc-box-no-reorder.patch` | `viewFrame.ts` | a box moved to IFC world keeps min/max as converted, so the negated axis comes out inverted | `view-protocol.test.ts` |
| `world-offset-dropped.patch` | `viewFrame.ts` | the render frame to IFC world offset is not added | `view-protocol.test.ts` |
| `viewer-axis-mismatch.patch` | `viewFrame.ts` | `viewerAxis` (the copy of `VIEWER_AXIS` kept out of the entry chunk) maps x and z the other way round | `view-protocol.test.ts` |

`viewQueries.ts`, `useAimViewCommands.ts` and the `AimBridge.tsx` wiring are store and renderer glue with no unit test. `viewQueries.ts` and `viewFrame.ts` load on first use (dynamic import from `useAimViewCommands.ts`), and neither imports a module the entry chunk also imports, so the bundler does not pull a shared chunk out of the entry (`viewer-entry-js-bytes`: +968 bytes over main instead of +6,718); they were verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting the bridge messages. `QUERY bounds` returned the spiral stair `38a9vdh9bF5Qg28GWyHhlr` at x 6.718..8.315, y 2.243..3.952, z 0..3.56 and a missing GUID under `missing`; `SET_SECTION fit=along` on it cut on X at 7.517 m (the stair's centre, shown by the viewer's own Section tool); `SET_SECTION axis=y coordinate=1.5` came back from `QUERY view_state` as coordinate 1.5. The same messages were also driven end to end from the AIM host (MCP tool -> Realtime -> host page -> bridge -> reply). A cut through an element sent by a deep link arrives with `MODELS_LOADED`, before the geometry has streamed into the scene; `useAimViewCommands.ts` retries it every 500 ms (up to 30 s, cancelled by a newer cut), which that run confirmed: the deep-linked along-cut landed at X 7.517.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/viewFrame.ts \
  --test apps/viewer/src/aim/view-protocol.test.ts \
  --mutation /tmp/d085-mut/along-across-swapped.patch --ci --json
```

The `view-protocol.ts` patches use `--only apps/viewer/src/aim/view-protocol.ts`, the others `--only apps/viewer/src/aim/viewFrame.ts`.
