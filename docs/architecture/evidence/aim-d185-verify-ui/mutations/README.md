<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-185 UI (overenie výmer v paneli): chirurgické mutácie

Zmena pridáva do `apps/viewer/src/aim/` nové moduly: správy `VERIFY_REQUEST` / `VERIFY_RESULT` a overenie tvaru
dát od hosta (`verify-protocol.ts`), čistú logiku riadku, čísel a kót (`aimVerifyPlan.ts`) a žiadosti na hosta
(`aimVerify.ts`). Testy (`aimVerifyPlan.test.ts`, `aimVerify.test.ts`) ich importujú, takže revert produkcie na
`main` (zmazanie modulov) by test nenačítal a revert oracle by hlásil INCONCLUSIVE. Každé hlavné rozhodnutie
testovaných modulov sa preto overilo chirurgickou mutáciou.

Patche sú zapísané mutant -> oprava (smer `git diff base...head`), oracle ich aplikuje opačne. Každý beh skončil
`OBSERVED` (exit 0) s overeným obnovením stromu, voči `origin/main`. Záznamy sú v `summary.json`.

| Patch | Modul | Mutácia | Test, ktorý zčervenal |
|---|---|---|---|
| `href-protocol-relative.patch` | `verify-protocol.ts` | odkaz od hosta `//iny.web/...` prejde ako cesta hosta | `aimVerifyPlan.test.ts` |
| `unit-unchecked.patch` | `verify-protocol.ts` | cieľ s neznámou jednotkou (`ft`) sa nezahodí | `aimVerifyPlan.test.ts` |
| `result-ok-not-boolean.patch` | `verify-protocol.ts` | odpoveď s `ok` iným ako boolean prejde | `aimVerifyPlan.test.ts` |
| `segments-host-ignored.patch` | `aimVerifyPlan.ts` | úseky kót od hosta sa ignorujú, kótuje sa vždy z kotiev | `aimVerifyPlan.test.ts` |
| `stale-not-rerun.patch` | `aimVerifyPlan.ts` | zastaraný beh (stará revízia) sa použije bez overenia znova | `aimVerifyPlan.test.ts` |
| `length-diff-in-metres.patch` | `aimVerifyPlan.ts` | rozdiel dĺžky sa neprevedie na mm | `aimVerifyPlan.test.ts` |
| `other-element-accepted.patch` | `aimVerify.ts` | výsledok pre iný prvok, než bol vyžiadaný, sa zobrazí | `aimVerify.test.ts` |
| `run-all-no-reload.patch` | `aimVerify.ts` | po behu celého modelu sa výsledok vybraného prvku znova nenačíta | `aimVerify.test.ts` |

`AimQtoVerify*.tsx`, `AimVerifyBar*.tsx`, `AimVerifyDetail.tsx`, `AimVerifyRibbonGroup.tsx`, `aimVerifyStore.ts`
a napojenie v `AimBridge.tsx`, `QuantitySetCard.tsx` a `PropertiesPanel.tsx` sú UI a lepidlo bez unit testu;
overené živo (viewer vložený do hostovej stránky, Playwright), viď PR.

## Pripomienky Samuela 3. 11. 2026 (druhá sada)

Nový modul `aimVerifyView.ts` (orez a kamera podľa druhu veličiny) a nové funkcie v `aimVerifyPlan.ts` (odkazy na
prvky, vstupné prvky, kóty viacerých veličín) a `verify-protocol.ts` (odvodená bunka). Testy `aimVerifyView.test.ts`
a `aimVerifyRefs.test.ts` ich importujú, preto znova chirurgické mutácie; všetky `OBSERVED` s overeným obnovením
voči `origin/main` (záznamy v `summary.json`).

