<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #199 point 1, markup on PDF issues: surgical mutation evidence

The change adds markup shapes (cloud, arrow, text, pin) to the PDF issues of AIM D-158. The pure logic lives in the new `docMarkup.ts` (validation of untrusted shapes, shape from a drag, the issue region around the shapes, cloud outline and arrow head geometry). `docIssueModel.ts` carries the shapes on the topic's DocumentReference, in `view_state.bcf_local` and in the host snapshot URL, and `aimBcf.ts` reads them back from the host's `document_references` rows. The test (`docMarkup.test.ts`) imports `docMarkup.ts`, which does not exist on `main`, so reverting production makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main decision of the three tested modules was instead checked with a surgical mutation.

Each patch is written mutant to fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main` (`b9612f0a`). The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `markup-not-clamped.patch` | `docMarkup.ts` | points from the host are not clamped to the page (0-100 %) | `docMarkup.test.ts` |
| `markup-no-cap.patch` | `docMarkup.ts` | no cap on the number of shapes per reference | `docMarkup.test.ts` |
| `text-without-text-kept.patch` | `docMarkup.ts` | a text shape with empty text is kept | `docMarkup.test.ts` |
| `cloud-corners-unsorted.patch` | `docMarkup.ts` | a cloud dragged up-left keeps unsorted corners | `docMarkup.test.ts` |
| `bounds-without-pad.patch` | `docMarkup.ts` | the issue region hugs the shapes with no margin | `docMarkup.test.ts` |
| `cloud-scallops-inward.patch` | `docMarkup.ts` | cloud arcs bulge inward (sweep flag 0) | `docMarkup.test.ts` |
| `arrow-wings-collapsed.patch` | `docMarkup.ts` | the arrow head has no width | `docMarkup.test.ts` |
| `reference-drops-markup.patch` | `docIssueModel.ts` | the new topic's DocumentReference drops the shapes | `docMarkup.test.ts` |
| `view-state-drops-markup.patch` | `docIssueModel.ts` | `view_state.bcf_local` does not send the shapes to the host | `docMarkup.test.ts` |
| `snapshot-without-markup.patch` | `docIssueModel.ts` | the host snapshot URL of a local issue does not ask for the shapes | `docMarkup.test.ts` |
| `host-markup-ignored.patch` | `aimBcf.ts` | `markup` in the host's `document_references` rows is ignored | `docMarkup.test.ts` |

`docIssueDraw.ts` (drawing, the draft and the text field), `docMarkupSvg.ts` (SVG over the page), the frames in `docIssues.ts` and the tool row in `AimDocumentIssue.tsx` are DOM glue with no unit test; they live in the lazy document pane chunk, not the entry. They were verified live: local fork viewer (`vite --port 3000`) embedded in a host page on `127.0.0.1:3001` that serves a test PDF and a minimal BCF API, Playwright driving it. `AIM_BCF_LOAD` loaded a saved topic `#1` whose `document_references` row carries a cloud and a pin with text; after `DOCUMENTS_LOAD` + `DOCUMENT_OPEN` the page showed both over the frame (solid lines). Then "Pripomienka", tool row: a cloud, an arrow and the text "chýba prestup" were drawn on page 1, "Hotovo (3)" opened the upstream New Topic form, "Create Topic" made local topic `N1` drawn with dashed lines, and `QUERY view_state` returned `bcf_local.topics[0].document_references[0].markup` with the three shapes in % of the page and the region `53_8_41_34` around them in the URL. The live run caught one bug fixed in this PR: the text field took focus a tick late, so the first typed characters were lost.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/docMarkup.ts \
  --test apps/viewer/src/aim/docMarkup.test.ts \
  --mutation /tmp/aim199-mut/cloud-scallops-inward.patch --ci --json
```

`--only` names the file the patch touches (`docMarkup.ts`, `docIssueModel.ts` or `aimBcf.ts`).
