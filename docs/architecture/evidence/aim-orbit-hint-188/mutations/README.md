<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIMviewer#188 nápoveda k orbitu: surgical mutation evidence

Zmena pridáva `apps/viewer/src/aim/orbitHintPlan.ts` (čisté rozhodnutia) a jeho test `orbitHintPlan.test.ts`. Test importuje exporty, ktoré na `main` neexistujú, takže revert výroby test nenačíta a CI revert oracle (`Changed tests observe production`) hlási INCONCLUSIVE. Každé hlavné rozhodnutie modulu sa preto overilo chirurgickou mutáciou. Patche sú zapísané mutant -> opravené (orientácia `git diff -R`), oracle ich aplikuje spätne. Každý beh skončil `OBSERVED` s overenou obnovou, voči základu `origin/main` (záznamy v `summary.json`).

| Patch | Mutácia | Test, ktorý zčervenal |
|---|---|---|
| `orbit-blocked-without-calibration.patch` | zámok blokuje orbit aj bez bežiacej kalibrácie (stály zámok by ukazoval nápovedu a Enter by robil zmenu) | `orbitHintPlan.test.ts` |
| `hint-on-click.patch` | nápoveda aj pri kliknutí a chvení bez ťahania | `orbitHintPlan.test.ts` |
| `hint-without-cooldown.patch` | nápoveda pri každom ťahaní, bez pauzy | `orbitHintPlan.test.ts` |
| `key-in-inputs.patch` | Enter a medzerník prepínajú aj počas písania vo vstupoch a na tlačidlách | `orbitHintPlan.test.ts` |
| `key-with-modifiers.patch` | Ctrl, Cmd, Alt, Shift + Enter tiež prepne | `orbitHintPlan.test.ts` |
| `key-outside-lock.patch` | Enter prepína do 3D aj keď orbit nie je zablokovaný | `orbitHintPlan.test.ts` |

Oprava podkladov pri prepise pohľadu (`viewsBridge.ts`, #170) tieto patche nepotrebuje: jej test je v `aim/integration/viewsBridge.test.ts` a importuje len exporty, ktoré existujú aj na `main`, takže oracle vráti výrobu bežným spôsobom (po vrátení opravy test padá).

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/orbitHintPlan.ts \
  --test apps/viewer/src/aim/orbitHintPlan.test.ts \
  --mutation /tmp/orbit-mut/hint-on-click.patch --ci --json
```
