<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-130 popisky na výkrese ako odkazy: chirurgické mutácie

Zmena pridáva `apps/viewer/src/aim/docLinks.ts`: správu `DOCUMENT_LINKS` od hosta (popisky výkresu spárované s prvkami, AIM vrstva), jej overenie, store a vrstvu klikateľných oblastí nad stranou PDF karty. Klik vyberie prvok ako klik do modelu (`selectPickedGlobalId`, AIM D-082) a otvorí panel vlastností; pri viacerých kandidátoch ukáže výber s odznakom AIM. Správu prijíma vlastný poslucháč v `docLinks.ts` (`listenDocLinks`, rovnaká kontrola rodiča a originu ako most, `acceptsDocLinksEvent`), zapína ho `wireDocumentEvents` v `docBridge.ts`; `AimBridge.tsx` ani `bridge-protocol.ts` sa nemenia. `docRegion.ts` vrstvu pripojí ku karte (jeden riadok v `useAimDocRegion`). Test `docLinks.test.ts` importuje nový modul, takže revert produkcie na base (zmazanie `docLinks.ts`) test nenačíta a revert oracle hlási INCONCLUSIVE. Každé hlavné rozhodnutie modulu je preto overené chirurgickou mutáciou.

Každý patch je zapísaný mutant -> oprava (smer `git diff base...head`); oracle ho aplikuje spätne. Každý beh skončil `OBSERVED` (exit 0) s overeným obnovením, base = hlava #97 `67d78612a` (`claude/aim-d127-panely`), na ktorej patch stojí. Záznamy sú v `summary.json`.

| Patch | Mutácia | Test, ktorý sčervenal |
|---|---|---|
| `source-unchecked.patch` | správa sa prijme bez `source: 'aim-bridge'` | `docLinks.test.ts` |
| `handler-claims-all.patch` | obsluha "vybaví" aj inú správu | `docLinks.test.ts` |
| `frame-unchecked.patch` | poslucháč prijme správu z iného okna než rodič | `docLinks.test.ts` |
| `origin-unchecked.patch` | poslucháč prijme správu z iného originu než hostiteľ z referrera | `docLinks.test.ts` |
| `empty-targets-kept.patch` | oblasť bez platného cieľa (GUID + kód) sa nakreslí | `docLinks.test.ts` |
| `page-not-integer.patch` | strana 1,5 sa prijme | `docLinks.test.ts` |
| `unclipped.patch` | oblasť mimo strany sa neoreže | `docLinks.test.ts` |
| `status-from-wire.patch` | stav berie z drôtu, nie z počtu platných cieľov (jeden cieľ by otvoril výber) | `docLinks.test.ts` |
| `targets-uncapped.patch` | počet kandidátov nemá strop | `docLinks.test.ts` |
| `title-without-aim.patch` | popis oblasti nehovorí, že ide o odvodenie AIM (D-129) | `docLinks.test.ts` |
| `store-merges.patch` | nová správa strany pridá k starým namiesto náhrady | `docLinks.test.ts` |

Kreslenie vrstvy a výber prvku sú DOM a store glue bez unit testu; overené naživo: lokálny viewer v iframe hostiteľskej stránky, model `ASR.ifc` z produkcie AIM a pôdorys `D.1.1.01 Pôdorys 1NP` (PDF z produkcie), `DOCUMENT_LINKS` vygenerovaný funkciami hosta (`lib/data/drawing-labels.ts` v AIMvieweri) nad skutočnými riadkami strany. Na strane bolo 97 oblastí; klik na bublinu `DD01 08` poslal hostovi `ENTITY_SELECTED` s GUID `1_YiIDK5n2fvfP1VGIobML` (DD01.08.0001) a panel vlastností ukázal IfcDoor na 1NP; klik na `OV01 01` otvoril výber "AIM · OV01 01 · kandidáti na podlaží: 2" a voľba druhého kandidáta poslala `ENTITY_SELECTED` `3sAWwiVnb4mf5GPnoLjzDO` (OV01.01.234) a výber zavrela. Raster PDF sa v headless Chromiu (swiftshader, strata WebGPU zariadenia) nevykreslil; vrstva odkazov, kliky a výber áno.

Balík (`scripts/perf-ratchet`, vetva aj báza `67d78612a` postavené rovnako): `viewer-entry-js-bytes` 3 164 652 (báza 3 165 065), `viewer-eager-js-bytes` 19 361 936 (báza 19 356 020, +5 916); oboje v tolerancii stropu, strop sa nemení.

## Prehratie

Čistý checkout vetvy s nainštalovanými závislosťami. Patche skopíruj mimo strom (oracle odmietne špinavý strom), potom napríklad:

```bash
node scripts/check-test-revert-oracle.mjs --base 67d78612a \
  --only apps/viewer/src/aim/docLinks.ts \
  --test apps/viewer/src/aim/docLinks.test.ts \
  --mutation /tmp/d130-mut/unclipped.patch --ci --json
```
