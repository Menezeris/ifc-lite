<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #97 V1, view before FOCUS: surgical mutation evidence

The change (AIM issue #97, task V1 of the D-115 eval) makes the host's `FOCUS` a highlight only: it no longer calls `bim.viewer.select`, so focus and selection stay two host commands (`FOCUS` / `SELECT`). Before framing, a viewer in 2D or split mode moves the plan to the storey of the targets, or switches to 3D when the targets are on several storeys or have none. The decision is the pure `focusViewStep` in `viewCommands.ts`; the test (`focus-view.test.ts`) imports it, so reverting `viewCommands.ts` to the base makes the test file fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each decision of `focusViewStep` was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `focus-3d-not-kept.patch` | the 3D mode no longer keeps the view, so a FOCUS in 3D would move to a storey plan | `focus-view.test.ts` |
| `focus-active-storey-moved.patch` | a target on the active storey still asks for a storey change | `focus-view.test.ts` |
| `focus-many-storeys-first.patch` | targets on several storeys move the plan to the first storey instead of switching to 3D | `focus-view.test.ts` |
| `focus-unknown-storey-trusted.patch` | a storey the view switcher does not know is used as a plan target | `focus-view.test.ts` |

The store and renderer glue (`visibility-commands.ts` FOCUS, `useAimViewCommands.ts` `prepareFocusView`, the `AimBridge.tsx` wiring without the programmatic-selection guard) has no unit test; the AIM bridge tests (112) pass and the behaviour is to be verified live in an embedded viewer (`?viewer=pr-<number>`). Bundle: `viewer-entry-js-bytes` +653 bytes and `viewer-eager-js-bytes` +515 bytes over the ceiling, inside the tolerance, no raise.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/viewCommands.ts \
  --test apps/viewer/src/aim/focus-view.test.ts \
  --mutation /tmp/v1-mut/focus-3d-not-kept.patch --ci --json
```
