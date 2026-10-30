<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #168 and #315: surgical mutation evidence

Both changes live in the AIM layer, `apps/viewer/src/aim/`, with no edit in an upstream file:
- #168: a chat property focus (`SELECT` `panel.focus`, `show_in_3d` with `highlight`) did not wait for the element's properties. A large model delivers them seconds after the selection. The search switched section after 0.9 s and gave up after 1.8 s, so the row was never marked and the panel never scrolled. `aimPanelView.ts` now waits until the properties are in the store (up to 10 s) and only then counts the section search time.
- #315: `VIEW_CAPTURE` took a non-empty basket (also a stale one from an earlier save) or the selection before the visible elements, so a saved view under a Lens isolation held one element. `viewCaptureBasket.ts` makes the basket the visible elements whenever an isolation or a hide is in force (Lens, class filter, storey, manual isolation, hidden elements). Without one the old order stays.
- #315: new bridge message `SELECT { visible: true }` selects every currently visible element.

The changed tests import `viewCaptureBasket.ts` or use new behaviour that does not exist on `main`, so reverting production makes them fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision was checked with a surgical mutation instead. Each patch is written mutant->fixed and reverse-applied by the oracle. Every run ended `OBSERVED` (exit 0) with restoration verified. The records are in `summary.json`.

| Patch | Module | Mutation | Test |
|---|---|---|---|
| `capture-ignores-isolation.patch` | `viewCaptureBasket.ts` | the visible-elements branch is never taken (the old selection-first order) | `integration/viewCapture.test.ts` |
| `reduced-ignores-hidden.patch` | `viewCaptureBasket.ts` | hidden elements and Lens hides do not count as an isolation | `integration/viewCapture.test.ts` |
| `reduced-ignores-isolation.patch` | `viewCaptureBasket.ts` | class, storey and manual isolation do not count as an isolation | `integration/viewCapture.test.ts` |
| `stale-basket-wins.patch` | `viewCaptureBasket.ts` | a non-empty old basket wins over the visible elements | `integration/viewCapture.test.ts` |
| `select-visible-first-only.patch` | `visibility-commands.ts` | `SELECT visible` selects only the first visible element | `integration/select-visible.test.ts` |
| `select-visible-false-accepted.patch` | `bridge-protocol.ts` | `visible: false` passes the bridge check | `integration/select-visible.test.ts` |
| `select-visible-with-guid.patch` | `bridge-protocol.ts` | `visible: true` together with `guid` or `guids` passes the bridge check | `integration/select-visible.test.ts` |
| `no-wait-for-properties.patch` | `aimPanelView.ts` | the section search clock starts at the selection, not when the properties are loaded | `aimPanelView.sticky.test.tsx` |

`aimPanelView.sticky.test.tsx` mounts the real `PropertiesPanel` over a real parsed store, so the DOM glue is covered too (it was verified live only before).

Not done in the session that wrote this: the live check in an embedded viewer and the bundle ratchet measurement. The viewer package depends on a private package (`@assetinspace/design-kit`) the session could not fetch, so `vite` could not build or serve the viewer. CI measures the bundle; the live check is the "Ako vyskúšať" section of the PR.

## Replay

Use a clean checkout with dependencies. Copy the patches outside the tree, then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/viewCaptureBasket.ts \
  --test apps/viewer/src/aim/integration/viewCapture.test.ts \
  --mutation /tmp/mut168315/stale-basket-wins.patch --ci --json
```
