<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-164 clash z AIM: surgical mutation evidence

The change adds the clash bridge in `apps/viewer/src/aim/`: `CLASH_LOAD` (a clash test with sets A and B, mode, tolerance and the statuses of a saved run, opened in the upstream `clash` panel), `CLASH_SAVE` / `CLASH_SAVED` (the "Save to AIM" button) and `view_state.clash_local`. The message checks live in the new `clash-protocol.ts`, the pure maths in the new `aimClashPlan.ts`. Their tests (`clash-protocol.test.ts`, `aimClashPlan.test.ts`) import both, so reverting them to the base (deleting the files) makes the test files fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main decision of the two tested modules was instead checked with a surgical mutation.

Each patch is written mutant to fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `tolerance-unbounded.patch` | `clash-protocol.ts` | the tolerance has no upper bound (the panel clamps to 1 m) | `clash-protocol.test.ts` |
| `mode-unchecked.patch` | `clash-protocol.ts` | any string is accepted as the mode | `clash-protocol.test.ts` |
| `results-uncapped.patch` | `clash-protocol.ts` | a run may carry any number of results | `clash-protocol.test.ts` |
| `status-unchecked.patch` | `clash-protocol.ts` | any string is accepted as a result status | `clash-protocol.test.ts` |
| `pairkey-unsorted.patch` | `aimClashPlan.ts` | the pair key depends on the order of A and B, so a review no longer matches `clashReviewKey` | `aimClashPlan.test.ts` |
| `run-other-rules.patch` | `aimClashPlan.ts` | the saved run also carries clashes of other rules | `aimClashPlan.test.ts` |
| `review-skip-equal-dropped.patch` | `aimClashPlan.ts` | a loaded status is rewritten even when the viewer already holds it | `aimClashPlan.test.ts` |
| `clearance-in-hard-signature.patch` | `aimClashPlan.ts` | the clearance counts towards "edited" in hard mode, where it is not sent | `aimClashPlan.test.ts` |
| `mm-unit-wrong.patch` | `aimClashPlan.ts` | metres are converted to the wrong unit | `aimClashPlan.test.ts` |
| `clearance-always-sent.patch` | `aimClashPlan.ts` | the clearance is sent in hard mode too | `aimClashPlan.test.ts` |
| `truncated-flag-dropped.patch` | `aimClashPlan.ts` | a run cut at the cap does not say it was cut | `aimClashPlan.test.ts` |
| `describe-always-object.patch` | `aimClashPlan.ts` | `clash_local` is an object even when no test is open | `aimClashPlan.test.ts` |

`aimClash.ts`, `aimClashStore.ts`, `AimClashBar.tsx` and the `AimBridge.tsx` wiring are store and panel glue with no unit test; they were verified live (see the PR).

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimClashPlan.ts \
  --test apps/viewer/src/aim/aimClashPlan.test.ts \
  --mutation /tmp/d164-mut/mm-unit-wrong.patch --ci --json
```

The `clash-protocol.ts` patches use `--only apps/viewer/src/aim/clash-protocol.ts` and `--test apps/viewer/src/aim/clash-protocol.test.ts`.
