<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-123 text highlights: surgical mutation evidence

The change lets the AIM host frame found text in a PDF document tab: `DOCUMENT_OPEN` carries an optional `highlights` list (rectangles in page fractions, origin top left, e.g. text lines from AIMviewer `search_documents`). The checks, the frame style and the store live in `apps/viewer/src/aim/docRegion.ts` next to the D-117 page region; `useAimDocRegion` draws the frames as a layer over the page, so `PdfDocumentView.tsx` does not change. `AimBridge.tsx` forwards the list (every `DOCUMENT_OPEN` replaces or clears it, a bridge reset clears it) and `bridge-protocol.ts` only widens the message type. The test (`docRegion.test.ts`) imports exports that do not exist on `main`, so the CI revert oracle reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `off-page-accepted.patch` | a rectangle wholly off the page is kept | `docRegion.test.ts` |
| `edge-not-clipped.patch` | a rectangle crossing the left page edge keeps its full width | `docRegion.test.ts` |
| `count-not-capped.patch` | more than 20 frames are drawn | `docRegion.test.ts` |
| `thin-line-inflated.patch` | a thin text line is blown up to the 1 % region minimum | `docRegion.test.ts` |
| `empty-list-keeps-frames.patch` | an open without highlights leaves an empty frame set instead of clearing it | `docRegion.test.ts` |
| `highlight-nonce-reused.patch` | new frames do not get a new nonce, so the layer would not redraw | `docRegion.test.ts` |

The DOM layer (`syncHighlightLayer`) and the `AimBridge.tsx` wiring are glue without a unit test.

## Replay

Clean checkout of the branch with dependencies installed, patches copied outside the tree:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/docRegion.ts \
  --test apps/viewer/src/aim/docRegion.test.ts \
  --mutation /tmp/d123-mut/thin-line-inflated.patch --ci --json
```
