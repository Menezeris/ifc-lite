<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #211 panel resize: surgical mutation evidence

The change adds the new module `apps/viewer/src/aim/planRefit.ts` (pure decision and debounce for refitting a plan tab after the centre area changes size) and a wider hit zone for the properties column handle (`SidebarDock.tsx`, AIM-FORK block). The test `planRefit.test.ts` imports the new module, so reverting it to the base makes the test file fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each decision of the module was instead checked with a surgical mutation.

Each patch is written mutant to fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `plan-check-dropped.patch` | free 3D, a saved view or a document is refitted too, so the user's own view moves | `planRefit.test.ts` |
| `lock-check-dropped.patch` | a plan tab with an unlocked camera is refitted | `planRefit.test.ts` |
| `delta-threshold-exclusive.patch` | a change of exactly the threshold does not count | `planRefit.test.ts` |
| `height-ignored.patch` | only a width change is noticed | `planRefit.test.ts` |
| `collapsed-size-allowed.patch` | a collapsed centre area (document full screen) is refitted to nothing | `planRefit.test.ts` |
| `no-debounce-reset.patch` | each resize event keeps its own timer, so a column drag refits many times | `planRefit.test.ts` |
| `settled-not-updated.patch` | the settled size is never updated, so later checks compare with the first size | `planRefit.test.ts` |
| `first-sample-triggers.patch` | the layout at start counts as a change | `planRefit.test.ts` |
| `dispose-keeps-timer.patch` | a pending refit survives `dispose` | `planRefit.test.ts` |

`useAimPlanRefit.ts` (ResizeObserver on the centre region, `fitAll` of upstream) and the `SidebarDock.tsx` class change are store, DOM and layout glue with no unit test; they were checked by reading the code paths and the type check (no live WebGPU in the cloud session, see the PR body).

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/planRefit.ts \
  --test apps/viewer/src/aim/planRefit.test.ts \
  --mutation /tmp/aim211-mut/delta-threshold-exclusive.patch --ci --json
```
