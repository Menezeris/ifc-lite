<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-102 camera on rooms and clear selection: surgical mutation evidence

The change has three parts.
- **Camera on hidden classes.** `FOCUS` and `SELECT` from the AIM host now move the camera even when the target is a room (IfcSpace) or a zone, which the viewer hides by default; before, `flyTo` had nothing to frame and the camera stayed still. The new `frame-refs.ts` turns on the hidden class of the target (the same toggle the viewer's search and tree use), waits until the target has geometry in the scene, frames it and waits for the 300 ms animation, so `APPLIED` carries the final camera. A target with no geometry becomes an issue in `APPLIED` instead of a silent success.
- **`CLEAR_SELECTION`.** Clears the selection like a click into empty space.
- **Earlier view-state queries.** The view-state query module is fetched when the bridge mounts, so the first `APPLIED` no longer waits for it.

The pure part (which hidden classes to turn on) lives in `frame-gates.ts`, without the store, so its test runs without loading the viewer or the WASM package. The test (`frame-gates.test.ts`) imports this new module, so reverting it to the base (deleting the file) makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each decision of the tested function `gatesToReveal` was instead checked with a surgical mutation. The `CLEAR_SELECTION` message check is covered by the existing `command-gate.test.ts`, which imports `isCommandMessage` from the base module.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `reveal-ignores-gate.patch` | toggles a class that is already visible (and so hides it) | `frame-gates.test.ts` |
| `reveal-case-sensitive.patch` | misses `IfcSpace` written in the viewer's mixed case | `frame-gates.test.ts` |
| `reveal-no-zones.patch` | does not turn on zones (IfcSpatialZone) | `frame-gates.test.ts` |

`frameRefs`, `visibility-commands.ts` (FOCUS, SELECT, CLEAR_SELECTION) and `useAimViewCommands.ts` are store and renderer glue with no unit test. They were verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright posting the bridge messages.
- `SELECT` of a room moved the camera from (50, -100, 50) to (27.6, -17.6, 20.7), and `APPLIED` already carried the new position.
- `CLEAR_SELECTION` brought the selection count from 1 to 0.
- `FOCUS` of the room framed it with one focused GUID.
- `SELECT` of a wall and of a storey framed them as before.

Bundle against `main`: `viewer-entry-js-bytes` +19 bytes, `viewer-eager-js-bytes` +41 bytes.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/frame-gates.ts \
  --test apps/viewer/src/aim/frame-gates.test.ts \
  --mutation /tmp/d102-mut/reveal-ignores-gate.patch --ci --json
```
