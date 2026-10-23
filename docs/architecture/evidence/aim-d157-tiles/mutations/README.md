<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-157 tiles: surgical mutation evidence

The change adds tiled view tabs to the AIM viewer (`apps/viewer/src/aim/`): layouts of one to four
tiles, one live 3D tile (the single WebGPU canvas is moved into it) and snapshots for the other 3D
tiles. The pure logic lives in the new `viewTilesPlan.ts` and the bridge message check in the new
`tiles-protocol.ts`. The test (`viewTilesPlan.test.ts`) imports both, so reverting them to the base
makes the test file fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision of
the two modules was checked with a surgical mutation instead.

Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED`
(exit 0) with restoration verified, against base `origin/main`. Full records: `summary.json`.

| Patch | Module | Mutation |
|---|---|---|
| `layout-allows-duplicates.patch` | `viewTilesPlan.ts` | a requested tab can fill two tiles |
| `place-ignores-kind.patch` | `viewTilesPlan.ts` | a tab outside the tiles replaces the last non-live tile, not one of the same kind (document for document) |
| `reconcile-no-refill.patch` | `viewTilesPlan.ts` | a closed tab leaves its tile empty although another open tab is not shown |
| `scene-ignores-current-tile.patch` | `viewTilesPlan.ts` | the live 3D tile jumps to the first 3D tile when a document becomes active |
| `set-tile-no-swap.patch` | `viewTilesPlan.ts` | choosing a tab already in another tile duplicates it instead of swapping |
| `three-bottom-big-on-top.patch` | `viewTilesPlan.ts` | "two on top, one big below" puts the big tile on top |
| `protocol-unbounded-tiles.patch` | `tiles-protocol.ts` | `VIEW_TABS layout` accepts more tiles than the layout has |

`tileShots.ts`, `viewTabsApply.ts` (commit, prerender), `AimTileGrid.tsx`, `AimViewTabsBar.tsx`, the
`useAimCenterPanes.ts` frame and the `ViewerLayout.tsx` AIM-FORK wrapper are store, DOM and canvas
glue without a unit test; they were checked live in an embedded viewer (`AC20-FZK-Haus.ifc`, host page
posting `VIEW_TABS layout`): the grid, tile headers, the canvas moving into the live tile and back to
full size with `single`. WebGPU in the session container lost its device, so the snapshot pixels were
not checked there; the read is the same post-presentation canvas read the BCF capture uses
(`lib/viewport-capture.ts`).

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/viewTilesPlan.ts \
  --test apps/viewer/src/aim/viewTilesPlan.test.ts \
  --mutation /tmp/d157-mut/place-ignores-kind.patch --ci --json
```

`protocol-unbounded-tiles.patch` uses `--only apps/viewer/src/aim/tiles-protocol.ts`.
