<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-101 command acknowledgement: surgical mutation evidence

The change gives the AIM bridge in `apps/viewer/src/aim/` an acknowledgement for host commands and a gate for commands that arrive before the models are loaded. The host sends `ACK_REQUEST {cmdId}` after the commands of one call; the bridge handles it in order behind them, waits for their asynchronous steps (cut through an element, camera, chat lens) and answers `APPLIED {cmdId, ok, issues, state}` with the view state after the commands. Commands sent before `MODELS_LOADED` and before the geometry finished streaming are queued and replayed in order (they used to be dropped). `ISOLATE` now sets the isolation instead of toggling it, `ISOLATE_ADD` / `ISOLATE_REMOVE` change it, chat lens isolation with `mode: add` extends it, `CLEAR_FOCUS` removes the orange `FOCUS` highlight, and a hidden section widget stays hidden for the next cut (hint and drag handle included, two AIM-FORK lines). The pure logic lives in the new `command-gate.ts` (queue, tracked steps, issues) and `command-protocol.ts` (message checks, next isolation set). The test (`command-gate.test.ts`) imports both, so reverting them to the base (deleting the files) makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main behavioural decision of the two tested modules was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `gate-skips-queue.patch` | `command-gate.ts` | a command arriving when the gate is ready runs before the queued ones | `command-gate.test.ts` |
| `gate-flush-unready.patch` | `command-gate.ts` | `flush` runs queued commands before the models are ready | `command-gate.test.ts` |
| `settled-single-wait.patch` | `command-gate.ts` | `settled` waits once and misses a step added while it waited (the cut that starts the camera) | `command-gate.test.ts` |
| `track-swallows-error.patch` | `command-gate.ts` | a failed step is not reported as an issue, so `APPLIED` would say ok | `command-gate.test.ts` |
| `cmd-id-unbounded.patch` | `command-protocol.ts` | the `cmdId` is not bounded in length | `command-gate.test.ts` |
| `isolate-target-optional.patch` | `command-protocol.ts` | `ISOLATE_ADD` / `ISOLATE_REMOVE` without a target pass the check | `command-gate.test.ts` |
| `isolate-add-replaces.patch` | `command-protocol.ts` | adding to the isolation replaces it (the bug from AIMviewer #95) | `command-gate.test.ts` |
| `isolate-remove-noop.patch` | `command-protocol.ts` | removing from the isolation keeps everything | `command-gate.test.ts` |

`AimBridge.tsx`, `visibility-commands.ts`, `useAimViewCommands.ts`, `viewCamera.ts`, `viewQueries.ts`, `aimLens.ts` and the two section components are store and renderer glue with no unit test. `visibility-commands.ts` loads lazily right after the bridge mounts and gets the helpers of entry modules from `AimBridge` (`viewer-entry-js-bytes`: +1,429 bytes over main instead of +3,387). They were verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting the bridge messages. A `SET_SECTION` and `ACK_REQUEST` posted right after `READY` were applied after `MODELS_LOADED` and acknowledged with the cut at 30 %. `ISOLATE` of the walls gave 13 isolated, the same `ISOLATE` again still 13 (no toggle), `ISOLATE_ADD` of the stairs 14, `ISOLATE_REMOVE` 13. `FOCUS` reported one focused GUID and `CLEAR_FOCUS` none. After `SET_SECTION gizmo false` a new cut reported `show_gizmo: false` and the page had no section hint. `FOCUS` of an unknown GUID answered `ok: false` with the issue. A chat lens isolation of the walls (13) followed by `mode: add` for the stairs gave 14, `mode: replace` 1. Acknowledgements came back in 20 to 700 ms.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/command-gate.ts \
  --test apps/viewer/src/aim/command-gate.test.ts \
  --mutation /tmp/d101-mut/gate-skips-queue.patch --ci --json
```

The `command-protocol.ts` patches use `--only apps/viewer/src/aim/command-protocol.ts`.
