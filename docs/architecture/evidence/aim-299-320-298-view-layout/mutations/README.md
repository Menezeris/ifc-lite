<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #299, #320, #298: surgical mutation evidence

The change extends existing bridge messages in `apps/viewer/src/aim/` (D-114): `VIEW_TABS layout` gets `ratio` / `sizes` (tile shares, #299; the strip also gets draggable dividers), `SET_PANELS` gets `panel_layout` (width and side of a panel, #320), and `RESET_COLORS` now also clears the isolation (#298). New tested functions (`normalizeSizes`, `tileRects`, `sizesFromDrag`, `planPanelLayout`, `resizeTiles`) do not exist on `main`, so reverting production would make the tests fail to load (INCONCLUSIVE). Each decision was instead checked with a surgical mutation.

Patches are written mutant -> fixed (orientation of `git diff base...head`); the oracle reverse-applies them. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. Records are in `summary.json`. `closed-panel-resized` was first UNOBSERVED (the test only counted issues); the test was tightened and the run repeated.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `clear-filter-drops-isolation.patch` | `visibility-commands.ts` | CLEAR_FILTER also clears the isolation (only RESET_COLORS may) | `focus-dismiss-fill.test.ts` |
| `closed-panel-resized.patch` | `aimPanelsPlan.ts` | a closed panel is floated / resized | `aimPanelsPlan.test.ts` |
| `divider-from-end-ignored.patch` | `viewTilesPlan.ts` | the divider of three_right / three_bottom is placed from the start, not from the end | `viewTilesPlan.test.ts` |
| `drag-unclamped.patch` | `viewTilesPlan.ts` | dragging a divider can push a tile out of the area | `viewTilesPlan.test.ts` |
| `float-min-width-dropped.patch` | `aimPanelsPlan.ts` | a floating panel can be made narrower than 240 px | `aimPanelsPlan.test.ts` |
| `layout-drops-sizes.patch` | `viewTilesPlan.ts` | layoutTiles forgets the shares given with the layout | `viewTilesPlan.test.ts` |
| `layout-without-panels-refused.patch` | `view-protocol.ts` | `panel_layout` without `panels` is refused | `aimPanelsPlan.test.ts` |
| `min-share-ignored.patch` | `viewTilesPlan.ts` | a tile share below 10 % is kept instead of being raised | `viewTilesPlan.test.ts` |
| `panel-width-docked-ignored.patch` | `aimPanelsPlan.ts` | the width of a docked right panel is not applied | `aimPanelsPlan.test.ts` |
| `ratio-any-layout.patch` | `tiles-protocol.ts` | `ratio` is accepted for layouts with three shares | `viewTilesPlan.test.ts` |
| `reset-colors-keeps-isolation.patch` | `visibility-commands.ts` | RESET_COLORS does not clear the isolation (the old behaviour) | `focus-dismiss-fill.test.ts` |
| `resize-keeps-old-frame.patch` | `viewTabsApply.ts` | resizeTiles does not recompute the frame of the live 3D tile | `tileResize.test.ts` |
| `side-same-as-docked-floats.patch` | `aimPanelsPlan.ts` | side=right on a panel already docked right floats it | `aimPanelsPlan.test.ts` |
| `sizes-and-ratio-together.patch` | `tiles-protocol.ts` | `sizes` and `ratio` may be sent together | `viewTilesPlan.test.ts` |
| `three-right-swapped.patch` | `viewTilesPlan.ts` | three_right puts the big tile on the wrong side | `viewTilesPlan.test.ts` |
| `width-range-open.patch` | `view-protocol.ts` | `width_pct` accepts any number | `aimPanelsPlan.test.ts` |

## Replay

Copy the patches outside the tree (the oracle refuses a dirty tree), then for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/viewTilesPlan.ts \
  --test apps/viewer/src/aim/viewTilesPlan.test.ts \
  --mutation /tmp/mut/min-share-ignored.patch --ci --json
```
