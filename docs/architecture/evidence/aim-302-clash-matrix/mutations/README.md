<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #302 discipline matrix of clashes: surgical mutation evidence

The change adds `aimClashMatrix.ts` (matrix of clashes by model pair, derived from the run result) and `clashCellFilter.ts` (cell filter state), wires them into `AimClashBar.tsx` (matrix buttons), `aimClashPlan.ts` / `aimClashStore.ts` (`view_state.clash_local.matrix`) and the `AIM-FORK` block in `ClashPanel.tsx` (list filter). The tests import new modules, so reverting production makes them fail to load (INCONCLUSIVE); each decision was therefore checked with a surgical mutation instead.

Patches are written mutant to fixed (`git diff -R` of the mutated file). Every run ended `OBSERVED` (exit 0) with restoration verified against base `origin/main`; records in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `cell-order-sensitive` | ASR x VZT and VZT x ASR are different cells | `aimClashMatrix.test.ts` |
| `matrix-counts-touch` | touching pairs are counted | `aimClashMatrix.test.ts` |
| `matrix-other-rules` | clashes of other rules are counted | `aimClashMatrix.test.ts` |
| `review-default-resolved` | a pair without a review counts as resolved, not open | `aimClashMatrix.test.ts` |
| `status-split-wrong` | clearance clashes counted as hard | `aimClashMatrix.test.ts` |
| `models-unsorted` | model list in order of appearance | `aimClashMatrix.test.ts` |
| `toggle-never-off` | second click does not clear the filter | `aimClashMatrix.test.ts` |
| `incell-ignores-cell` | the filter passes every clash | `aimClashMatrix.test.ts` |
| `describe-matrix-without-run` | `clash_local.matrix` present without a run | `aimClashMatrix.test.ts` |
| `describe-filter-dropped` | active cell missing in `clash_local.matrix.filter` | `aimClashMatrix.test.ts` |
| `toggle-keeps-extras` | the stored cell carries counts, so state leaks them | `AimClashBar.matrix.test.tsx` |
| `bar-stale-cell-kept` | a cell absent from a new run stays active (empty list) | `AimClashBar.matrix.test.tsx` |
| `bar-matrix-any-run` | matrix shown for a non-preset run | `AimClashBar.matrix.test.tsx` |
| `panel-filter-removed` | the list ignores the active cell | `AimClashPanel.matrix.test.tsx` |
