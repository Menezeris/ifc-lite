# D-185 UI: fajočky overenia výmer v paneli vlastností (návrh)

Stav: NÁVRH na schválenie Samuelom, nič produkčné nie je napísané.
Mockup: `docs/architecture/aim-d185-verify-ui/mockup.html` (screenshot `mockup.png`),
čísla sú reálne z `v_verification_latest` (ASR rev. 79, register v3).

## 1. Kde to sedí vo forku

- Karta Quantities: `apps/viewer/src/components/viewer/PropertiesPanel.tsx` (TabsContent
  `quantities`, r. ~1731) renderuje `QuantitySetCard` pre výskyt aj typ.
- Riadok veličiny: `apps/viewer/src/components/viewer/properties/QuantitySetCard.tsx` (96 r.,
  zatiaľ bez AIM-FORK). Riadok je `flex items-start`: meno + hodnota, `CopyValueButton`.
- AIM v paneli dnes: `AimInspectorTabs` (D-077, tab AIM | IFC) a wrapper natívneho obsahu,
  oba ako AIM-FORK bloky v `PropertiesPanel.tsx`. Per-riadkový AIM odznak pri vlastnosti
  zatiaľ neexistuje (AIM_TREE_DECORATIONS je len v strome).

Navrhovaný zásah do upstreamu (jediný súbor, 2 bloky, spolu 4 riadky):

```tsx
// QuantitySetCard.tsx
// >>> AIM-FORK: D-185 overenie výmer (fajočka + detail)
import { AimQtoVerify } from '@/aim/AimQtoVerify';
// <<< AIM-FORK
...
<CopyValueButton name={q.name} value={display} />
{/* >>> AIM-FORK: D-185 */}<AimQtoVerify qset={qset.name} quantity={q.name} />{/* <<< AIM-FORK */}
```

a `flex-wrap` do className riadku (v tom istom bloku), aby sa detail zalomil pod riadok
na plnú šírku. `AimQtoVerify` je tenký eager komponent (selektor zo store, mimo AIM hosta
alebo bez výsledku vráti `null`); detail (bunky, definícia, akcie) je lenivý `import()`.
Lišta nad výmerami (rev., súhrn, "Ako to funguje?", "Overiť znova") a "duch" riadky pre
veličiny, ktoré v súbore chýbajú, ale recept ich žiada (1.07 FinishFloorHeight = žltá):
jeden AIM-FORK riadok na začiatku TabsContent `quantities` v `PropertiesPanel.tsx`
(`<AimVerifyBar />`). Duch riadky renderuje `AimVerifyBar` pod svojou lištou, nie v karte.

Nové súbory (všetko v `apps/viewer/src/aim/`):
- `verify-protocol.ts` (+test): správy VERIFY_REQUEST / VERIFY_RESULT, validácia tvaru.
- `aimVerifyStore.ts`: výsledok pre vybraný prvok, kľúč `Qto.Name`, stav načítania.
- `aimVerifyPlan.ts` (+test): čistá logika: rozdiel, voľba hlavného receptu, kóty z anchors.
- `AimQtoVerify.tsx` (fajočka), `AimVerifyDetail.tsx` (lenivý detail), `AimVerifyBar.tsx`.

Kóty a zvýraznenie: existujúce cesty, nič nové. Kóty `addHostMeasurements` (D-124,
`measureShow.ts`), zvýraznenie vstupných prvkov tou istou funkciou ako `HIGHLIGHT_FILTER`
/ `FOCUS`, klik na kód v bunke = výber ako `SELECT`.

## 2. Tok dát

