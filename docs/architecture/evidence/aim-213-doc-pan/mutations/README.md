# Mutacne dokazy AIM #213 (posun PDF karty tahanim)

Modul `apps/viewer/src/aim/docPan.ts` je novy, takze revert oracle by bol INCONCLUSIVE; kazde rozhodnutie
ma chirurgicky patch (mutant -> opravene) overeny
`node scripts/check-test-revert-oracle.mjs --base origin/main --only apps/viewer/src/aim/docPan.ts --test apps/viewer/src/aim/docPan.test.ts --mutation <patch> --ci --json`.

| Patch | Rozhodnutie |
|---|---|
| left-button-only | tahanie len lavym tlacidlom |
| mouse-and-pen-only | dotyk sa nemeni (nativny scroll, pinch) |
| text-selection-kept | tahanie nezacina na texte pdf.js (vyber textu) |
| links-clickable | tahanie nezacina na odkazoch a tlacidlach (popisky D-130) |
| click-threshold | pod 4 px je to klik, nie tahanie |
| scroll-direction | smer posunu |

Vsetkych 6: OBSERVED, restoration verified (`summary.json`).
