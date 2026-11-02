<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-186 Requirements library browser link: surgical mutation evidence

The change adds a "Prehliadač knižnice" button to the Requirements library card (host page `/kniznica`, read-only browser of the library head in the AIM database) and, for an item that comes from a library release in the database, a "Poznámka" button that opens the ER note in that browser. Navigation goes through the existing `AIM_NAVIGATE` bridge message (`postAimNavigate`); the address comes from the new pure function `libraryBrowserHref` in `reqlibPlan.ts`. The test (`reqlibPlan.test.ts`) imports that new export, so reverting `reqlibPlan.ts` to the base makes the import fail and the CI revert oracle reports INCONCLUSIVE. Each decision of the function was checked with a surgical mutation instead.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. Records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `always-root.patch` | `reqlibPlan.ts` | the browser link always opens the whole browser, never the note of the item | `reqlibPlan.test.ts` |
| `path-not-encoded.patch` | `reqlibPlan.ts` | the note path goes into the query string without encoding (spaces, diacritics and & break the link) | `reqlibPlan.test.ts` |
| `library-optional.patch` | `reqlibPlan.ts` | an item without a library code still builds a note link (`kniznica=undefined`) | `reqlibPlan.test.ts` |

`AimRequirementsLibrary.tsx` is UI glue (two buttons) without a unit test; it is a lazy module, the bundle is unchanged against `main` (`viewer-entry-js-bytes` and `viewer-eager-js-bytes` +0).

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree (the oracle refuses a dirty tree), then for each patch:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/reqlibPlan.ts \
  --test apps/viewer/src/aim/reqlibPlan.test.ts \
  --mutation /tmp/d186-mut/always-root.patch --ci --json
```
