<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-158 issues on PDF pages: surgical mutation evidence

The change adds "Pripomienka" to the document tab strip: a rectangle dragged over a PDF page opens the upstream BCF "New topic" form and the topic gets a BCF DocumentReference to that page and region; issue frames are drawn on the pages, `view_state.bcf_local` lists topics the AIM host does not have yet, and AIM_BCF_LOAD merges host topics with the local ones and reads their document references. The pure logic is the new `docIssueModel.ts`; its test (`docIssueModel.test.ts`) imports a module that does not exist on the base, so reverting production makes the test fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision was checked with a surgical mutation instead.

Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. Records: `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `click-is-region.patch` | `docIssueModel.ts` | a click (drag under 0.5 % of the page) still makes a region | `docIssueModel.test.ts` |
| `url-any-id.patch` | `docIssueModel.ts` | any /drawing/<x> path is taken as an AIM document | `docIssueModel.test.ts` |
| `frames-any-page.patch` | `docIssueModel.ts` | frames of every page are drawn on each page | `docIssueModel.test.ts` |
| `saved-as-local.patch` | `docIssueModel.ts` | host topics (with #N) are listed as unsaved in view_state | `docIssueModel.test.ts` |
| `merge-drops-local.patch` | `docIssueModel.ts` | a reload from the host drops topics added in the panel | `docIssueModel.test.ts` |
| `merge-any-project.patch` | `docIssueModel.ts` | the user's own project (file, other server) is merged with AIM topics | `docIssueModel.test.ts` |
| `new-topic-ignores-before.patch` | `docIssueModel.ts` | the reference goes to the first topic, not the one the form created | `docIssueModel.test.ts` |
| `doc-refs-not-read.patch` | `aimBcf.ts` | host topics never get their document references | `bcf-protocol.test.ts` |

`docIssues.ts` and `AimDocumentIssue.tsx` are store and DOM glue (drawing, frames, the upstream New topic button) with no unit test; both sit in the lazy DocumentPane chunk. They were verified live: local fork viewer embedded in a host page with a fake BCF API, Playwright dragging a rectangle over page 1 of a test PDF, filling the upstream form, reading `QUERY view_state` (`bcf_local` with the page and region link), reloading host topics (the local topic stays), then serving the same guid as saved topic #2 (no duplicate, frame label `#2`, click opens the topic).

## Replay

Clean checkout of the branch with dependencies installed; copy the patches outside the tree (the oracle refuses a dirty tree):

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/docIssueModel.ts \
  --test apps/viewer/src/aim/docIssueModel.test.ts \
  --mutation /tmp/d158-mut/click-is-region.patch --ci --json
```

`doc-refs-not-read.patch` uses `--only apps/viewer/src/aim/aimBcf.ts --test apps/viewer/src/aim/bcf-protocol.test.ts`.
