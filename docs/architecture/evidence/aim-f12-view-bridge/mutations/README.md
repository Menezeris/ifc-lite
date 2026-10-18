<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM F12 view bridge: surgical mutation evidence

The view bridge (AIM D-083: `SET_SECTION`, `SET_CAMERA`, `SET_VIEW_MODE`) adds new fork modules under `apps/viewer/src/aim/`. The CI revert oracle (`Changed tests observe production`) reverts them by deleting the files, so `view-protocol.test.ts` cannot load and the verdict is `REVERT-BROKE-BUILD` / INCONCLUSIVE. Each main behavioural decision of the two tested modules was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `storey-section-any-axis.patch` | `view-protocol.ts` | a section above a storey accepts any axis, not only the horizontal one | `view-protocol.test.ts` |
| `storey-offset-unbounded.patch` | `view-protocol.ts` | the height above the storey is not bounded to the host's range | `view-protocol.test.ts` |
| `camera-any-preset.patch` | `view-protocol.ts` | `SET_CAMERA` accepts any string as a preset | `view-protocol.test.ts` |
| `unknown-storey-falls-back.patch` | `viewCommands.ts` | an unknown storey GUID falls back to the viewer's choice instead of skipping the message | `view-protocol.test.ts` |
| `cut-frame-offset-sign.patch` | `viewCommands.ts` | the storey cut adds the renderer frame offset instead of subtracting it | `view-protocol.test.ts` |

`unknown-storey-falls-back` first came back `UNOBSERVED`: the test compared with `assert.equal`, and `undefined == null`. The test now uses `assert.strictEqual` for both cases.

`useAimViewCommands.ts` and the `AimBridge.tsx` wiring are React glue with no unit test; they were verified live (fork viewer + AIM host + Playwright: section, camera, 2D/Split), see AIMviewer ROADMAP 2026-10-17.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/viewCommands.ts \
  --test apps/viewer/src/aim/view-protocol.test.ts \
  --mutation /tmp/f12-mut/unknown-storey-falls-back.patch --ci --json
```

The `view-protocol.ts` patches use `--only apps/viewer/src/aim/view-protocol.ts`.
