<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-096 Lens from chat: surgical mutation evidence

The change lets the AIM host drive the upstream Lens: `APPLY_LENS` puts an "AIM chat" lens (rules as `FilterGroup` from `@ifc-lite/rules`, a colour and an action per rule, optional auto-colour) into the ephemeral `auto-color-from-list` slot that upstream never persists or exports, newest rules first because Lens colours by first match. `isolate: true` does not go through the lens: the rules are evaluated with the same federated filter evaluator and their union is isolated through the viewer's isolation channel, so rules without a colour (`action: isolate`) keep the elements' own appearance. `LENS_QUERY` answers with the per-rule counts and the isolation once that exact version has been evaluated. The pure logic lives in the new `aimLensPlan.ts` and the envelope check in the new `lens-protocol.ts`. The test (`aimLensPlan.test.ts`) imports both, so reverting them to the base (deleting the files) makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision of the two tested modules was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `newest-rule-last.patch` | `aimLensPlan.ts` | rules from a later call go behind the earlier ones, so a new colour on the same elements never wins | `aimLensPlan.test.ts` |
| `add-drops-previous.patch` | `aimLensPlan.ts` | `mode: add` drops the rules from earlier calls | `aimLensPlan.test.ts` |
| `same-rev-duplicates.patch` | `aimLensPlan.ts` | the same version applied again (host re-applies ops after a page refresh) duplicates its rules | `aimLensPlan.test.ts` |
| `isolate-rule-colored.patch` | `aimLensPlan.ts` | an isolate-only rule (no colour) is added to the lens and recolours the elements | `aimLensPlan.test.ts` |
| `isolation-without-flag.patch` | `aimLensPlan.ts` | rules are isolated although the message does not ask for isolation | `aimLensPlan.test.ts` |
| `isolate-needs-color.patch` | `aimLensPlan.ts` | an isolate-only rule without a colour is rejected | `aimLensPlan.test.ts` |
| `unknown-model-matches-all.patch` | `aimLensPlan.ts` | a model name with no loaded model leaves the `model` rule empty instead of matching nothing | `aimLensPlan.test.ts` |
| `globalid-cap-unchecked.patch` | `aimLensPlan.ts` | the total GlobalId cap per message is not enforced | `aimLensPlan.test.ts` |
| `foreign-lens-adopted.patch` | `aimLensPlan.ts` | a "Color by" lens from the list column in the shared slot is treated as the chat lens | `aimLensPlan.test.ts` |
| `evaluated-any-rule.patch` | `aimLensPlan.ts` | counts are reported as soon as any rule (an older one) has a count, before the new version was evaluated | `aimLensPlan.test.ts` |
| `envelope-any-type.patch` | `lens-protocol.ts` | the envelope accepts any bridge message type, so other messages would load the Lens module | `aimLensPlan.test.ts` |

`aimLens.ts` (store glue) and the `AimBridge.tsx` wiring have no unit test. `aimLens.ts` and `aimLensPlan.ts` load on first use (dynamic import from `AimBridge.tsx`); the entry imports only the import-free envelope check (`viewer-entry-js-bytes` +448 bytes, `viewer-eager-js-bytes` +1,627 bytes over main, inside the tolerance, no ceiling raise). They were verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting the bridge messages. `APPLY_LENS replace` with walls red and ground-floor windows blue (`ifcType` AND `storey`) showed the "AIM chat" lens in the Lens panel with 13 and 9; `LENS_QUERY` with the same `rev` returned those counts; `isolate` with an isolate-only rule (ground-floor windows, no colour) left the lens inactive and isolated 9 elements; `add` walls red, then `isolate` with walls green and the windows isolated 22 elements and reported walls 13 under the new green rule (the older red one 0); `unisolate` released the isolation and kept the lens; `autoColor` by IFC class returned the legend; `clear` deactivated the lens and the query answered `active: false`.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimLensPlan.ts \
  --test apps/viewer/src/aim/aimLensPlan.test.ts \
  --mutation /tmp/d096-mut/rest-rule-first.patch --ci --json
```

`envelope-any-type.patch` uses `--only apps/viewer/src/aim/lens-protocol.ts`, the others `--only apps/viewer/src/aim/aimLensPlan.ts`.