```
viewer                                   host (AIMviewer)
 | výber IfcSpace, karta Quantities
 |-- VERIFY_REQUEST {id, action:'latest', global_id, model} -->  SELECT v_verification_latest
 |<- VERIFY_RESULT  {id, ok, data: VerifyElementWire} ---------
 | klik na fajočku: detail + kóty z anchors (lokálne, žiadna správa)
 | "Overiť znova"
 |-- VERIFY_REQUEST {id, action:'run', global_id, model} ----->  ifc_measure verify=true, save=false
 |<- VERIFY_RESULT  {id, ok, data: VerifyElementWire (preview:true, preview_id)}
 | "Uložiť do AIM"
 |-- VERIFY_REQUEST {id, action:'save', preview_id} ---------->  insert verification_runs/results
 |<- VERIFY_RESULT  {id, ok, data: VerifyElementWire (preview:false)}
 | "Ako to funguje?" / odkaz na D-185 / klik na definíciu
 |-- AIM_NAVIGATE {href} (existujúca správa, host otvorí stránku)
```

- Žiadosť ide len pri otvorenej karte Quantities a len vo vnútri AIM hosta (iframe), raz
  na výber (cache podľa `global_id` + `revision` do ďalšieho výberu). Mimo AIM: nič.
- Vzor páru `id` / `ok` / `data` / `error` je ten istý ako `REQLIB_REQUEST` / `REQLIB_RESULT`
  (D-182). Odpoveď s iným `global_id`, než je práve vybraný, viewer zahodí.

## 3. Tvar dát (VerifyElementWire, v1)

```ts
interface VerifyElementWire {
  version: 1;
  global_id: string;
  model: string;               // 'ASR'
  revision: number;            // revízia, na ktorej sa overovalo (79)
  current_revision: number;    // aktuálna revízia modelu (stale = revision < current)
  stale: boolean;
  checked_at: string;          // ISO
  registry_version: number;    // 3
  engine: string;              // '@ifc-lite/mcp@0.27.0'
  preview?: { id: string };    // len po action 'run' pred uložením
  help_href: string;           // host stránka "ako to funguje" (D-185)
  targets: VerifyTargetWire[];
}
interface VerifyTargetWire {
  target: string;              // 'Qto_SpaceBaseQuantities.Height'
  status: 'green' | 'yellow' | 'red' | 'grey';
  unit: 'm' | 'm2' | 'm3';     // jednotka file_value / computed_value (SI)
  file_value: number | null;
  computed_value: number | null;
  tolerance: { text: string; abs: number | null };  // abs v jednotke unit, na rozdiel
  definition: string;
  spec: { ref: string; url: string; label: string }; // url na buildingSMART (viď 4.)
  file_meta?: { method_of_measurement?: string; formula?: string }; // zo súboru, ak sú
  recipes: VerifyRecipeWire[]; // [0] = hlavný (určuje status), ďalšie = kontrolné
}
interface VerifyRecipeWire {
  recipe: string;              // 'space.height.slabs@2'
  status: 'green' | 'yellow' | 'red' | 'grey';
  method: string;
  computed_value: number | null;
  formula_text: string | null; // dnešný stĺpec formula (fallback, keď cells chýbajú)
  expression?: string;         // 'A - B'
  cells?: { key: string; label: string; value: number; unit: string;
            global_id?: string; ref?: string; role?: string }[];
  note?: string | null;
  anchors: { global_id: string; role: string; z_m?: number }[];
  segments?: { a: [number, number, number]; b: [number, number, number] }[]; // IFC svet, m
}
```

## 4. Hostová časť (špecifikácia pre orchestrátora, nepíšem ju)

Bridge handler v AIMviewer (vedľa REQLIB): prijme `VERIFY_REQUEST`, overí, že `global_id`
patrí do modelov projektu, a volá route:

