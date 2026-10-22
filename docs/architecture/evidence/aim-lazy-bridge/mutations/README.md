<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM lazy bridge: surgical mutation evidence

The change loads the AIM bridge (`AimBridge.tsx` and everything only it imports) lazily, from the new
`AimBridgeMount.tsx`, and only when the viewer is embedded. The entry part keeps the embed flag, the
autoload veil and a latch for the end of the `?models=` autoload (`autoloadLatch.ts`), so a bridge that
attaches after the autoload has finished still announces `MODELS_LOADED`. The test
(`autoloadLatch.test.ts`) imports the new module, so reverting it to the base makes the test file fail to
load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each decision of
the latch was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies
it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base
`release/aim-2026-10-22-6` (`9711d534`). The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `late-subscriber-waits.patch` | a bridge that subscribes after the autoload ended waits forever (no immediate call) | `autoloadLatch.test.ts` |
| `complete-repeats.patch` | a second end of the autoload calls the subscribers again | `autoloadLatch.test.ts` |
| `unsubscribe-noop.patch` | unsubscribing (bridge unmounted) does not remove the callback | `autoloadLatch.test.ts` |

`AimBridgeMount.tsx`, the `AimBridge.tsx` wiring, `bridge-core.ts` and the moved `resolveGuids` in
`AimDerivedRelations.tsx` are React and bundler glue with no unit test; they were verified live: the built
viewer before and after the change embedded in a host page with `AC20-FZK-Haus.ifc` autoloaded
(same origin), Playwright posting `QUERY bounds`, `SET_SECTION` 40 %, `FOCUS`, `SET_SECTION` 60 % and
`ACK_REQUEST` synchronously on `MODELS_LOADED`. Both builds answered the same: `READY`, `MODELS_LOADED`,
`QUERY_RESULT` ok, `APPLIED` ok with no issues, section at 60 % (3.391 m), focus 1; the veil showed from the
first frames. The standalone viewer (no parent frame) no longer fetches the bridge chunks
(`viewQueries`, `sectionBox`).

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base <base> \
  --only apps/viewer/src/aim/autoloadLatch.ts \
  --test apps/viewer/src/aim/autoloadLatch.test.ts \
  --mutation /tmp/lazy-bridge-mut/late-subscriber-waits.patch --ci --json
```
