<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-099 BCF load: surgical mutation evidence

The change adds `AIM_BCF_LOAD` to the AIM bridge in `apps/viewer/src/aim/`: the AIM host points the viewer at its BCF API 2.1 (`<host>/api/bcf`, on the parent's own origin) and project, and the viewer pulls the topics with the upstream client (`@ifc-lite/bcf-api` `fetchProjectAsBCF`) without a token into the BCF panel's store. The message check lives in the new `bcf-protocol.ts`, the pull in the new lazy `aimBcf.ts`. The test (`bcf-protocol.test.ts`) imports both, so reverting them to the base makes the test file fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision of the two tested modules was instead checked with a surgical mutation.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `origin-not-checked.patch` | `bcf-protocol.ts` | the API URL is accepted on any origin, so a host message could point the viewer's fetches at a third-party server | `bcf-protocol.test.ts` |
| `plain-http-allowed.patch` | `bcf-protocol.ts` | plain `http:` is accepted for any host, not only localhost | `bcf-protocol.test.ts` |
| `replace-always.patch` | `aimBcf.ts` | the host's topics replace the BCF project the user opened from a file or a server | `bcf-protocol.test.ts` |
| `stale-not-dropped.patch` | `aimBcf.ts` | a pull overtaken by a newer one still overwrites the store with older topics | `bcf-protocol.test.ts` |
| `snapshots-fetched.patch` | `aimBcf.ts` | the pull probes a snapshot for every viewpoint the host does not serve | `bcf-protocol.test.ts` |

`aimBcf.ts` loads on first use (dynamic import from `AimBridge.tsx`) and imports nothing the entry chunk imports at runtime (store access is passed in), so `viewer-entry-js-bytes` grows by 875 bytes over main, inside the ratchet tolerance. The bridge wiring was verified live: the local fork viewer embedded in a host page on another origin that serves a BCF API 2.1 mock under `/api/bcf` and posts `AIM_BCF_LOAD` on `READY`; Playwright saw the client request the project, extensions, topics (`$top=100&$skip=0`), comments and viewpoints with no `Authorization` header, and the BCF panel listed both topics of project "AIM - modely federacie" with their comment and viewpoint counts. The dev viewer posts `READY` twice (React strict mode), and the second load replaced the first without duplicating topics.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimBcf.ts \
  --test apps/viewer/src/aim/bcf-protocol.test.ts \
  --mutation /tmp/d099-mut/replace-always.patch --ci --json
```

The `origin-not-checked` and `plain-http-allowed` patches use `--only apps/viewer/src/aim/bcf-protocol.ts`, the others `--only apps/viewer/src/aim/aimBcf.ts`.
