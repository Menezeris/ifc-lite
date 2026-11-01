# Mutácie: zoznam priradených entít v karte pripomienky (AIM #199 bod 2)

Test `apps/viewer/src/aim/docEntities.test.ts` importuje nové exporty (`addPicked`, `removePicked`, `isSpatialRoot`),
ktoré na `main` neexistujú, takže revert oracle by bol INCONCLUSIVE. Päť chirurgických mutácií (patch = mutant -> opravené).
Každá mutácia pustená proti testu končí chybou (`# fail 1`), súbor sa po každej vrátil (`git checkout`).

Oracle skript pustí testy cez `vite-module-hooks.mjs`, ktorý potrebuje zbuildované WASM (v cloud session bez Rustu nejde,
`BASELINE-BROKEN: ERR_MODULE_NOT_FOUND`). Mutácie sú preto overené priamo: `git apply -R <patch>` a
`npx tsx --test src/aim/docEntities.test.ts`.

| Patch | Rozhodnutie |
|---|---|
| picked-no-dedupe | rovnaký GlobalId sa v zozname neopakuje |
| picked-no-cap | zoznam má strop (`MAX_TOPIC_COMPONENTS`) |
| picked-keep-last | pri duplicite vyhráva prvá položka (jej názov a druh) |
| remove-noop | odstránenie položky ju naozaj vyradí |
| spatial-with-space | priestor nie je priestorový koreň (vyberá sa v 3D normálne) |
