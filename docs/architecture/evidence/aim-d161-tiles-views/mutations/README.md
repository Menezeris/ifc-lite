<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-161 tiles with Presentation views: surgical mutation evidence

The change lets a tile of the AIM tile layout (D-157) carry a view from the Presentation panel (`BasketView`, D-161): a new tab kind `view` (`view:<id>`, lives only in a tile), `{view}` tiles in `VIEW_TABS layout`, a view as the target of `beside` / `activate`, and `view_id` / `view` in `view_state.layout.tiles`. The pure logic is in `viewTabsPlan.ts` (`syncViewTabs`, `dropViewTabs`, `viewTabId`, `resolveTabRef`, `describeTabs`), `viewTilesPlan.ts` (`addTile`, `GROW_LAYOUT`, `describeLayout`) and `tiles-protocol.ts`. The new test (`viewTilesViews.test.ts`) imports `syncViewTabs`, `dropViewTabs`, `viewTabId` and `addTile`, which do not exist on the base, so reverting production makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision of the tested modules was instead checked with a surgical mutation.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `sync-no-rename.patch` | `viewTabsPlan.ts` | a renamed Presentation view keeps its old tab label | `viewTilesViews.test.ts` |
| `sync-keeps-deleted.patch` | `viewTabsPlan.ts` | a deleted Presentation view keeps its tab | `viewTilesViews.test.ts` |
| `drop-keeps-active.patch` | `viewTabsPlan.ts` | leaving the tile layout keeps a (dropped) view tab as the active tab | `viewTilesViews.test.ts` |
| `resolve-ignores-view-id.patch` | `viewTabsPlan.ts` | a chat reference by view id does not find the view tab | `viewTilesViews.test.ts` |
| `describe-tabs-no-view-id.patch` | `viewTabsPlan.ts` | `view_state.tabs` omits `view_id` | `viewTilesViews.test.ts` |
| `grow-wrong-layout.patch` | `viewTilesPlan.ts` | "open in a new tile" turns two tiles side by side into the wrong three-tile layout | `viewTilesViews.test.ts` |
| `add-ignores-empty-tile.patch` | `viewTilesPlan.ts` | a new view tile does not use an empty tile first | `viewTilesViews.test.ts` |
| `describe-no-view.patch` | `viewTilesPlan.ts` | `view_state.layout.tiles` omits which view is in which tile | `viewTilesViews.test.ts` |
| `protocol-rejects-view.patch` | `tiles-protocol.ts` | `VIEW_TABS layout` rejects a `{view}` tile | `viewTilesViews.test.ts` |

`viewTabsApply.ts` (commit with scene switch, `openViewInNewTile`, `showViewLive`, `prerenderViews`), `viewTilesScene.ts` (stash of camera, section and basket per tile), `AimTileGrid.tsx`, `AimOpenViewInTile.tsx` and the `viewsBridge.ts` change are store and renderer glue with no unit test; they were verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting the bridge messages (`VIEWS_LOAD` with two views, `VIEW_TABS layout` with `{view}`, `VIEW_TABS beside`, `VIEW_ACTIVATE`, a click on the tile snapshot, back to one window, and the "Open in a new tile" button and a card click in the Presentation strip). The views were activated in the live tile, the displaced tile kept its camera and returned to it (`3D` camera 27.6, -17.6, 20.659 restored after a view tile was live), and `view_state.layout.tiles[].view_id` and `view_state.view` followed the live tile.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/viewTabsPlan.ts \
  --test apps/viewer/src/aim/viewTilesViews.test.ts \
  --mutation /tmp/mutations/sync-no-rename.patch --ci --json
```

(`--only apps/viewer/src/aim/viewTilesPlan.ts` for the `grow-*`, `add-*` and `describe-no-view` patches, `--only apps/viewer/src/aim/tiles-protocol.ts` for `protocol-rejects-view`.)
