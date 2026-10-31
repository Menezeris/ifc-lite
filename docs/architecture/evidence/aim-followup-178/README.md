<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Follow-up k balíku 2026-10-29c (#178): revert oracle

Zmeneny test importuje len exporty, ktore existuju aj na `main`, takze oracle vracia vyrobny kod priamo (bez mutacnych patchov): spustene lokalne
`node scripts/check-test-revert-oracle.mjs --base origin/main --only <vyroba> --test <test> --ci --json`. Vsetkych 7 behov skoncilo `OBSERVED`.

| Oprava | Vyrobny subor | Test, ktory zlyha po vrateni |
|---|---|---|
| `underlays_3d` zohladnuje `viewLocked` | `apps/viewer/src/aim/viewQueries.ts` | `integration/underlays3dViewState.test.ts` |
| `cellEquals('', '')` | `apps/viewer/src/aim/aimListLayoutPlan.ts` | `aimListLayoutPlan.test.ts` |
| `side` pri paneli v spodnom pase sa hlasi | `apps/viewer/src/aim/aimPanelsPlan.ts` | `aimPanelsPlan.test.ts` |
| vyber zalozky nevracia pomer dlazdic | `apps/viewer/src/aim/viewTabsApply.ts` | `integration/tileResize.test.ts` |
| sirky stlpcov pri inom zozname | `apps/viewer/src/aim/aimListTable.ts` | `integration/aimListView.test.tsx` |
| relacne stlpce: dedup podla id, zaloha Aggregate | `packages/lists/src/relation-levels.ts` | `packages/lists/src/engine.spatial-relations.test.ts`, `apps/viewer/src/aim/aimRelationNames.test.ts` |
