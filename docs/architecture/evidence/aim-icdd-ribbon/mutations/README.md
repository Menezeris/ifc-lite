<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM ICDD ribbon (D-181): surgical mutation evidence

The change adds the ICDD button to the AIM ribbon tab in `apps/viewer/src/aim/`: `ICDD_EXPORT` / `ICDD_CHECK` to the host and `ICDD_STATUS` back. The pure logic is in `icddPlan.ts` (run state, the 5 s "host does not support ICDD" limit, result text) and `icdd-protocol.ts` (message checks). The test `icdd.test.ts` imports both new modules, so reverting production to `origin/main` makes it fail to load and the CI revert oracle reports INCONCLUSIVE; each main decision was checked with a surgical mutation instead.

Each patch is written mutant -> fixed (`git diff -R` of the mutated file); the oracle reverse-applies it.

**Honest status:** these were run locally by applying each mutation, running `icdd.test.ts` with `tsx --test` (RED for all 8) and restoring the file. The CI revert oracle itself was not run in the authoring session, because `pnpm install` is blocked there by the private `design-kit` dependency. `summary.json` therefore says `RED_LOCAL`, not `OBSERVED`. Replay with the oracle:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/icddPlan.ts \
  --test apps/viewer/src/aim/icdd.test.ts \
  --mutation /tmp/icdd-mut/timeout-5s-to-15s.patch --ci --json
```

The `icdd-protocol.ts` patches use `--only apps/viewer/src/aim/icdd-protocol.ts`.

| Patch | Module | Mutation |
|---|---|---|
| `timeout-5s-to-15s` | `icddPlan.ts` | the older-host limit is 15 s instead of 5 s |
| `timeout-overrides-running` | `icddPlan.ts` | the limit also fires on a run the host already confirmed |
| `terminal-state-overwritten` | `icddPlan.ts` | a late `running` status overwrites a done / error run |
| `status-other-run-applied` | `icddPlan.ts` | a status for another run id or op is applied |
| `shown-errors-limit` | `icddPlan.ts` | the dialog shows 10 errors instead of the first 5 |
| `check-ok-ignores-same` | `icddPlan.ts` | a check that differs from AIM still counts as OK |
| `result-checked-by-wrong-op` | `icdd-protocol.ts` | `result` is validated against the other op's shape |
| `status-source-unchecked` | `icdd-protocol.ts` | `ICDD_STATUS` is accepted without the bridge `source` |

The ribbon group, dialog and store (`AimIcddRibbonGroup.tsx`, `AimIcddDialog.tsx`, `aimIcddStore.ts`) and the `AimBridge.tsx` wiring are UI / store glue without a unit test.
