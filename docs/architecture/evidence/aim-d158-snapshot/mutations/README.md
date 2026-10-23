<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-158 step 3: PDF region snapshot, surgical mutation evidence

The change adds the PDF region snapshot to issues on documents (AIM D-158 step 3): a local
issue fetches the region picture with its frame from the AIM host
(`/api/drawing/<id>/snapshot`) and gets a viewpoint carrying it (camera copied from the
topic's 3D viewpoint, BCF 3.0 requires one), and host topics are pulled with snapshots
(`includeSnapshots`). The tests import the new `docSnapshotUrl` / `docSnapshotViewpoint`, so
reverting `docIssueModel.ts` to the base makes the test fail to load and the CI revert oracle
reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED`
(exit 0) with restoration verified, against the base of this branch (`3510a1db`, the step 2
commit; the shallow clone had no `origin/main`). Full records in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `snapshot-needs-camera.patch` | `docIssueModel.ts` | a snapshot viewpoint is made for a topic without a camera, so a BCF 3.0 export of the whole archive would fail | `docIssueModel.test.ts` |
| `snapshot-url-region.patch` | `docIssueModel.ts` | the snapshot address drops the region, so the host renders the whole page | `docIssueModel.test.ts` |
| `host-snapshots.patch` | `aimBcf.ts` | host topics are pulled without snapshots | `bcf-protocol.test.ts` |

`docIssues.ts` (fetch, data URL, `addViewpoint`) is store glue without a unit test; it lives in
the lazy document-tab chunk like the rest of the step 2 glue.

## Replay

Clean checkout of the branch with dependencies installed; copy the patches outside the tree
(the oracle refuses a dirty tree), then for example:

```bash
node scripts/check-test-revert-oracle.mjs --base 3510a1db \
  --only apps/viewer/src/aim/docIssueModel.ts \
  --test apps/viewer/src/aim/docIssueModel.test.ts \
  --mutation /tmp/snapshot-needs-camera.patch --ci --json
```
