<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-125 live viewer state: surgical mutation evidence

The change (AIM D-125, issues #182, #180, #178, #175) extends `apps/viewer/src/aim/`: a translucent variant of chat Lens colour rules for IfcSpace / IfcSpatialZone, rule and isolation status in the Lens summary (`inactive`, `active: false`, `stored_rules`), the `compact` legend, view changes outside host commands (new `viewDelta.ts`) and the room fill in a horizontal 3D cut seen from above (`aimRoomFill.ts`). The tests import exports that do not exist on `main` (`withVolumeVariants`, `VOLUME_SUFFIX`, `describeViewChanges`, `looksDown`, `cutsRoom`), so reverting production makes them fail to load and the CI revert oracle reports INCONCLUSIVE. Each main decision was checked with a surgical mutation instead.

Each patch is written mutant->fixed; the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. Full records in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `variant-missing.patch` | `aimLensPlan.ts` | colour rules get no room variant | `aimLensPlan.test.ts` |
| `variant-without-class.patch` | `aimLensPlan.ts` | the variant is not limited to IfcSpace / IfcSpatialZone | `aimLensPlan.test.ts` |
| `variant-opaque.patch` | `aimLensPlan.ts` | the variant stays opaque `colorize` | `aimLensPlan.test.ts` |
| `variant-count-lost.patch` | `aimLensPlan.ts` | the variant's count is not added to its rule | `aimLensPlan.test.ts` |
| `inactive-unmarked.patch` | `aimLensPlan.ts` | a rule with no match is not marked `inactive` | `aimLensPlan.test.ts` |
| `stored-rules-dropped.patch` | `aimLensPlan.ts` | a switched-off AIM chat lens reports no `stored_rules` | `aimLensPlan.test.ts` |
| `legend-compact-rejected.patch` | `aimLensPlan.ts` | `legend: compact` is rejected | `aimLensPlan.test.ts` |
| `isolation-off-silent.patch` | `viewDelta.ts` | isolation cleared by the user is not reported | `viewDelta.test.ts` |
| `section-change-ignored.patch` | `viewDelta.ts` | a section change outside commands is not reported | `viewDelta.test.ts` |
| `cut-ignores-top.patch` | `aimRoomFill.ts` | a cut above the room still counts as cutting it | `aimRoomFill.test.ts` |
| `looks-down-sign.patch` | `aimRoomFill.ts` | a camera looking up counts as a plan view | `aimRoomFill.test.ts` |

`aimLens.ts`, `aimLensScope.ts`, `AimBridge.tsx`, `AimRoomFillLayer.tsx`, `AimLensLegendCard.tsx`, `CapturePinLayer.tsx`, `useAimViewCommands.ts` and `viewQueries.ts` are store and renderer glue, verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc` (room Wohnen + 11 windows), Playwright posting bridge messages. Isolating the room with a colour no longer draws an opaque box over the windows; a rule shadowed by a newer one comes back `inactive`; after the user pressed A (show all) the next `APPLIED` carried `changed_outside_commands: ["izolácia zrušená (bolo 12 prvkov)"]` and the Lens summary `isolation.active: false`; with a cut at 1NP + 1.2 m and a top orthographic camera in 3D the room fill layer drew the coloured room (before: nothing); `legend: compact` showed the small card and closed the Lens panel. Bundle: `viewer-entry-js-bytes` +1,517 bytes and `viewer-eager-js-bytes` +2,198 bytes over `main`, inside the ratchet tolerance.

## Replay

Clean checkout of the branch with dependencies installed; copy the patches outside the tree (the oracle refuses a dirty tree), then for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimLensPlan.ts \
  --test apps/viewer/src/aim/aimLensPlan.test.ts \
  --mutation /tmp/d125-mut/variant-opaque.patch --ci --json
```

`viewDelta` patches use `--only apps/viewer/src/aim/viewDelta.ts --test apps/viewer/src/aim/viewDelta.test.ts`, `aimRoomFill` patches the same with `aimRoomFill`.
