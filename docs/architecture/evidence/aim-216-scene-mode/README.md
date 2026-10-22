# AIM #216: zalozka 3D ostava perspektivna a volna

Modul `apps/viewer/src/aim/sceneMode.ts`, test `sceneMode.test.ts`. Mutacne patche (mutant -> opravene,
`git diff -R` mutovaneho suboru) su v `mutations/`; kazdy po aplikovani na opraveny kod necha test cerveny.

| Patch | Rozhodnutie | Ocakavane |
|---|---|---|
| `01-scenemode-3d-prijme-2d.patch` | zalozka 3D neberie zvysny 2D zamok ako svoj rezim | test "zalozka 3D nikdy nie je 2D" padne |
| `02-settle3d-nechava-zamok.patch` | `mode=3d` zrusi zamok kamery | test `settle3d` padne |
| `03-settle3d-nechava-ortho.patch` | `mode=3d` vrati perspektivnu kameru | test `settle3d` padne |

Zmutovane testy boli spustene lokalne (`tsx --test`, 1 fail z 4 pri kazdom mutante, 4 pass bez mutacie).
Oracle `check-test-revert-oracle.mjs` sa v cloud session nespustil (bez node_modules, `pnpm install` padol na 403 pri design-kit).
