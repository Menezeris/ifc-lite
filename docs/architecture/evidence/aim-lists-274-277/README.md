<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM panel Lists: relation columns, filter, column widths, highlight (AIM #277, #276, #275, #274)

Four AIMviewer requests on the Lists panel and `open_list`, all through the existing bridge messages `OPEN_LIST` and `LIST_UPDATE` (D-114: no new message, no new tool). The viewer side lives in `aim/aimListViewPlan.ts` (wire shape), `aim/aimListLayoutPlan.ts` (pure decisions), `aim/aimListTable.ts` (table hook) and `aim/aimRelationNames.ts` (provider hooks); upstream files only get wiring (`FORK_MAINTENANCE.md`).

## Host specification (for `open_list` parameters and `MCP-TOOLS.md`)

The host maps snake_case MCP parameters to the camelCase `view` object of the wire message. `<column_ref>` is the column reference `view.sort`, `view.sum` and `view.groupBy` already use: `{ source, propertyName, psetName? }` (MCP: `source`, `property_name`, `pset_name`).

### #276 Isolation in 3D (no parameter needed, one optional)

- Decision: `open_list` no longer needs `clear_isolation`. When the 3D view has an active isolation (`isolatedEntities` is set) at the moment a NEW list is opened, the viewer turns the table filter "only visible in 3D" off for that list, so the rows of the new list are all shown. The isolation in 3D itself is NOT cancelled: it is the user's view, and the filter has a one-click toggle in the table (eye icon).
- Why this and not cancelling the isolation: the failure was in the table filter, not in the list run (`rows` in `APPLIED` was always right, `visible_rows` was 0). Cancelling the isolation would destroy a view the user may still want, and adapting the isolation to the new list would make a list silently change the 3D scene.
- Optional `visible_only: boolean` -> `view.visibleOnly`. `false` shows all rows whatever 3D shows, `true` forces the filter on (rows hidden in 3D drop out). Also valid in `LIST_UPDATE`.
- Tool description sentence to add: "Ak je v 3D izolácia, nový zoznam ukáže všetky svoje riadky; filter 'len viditeľné' sa vypne (visible_only ho prepne)."
- `view_state.list` and `APPLIED.list` gain `visible_only: boolean`; `visible_rows` is the number of rows the table shows.

### #277 Columns for IFC relations

- New levels of the `spatial` column (`propertyName`), next to `Container`, `Storey`, `Building`, `Site`, `Project`:
  - `Referenced`: spaces and other spatial structure elements that reference the element through `IfcRelReferencedInSpatialStructure` (typical: a door or an HVAC element "referenced in" a room).
  - `Boundary`: spaces whose boundary the element forms through `IfcRelSpaceBoundary` (wall, door, window, slab).
  - `Aggregate`: names of the `IfcRelAggregates` parents (the assembly the element is a part of).
  Several related entities are joined with ", " (distinct, in file order); an element without the relation has an empty cell. Case does not matter.
- Example column: `{ "source": "spatial", "property_name": "Referenced", "label": "Priestor (referenced)" }` and `{ "source": "spatial", "property_name": "Boundary", "label": "Hranica priestoru" }`. Works in `open_list.columns` and in `LIST_UPDATE edit.columns`.
- Scope: columns only. These levels are not offered as filter conditions, and the builder's column picker does not list them (the chat is the way in). The values come from the IFC file of the loaded model, not from the AIM database.
- What else the viewer could serve the same way (one line each in `aimRelationNames.ts`, the graph already indexes them): `ConnectsElements`, `VoidsElement` / `FillsElement` (opening and its filler), `AssignsToGroup`, `AssignsToProduct`, `ConnectsPathElements`, `Declares`. Tell us which `ifc_relations` kinds the chat actually needs.
- Derived relations from the AIM database (D-167, `v_space_elements` with `relation = referenced | contained | boundary`, computed from geometry, not stored in the IFC) are NOT in the viewer. Proposal, host side, not implemented here: extend the `OPEN_LIST` column with `source: "host"` and a `values` map `{ [IFC GlobalId]: string }` computed by the host from the DB (limit 20 000 entries, 200 characters per value), for example
  `{ "source": "host", "propertyName": "space_referenced", "label": "Priestor (odvodený)", "values": { "2O2Fr$t4X7Zf8NOew3FLOH": "3.02", ... } }`.
  The viewer would show it as a text column (sortable, groupable, exportable) through one new provider hook `getHostValue(entityId, key)` in `packages/lists`. Cheaper first step that needs no viewer change: the host adds the derived value into the filter (`globalId` rule from the DB query) and the viewer columns `Container` / `Referenced` show the IFC side next to it. Say if you want the `host` column, it is one more PR.

### #275 Column widths

- Manual: dragging the right edge of a header already resizes a column (upstream, `ColumnResizeHandle`: mouse, arrow keys, double click or Home resets to the default). Nothing was missing there.
- MCP parameter `column_widths` -> `view.columnWidths`, valid in `open_list` and `LIST_UPDATE`:
  - `"fit"`: every column fits its longest value and its header (up to 800 px; the default width is capped at 460 px and looks at 200 rows).
  - `"auto"`: drops the manual widths, back to the table default.
  - `[{ "column": <column_ref>, "width": <px 56..800> | "fit" | "auto" }, ...]`: per column (max 40).
- A column the list does not have is reported in `APPLIED.issues` and the rest is applied. Widths are state of the table view; do not rely on them surviving a new `open_list`, send `column_widths` again.
- `view_state.list.column_widths`: `[{ column, px }]`, the widths in use.

### #274 Highlight

- MCP parameter `highlight` -> `view.highlight`, valid in `open_list` and `LIST_UPDATE`; `null` clears. All parts are optional and combine:
  - `rows`: `{ "column": <column_ref>, "values": [string | number, ...] }` (1 to 200 values). Highlights the rows whose cell in that column equals any value (text without regard to case, numbers numerically). Raw cell values are compared, before unit conversion.
  - `columns`: `[<column_ref>, ...]` (max 8). Highlights the header and all cells of those columns.
  - `cells`: `[{ "column": <column_ref>, "row": { "column": <column_ref>, "value": string | number } }, ...]` (max 200). Highlights the cell in `column` of the rows where `row.column` equals `row.value`.
  - `sum`: `true` or `[<column_ref>, ...]`. Highlights the totals row (all sums, or those columns). Needs sums: the list must have `view.sum`, otherwise `APPLIED.issues` says so.
- The first highlighted row is scrolled to the middle of the table once (when its group is expanded in a grouped table). The highlight stays until `highlight: null` or a new `open_list`; `LIST_UPDATE` that re-runs the table keeps it.
- Limits: it is drawn in the flat and nested table, not in the pivot (`schedule`) view; the counts in `view_state` are still right there.
- `view_state.list.highlight` and `APPLIED.list.highlight`: `{ rows: n, cells: n, columns: [names], sum: [names] }` (counts of what matched in the result, so Claude knows whether the match found anything).

## Mutation evidence

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `relation-boundary-level-missing.patch` | `relation-levels.ts` | the `Boundary` level is unknown, the column falls back to the storey name | `engine.spatial-relations.test.ts` |
| `relation-names-not-distinct.patch` | `relation-levels.ts` | a space named twice is listed twice | `engine.spatial-relations.test.ts` |
| `relation-levels-not-wired.patch` | `engine.ts` | the engine does not ask the new levels (`Referenced`, `Boundary`, `Aggregate` fall back to the storey) | `engine.spatial-relations.test.ts` |
| `relation-reads-forward-edges.patch` | `aimRelationNames.ts` | the relation is read from the forward edge of the element instead of the inverse one (the space) | `aimRelationNames.test.ts` |
| `isolation-hides-new-list.patch` | `aimList.ts` | a new list does not turn the "only visible" filter off under a 3D isolation (0 visible rows, #276) | `aimListView.test.tsx` |
| `visible-only-not-applied.patch` | `aimListTable.ts` | the table ignores `visibleOnly` from the chat | `aimListView.test.tsx` |
| `visible-only-accepts-non-boolean.patch` | `aimListViewPlan.ts` | `view.visibleOnly` accepts any value | `aimListLayoutPlan.test.ts` |
| `fit-ignores-header-and-cap.patch` | `aimListLayoutPlan.ts` | `fit` ignores the header width and the 800 px cap | `aimListLayoutPlan.test.ts` |
| `widths-auto-keeps-manual.patch` | `aimListTable.ts` | `auto` does not drop the manual widths | `aimListView.test.tsx` |
| `widths-out-of-range-accepted.patch` | `aimListViewPlan.ts` | a width of any size (10 px, 5000 px) is accepted | `aimListLayoutPlan.test.ts` |
| `highlight-text-case-sensitive.patch` | `aimListLayoutPlan.ts` | row and cell matching is case sensitive | `aimListLayoutPlan.test.ts` |
| `highlight-row-not-styled.patch` | `aimListTable.ts` | matched rows are not drawn highlighted | `aimListView.test.tsx` |
| `highlight-not-stored.patch` | `aimListControl.ts` | `view.highlight` is never stored, nothing is highlighted | `aimListView.test.tsx` |
| `highlight-survives-new-list.patch` | `aimList.ts` | a new `open_list` keeps the highlight of the previous list | `aimListView.test.tsx` |
| `highlight-not-reported.patch` | `aimListViewPlan.ts` | `view_state` does not report the highlight counts | `aimListLayoutPlan.test.ts` |
| `sum-highlight-not-styled.patch` | `ListResultsTable.tsx` | the totals row is not drawn highlighted | `aimListView.test.tsx` |
| `sum-highlight-not-styled.patch` | `ListResultsTable.tsx` | the totals row is not drawn highlighted | `aimListView.test.tsx` |

Each patch is written mutant to fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. All 16 runs ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main` (`f86607ad`), head `fef8b3e2`. After the width and highlight maths (`aimListLayoutPlan`) became a lazy import (bundle ceiling), four patches (`highlight-not-stored`, `widths-auto-keeps-manual`, `visible-only-not-applied`, `highlight-row-not-styled`) were rewritten against the new code and run again: all `OBSERVED`, restoration verified, base `bc579888`, head `870a8299` (their records in `summary.json`). The records are in `summary.json`. The new pure module `aimListLayoutPlan.ts` and the new `aimRelationNames.ts` do not exist on `main`, so a blunt revert of production would only break the test build (INCONCLUSIVE); the surgical mutations avoid that. The component test (`aim/integration/aimListView.test.tsx`) mounts the real `ListResultsTable` with the real store and the real bridge entry points (`openListFromChat`, `applyListView`).

## Replay

Use a clean checkout of the branch with dependencies and built packages. Copy the patches outside the tree, because the oracle refuses a dirty tree, then for each row of the table:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only <module path> --test <test path> \
  --mutation /tmp/aim-lists-mut/<patch> --ci --json
```

The `--only` module is the file named in the patch header (`packages/lists/src/relation-levels.ts`, `packages/lists/src/engine.ts` or `apps/viewer/src/aim/...`), `--test` is the test in the last column (`packages/lists/src/engine.spatial-relations.test.ts`, `apps/viewer/src/aim/aimRelationNames.test.ts`, `aimListLayoutPlan.test.ts` or `integration/aimListView.test.tsx`).

## Live check

Local viewer (`vite --port 3000`, `VITE_AIM_MODEL_ORIGINS=http://localhost:3100`) embedded in a host page, a generated IFC4 model (8 slabs with `Qto_SlabBaseQuantities.NetArea`, 3 spaces, 3 walls, one `IfcRelReferencedInSpatialStructure` and one `IfcRelSpaceBoundary` per element), Playwright with WebGPU on swiftshader, messages posted as the host does (`ISOLATE`, `OPEN_LIST`, `LIST_UPDATE`, `ACK_REQUEST`):

- #276: after `ISOLATE` of one wall, `OPEN_LIST` of the slabs and Run: 8 rows shown, `visible_only: false`, the isolation still set. Without the fix the same list showed `0 / 8 rows` and "Matching rows are hidden by the current filters".
- #275: `columnWidths: fit` for the long name column gave 671 px, the second column 300 px; `view_state.column_widths` reported both.
- #274: highlight of the rows with space "izba 2" (3 rows), the cell NetArea of "Doska 1" and the totals row: the DOM had exactly those three rows, one cell and the footer marked; `APPLIED.list.highlight` was `{ rows: 3, cells: 1, columns: [], sum: [NetArea] }`.
- #277: walls with the column `Boundary` ("Hranica priestoru") gave Izba 1, Izba 2, Izba 3; slabs with `Referenced` gave Izba 1, Izba 2, Izba 3 in turn. The builder shows the new level as a plain column.

Not covered live: `run: true` did not start the table in this headless run, with or without the change (same on `main`), so the check pressed Run. `aimListRun.ts` is not touched.
