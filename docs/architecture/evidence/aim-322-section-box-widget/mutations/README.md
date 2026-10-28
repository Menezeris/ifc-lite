# AIMviewer#322: mutačné dôkazy (revert oracle)

Test `apps/viewer/src/aim/sectionBoxWidget.test.tsx` importuje `applyGizmo`, ktorý na `main` neexistuje,
preto by revert celej produkcie skončil `INCONCLUSIVE` (test sa nenačíta). Každé rozhodnutie opravy je
preto overené vlastným chirurgickým patchom (mutant -> opravené), spusteným cez
`node scripts/check-test-revert-oracle.mjs --base origin/main --only <súbor> --test <test> --mutation <patch> --ci --json`.

| Patch | Čo pokazí | Výsledok |
| --- | --- | --- |
| `box-ignores-host-widget-choice.patch` | `SET_SECTION_BOX` po úspechu nepoužije poslednú voľbu widgetu od hosta | OBSERVED |
| `box-gizmo-ignores-show-flag.patch` | `SectionBoxVisualization` ignoruje `showGizmo` (steny a rukoväte boxu ostanú) | OBSERVED |

Obe: obnova stromu overená (`restoration: verified`).
