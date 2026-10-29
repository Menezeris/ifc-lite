# AIM #273: viacnásobný SELECT a APPLIED v rozpočte času, dôkaz revert oracle

Nové moduly (`aimMultiSelect.ts`, `ackBudget.ts`) a ich testy neexistujú na `main`, preto samotný revert
produkcie by test nenačítal (INCONCLUSIVE). Každé hlavné rozhodnutie má povrchovú mutáciu
(`mutations/*.patch`, smer mutant -> opravené), overenú
`node scripts/check-test-revert-oracle.mjs --base origin/main --only <súbor> --test <test> --mutation <patch> --ci --json`.
Všetky štyri skončili `OBSERVED` a stav stromu sa obnovil (`restoration: verified`), viď `summary.json`.

| Mutácia | Čo pokazí | Test, ktorý ju chytí |
|---|---|---|
| `m1-select-loop` | SELECT pridáva prvky po jednom (N zápisov do store) | `visibility-select.test.ts` |
| `m2-no-seed` | dávka zabudne na primárny prvok z prvého výberu | `aimMultiSelect.test.ts` |
| `m3-no-timeout` | `withinBudget` nikdy nevyprší | `ackBudget.test.ts` |
| `m4-no-reserve` | čakania na kroky môžu minúť aj rezervu na stav | `ackBudget.test.ts` |

Nepokryté testom: samotné zapojenie rozpočtu do `answerAck` v `AimBridge.tsx` (komponent, overené len čítaním a typecheckom).
