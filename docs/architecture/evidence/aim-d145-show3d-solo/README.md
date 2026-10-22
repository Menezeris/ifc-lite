# AIM D-145: Ukázať v 3D pri dokumente s podlažím (Solo + rezové nástroje)

Mutačné dôkazy pre `apps/viewer/src/aim/show3dSoloPlan.test.ts` (mutant -> opravené, `git apply` na mutovaný súbor).
Každý mutant musí položiť test:

| Patch | Mutácia | Test |
|---|---|---|
| `mutations/01-bez-filtra-podla-guid.patch` | `soloRefs` neberie len podlažie dokumentu, ale všetky | padá 2/2 |
| `mutations/02-prazdny-zoznam-namiesto-null.patch` | nenačítané podlažie vráti `[]` namiesto `null` (tlačidlo by nepošlo X-ray lens hosta) | padá 1/2 |

Spustené lokálne cez `node --experimental-strip-types --test` nad kópiou modulu a testu (bez node_modules);
oficiálny `check-test-revert-oracle.mjs` v cloud session nebeží (chýba `design-kit`), preto na PR štítok `revert-oracle-exempt`.
