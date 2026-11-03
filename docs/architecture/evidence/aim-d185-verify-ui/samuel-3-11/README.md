<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# D-185 UI: pripomienky Samuela z 3. 11. 2026

Pripomienky k miestnosti na ASR 1NP (GUID `11POIrTfjBlRLHYd2fiz8_`) a k 2.01. Viewer: vetva
`claude/d185-verify-refs` (nadväzuje na #227 a Box cut #229). Host (AIMviewer) časť je opísaná v časti 7; do repa
hosta som sa z tejto session nedostal (pridanie repa zamietnuté), preto ju robí orchestrátor alebo iná session.

## Ako to bolo overené

- Lokálny viewer vložený do hostovej stránky (rovnaký pôvod), model `AC20-FZK-Haus.ifc`, Playwright, headless shell
  so swiftshader (okno 1280 x 1080; väčšie okno swiftshader nevykreslí). Host napodobený: na `VERIFY_REQUEST` vráti
  dáta v tvare ASR (rev. 79, register v3) nad GUID z FZK-Haus. Recepty FinishFloorHeight, FinishCeilingHeight
  a NetVolume posiela tak ako dnešný motor (bez buniek, prvky len v kotvách, kódy v texte).
- Produkčné modely ASR sa v živej skúške nesťahujú (D-135, malá kvóta bucketu). ASR som preveril cez nástroje AIM
  (`ifc_measure verify=true` bez uloženia) pre 2.01: pozri bod 5. GUID `11POIrTfjBlRLHYd2fiz8_` motor v ASR ani VZT
  nenašiel (`ifc_get`: "nie je v ASR/VZT"); prosím o kód miestnosti (napr. 1.07), over to Samuel v AIM.
- Snímky: `00` až `09`, `moznost-b-*`. Mutácie: `../mutations/README.md` (12 nových, všetky OBSERVED).

## 1. Odkazy na konkrétne prvky

- Bunka s prvkom ukazuje jeho kód a je odkazom (klik prvok oranžovo zvýrazní; pri vstupných prvkoch v detaile sa
  kamera nehýbe, aby ostal pohľad veličiny).
- Recept bez buniek (dnes FinishFloorHeight, FinishCeilingHeight, NetVolume): pod vzorcom tabuľka **Vstupné prvky**
  z kotiev (úloha, kód prvku, výška z), každý prvok raz (`03-ffh-vstupne-prvky.png`).
- Kódy prvkov v texte vzorca, vysvetlení a poznámke sú klikateľné (`04-objem.png`: Bodenplatte, Slab-033).
- Kód berie viewer od hosta (`ref`); keď ho host nepošle, použije meno prvku v IFC (kód v AIM = meno prvku), takže
  funguje hneď aj s dnešným hostom. Číslo miestnosti (2.01) sa v texte odkazom nestane, chytilo by sa aj v čísle.

## 2. Orez a kamera pri rozbalení veličiny

Rezný box okolo miestnosti so skladbami (dosky a steny ako Box cut, #229), zvisle rozšírený o vstupné prvky
(vodorovne nie: doska cez celé podlažie by box roztiahla na celé podlažie), 5 cm za lícami (box presne na líci
renderer kreslí vnútro prvku farbou rezu). Po zatvorení detailu sa rez a projekcia vrátia.

| Druh | Orez | Kamera | Prečo |
|---|---|---|---|
| výška (Height, FinishFloorHeight, FinishCeilingHeight) | zvislý rez stredom miestnosti rovnobežne s dlhšou stranou (5 cm pred kótou) | vodorovne kolmo na rez, 12° zhora, **perspektíva** | vidno dosku pod aj nad, podlahovinu a podhľad v reze a kótu celú; perspektíva dáva hĺbku, ortografia zboku ukáže dosky len ako čiary |
| plocha, obvod | pôdorysný rez 1,2 m nad spodkom miestnosti (ako výkres) | zhora, **ortografia** | plocha a obvod v skutočnej veľkosti, steny v reze ohraničia pôdorys |
| objem (GrossVolume, NetVolume) | rez stredom ako pri výške, strop rezu tesne nad telesom miestnosti | izometria zošikma zhora (35°), perspektíva | "domček pre bábiky": celé teleso, podlahovina aj podhľad, ktoré sa odpočítavajú |

**Dve možnosti pre Samuela** (prepínač `?aimVerifyView=b` v adrese vieweru, predvolené je A):

- výška: A = perspektíva 12° zhora (`01-vyska.png`), B = ortografia presne zboku (`moznost-b-vyska.png`).
  Odporúčam A (Samuel: "asi treba pri výškach vypnúť orthographic").
- plocha: A = ortografia zhora (`07-plocha-netfloorarea.png`), B = perspektíva 40° zošikma (`moznost-b-plocha.png`).
  B je názornejšia (vidno steny aj podlahu), A je presnejšia na čítanie rozmerov. Prosím vybrať.

Druhá menšia miestnosť (Bad) sa sama otočí pozdĺž svojej dlhšej strany (`09-druha-miestnost-vyska.png`).

## 3. Viac kót naraz

Pred fajočkou je očko: zapne alebo vypne kótu veličiny bez rozbalenia detailu. Rozbalený detail má kótu vždy.
Viac zapnutých kót stojí vedľa seba (0,6 m pozdĺž dlhšej strany), aby sa čísla neprekrývali
(`02-ocka-viac-kot.png`: Height, FinishFloorHeight, FinishCeilingHeight).

## 4. Grafika výberu

Príčina tmavej scény: výber miestnosti zapne triedu IfcSpace a telesá miestností sa kreslia plnou farbou cez
celý pohľad; v reze ich plochy prekryjú podlahu aj steny (pri FZK-Haus celá miestnosť červená). Riešenie:

- po kliku na fajočku sa miestnosť v 3D odznačí; **panel vlastností ostane na nej** (`selectedEntity` sa nemení,
  malý AIM-FORK blok v `PropertiesPanel.tsx`, pripnutie trvá, kým sa nevyberie iný prvok);
- počas detailu sú IfcSpace skryté (aj overovaná miestnosť; jej pôdorys ohraničia steny v reze), po zatvorení sa
  ukážu; vstupné prvky sú oranžové, bez pohybu kamery.

## 5. NetFloorArea nemá fajočku

Príčina: register metód v3 nemá pre `Qto_SpaceBaseQuantities.NetFloorArea` recept. Overené na 2.01:
`ifc_measure verify=true` vráti 8 výsledkov (Height x2, FFH, FCH, GrossFloorArea, GrossPerimeter, GrossVolume,
NetVolume), NetFloorArea medzi nimi nie je, hoci súbor ju má (230,9544 m2, rovnako ako GrossFloorArea).
Viewer nič nemení: fajočku ukáže, keď host pošle cieľ.

**Návrh receptu (rozhodnutie o metóde pre Samuela):** `space.netfloorarea.profile@1`,
definícia bSI: "Sum of all usable floor areas covered by the space. It excludes the area covered by elements inside
the space (columns, inner walls, built-in's etc.), slab openings, or other protruding elements."

- výpočet: A = plocha profilu telesa (to isté ako GrossFloorArea), B = pôdorys prvkov vnútri miestnosti v úrovni
  podlahy (IfcColumn, IfcWall vnútri pôdorysu, IfcBuildingElementProxy/šachty, otvory v doske), výsledok A - B;
- bunky: A s `quantity: 'Qto_SpaceBaseQuantities.GrossFloorArea'` (odvodená, bod 6), B po prvkoch s kódom;
- tolerancia ako ostatné plochy: +- 0,5 %;
- stav: zelená v tolerancii; žltá, keď NetFloorArea = GrossFloorArea a vnútri sú prvky (autor neodčítal);
  sivá, keď teleso miestnosti nemá použiteľný profil (ako dnes pri 2.01 pri obvode a objeme).
- Otázka pre Samuela: odčítať aj obklady stien (wall claddings)? bSI ich vylučuje už z GrossFloorArea.

Ukážka, ako by to vyzeralo vo vieweri: `07-plocha-netfloorarea.png` (napodobený host, recept označený NÁVRH).

## 6. Odvodené veličiny

Bunka môže niesť `quantity` (meno inej výmery toho istého prvku). Ukáže "30,2500 m² (GrossFloorArea)" a klik
posunie panel na riadok tej výmery a na 2,5 s ho orámuje (`05-odvodene-bunky.png`, `06-klik-odvodena.png`).

## 7. Čo treba v hostovi (AIMviewer, `lib/verify/service.ts`, `wire.ts`, `lib/engine/space-verify.ts`)

Všetko voliteľné a spätne kompatibilné; viewer funguje aj bez toho (kódy z mien IFC, vstupné prvky z kotiev).

1. `anchors[].ref`: kód prvku (`objects.object_ref` podľa `ifc_guid`, výskyt, nie typ), rovnako ako pri bunkách.
2. Bunky pre recepty, ktoré ich dnes nemajú (tabuľka v `../navrh.md`, časť 4): `space.ffh.covering`
   (A vrch podlahoviny, B spodok telesa), `space.fch.covering` (A spodok podhľadu, B vrch podlahoviny),
   `space.netvolume.coverings` (A GrossVolume, B, C ... objem krytín po prvkoch) s `global_id` a `ref`.
3. `cells[].quantity` pri bunke, ktorej hodnota je iná výmera: `space.volume.prism` B = výška
   (`Qto_SpaceBaseQuantities.Height`), `space.netvolume.coverings` A = `Qto_SpaceBaseQuantities.GrossVolume`,
   návrh NetFloorArea A = `Qto_SpaceBaseQuantities.GrossFloorArea`. Pravidlo: `quantity` len keď hodnota bunky je
   tá výmera zo súboru alebo z jej receptu, inak bez neho.
4. Recept NetFloorArea podľa bodu 5 po rozhodnutí Samuela (register v4, migrácia len pripraviť do
   `supabase/pending`).
5. `FOCUS` od hosta môže poslať `frame: false` (zvýrazniť bez pohybu kamery); starší viewer pole ignoruje.
