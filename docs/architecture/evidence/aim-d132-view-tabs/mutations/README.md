<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-132 view tabs: surgical mutation evidence

AIM D-132 (#165) adds view tabs to the AIM layer in `apps/viewer/src/aim/`:
- One tab is one open view on the whole center area: 3D (always first), a storey plan (the D-072 locked top-down cut), a saved view of the host (D-122) and a D-075 document.
- A document tab collapses the 3D panel the same way the 2D mode does. "Vedľa" puts a second tab beside the active one: a document beside a 3D view, or a storey plan as the D-072 2D plan beside free 3D. Two 3D views side by side are refused (one WebGPU canvas).
- Switching tabs stores the canvas state of the tab being left (camera, the whole plane set or box, lock, storey cut) and restores it on return.
- The bridge gets `VIEW_TABS`, `SET_SECTION_BOX`, `DOCUMENT_OPEN layout` and `view_state.tabs` / `section.box`. `SET_VIEW_MODE` goes through the tabs.

The pure logic lives in `viewTabsPlan.ts`, `viewTabsLayout.ts` (the small part the entry chunk needs), `tabs-protocol.ts` and `sectionBox.ts`. The tests import exports that do not exist on `main`, so reverting production makes them fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed and reverse-applied by the oracle. Every run ended `OBSERVED` (exit 0) with restoration verified against `origin/main`. The records are in `summary.json`.

| Patch | Module | Mutation | Test |
|---|---|---|---|
| `close-3d.patch` | `viewTabsPlan.ts` | the 3D tab can be closed | `viewTabsPlan.test.ts` |
| `close-to-3d.patch` | `viewTabsPlan.ts` | closing the active tab always falls back to 3D, not to the tab beside or the previous one | `viewTabsPlan.test.ts` |
| `two-scenes-beside.patch` | `viewTabsPlan.ts` | any two 3D tabs may stand side by side | `viewTabsPlan.test.ts` |
| `doc-open-ignored.patch` | `viewTabsPlan.ts` | a newly opened document card does not become the active tab | `viewTabsPlan.test.ts` |
| `ref-case-sensitive.patch` | `viewTabsPlan.ts` | a chat reference to a tab is case sensitive | `viewTabsPlan.test.ts` |
| `doc-beside-collapses.patch` | `viewTabsLayout.ts` | an active document collapses 3D even with a tab beside it | `viewTabsPlan.test.ts` |
| `plan-beside-any.patch` | `viewTabsLayout.ts` | a plan beside a document is shown as the 2D plan pane | `viewTabsPlan.test.ts` |
| `view-without-label.patch` | `tabs-protocol.ts` | a saved view tab opens without a label | `viewTabsPlan.test.ts` |
| `layout-default-split.patch` | `tabs-protocol.ts` | `DOCUMENT_OPEN` without a layout opens beside 3D | `viewTabsPlan.test.ts` |
| `box-and-guids.patch` | `sectionBox.ts` | `SET_SECTION_BOX` accepts elements and a box at once | `sectionBox.test.ts` |
| `margin-ignored.patch` | `sectionBox.ts` | the margin around the elements is dropped | `sectionBox.test.ts` |

The following is store, DOM and renderer glue with no unit test, and was verified live:
- `viewTabsApply.ts` (canvas state per tab, plan and split entry, document card sync), `viewTabsStore.ts`.
- `useAimCenterPanes.ts` (moved from the `ViewerLayout.tsx` AIM-FORK block), `AimViewTabsBar.tsx`.
- The `AimBridge.tsx`, `docBridge.ts`, `useAimViewCommands.ts` and `viewQueries.ts` wiring.

The live check ran in a local fork viewer embedded in a host page with `public/_fixtures/AC20-FZK-Haus.ifc`, driven by Playwright posting bridge messages and `ACK_REQUEST`:
- `SET_VIEW_MODE 2d` opened the Dachgeschoss plan tab (orthographic, locked).
- `DOCUMENT_OPEN` opened the PDF as the active tab on the whole center area, 3D collapsed.
- `VIEW_TABS activate 3D` came back to perspective 3D without a cut. `beside` put the PDF beside 3D.
- `VIEW_TABS open` a view + `SET_SECTION_BOX` + `SET_CAMERA front` kept the box in the view tab. 3D came back without the box, and the view tab came back with it.
- `beside 3D` from a view tab was refused with an `APPLIED` issue (one 3D canvas). `close all` left only 3D.

Bundle (`vite build` of the branch and of `claude/aim-d127-panely` @ 67d78612a, same machine):
- `viewer-entry-js-bytes` +2,275 B against the base (protocol checks, tabs and section box run in lazy modules); inside the tolerance, no ceiling raise.
- `viewer-eager-js-bytes` +3,659 B, inside the tolerance.

## Replay

Use a clean checkout with dependencies. Copy the patches outside the tree, then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/viewTabsPlan.ts \
  --test apps/viewer/src/aim/viewTabsPlan.test.ts \
  --mutation /tmp/d132-mut/close-3d.patch --ci --json
```
