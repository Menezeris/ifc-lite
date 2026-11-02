<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-182 requirements library: surgical mutation evidence

The change adds the "Requirements library" card to the AIM fork: a ribbon button in the AIM tab opens a view tab of the new kind `req` in the pane beside 3D (`AimCenterPane.tsx`), the card asks the host through one message pair (`REQLIB_REQUEST` / `REQLIB_RESULT`, `reqlib-protocol.ts`), and the IDS bar of Data validation saves the check result per federation model (`reqlibPlan.ts`). The tests (`reqlibPlan.test.ts`, the new case in `viewTabsPlan.test.ts`) import modules or exports that do not exist on `main` (`reqlibPlan.ts`, `reqlib-protocol.ts`, `REQ_TAB`, `isPaneTab`), so reverting production makes them fail to load and the CI revert oracle reports INCONCLUSIVE. Each main behavioural decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Three (fixes of Claude review findings on #221) were run against head `b66aa38a`, `choice-survives-disconnect` (a later finding) against `86d1dced`, `null-origin-rejected` (a finding on #222) against `e7ced17d`. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `untagged-multi-model-accepted.patch` | `reqlibPlan.ts` | an element without a model id is attributed to the first model of a multi-model run | `reqlibPlan.test.ts` |
| `assign-empty-reads-success.patch` | `reqlibPlan.ts` | an empty or unknown host reply to "assign" reads as success | `reqlibPlan.test.ts` |
| `save-empty-reads-success.patch` | `reqlibPlan.ts` | a host reply to "save_run" without saved models reads as success | `reqlibPlan.test.ts` |
| `status-ignores-model.patch` | `reqlibPlan.ts` | a model's specification keeps the status of the whole federated run instead of its own elements | `reqlibPlan.test.ts` |
| `passing-reasons-kept.patch` | `reqlibPlan.ts` | reasons of passing requirements are sent too (the host stores reasons only for failures) | `reqlibPlan.test.ts` |
| `engine-version-any-package.patch` | `reqlibPlan.ts` | the tool version stamp takes the first fork package instead of `@ifc-lite/ids` | `reqlibPlan.test.ts` |
| `result-empty-id.patch` | `reqlib-protocol.ts` | a host reply with an empty request id is accepted | `reqlibPlan.test.ts` |
| `req-is-scene.patch` | `viewTabsLayout.ts` | the library tab counts as a 3D scene tab | `viewTabsPlan.test.ts` |
| `library-flag-lost.patch` | `viewTabsLayout.ts` | the center layout never tells the pane to show the library | `viewTabsPlan.test.ts` |
| `doc-beside-library.patch` | `viewTabsPlan.ts` | a document may sit beside the library (two panes, no 3D) | `viewTabsPlan.test.ts` |
| `choice-survives-disconnect.patch` | `aimReqlib.ts` | a bridge disconnect leaves the open assign choice (old commit and sha) and the busy flag in the card store | `aimReqlib.test.ts` |
| `null-origin-rejected.patch` | `ids-protocol.ts` | an `IDS_LOAD` with `origin` or `library_commit` sent as `null` is dropped as a whole | `ids-protocol.test.ts` |

The rest of `aimReqlib.ts`, `AimRequirementsLibrary.tsx`, `AimCenterPane.tsx`, the ribbon button, the `AimIdsBar.tsx` buttons and the `AimBridge.tsx` routing are store and UI glue with no unit test; the card, the IDS bar and the result upload are lazy (first use), the entry chunk gets the button, the tab kind and the message routing (`viewer-entry-js-bytes` +930 bytes and `viewer-eager-js-bytes` +1,924 bytes over `main`, both inside the ratchet tolerance).

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/reqlibPlan.ts \
  --test apps/viewer/src/aim/reqlibPlan.test.ts \
  --mutation /tmp/d182-mut/status-ignores-model.patch --ci --json
```

`result-empty-id` uses `--only apps/viewer/src/aim/reqlib-protocol.ts`; `req-is-scene` and `library-flag-lost` use `--only apps/viewer/src/aim/viewTabsLayout.ts` with `--test apps/viewer/src/aim/viewTabsPlan.test.ts`; `doc-beside-library` uses `--only apps/viewer/src/aim/viewTabsPlan.ts` with the same test; `choice-survives-disconnect` uses `--only apps/viewer/src/aim/aimReqlib.ts` with `--test apps/viewer/src/aim/aimReqlib.test.ts`; `null-origin-rejected` uses `--only apps/viewer/src/aim/ids-protocol.ts` with `--test apps/viewer/src/aim/ids-protocol.test.ts`.
