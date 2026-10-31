# Mutácie: výber IFC prvkov pod oblasťou pripomienky (AIM #199 bod 2)

Test `apps/viewer/src/aim/docEntities.test.ts` testuje nový modul, ktorý na `main` neexistuje, takže revert
oracle by bol INCONCLUSIVE. Preto päť chirurgických mutácií hlavných rozhodnutí modulu (patch = mutant -> opravené).
Každá mutácia pustená proti testu končí chybou (`# fail 1`), pôvodný súbor sa vrátil bajt po bajte.

Pozor: oracle skript pustí testy cez `vite-module-hooks.mjs`, ktorý potrebuje zbuildované WASM (v cloud session
bez Rustu nejde). Mutácie sú preto overené priamo: `npx tsx --test src/aim/docEntities.test.ts`.

| Patch | Rozhodnutie |
|---|---|
| y-not-flipped | zlomok y strany ide zhora, bod PDF zdola |
| no-band-filter | pásmo výšok podlažia (doska pod a nad nepatrí) |
| aabb-only | presný test štvoruholníka (SAT), nie len obálka oblasti |
| spaces-kept | priestory, otvory a pod. nie sú prvky |
| section-allowed | zvislý rez návrh nedá |
