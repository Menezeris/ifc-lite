<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-106 derived relations as a tree: surgical mutation evidence

The AIM records group in Relationship records ("Odvodené záznamy") now shows one AIM badge on its heading and a tinted frame around the whole group, and its rows form a tree: relation + direction > IFC class / PredefinedType > instances, with counts (AIMviewer #93). The grouping is the pure function `groupDerivedRelations` in the new `derivationsTree.ts`; the wire gained an optional `other.predefinedType` that `derivedRelationsOf` validates. The test (`derivationsTree.test.ts`) imports the new module, so reverting production to the base (deleting the file) makes the test fail to load and the CI revert oracle (`Changed tests observe production`) reports `REVERT-BROKE-BUILD`. Each behavioural decision was instead checked with a surgical mutation.

Each patch is written mutant→fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `direction-merged.patch` | `derivationsTree.ts` | outgoing and incoming rows of the same relation fall into one group | `derivationsTree.test.ts` |
| `predefined-type-ignored.patch` | `derivationsTree.ts` | the class level shows only the IFC class, so THERMAL and FIRESAFETY spatial zones merge | `derivationsTree.test.ts` |
| `rows-unsorted.patch` | `derivationsTree.ts` | instances keep the host's order instead of natural order (3.10 before 3.02) | `derivationsTree.test.ts` |
| `classes-unsorted.patch` | `derivationsTree.ts` | class groups keep first-appearance order | `derivationsTree.test.ts` |
| `rules-duplicated.patch` | `derivationsTree.ts` | the group tooltip repeats a rule name per row | `derivationsTree.test.ts` |
| `predefined-type-unchecked.patch` | `derivations-protocol.ts` | a malformed `other.predefinedType` is accepted instead of dropping the row | `derivationsTree.test.ts` |

`AimDerivedRelationsBody.tsx` (the tree markup) has no unit test. It loads lazily and imports `derivationsTree.ts` only from there, so the entry chunk does not grow. It was verified live: local fork viewer embedded in a host page, `AC20-FZK-Haus.ifc`, Playwright selecting a wall through the bridge and answering `ENTITY_SELECTED` with `AIM_PANEL_DATA` that carries seven derived relations. The IFC tab showed one AIM badge, the tinted group, `→ IfcRelReferencedInSpatialStructure 4` > `IfcSpace / SPACE 2` (3.02 Kancelária inside, 3.03 partial), `IfcSpatialZone / FIRESAFETY 1`, `IfcSpatialZone / THERMAL 1`, and `→ IfcZone cez priestor 3` > `IfcZone 3` with "cez 3.02" on each row.

## Replay

Use a clean checkout of the branch with dependencies installed. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/derivationsTree.ts \
  --test apps/viewer/src/aim/derivationsTree.test.ts \
  --mutation /tmp/d106-mut/direction-merged.patch --ci --json
```

`predefined-type-unchecked.patch` uses `--only apps/viewer/src/aim/derivations-protocol.ts`, the others `--only apps/viewer/src/aim/derivationsTree.ts`.
