<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #97 (D-122 check): `APPLIED` waits for the camera animation, surgical mutation evidence

The production check of saved views (AIMviewer D-122) showed that `APPLIED` after `set_view_mode` (restoring a saved view, reset) reported the camera in the middle of its animation (71.98 / -23.06 / 62.09) instead of its target; only the next `get_viewer_state` was right. `appliedViewState` (`useAimViewCommands.ts`) now first waits until the camera pose settles: two samples 50 ms apart with the same position and target, at most 1 s so it never waits forever while the user keeps orbiting. The logic is the new module `cameraSettle.ts` (no store import, so its test runs in the fast lane without WASM).

The test (`cameraSettle.test.ts`) imports `waitCameraSettled` from the new module, so reverting it to the base makes the test file fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each decision of the module was instead checked with a surgical mutation.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `no-wait.patch` | returns right after the first sample, no waiting | `cameraSettle.test.ts` |
| `timeout-reports-settled.patch` | the time limit reports a settled camera | `cameraSettle.test.ts` |
| `target-ignored.patch` | only the position is compared, a pan of the target is ignored | `cameraSettle.test.ts` |
| `no-camera-not-settled.patch` | without a camera it reports "not settled" | `cameraSettle.test.ts` |

The one-line wiring in `appliedViewState` has no unit test (it reads the viewer store); it is checked live with the "Ako vyskúšať" link of the PR.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/cameraSettle.ts \
  --test apps/viewer/src/aim/cameraSettle.test.ts \
  --mutation /tmp/patches/no-wait.patch --ci --json
```
