<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-122 saved views: surgical mutation evidence

The AIM host can now save and restore a view (AIMviewer #72). To restore isolation and hidden elements it needs their GlobalIds, so `QUERY view_state` now also returns `hidden_guids` and `isolated_guids` (capped at 600, the same limit as `HIDE`/`ISOLATE` on the bridge, so a restore is one message each). `APPLIED` keeps sending only the counts. The pure part is the new `visibilityGuids` in `selectionSummary.ts`; its test (`selection-summary.test.ts`) imports it, so reverting production to the base makes the test fail to load and the CI revert oracle reports `REVERT-BROKE-BUILD`. Each behavioural decision was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `cap-ignored.patch` | `selectionSummary.ts` | the list has no cap, so a large isolation would exceed the bridge limit | `selection-summary.test.ts` |
| `cap-off-by-one.patch` | `selectionSummary.ts` | the cap lets one GlobalId more through than the bridge accepts | `selection-summary.test.ts` |
| `guidless-kept.patch` | `selectionSummary.ts` | an element without a GlobalId lands in the list as an empty value | `selection-summary.test.ts` |

`viewQueries.ts` (store glue: GlobalId of each id via `guidForEntity`) has no unit test. It is checked live through the PR preview (`?viewer=pr-<number>`, AIM D-116): isolate and hide elements, then `get_viewer_state` / `saved_view(action=save)` from the AIM connector.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/selectionSummary.ts \
  --test apps/viewer/src/aim/selection-summary.test.ts \
  --mutation /tmp/d122-mut/cap-ignored.patch --ci --json
```
