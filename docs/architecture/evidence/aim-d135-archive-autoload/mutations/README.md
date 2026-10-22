<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-135 archive autoload: surgical mutation evidence

The AIM host now federates each model from its immutable revision archive
(`.../ifc/archive/<MODEL>/vNNN.ifc.gz`, gzip, `Cache-Control: max-age=31536000, immutable`)
to cut Supabase egress. The autoload (`hooks/useModelUrlAutoload.ts`, inside its existing
`AIM-FORK` block) passes the fetched bytes through the new `aim/modelFile.ts`, which unpacks
gzip and keeps the plain model name (`ASR.ifc`). The test (`aim/modelFile.test.ts`) imports
the new module, so reverting it to the base makes the test fail to load and the CI revert
oracle reports INCONCLUSIVE. Each decision of the module was instead checked with a surgical
mutation.

Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED`
(exit 0) with restoration verified, against base `origin/main`. Records: `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `archive-name-dropped.patch` | an archive keeps its file name (`v078.ifc`), so bridge and revisions lose the model | `modelFile.test.ts` |
| `gz-suffix-kept.patch` | a non-archive `.ifc.gz` keeps the `.gz` suffix | `modelFile.test.ts` |
| `gzip-magic-loose.patch` | gzip detection checks one byte only | `modelFile.test.ts` |
| `archive-not-unpacked.patch` | gzip bytes reach the parser packed | `modelFile.test.ts` |
| `plain-type-overridden.patch` | a plain IFC loses its served content type | `modelFile.test.ts` |

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/modelFile.ts \
  --test apps/viewer/src/aim/modelFile.test.ts \
  --mutation /tmp/d135-mut/archive-name-dropped.patch --ci --json
```
