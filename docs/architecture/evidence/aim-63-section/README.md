<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #63: rez nad podlažím reže tam, kam host žiada

Issue: Menezeris/AIMviewer#63. Rez `SET_SECTION {storeyGuid, offsetM}` v AIM federácii
ASR + VZT padol na 13,55 m namiesto 10,2 m a pri zmene offsetu o 3 m sa posunul len o 1,46 m.

## Príčina

Renderer (a Section bar) rozkladá percento rezu `SectionPlane.position` na rozsah z
`usePlacementCoordinateInfo`: živé obálky modelov zo scény. AIM vrstva
(`useAimViewCommands`, `viewQueries`) prepočítavala výšku na percento voči holému
`mergedSectionBounds` (`coordinateInfo.shiftedBounds`). Keď sa tieto obálky líšia (federácia,
posunutý model), rovina skončí inde a sklon je pomer ich výšok. `view_state` čítal rez cez tú
istú holú obálku, takže hlásil požadovanú výšku, nie skutočnú.

Strecha "nad rovinou" z #63 je dôsledok: rovina pre 3NP + 1 m bola v skutočnosti nad
podlahou 4NP (13,4 m), takže pôdorys 3NP zakryla doska 4NP.

## Oprava

`aim/sectionRange.ts` počíta tú istú obálku ako `useSectionDistance` (merged + placement).
Používa ju rez nad podlažím, rez cez prvok a súradnicu, `view_state` aj obálka modelu v
`QUERY bounds`. Elevácia podlažia sa prevádza rámcom vlastného modelu podlažia. Nové
`showGizmo` (pri `set`) a `action: 'gizmo'` skryjú widget rezu, rez ostáva.

## Živé overenie (Playwright, iframe host, `apps/viewer` dev server)

FZK-Haus (`Dachgeschoss`, elevácia 2,7 m) + AB22 vo federácii, AB22 posunutý o +15 m
(nesúlad obálok ako v AIM: holá obálka Y -1,49..8,24, renderer -1,00..23,24).
Rovina renderera = `percentToWorld(position, rozsah renderera)`.

| offsetM | očakávané | pred opravou | po oprave |
| ---: | ---: | ---: | ---: |
| 1 | 3,7 m | 11,925 m | 3,700 m |
| -2 | 0,7 m | 4,448 m | 0,700 m |

Po oprave rozdiel presne 3 m; `showGizmo: false` dal `sectionPlane.showGizmo = false` a
`view_state.section.show_gizmo = false`, rez ostal `enabled`.

## Test a mutácia

`aim/sectionRange.test.ts` volá `sectionRenderBounds` na dvoch modeloch so živou obálkou, kde je VZT posunutý o +15 m
a overí, že rez nad podlažím padne presne na eleváciu + offset. Mutácia
`mutations/bare-merged-bounds.patch` (vrátenie holého `mergedSectionBounds`, teda chyba #63):

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/sectionRange.ts --test apps/viewer/src/aim/sectionRange.test.ts \
  --mutation /tmp/bare-merged-bounds.patch --ci --json
```

Výsledok: `OBSERVED`, obnovenie overené.
