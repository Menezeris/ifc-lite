<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM hold timing: surgical mutation evidence

The change adds `apps/viewer/src/aim/holdTiming.ts` (the long-press timer waits while the browser has queued input, `navigator.scheduling.isInputPending`) and wires it into `touchLongPress.ts` inside an `AIM-FORK` block. The new tests import `holdTiming.ts`, which does not exist on `main`, so reverting production makes them fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each decision was instead checked with a surgical mutation. The `mobile-journey` E2E spec change is a timeout, observed by 30 stressed local runs (6/30 before, 30/30 after), see the PR body.

Each patch is written mutant to fixed; the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. Full records: `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `hold-never-deferred.patch` | `holdTiming.ts` | `shouldDeferHold` always answers "fire now" | `holdTiming.longpress.test.ts` |
| `deferral-budget-removed.patch` | `holdTiming.ts` | no cap on deferrals, a probe stuck on "pending" blocks the hold for ever | `holdTiming.test.ts` |
| `continuous-input-ignored.patch` | `holdTiming.ts` | the probe ignores continuous input, so a queued touchmove is not seen | `holdTiming.test.ts` |
| `wiring-defer-removed.patch` | `touchLongPress.ts` | the timer fires without asking `shouldDeferHold` | `holdTiming.longpress.test.ts` |
| `wiring-no-retimer.patch` | `touchLongPress.ts` | a deferred hold is never re-armed, so it never fires | `holdTiming.longpress.test.ts` |

## Replay

Clean checkout of the branch, patches copied outside the tree (the oracle refuses a dirty tree):

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/holdTiming.ts \
  --test apps/viewer/src/aim/holdTiming.longpress.test.ts \
  --mutation /tmp/hold-mut/hold-never-deferred.patch --ci --json
```

The `touchLongPress.ts` patches use `--only apps/viewer/src/components/viewer/touchLongPress.ts`; the two `holdTiming.test.ts` rows use `--test apps/viewer/src/aim/holdTiming.test.ts`.
