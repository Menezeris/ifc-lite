# D-185 UI: fajočky overenia výmer v paneli vlastností

Stav: viewer implementovaný (PR na vetve `claude/d185-verify-ui`), host podľa časti 4 robí iná session.
Mockup: `mockup.html` / `mockup.png` (pôvodný návrh; "duch" riadky a tlačidlo "Overiť znova" po
rozhodnutí Samuela vypadli, viď časť 0).

## 0. Rozhodnutia Samuela (2. 11. 2026)

1. Height: fajočka podľa výpočtu z dosiek (spodok dosky nad - vrch dosky pod, definícia schémy);
   výpočet z vlastného telesa len ako kontrola v detaile. Pri každej veličine detail slovami
   vysvetlí, ako sa počíta, a ukáže vzorec s bunkami.
2. Veličina, ktorá v súbore nie je, sa nezobrazuje (žiadne "duch" riadky).
3. Ribbon AIM, skupina "Overovanie": rozbaľovací zoznam kontrol (zatiaľ "Výmery miestností
   (IfcSpace)"). Klik = overiť naraz všetky prvky modelu, beh sa uloží k revízii. Bez toho sa prvok
   overí, až keď sa zobrazia jeho výmery: viewer požiada hosta; uložený beh pre revíziu sa použije,
   ak existuje a nie je zastaraný. Žiadne priebežné overovanie.
4. Bunky (pomenované vstupy s hodnotou a zdrojovým prvkom) pri všetkých veličinách naraz.
5. Kóty sa ukážu hneď pri rozbalení detailu.
6. Fajočky len pri výmerach konkrétneho prvku (výskyt), nie typu.

## 1. Viewer (hotové v PR)

- `QuantitySetCard.tsx`: AIM-FORK bloky, prop `aimVerify`, fajočka `AimQtoVerifyBadge` pred
  tlačidlom kopírovania a detail `AimQtoVerifyDetail` pod hodnotou.
- `PropertiesPanel.tsx`: `aimVerify={scope === 'occurrence'}` a lišta `<AimVerifyBar>` na začiatku
  karty Quantities.
- `src/aim/`: `verify-protocol.ts` (správy, overenie tvaru), `aimVerifyPlan.ts` (čistá logika +
  test), `aimVerifyStore.ts` (malý store), `aimVerify.ts` (lenivý: žiadosti, kóty, zvýraznenie),
  `AimQtoVerify.tsx`, `AimVerifyDetail.tsx` (lenivý), `AimVerifyBar.tsx`,
  `AimVerifyRibbonGroup.tsx` (lenivý) + 1 skupina v `DocumentsRibbonTab.tsx`, most `AimBridge.tsx`.
- Kóty: existujúce `MEASURE_SHOW` (D-124) lokálne; prednosť majú `segments` od hosta, inak zvislá
  kóta v strede pôdorysu prvku od najnižšej po najvyššiu kotvu s `z_m`. Zvýraznenie: `FOCUS`
  (miestnosť priesvitne, vstupné prvky oranžovo, kamera na ne). Klik na kód v bunke zvýrazní prvok.
- Fajočky len pri prvku, ktorého výmery panel ukazuje (most pri výbere nastaví `panelGuid`; stena má tiež
  `BaseQuantities.Height`, výsledok miestnosti sa na ňu nechytí). Iný výber zavrie detail aj s kótami.
- Mimo AIM hosta (bez iframe) sa nič nežiada ani nekreslí.

## 2. Tok dát

```
výber IfcSpace, karta Quantities otvorená
 viewer -> VERIFY_REQUEST {id, action:'latest', payload:{global_id}}
 host   -> VERIFY_RESULT  {id, ok:true, data: VerifyElementWire | null}
 ak data chýba, nemá targets alebo stale=true:
 viewer -> VERIFY_REQUEST {id, action:'run', payload:{global_id}}       (host overí a ULOŽÍ k revízii)
 host   -> VERIFY_RESULT  {id, ok:true, data: VerifyElementWire}
klik na fajočku: detail + kóty + FOCUS, lokálne, bez správy
ribbon AIM > Overovanie > Výmery miestností (IfcSpace):
 viewer -> VERIFY_REQUEST {id, action:'run_all', payload:{check:'space_quantities'}}
 host   -> VERIFY_RESULT  {id, ok:true, data: VerifyRunAllWire}
 (viewer ukáže súhrn v toaste a znova načíta výsledok vybraného prvku)
"Ako to funguje?" > "Rozhodnutie D-185 a recepty": AIM_NAVIGATE {href: help_href}
```

Chyba: `{id, ok:false, error:'text pre používateľa'}`. Časové limity vieweru: `latest` 30 s,
`run` 180 s, `run_all` 20 min. Odpoveď s iným `global_id` než žiadosť viewer zahodí.

## 3. Tvar dát (viď `apps/viewer/src/aim/verify-protocol.ts`, záväzné)

```ts
interface VerifyElementWire {
  version: 1;
  global_id: string;
  model: string;               // 'ASR'
  revision: number;            // revízia overenia (79)
  current_revision: number;    // aktuálna revízia modelu
  stale: boolean;              // revision < current_revision
  checked_at: string;          // ISO
  registry_version: number;    // 3
  engine?: string;             // '@ifc-lite/mcp@0.27.0'
  help_href?: string;          // host stránka D-185 (relatívna cesta), cez AIM_NAVIGATE
  targets: VerifyTargetWire[]; // LEN veličiny, ktoré sú v súbore (file_value != null) - rozhodnutie 2
}
interface VerifyTargetWire {
  target: string;              // 'Qto_SpaceBaseQuantities.Height' (meno sady . meno veličiny, presne ako v IFC)
  status: 'green' | 'yellow' | 'red' | 'grey';   // = status hlavného receptu
  unit: 'm' | 'm2' | 'm3';     // SI jednotka file_value, computed_value a buniek
  file_value: number | null;
  computed_value: number | null;
  tolerance: { text: string; abs: number | null };
  definition?: string;         // text zo schémy
  spec?: { label: string; url: string };          // https odkaz na bSI, viď 4.
  file_meta?: { method_of_measurement?: string; formula?: string };
  recipes: VerifyRecipeWire[]; // [0] = hlavný recept, ďalšie = kontrolné výpočty
}
interface VerifyRecipeWire {
  recipe: string;              // 'space.height.slabs@2'
  status: 'green' | 'yellow' | 'red' | 'grey';
  explanation: string;         // POVINNÉ: ako sa počíta, 1 až 2 vety po slovensky pre človeka
  method?: string;             // technický popis z registra
  computed_value: number | null;
  expression?: string;         // výraz nad kľúčmi buniek: 'A - B', 'A - B - C', 'A x B'
  cells: { key: string; label: string; value: number; unit: string; global_id?: string; ref?: string }[];
  formula_text?: string;       // dnešný stĺpec formula, zobrazí sa len keď cells je prázdne
  note?: string;               // prečo sivá / žltá
  anchors: { global_id: string; role: string; z_m?: number }[];
  segments?: { a: [number, number, number]; b: [number, number, number] }[]; // IFC svet, m, Z hore
}
interface VerifyRunAllWire {
  check: string;               // 'space_quantities'
  model?: string;
  revision?: number;
  elements: number;            // počet overených prvkov
  counts: { green: number; yellow: number; red: number; grey: number };  // počty veličín
}
```

Overenie tvaru vo vieweri: neznámy stav alebo jednotka, recept bez mena, cieľ bez receptov a odkazy
mimo `http(s)://` alebo relatívnej cesty hosta sa zahodia. Najviac 64 cieľov, 8 receptov na cieľ,
64 buniek a kotiev na recept.

## 4. Hostová časť (spec pre orchestrátora, nepíšem ju)

Bridge handler v AIMviewer vedľa `REQLIB_REQUEST`: prijme `VERIFY_REQUEST` len od svojho iframe,
overí, že `global_id` patrí do modelov projektu, a volá route:

1. `GET /api/verify/latest?global_id=...` -> `VerifyElementWire | null`
   - SELECT z `v_verification_latest` pre `global_id`. Pohľad dnes vracia viac riadkov na veličinu
     (staršie recepty a registre, napr. 1.07 Height: `slabs@1`, `slabs@2`, `own@1`): na každý
     `target` a rodinu receptu (`space.height.slabs`) nechať najvyšší `registry_version`.
   - Poradie receptov podľa registra: hlavný prvý. Height: `space.height.slabs` hlavný,
     `space.height.own` kontrolný (rozhodnutie 1). Status cieľa = status hlavného receptu.
   - Ciele s `file_value = null` vynechať (rozhodnutie 2).
   - `current_revision` z modelu, `stale` z pohľadu. Žiadny riadok = `data: null`.
   - `spec.url`: `ref` `buildingSMART/IFC4.3.x-development@d71e140:reference_schemas/psd/X.xml#Name`
     -> `https://github.com/buildingSMART/IFC4.3.x-development/blob/d71e140/reference_schemas/psd/X.xml`,
     `label` = `X.Name, IFC 4.3`.
   - `ref` buniek: `objects.object_ref` podľa `ifc_guid`; ten istý GUID má v `objects` dva riadky
     (výskyt `SD02.03.0003` a riadok s object_ref = GUID, meno `SD02`), brať kód výskytu.
   - `file_meta`: `IfcElementQuantity.MethodOfMeasurement` a `IfcPhysicalQuantity.Formula` zo
     súboru (ifc_get); ak nie sú, vynechať.
   - `help_href`: stránka hosta s D-185 (recepty, stavy, tolerancie).
2. `POST /api/verify/run {global_id}` -> `VerifyElementWire`: `ifc_measure verify=true` pre jeden
   prvok, výsledok ULOŽIŤ do `verification_runs` / `verification_results` k aktuálnej revízii
   (ďalšie zobrazenie ho už len načíta) a vrátiť ho v tvare ako `latest`.
3. `POST /api/verify/run_all {check:'space_quantities'}` -> `VerifyRunAllWire`: overiť všetky
   IfcSpace modelu (modelov federácie s IfcSpace) jedným behom, uložiť k revízii, vrátiť súhrn.
   Ak beh trvá dlhšie ako ~20 min, viewer to vzdá (host môže dokončiť a uložiť aj tak).
   Súbežný druhý `run_all` odmietnuť chybou "overenie už beží".
4. Bunky a vysvetlenie (rozhodnutie 1 a 4): každý recept v `lib/verify/quantity-methods.ts` /
   `lib/engine/space-verify.ts` vráti `explanation`, `expression` a `cells`; uložiť v novom jsonb
   stĺpci `inputs` vo `verification_results` (+ `explanation`) a vystaviť v `v_verification_latest`.
   Návrh buniek pre recepty registra v3:

| recept | expression | bunky |
|---|---|---|
| space.height.slabs | A - B | A spodok dosky nad (doska), B vrch dosky pod (doska) |
| space.height.own | A - B | A vrch telesa miestnosti, B spodok telesa miestnosti |
| space.ffh.covering | A - B | A vrch podlahoviny (krytina), B spodok telesa miestnosti |
| space.fch.covering | A - B | A spodok podhľadu (krytina), B vrch podlahoviny (krytina) |
| space.area.profile | A | A plocha profilu telesa (miestnosť) |
| space.perimeter.profile | A | A obvod vonkajšej slučky profilu (miestnosť) |
| space.volume.prism | A x B | A plocha profilu, B výška extrúzie (miestnosť) |
| space.netvolume.coverings | A - B - C ... | A GrossVolume (miestnosť), B, C ... objem krytiny vnútri telesa (každá krytina) |

   Príklad 2.01 Height: `explanation` "Výška miestnosti je vzdialenosť od vrchu dosky pod miestnosťou
   po spodok dosky nad ňou, meraná v jej pôdoryse (definícia schémy).", `expression` "A - B",
   cells A "spodok dosky nad" 8.8 m SD02.03.0003, B "vrch dosky pod" 4.85 m SD02.03.0001.
   Príklad 1.07 NetVolume: A "GrossVolume miestnosti" 71.5849 m3 (1.07), B "objem podlahoviny
   vnútri telesa (uzavretý mesh, plnosť 0,9556)" 4.1429 m3 PD02.50.03, výsledok 67.442.
5. `segments` (voliteľné): ak motor pozná bod merania (pôdorys miestnosti, kde hľadal dosky),
   úsek kóty v IFC svete. Bez neho viewer kótuje v strede obálky miestnosti.

## 5. Mimo rozsahu

BCF z červeného stavu (neskôr), fajočky v strome a v Lists, iné triedy ako IfcSpace.
