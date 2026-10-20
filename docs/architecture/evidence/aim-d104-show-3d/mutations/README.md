<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-104 step 4 "Ukázať v 3D": surgical mutation evidence

The change adds a "Ukázať v 3D" button to the toolbar of an open PDF. A click posts `DOCUMENT_SHOW_3D {documentId, page}` with the page being read; the AIM host resolves the elements that page (or, without own elements, the whole document) refers to and answers with `APPLY_LENS`. The payload is decided by the new pure function `show3dTarget` in `apps/viewer/src/aim/documentsQuery.ts`; its test imports that new export, so reverting production to the base makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each decision of the function was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `show3d-local-docs.patch` | `documentsQuery.ts` | a file opened from disk (`local:`) also asks the host, which has no elements for it | `documentsQuery.test.ts` |
| `show3d-any-page.patch` | `documentsQuery.ts` | any truthy page is sent, also a fractional one | `documentsQuery.test.ts` |
| `show3d-drops-page.patch` | `documentsQuery.ts` | the page being read is never sent, so the host always shows the whole document | `documentsQuery.test.ts` |

`AimDocumentShow3d.tsx` (the button, rendered only inside the AIM host), `postAimDocumentShow3d` in `aimPanelStore.ts` and the `PdfDocumentView.tsx` block are UI glue without a unit test; they are checked live in the embedded viewer as described in the pull request ("Ako vyskúšať").

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/documentsQuery.ts \
  --test apps/viewer/src/aim/documentsQuery.test.ts \
  --mutation /tmp/d104-mut/show3d-local-docs.patch --ci --json
```
