<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-117 page region: surgical mutation evidence

The change lets the AIM host zoom a PDF document tab to a part of a page: `DOCUMENT_OPEN` carries an optional `region` (page fractions, origin top left). The checks, the zoom and scroll maths and the request store live in the new `apps/viewer/src/aim/docRegion.ts`; `PdfDocumentView.tsx` only calls `useAimDocRegion` (one-line `AIM-FORK` blocks, the file sits at its module-size budget), `AimBridge.tsx` forwards the region and `bridge-protocol.ts` only widens the message type. The test (`docRegion.test.ts`) imports the new module, so reverting it to the base (deleting the file) makes the test fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision of the module was instead checked with a surgical mutation.

Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `region-not-clamped.patch` | a region running past the page edge is not cut to the page | `docRegion.test.ts` |
| `empty-region-accepted.patch` | a zero-size region is accepted (and blown up to the minimum) | `docRegion.test.ts` |
| `zoom-ignores-height.patch` | the zoom fits only the region width, a tall region overflows the viewport | `docRegion.test.ts` |
| `zoom-unbounded.patch` | the zoom is not held to the tab's 0.5-16 range | `docRegion.test.ts` |
| `scroll-to-corner.patch` | the scroll puts the region's left edge, not its centre, in the middle | `docRegion.test.ts` |
| `nonce-reused.patch` | repeating the same region does not get a new nonce, so it would not run again | `docRegion.test.ts` |

`useAimDocRegion` (zoom first, scroll after the zoom commits) and the `AimBridge.tsx` / `PdfDocumentView.tsx` wiring are store and DOM glue without a unit test.

## Replay

Clean checkout of the branch with dependencies installed, patches copied outside the tree:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/docRegion.ts \
  --test apps/viewer/src/aim/docRegion.test.ts \
  --mutation /tmp/d117-mut/zoom-ignores-height.patch --ci --json
```
