<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-162 IDS bridge: surgical mutation evidence

The change adds the IDS bridge to `apps/viewer/src/aim/`: the lazy message contract `ids-protocol.ts` (`IDS_LOAD`, `IDS_SAVED`), the one-specification lookup `aimIdsSpec.ts` and the pure `view_state.ids_local` builder `aimIdsLocal.ts`. The three new tests import modules that do not exist on `main`, so reverting production makes them fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision of the three modules was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `target-any.patch` | `ids-protocol.ts` | any string is accepted as `target` (only `studio` and `validation` exist) | `ids-protocol.test.ts` |
| `version-zero.patch` | `ids-protocol.ts` | version 0 is accepted | `ids-protocol.test.ts` |
| `xml-unbounded.patch` | `ids-protocol.ts` | the XML of `IDS_LOAD` is not bounded in size | `ids-protocol.test.ts` |
| `run-any-type.patch` | `ids-protocol.ts` | `run` accepts a non-boolean | `ids-protocol.test.ts` |
| `spec-id-first.patch` | `aimIdsSpec.ts` | the specification id wins over its identifier | `aimIdsSpec.test.ts` |
| `spec-case-sensitive.patch` | `aimIdsSpec.ts` | the lookup is case sensitive | `aimIdsSpec.test.ts` |
| `only-keeps-all.patch` | `aimIdsSpec.ts` | an unknown specification id keeps the whole document instead of none | `aimIdsSpec.test.ts` |
| `unlinked-clean.patch` | `aimIdsLocal.ts` | IDS that is not in AIM reports `dirty: false` | `aimIdsLocal.test.ts` |
| `dirty-never.patch` | `aimIdsLocal.ts` | `dirty` is always false | `aimIdsLocal.test.ts` |
| `xml-cap-ignored.patch` | `aimIdsLocal.ts` | XML over 256 kB is sent in `view_state` | `aimIdsLocal.test.ts` |
| `brief-studio-only.patch` | `aimIdsLocal.ts` | the `APPLIED` brief strips the XML of the Studio only, not of the validation panel | `aimIdsLocal.test.ts` |
| `docid-ignored.patch` | `aimIdsLocal.ts` | a different document in the Studio is still linked to the AIM code | `aimIdsLocal.test.ts` |

`aimIds.ts`, `aimIdsStore.ts`, `AimIdsBar.tsx`, `AimIdsBarLazy.tsx`, `idsHost.ts` and the wiring in `AimBridge.tsx` and the three upstream panels are store and renderer glue with no unit test; they were verified live (local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting the bridge messages), see the PR body.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/ids-protocol.ts \
  --test apps/viewer/src/aim/ids-protocol.test.ts \
  --mutation /tmp/d162-mut/target-any.patch --ci --json
```

The `aimIdsSpec.ts` and `aimIdsLocal.ts` patches use the matching `--only` and `--test` files.
