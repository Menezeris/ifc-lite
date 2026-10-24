<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-164 clash z AIM: surgical mutation evidence

The change adds the clash bridge in `apps/viewer/src/aim/`: `CLASH_LOAD` (a clash test with sets A and B, mode, tolerance and the statuses of a saved run, opened in the upstream `clash` panel), `CLASH_SAVE` / `CLASH_SAVED` (the "Save to AIM" button: test, last run and the changed statuses) and `view_state.clash_local`. The message checks (a mirror of the host's `lib/viewer-clash.ts`) live in the new `clash-protocol.ts`, the pure logic in the new `aimClashPlan.ts`. Their tests (`clash-protocol.test.ts`, `aimClashPlan.test.ts`) import both, so reverting them to the base (deleting the files) makes the test files fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main decision of the two tested modules was instead checked with a surgical mutation.

Each patch is written mutant to fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `clearance-without-amount.patch` | `clash-protocol.ts` | a clearance test without an amount in mm is accepted (the host rejects it) | `clash-protocol.test.ts` |
| `tolerance-unbounded.patch` | `clash-protocol.ts` | the tolerance has no upper bound | `clash-protocol.test.ts` |
| `load-results-uncapped.patch` | `clash-protocol.ts` | `CLASH_LOAD` accepts more than the 3000 results the host sends at most | `clash-protocol.test.ts` |
| `save-results-uncapped.patch` | `clash-protocol.ts` | a saved run may carry more than the 10 000 results the host accepts | `clash-protocol.test.ts` |
| `save-reviews-uncapped.patch` | `clash-protocol.ts` | a save may carry more than the 2000 status changes the host accepts | `clash-protocol.test.ts` |
| `review-state-unchecked.patch` | `clash-protocol.ts` | any string is accepted as the status of a loaded result | `clash-protocol.test.ts` |
| `empty-save-accepted.patch` | `clash-protocol.ts` | a save with no test, run or statuses is valid | `clash-protocol.test.ts` |
| `load-code-optional.patch` | `clash-protocol.ts` | `CLASH_LOAD` without a test code is accepted, so the test could not be linked to AIM | `clash-protocol.test.ts` |
| `save-bad-row-skipped.patch` | `clash-protocol.ts` | a bad result row is dropped silently instead of making the whole save invalid | `clash-protocol.test.ts` |
| `pairkey-unsorted.patch` | `aimClashPlan.ts` | the pair key depends on the order of A and B, so a status no longer matches `clashReviewKey` | `aimClashPlan.test.ts` |
| `b-always-sent.patch` | `aimClashPlan.ts` | side B is sent even when it equals A (self-clash within A) | `aimClashPlan.test.ts` |
| `clearance-zero-allowed.patch` | `aimClashPlan.ts` | a zero clearance is sent in clearance mode (the host rejects it) | `aimClashPlan.test.ts` |
| `hard-signature-with-clearance.patch` | `aimClashPlan.ts` | the clearance counts towards "edited" in hard mode, where it is not sent | `aimClashPlan.test.ts` |
| `results-other-rules.patch` | `aimClashPlan.ts` | the saved run also carries clashes of other rules | `aimClashPlan.test.ts` |
| `touch-sent.patch` | `aimClashPlan.ts` | touching pairs (no penetration), which AIM does not know, are sent as clashes | `aimClashPlan.test.ts` |
| `results-unsorted.patch` | `aimClashPlan.ts` | the saved run is not ordered by severity, so a cut at the cap drops the worst ones | `aimClashPlan.test.ts` |
| `truncated-flag-dropped.patch` | `aimClashPlan.ts` | a run cut at the cap does not say it was cut | `aimClashPlan.test.ts` |
| `load-update-equal-rewritten.patch` | `aimClashPlan.ts` | a loaded status is rewritten even when the viewer already holds it | `aimClashPlan.test.ts` |
| `load-update-without-state.patch` | `aimClashPlan.ts` | a loaded result without a status resets the viewer status to open | `aimClashPlan.test.ts` |
| `comment-always-sent.patch` | `aimClashPlan.ts` | the comment is sent with every changed status, overwriting an unchanged note in AIM | `aimClashPlan.test.ts` |
| `unknown-pair-not-counted.patch` | `aimClashPlan.ts` | a changed status of a pair the viewer cannot name ({model, guid}) is dropped without being counted | `aimClashPlan.test.ts` |
| `snapshot-other-rules.patch` | `aimClashPlan.ts` | statuses of other rules count as changes of this test | `aimClashPlan.test.ts` |
| `mm-unit-wrong.patch` | `aimClashPlan.ts` | metres are converted to the wrong unit | `aimClashPlan.test.ts` |
| `count-touch.patch` | `aimClashPlan.ts` | touching pairs are counted in the run totals | `aimClashPlan.test.ts` |
| `describe-without-test.patch` | `aimClashPlan.ts` | `clash_local` is an object even when no test is open | `aimClashPlan.test.ts` |

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
