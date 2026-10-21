<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-131 Reality Capture media: surgical mutation evidence

AIM D-131 shows the Reality Capture media of the selected space in the Documents panel
("Len pre výber"), below the selection's documents, grouped by media kind with an AIM badge.
The host sends them in `AimPanelData.captureMedia`; a click navigates the host to the space's
gallery. The pure logic is `selectionMedia` in `documentsQuery.ts`. The changed test imports an
export that does not exist on `main`, so reverting production makes it fail to load and the CI
revert oracle reports INCONCLUSIVE. Each main decision was instead checked with a surgical
mutation.

Each patch is written mutant->fixed and reverse-applied by the oracle. Every run ended
`OBSERVED` (exit 0) with restoration verified against `origin/main`. The records are in
`summary.json`.

| Patch | Module | Mutation | Test |
|---|---|---|---|
| `media-filter-ignored.patch` | `documentsQuery.ts` | the panel filter does not apply to media | `documentsQuery.test.ts` |
| `media-unsafe-thumb-kept.patch` | `documentsQuery.ts` | a thumbnail URL that is not http(s) reaches `<img src>` | `documentsQuery.test.ts` |
| `media-groups-unsorted.patch` | `documentsQuery.ts` | media kind groups keep arrival order instead of name order | `documentsQuery.test.ts` |

The rows and group headings in `AimDocumentsControls.tsx` are React glue with no unit test, and
were verified live in an embedded viewer driven by Playwright posting `AIM_PANEL_DATA`.
