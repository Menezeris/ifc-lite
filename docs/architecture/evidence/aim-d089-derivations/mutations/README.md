<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-089 derivations layer: surgical mutation evidence

The change adds the AIM derivations layer (D-089 phase B) to the viewer fork in `apps/viewer/src/aim/`: the `AIM_DERIVATIONS_LOAD` message and the narrowing of the `derivedRelations` / `derivedTotal` fields of `AIM_PANEL_DATA` in `derivations-protocol.ts`, the layer store `aimDerivationsStore.ts`, and the pure helpers `derivations.ts` (model revision pairing, eye filters, safe manage link) and `derivationsFormat.ts` (relative time of the last run). The tests (`derivations-protocol.test.ts`, `derivations.test.ts`, `aimDerivationsStore.test.ts`) import exports that do not exist on the base, so reverting production makes them fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision of the tested modules was instead checked with a surgical mutation.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main` and head `78d1cb26279d6c33ae5461db1a542f885f07f6dd`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `layer-version-ignored.patch` | `derivations-protocol.ts` | an unknown layer version is accepted, so a newer host could feed a shape this viewer does not understand | `derivations-protocol.test.ts` |
| `rule-last-run-unchecked.patch` | `derivations-protocol.ts` | a rule's lastRun is not shape-checked (missing or malformed run passes) | `derivations-protocol.test.ts` |
| `rule-count-negative.patch` | `derivations-protocol.ts` | a negative or non-numeric rule count passes | `derivations-protocol.test.ts` |
| `envelope-source-ignored.patch` | `derivations-protocol.ts` | a message from a foreign source (devtools, extensions) is taken as a layer | `derivations-protocol.test.ts` |
| `relations-not-filtered.patch` | `derivations-protocol.ts` | malformed derived relation rows are not dropped | `derivations-protocol.test.ts` |
| `total-below-rows.patch` | `derivations-protocol.ts` | the host total may be below the rows shown | `derivations-protocol.test.ts` |
| `revision-substring-match.patch` | `derivations.ts` | a model is paired with a revision by substring, so ASR_old.ifc shows ASR's revision | `derivations.test.ts` |
| `rule-eye-ignored.patch` | `derivations.ts` | the per-rule eye does not hide that rule's relations | `derivations.test.ts` |
| `global-eye-ignored.patch` | `derivations.ts` | the global eye does not hide derived relations | `derivations.test.ts` |
| `manage-url-any-scheme.patch` | `derivations.ts` | a javascript: manage link reaches window.open | `derivations.test.ts` |
| `relative-hours-as-minutes.patch` | `derivationsFormat.ts` | hours are shown as minutes | `derivations.test.ts` |
| `stale-hidden-rules-kept.patch` | `aimDerivationsStore.ts` | a re-push keeps hidden ids of rules the host no longer sends | `aimDerivationsStore.test.ts` |
| `rule-eye-never-reopens.patch` | `aimDerivationsStore.ts` | a hidden rule cannot be shown again | `aimDerivationsStore.test.ts` |
| `teardown-keeps-toggles.patch` | `aimDerivationsStore.ts` | teardown keeps the eye and section toggles, so a fresh layer after a remount stays hidden | `aimDerivationsStore.test.ts` |

The React parts (`DerivationsRibbonGroup.tsx`, `AimLayersSection*.tsx`, `AimDerivedRelations*.tsx`, `AimModelRevision.tsx`) and the `AimBridge.tsx` / `AIM-FORK` wiring are UI glue with no unit test of their own; the ribbon guards (`RibbonToolbar.i18n.test.tsx`, `command-labels.guard.test.tsx`) mount the AIM tab with them. They were verified live: local fork viewer embedded in a host page that autoloads `ASR.ifc` (AC20-FZK-Haus) and `VZT.ifc`, Playwright posting `AIM_DERIVATIONS_LOAD` after `MODELS_LOADED` and `AIM_PANEL_DATA` with four derived relations (`derivedTotal` 9) on `ENTITY_SELECTED`. Checked: AIM tab with the Derivations group (disabled without a layer, standalone), revision pills v72 / v15 on the MODELS rows, AIM LAYERS rows, four AIM rows plus "a ďalších 5" in Relationship records, the per-rule eye (4 -> 2 rows) and the global eye (-> 0), Pravidlá collapsing and reopening the section, Prepočítať opening `manageUrl` in a new tab, and a click on the other end selecting the space by GUID (`ENTITY_SELECTED 2RSCzLOBz4FAK$_wE8VckM` sent to the host).

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/derivations.ts \
  --test apps/viewer/src/aim/derivations.test.ts \
  --mutation /tmp/d089-mut/revision-substring-match.patch --ci --json
```

`--only` is the module in the table, `--test` the test named next to it.
