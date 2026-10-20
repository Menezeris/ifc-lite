<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-104 step 3 documents panel and AIM rail group: surgical mutation evidence

The change adds the AIM rail group (first of all groups: Documents, AIM layers, Drawing underlays), moves AIM LAYERS from the tree into its own `aim-layers` panel, lets the Documents panel group by the host's folder or any `meta` key, search name and metadata, and show the selected element's documents from the AIM card (`Len pre výber`), and opens a card document in the viewer at its page. The pure grouping and search live in the new `apps/viewer/src/aim/documentsQuery.ts`; its test (`documentsQuery.test.ts`) imports the new module, so reverting production to the base deletes it and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main decision of the module, and the rail order in `registry.ts`, was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `fold-keeps-diacritics.patch` | `documentsQuery.ts` | diacritics are not folded, so "podorys" misses "Pôdorys" | `documentsQuery.test.ts` |
| `filter-name-only.patch` | `documentsQuery.ts` | the filter searches the name only, not folder and metadata | `documentsQuery.test.ts` |
| `multi-value-not-split.patch` | `documentsQuery.ts` | a meta value with several values ("4NP; 5NP") stays one group | `documentsQuery.test.ts` |
| `catch-all-first.patch` | `documentsQuery.ts` | the catch-all bucket sorts first instead of last | `documentsQuery.test.ts` |
| `selection-ignores-library.patch` | `documentsQuery.ts` | the selection search ignores the library entry's metadata | `documentsQuery.test.ts` |
| `selection-drops-page.patch` | `documentsQuery.ts` | the page of a card document is lost, so the PDF opens on page 1 | `documentsQuery.test.ts` |
| `aim-group-last.patch` | `lib/panels/registry.ts` | the AIM group is the last group of the rail, not the first | `aimRailGroup.test.ts` |

`AimDocumentsControls.tsx`, `AimLayersPanel.tsx`, the `AimCard.tsx` click and the `DocumentsPanel.tsx` wiring are store and UI glue with no unit test. They were verified live: local fork viewer embedded in a host page that posts the bridge messages, ASR v76 of the AIM project (Polyfunkčný objekt) and the AIM host's real document list (44 PDFs with folder and `meta`) and AIM card documents read from its database. The rail showed `AIM: Documents, AIM layers, Drawing underlays`, then `Coordinate: Hierarchy`; grouping by `Podlažie` gave 1NP to 5NP with the roof plan under 4NP and 5NP; the filter `podorys pbr` left the four PBR floor plans; `SELECT` of room 3.01 with `Len pre výber` listed six documents with their path (`priamo`, `cez priestorovú zónu N3.01`, `cez priestorovú zónu Z3`); the floor covering ST01.20.0012 listed `D.1.1.09 Výpis skladieb s. 3 cez skupinu S1 (S1.01)` and a click opened the PDF at `3 / 10`; in the AIM card a click on `D.1.3.04 Pôdorys 3NP PBR` opened a document tab without an `AIM_NAVIGATE`; the AIM layers panel listed the two derivation rules.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/documentsQuery.ts \
  --test apps/viewer/src/aim/documentsQuery.test.ts \
  --mutation /tmp/d104-mut/catch-all-first.patch --ci --json
```

`aim-group-last.patch` uses `--only apps/viewer/src/lib/panels/registry.ts --test apps/viewer/src/aim/aimRailGroup.test.ts`.
