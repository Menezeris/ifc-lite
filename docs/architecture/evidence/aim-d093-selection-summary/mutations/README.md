<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-093 selection summary: surgical mutation evidence

`QUERY view_state` used to cut the selection to the first 50 GUIDs with no class, storey or parent (AIMviewer issue #64: a whole curtain wall of 1810 parts read as "only 1NP"). The reply now carries `selection.summary`, counted over the WHOLE selection by IFC class, storey (`elementToStorey`, which also places aggregated parts), parent assembly (`IfcRelAggregates`, grouped by the parent's GUID) and model (only with more than one model), plus capped lists: `guids` (1000), `items` with identity (100), `truncated`, and the selection `bbox` in the IFC world frame. The caps keep the reply well under the AIM Supabase Realtime limits (256 kB per message, 100 kB/s): about 60 kB even for 5000 selected elements.

The counting lives in the new `selectionSummary.ts`; the test (`selection-summary.test.ts`) imports it, so reverting it to the base (deleting the file) makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main decision of the module was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `summary-from-capped-list.patch` | class and storey counts are taken from the capped GUID list, not the whole selection (the #64 bug in a new form) | `selection-summary.test.ts` |
| `guids-uncapped.patch` | the GUID list is not capped, so a large selection can exceed the Realtime message limit | `selection-summary.test.ts` |
| `parent-grouped-by-label.patch` | parents are grouped by their label, so two assemblies with the same name merge | `selection-summary.test.ts` |
| `truncated-ignores-guidless.patch` | `truncated` compares with the elements that have a GUID, so a selection with a GUID-less element claims a full list | `selection-summary.test.ts` |
| `model-always-sent.patch` | the model name is sent per item and as `by_model` even with a single model | `selection-summary.test.ts` |
| `groups-uncapped.patch` | summary groups are not capped (55 curtain walls would give 55 parent rows) | `selection-summary.test.ts` |

`viewQueries.ts` (reading class, name, storey, parent and model from the loaded IFC, and the selection bbox through the same scene bounds as `QUERY bounds`) is store and renderer glue with no unit test. It is the lazily loaded module (dynamic import from `useAimViewCommands.ts`); the new imports (`@ifc-lite/data`, `./selectionSummary.js`) are already reachable from it through `@/utils/aggregation` or are AIM-only, so nothing moves into the entry chunk.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/selectionSummary.ts \
  --test apps/viewer/src/aim/selection-summary.test.ts \
  --mutation /tmp/d093-mut/summary-from-capped-list.patch --ci --json
```
