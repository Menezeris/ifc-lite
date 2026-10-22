<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #183 panel scroll: surgical mutation evidence

The change adds `SCROLL_PANEL` (scroll the properties panel up, down, to the top or the bottom on the chat's command) and replaces the one-shot `scrollIntoView` of a highlighted property row with `revealRow`, which keeps the row in view while the panel settles. The pure maths is the new `aimPanelScrollPlan.ts`, the message check is in `view-protocol.ts`. The test (`aimPanelScrollPlan.test.ts`) imports a module that does not exist on `main`, so reverting production makes it fail to load and the revert oracle reports INCONCLUSIVE; each decision was checked with a surgical mutation instead.

Each patch is written mutant to fixed (`git diff -R` of the mutated file). Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. Records: `summary.json`.

| Patch | Module | Mutation |
|---|---|---|
| `page-fraction-full.patch` | `aimPanelScrollPlan.ts` | up / down step is the whole visible height, so no context stays from the previous view |
| `centre-offset-sign.patch` | `aimPanelScrollPlan.ts` | the row is placed below the centre instead of at it |
| `visible-margin-ignored.patch` | `aimPanelScrollPlan.ts` | a row at the very edge counts as visible, so it is not re-centred |
| `bottom-unclamped.patch` | `aimPanelScrollPlan.ts` | `bottom` goes past the end of the content |
| `direction-unchecked.patch` | `view-protocol.ts` | `SCROLL_PANEL` accepts any direction |

`aimPanelScroll.ts` (DOM: scroll container lookup, row following, user-input cancel) and the `useAimViewCommands.ts` case are renderer glue with no unit test.

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimPanelScrollPlan.ts \
  --test apps/viewer/src/aim/aimPanelScrollPlan.test.ts \
  --mutation /tmp/mut/centre-offset-sign.patch --ci --json
```

The `direction-unchecked` patch uses `--only apps/viewer/src/aim/view-protocol.ts`. Copy the patches outside the tree first, the oracle refuses a dirty tree.