1. `GET /api/verify/latest?model=ASR&global_id=...`
   - SELECT z `v_verification_latest` pre `global_id`. Dnes vracia viac riadkov na jednu
     veličinu (staršie recepty a registre: 1.07 Height má `slabs@1`, `slabs@2`, `own@1`).
     Na každý `target` a rodinu receptu (`space.height.slabs`) nechať len najvyšší
     `registry_version`; poradie receptov z registra (hlavný prvý), status veličiny = hlavný.
   - `current_revision` z modelu, `stale` z pohľadu.
   - `spec.url`: `ref` `buildingSMART/IFC4.3.x-development@d71e140:reference_schemas/psd/X.xml#Name`
     -> `https://github.com/buildingSMART/IFC4.3.x-development/blob/d71e140/reference_schemas/psd/X.xml`
     (pevná verzia), `label` = `X.Name, IFC 4.3`. Prípadne druhý odkaz na ľudskú
     dokumentáciu `ifc43-docs.standards.buildingsmart.org` (lexical/X.htm).
   - `ref` pre bunky: `objects.object_ref` podľa `ifc_guid`; pozor, ten istý GUID má v
     `objects` dva riadky (výskyt `SD02.03.0003` a riadok s object_ref = GUID, meno `SD02`),
     brať ten s kódom výskytu.
   - `file_meta`: `IfcElementQuantity.MethodOfMeasurement` a `IfcPhysicalQuantity.Formula`
     (IFC4) zo súboru cez ifc_get; parser ifc-lite ich číta (`quantity-extractor.ts`),
     dátová cesta panela vieweru nie. Ak nie sú, pole vynechať.
2. `POST /api/verify/run {model, global_id}` = `ifc_measure verify=true` pre jeden prvok,
   `save=false`; vráti náhľad s `preview.id` (krátko žijúci, napr. 15 min).
3. `POST /api/verify/save {preview_id}` = zápis do `verification_runs` / `verification_results`
   (rovnako ako dnes cez chat), vráti uložený výsledok. Právo ukladať: viď otázka 3.

Bunky (`cells`, `expression`): dnes ich DB nemá, je tam len text `formula` a `anchors`
(role, z_m, global_id). Pre výšky sa dajú poskladať z anchors, pre NetVolume nie (objemy
krytín v anchors nie sú). Odporúčam, aby ich priamo vracal recept v `space-verify.ts`
(každý recept pozná svoje vstupy) a ukladali sa v novom jsonb stĺpci `inputs` v
`verification_results` (+ do pohľadu). Do toho fallback: viewer ukáže `formula_text`.

Kóty (`segments`): anchors majú len výšku `z_m`. Navrhujem, aby ich vracal motor (bod v
pôdoryse miestnosti, kde meral); ak nie, viewer dá kótu do stredu pôdorysu miestnosti
(obálku pozná) od najnižšieho po najvyšší anchor.

## 5. Mimo rozsahu tohto PR

BCF z červeného stavu (neskôr), fajočky v strome a v zozname (Lists), iné triedy ako
IfcSpace, overenie celého podlažia jedným klikom.

## 6. Otázky pre Samuela

1. Viac receptov na jednu veličinu (Height: z dosiek aj z vlastného telesa): fajočka podľa
   hlavného receptu a ostatné ako "kontrolný výpočet" v detaile (ako v mockupe), alebo
   najhorší stav zo všetkých?
2. Veličina, ktorú súbor nemá, ale recept ju žiada (1.07 FinishFloorHeight, žltá): ukázať
   ako "duch" riadok v karte (mockup B), alebo len v súhrne nad výmerami?
3. "Overiť znova": náhľad bez uloženia a tlačidlo "Uložiť do AIM" pre každého, kto vidí
   model, alebo ukladať môže len rola (napr. BIM manažér)?
4. Bunky vzorca: súhlasíš, že ich bude vracať recept v `space-verify.ts` (nový stĺpec
   `inputs`), alebo stačí prvá verzia s textom vzorca a bunkami len pre výšky z anchors?
5. Kóty: automaticky pri rozbalení detailu, alebo až na tlačidlo "Ukázať kóty vo vieweri"
   (mockup)? Kóty nahradia predchádzajúce kóty od hosta, merania používateľa ostanú.
6. Fajočky aj pri typových výmerách (Type Quantities), alebo len pri výskyte?
