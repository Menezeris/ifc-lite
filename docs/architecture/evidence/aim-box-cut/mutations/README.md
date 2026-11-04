<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM Box cut: surgical mutation evidence

The change adds the sized-margin box and the room box (floor slab to ceiling slab, plus the walls around it) in `apps/viewer/src/aim/` (`sectionBoxFit.ts` pure maths, `sectionBoxScene.ts` scene glue, `runBoxCut.ts`), the optional `auto` flag of `SET_SECTION_BOX` (`sectionBox.ts`, `viewQueries.ts`), and the fork wiring in the Section bar and the element context menu. The tests import modules that do not exist on `main` (`sectionBoxFit.ts`, `sectionBoxScene.ts`, `runBoxCut.ts`), so reverting production makes them fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision was instead checked with a surgical mutation.

Each patch is written mutant to fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. Full records in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `margin-fraction-halved` | `sectionBoxFit.ts` | margin 10 % of the longest side instead of 20 % | `sectionBoxFit.test.ts` |
| `margin-no-minimum` | `sectionBoxFit.ts` | no 0.3 m minimum margin | `sectionBoxFit.test.ts` |
| `floor-slab-any-depth` | `sectionBoxFit.ts` | a slab far below the room (another storey) counts as its floor | `sectionBoxFit.test.ts` |
| `wall-thickness-uncapped` | `sectionBoxFit.ts` | a 1 m "wall" (a mass, not a build-up) widens the box | `sectionBoxFit.test.ts` |
| `wall-extends-along-its-length` | `sectionBoxFit.ts` | a long wall also extends the box along its length | `sectionBoxFit.test.ts` |
| `missing-side-no-margin` | `sectionBoxFit.ts` | a side without slab or wall gets no margin (box touches the room) | `sectionBoxFit.test.ts` |
| `auto-with-margin-accepted` | `sectionBox.ts` | `auto` together with `marginM` is a valid message | `sectionBox.test.ts` |
| `room-branch-disabled` | `sectionBoxScene.ts` | an IfcSpace is boxed like any other element (margin only) | `sectionBoxScene.test.ts` |
| `ignores-clicked-entity` | `sectionBoxScene.ts` | the context-menu Box cut follows the old selection, not the clicked element | `runBoxCut.test.tsx` |
| `box-missing-on-bar` | `SectionAddMenu.tsx` | Box is filtered out of the empty bar again | `SectionToolbar.planes.test.tsx` |
| `fit-ignores-room-and-margin` | `SectionActivePlaneRow.tsx` | Fit refits to the exact selection bounds, not the Add box | `SectionToolbar.box.test.tsx` |

`viewQueries.ts` (`applySectionBox` with `auto`) is store and renderer glue with no unit test; it was driven live (below). One mutation was dropped on purpose: closing the context menu in the item itself (Radix closes it on select, so the call was redundant and the oracle correctly showed it unobserved; the call was removed instead).

## Live check

Dev viewer (`vite`, local), `tests/models/ara3d/AC20-FZK-Haus.ifc`, Playwright (software WebGPU; the 3D canvas lost its device in this sandbox, so the check reads viewer state, not pixels):

- The empty Section bar lists Down (Z), Front (Y), Side (X), Face, Box.
- Room 21640 (`2RSCzLOBz4FAK$_wE8VckM`), envelope x 0.30..3.80, y 0..2.50, z -9.70..-5.99 m: bar Box with the room selected, and the same through `SET_SECTION_BOX` with `auto: true`, gave x 0..4.04, y -0.20..2.70, z -10..-5.75 m (floor slab bottom, ceiling slab top, wall thickness 0.30 and 0.24 m). The Section bar showed 4.04 x 2.90 x 4.25 m.
- Box with nothing selected is still the whole-model box; a wall gets a 20 % margin.
- Found while checking: `SET_SECTION_BOX` with `marginM` on a room GUID never completes (the renderer holds no bounds for the hidden IfcSpace; the old path waited 30 s and returned false). `auto: true` does not have that problem.

## Replay

Clean checkout of the branch, dependencies installed, patches copied outside the tree (the oracle refuses a dirty tree):

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/sectionBoxFit.ts \
  --test apps/viewer/src/aim/sectionBoxFit.test.ts \
  --mutation /tmp/box-cut-mut/margin-fraction-halved.patch --ci --json
```

The other patches use the `--only` and `--test` pair from the table's module and test columns.