| Patch | Modul | Mutácia | Test, ktorý zčervenal |
|---|---|---|---|
| `view-height-ortho.patch` | `aimVerifyView.ts` | výška v ortografii namiesto perspektívy | `aimVerifyView.test.ts` |
| `view-slab-widens-box.patch` | `aimVerifyView.ts` | doska cez celé podlažie rozšíri box aj vodorovne | `aimVerifyView.test.ts` |
| `view-no-plan-cut.patch` | `aimVerifyView.ts` | plocha bez pôdorysného rezu 1,2 m | `aimVerifyView.test.ts` |
| `view-no-face-clearance.patch` | `aimVerifyView.ts` | box presne na lícach (renderer kreslí vnútro prvkov farbou rezu) | `aimVerifyView.test.ts` |
| `view-volume-slab-above.patch` | `aimVerifyView.ts` | pri objeme doska nad miestnosťou zakryje pohľad dnu | `aimVerifyView.test.ts` |
| `view-cut-on-long-axis.patch` | `aimVerifyView.ts` | rez kolmo na dlhšiu stranu (kamera vidí len kratšiu) | `aimVerifyView.test.ts` |
| `link-inside-longer-code.patch` | `aimVerifyPlan.ts` | kód PD02.10.03 sa chytí aj v PD02.10.031 | `aimVerifyRefs.test.ts` |
| `room-number-linked.patch` | `aimVerifyPlan.ts` | číslo miestnosti (2.01) sa v texte vzorca stane odkazom | `aimVerifyRefs.test.ts` |
| `ifc-name-overrides-host.patch` | `aimVerifyPlan.ts` | meno z IFC prepíše kód od hosta | `aimVerifyRefs.test.ts` |
| `input-rows-duplicate.patch` | `aimVerifyPlan.ts` | ten istý prvok vo vstupných prvkoch dvakrát | `aimVerifyRefs.test.ts` |
| `marks-overlap.patch` | `aimVerifyPlan.ts` | kóty viacerých veličín v jednej čiare cez seba | `aimVerifyRefs.test.ts` |
| `derived-without-set.patch` | `verify-protocol.ts` | odvodená bunka bez mena sady prejde | `aimVerifyRefs.test.ts` |

`aimVerifyScene.ts` (zápis boxu, kamera, skrytie miestností, pripnutie panela), `AimVerifyDetail.tsx`,
`AimQtoVerifyBody.tsx` (očko) a riadok AIM-FORK v `PropertiesPanel.tsx` sú lepidlo a UI bez unit testu, overené
živo (`../samuel-3-11/README.md`).

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimVerifyPlan.ts \
  --test apps/viewer/src/aim/aimVerifyPlan.test.ts \
  --mutation /tmp/d185-mut/stale-not-rerun.patch --ci --json
```

Patche `verify-protocol.ts` s `--only apps/viewer/src/aim/verify-protocol.ts` a testom `aimVerifyPlan.test.ts`,
patche `aimVerify.ts` s `--only apps/viewer/src/aim/aimVerify.ts --test apps/viewer/src/aim/aimVerify.test.ts`.
Patche `view-*` s `--only apps/viewer/src/aim/aimVerifyView.ts --test apps/viewer/src/aim/aimVerifyView.test.ts`, ďalšie
nové s `--only apps/viewer/src/aim/aimVerifyPlan.ts` (alebo `verify-protocol.ts`) a `--test apps/viewer/src/aim/aimVerifyRefs.test.ts`.
Patche skopíruj mimo stromu, oracle odmietne nečistý strom.

## Živá skúška (2. 11. 2026)

Lokálny viewer (`vite --port 3000`) vložený do hostovej stránky, model `AC20-FZK-Haus.ifc`, Playwright. Host na
`VERIFY_REQUEST` odpovedal testovacími dátami (`latest` = zastaraný beh, `run` = aktuálny). Výsledok:

- výber miestnosti `347jFE2yX7IhCEIALmupEH` cez `SELECT`: viewer poslal `latest`, potom `run`; fajočky pri
  `BaseQuantities.Height` (sedí), `FinishCeilingHeight` (nedá sa overiť), `FinishFloorHeight` (upozornenie);
  veličina, ktorú súbor nemá, sa nezobrazila;
- klik na fajočku: detail s vysvetlením, bunkami A, B, výsledkom, definíciou s odkazom a kontrolným výpočtom,
  vo vieweri kóta 2,500 m (`1 measured`), viď `../live-panel.png` a `../live-kota-help.png`;
- "Ako to funguje?" a odkaz na D-185: host dostal `AIM_NAVIGATE` s `help_href`;
- ribbon AIM, Overovanie > Výmery miestností (IfcSpace): `run_all`, toast so súhrnom, potom znova `latest` + `run`
  pre vybraný prvok (`../live-ribbon.png`);
- výber steny (má tiež `BaseQuantities.Height`): žiadna žiadosť, žiadna fajočka.
