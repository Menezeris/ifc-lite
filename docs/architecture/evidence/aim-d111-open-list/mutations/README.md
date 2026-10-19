<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-111 list from chat: surgical mutation evidence

The AIM host can now open the upstream Lists builder pre-filled from the chat (AIMviewer #70): `OPEN_LIST` rides the Lens bridge envelope, and the lazily loaded `aim/aimList.ts` turns it into an upstream `ListDefinition` (filters are the same `FilterGroup`s the chat Lens uses, model names resolved by `resolveModelRules`; columns are `ColumnDefinition`s without ids) and hands it to the panel as `pendingListDraft`, the path "Create list" from search already takes. Running and exporting stay with the user. The pure part is the new `aimListPlan.ts`; its test (`aimListPlan.test.ts`) imports it, so reverting production to the base makes the test fail to load and the CI revert oracle reports `REVERT-BROKE-BUILD`. Each behavioural decision was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `envelope-drops-open-list.patch` | `lens-protocol.ts` | the bridge envelope does not accept `OPEN_LIST`, so the message is ignored | `aimListPlan.test.ts` |
| `unknown-column-source.patch` | `aimListPlan.ts` | a column with a source the list engine does not know is accepted | `aimListPlan.test.ts` |
| `property-without-pset.patch` | `aimListPlan.ts` | a property column without its property set is accepted | `aimListPlan.test.ts` |
| `empty-columns-accepted.patch` | `aimListPlan.ts` | a list without columns is accepted | `aimListPlan.test.ts` |
| `model-rule-unresolved.patch` | `aimListPlan.ts` | the `model` rule keeps the host's model name instead of the loaded model's identity, so it matches nothing | `aimListPlan.test.ts` |

`aimList.ts` (store glue) has no unit test. It was verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting `OPEN_LIST` with an `IfcDoor` filter and the columns Name, GlobalId and Storey (label "Podlažie"). The Lists panel opened in the builder with the list name and the columns; pressing Run gave 5 rows with the three columns.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimListPlan.ts \
  --test apps/viewer/src/aim/aimListPlan.test.ts \
  --mutation /tmp/d111-mut/unknown-column-source.patch --ci --json
```

`envelope-drops-open-list.patch` uses `--only apps/viewer/src/aim/lens-protocol.ts`, the others `--only apps/viewer/src/aim/aimListPlan.ts`.
