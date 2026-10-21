<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-127 panels: surgical mutation evidence

AIM D-127 changes the AIM layer in `apps/viewer/src/aim/` (#169 follows AIM D-129):
- A chat property focus (`SELECT` `panel.focus`) stays highlighted until the next selection. It also reaches quantities and type psets.
- The AIM | IFC tab bar and the AIM card are gone. The element's last recipe change and its GUID history are AIM layer rows with an AIM badge, and inherited documents carry an AIM badge in the Documents panel.
- `SET_PANELS` opens, closes or toggles panels.
- A chat page region re-fits when the card is resized, and `view_state` reports the visible part of the page.

The pure logic lives in four modules: `aimPanelViewPlan.ts`, the new `aimPanelsPlan.ts`, `docVisible.ts` (`visiblePart`, `regionInside`, `describeVisible`, split out of `docRegion.ts` for the module size gate) and `docRegion.ts` (`regionApplied`). The message check lives in `view-protocol.ts`. The changed tests import exports that do not exist on `main`, so reverting production makes them fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed and reverse-applied by the oracle. Every run ended `OBSERVED` (exit 0) with restoration verified against `origin/main`. The records are in `summary.json`.

| Patch | Module | Mutation | Test |
|---|---|---|---|
| `qto-in-properties.patch` | `aimPanelViewPlan.ts` | a Qto focus opens Properties instead of Quantities | `aimPanelViewPlan.test.ts` |
| `propkey-ignores-pset.patch` | `aimPanelViewPlan.ts` | a row key matches on the property name alone, any pset | `aimPanelViewPlan.test.ts` |
| `loose-before-exact.patch` | `aimPanelViewPlan.ts` | a case-insensitive name wins over the exact one | `aimPanelViewPlan.test.ts` |
| `all-closes-explicit.patch` | `aimPanelsPlan.ts` | `all: close` also closes the panels the message opens | `aimPanelsPlan.test.ts` |
| `open-before-close.patch` | `aimPanelsPlan.ts` | opening runs before closing, so a shared slot gets closed again | `aimPanelsPlan.test.ts` |
| `floating-ignored.patch` | `aimPanelsPlan.ts` | a floating panel is reported as docked or closed | `aimPanelsPlan.test.ts` |
| `all-open-accepted.patch` | `view-protocol.ts` | `all: open` passes the bridge check | `aimPanelsPlan.test.ts` |
| `inside-no-tolerance.patch` | `docVisible.ts` | "region fully visible" has no rounding tolerance | `docRegion.test.ts` |
| `visible-unclamped.patch` | `docVisible.ts` | the visible part is not clamped to the page | `docRegion.test.ts` |
| `clear-no-waiter.patch` | `docRegion.ts` | clearing a region request never resolves `regionApplied` | `docRegion.test.ts` |
| `aim-badge-dropped.patch` | `documentsQuery.ts` | a document inherited through a relation loses its AIM flag (D-129) | `documentsQuery.test.ts` |

The following is store, DOM and renderer glue with no unit test, and was verified live:
- `aimPanelView.ts`: DOM focus with a MutationObserver.
- `aimPanels.ts`: store actions.
- The `useAimDocRegion` refit, `AimInspectorTabs.tsx` and `AimCard.tsx`.
- The `viewQueries.ts` / `useAimViewCommands.ts` wiring.

The live check ran in a local fork viewer embedded in a host page with the `BURKWIL_DX_B.ifc` model, driven by Playwright posting bridge messages and `ACK_REQUEST`:
- A focus on `AC_Pset_RenovationAndPhasing.Renovation Status` scrolled into view and was still marked after 7.5 s. A collapsed pset was expanded. `BaseQuantities.Width` was marked in Quantities. A missing property came back `found: false` with an `APPLIED` issue. Selecting another door cleared the mark.
- `SET_PANELS all=close` hid every panel. Lens, the tree and lists opened, and their reported state matched the screen.
- `DOCUMENT_OPEN` with a 30 % region in a 378 px card reported `region_fully_visible: true`. Narrowing the card to 264 px kept the region in view.

Bundle (`vite build` of branch and `main`, same machine, after the D-129 commit):
- `viewer-entry-js-bytes` 3,164,980, which is -1,748 B against `main` (the tab bar and the card are gone).
- `viewer-eager-js-bytes` +3,211 B, inside the tolerance.
- `perf-ratchet check` passes without a ceiling raise.

## Replay

Use a clean checkout with dependencies. Copy the patches outside the tree, then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimPanelsPlan.ts \
  --test apps/viewer/src/aim/aimPanelsPlan.test.ts \
  --mutation /tmp/d127-mut/open-before-close.patch --ci --json
```
