<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #199 topic list: surgical mutation evidence

`apps/viewer/src/aim/topicListModel.ts` is new, and its test imports it, so reverting production makes the test fail to load (INCONCLUSIVE in the CI revert oracle). Each main decision of the module was checked with a mutation instead. Patches are mutant -> fixed; every run ended `OBSERVED` (exit 0) with restoration verified, base `origin/main` (see `summary.json`).

| Patch | Mutation |
|---|---|
| `context-both-as-or.patch` | context `both` matches 3D or PDF instead of both |
| `context-none-inverted.patch` | context `none` matches topics with any one context missing |
| `document-filter-ignored.patch` | the document filter does nothing |
| `entity-filter-inverted.patch` | the entity filter keeps topics that do NOT contain the GlobalId |
| `project-only-ignored.patch` | "whole project" keeps topics linked to entities |
| `open-pdf-before-3d.patch` | a click on a topic with both contexts opens the PDF instead of the 3D viewpoint |

`AimTopicList.tsx` and `topicOpen.ts` are React and store glue with no unit test.

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/topicListModel.ts \
  --test apps/viewer/src/aim/topicListModel.test.ts \
  --mutation /tmp/aim199-mut/<patch> --ci --json
```
