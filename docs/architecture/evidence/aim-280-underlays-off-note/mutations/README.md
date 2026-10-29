<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIMviewer#280: panel Underlays ukáže vypnuté podklady v 3D, mutačný dôkaz

Zmena: keď sú podklady v 3D vypnuté (`SET_UNDERLAYS_3D show=false`, `set_view_mode underlays_3d=false` alebo prepínač), panel Underlays ukáže stav prepínača (On / Off), pás nad zoznamom a poznámku pri riadku, ktorého oko je zapnuté. V zamknutom pôdoryse (2D) sa podklady kreslia, takže pás ani poznámka nie sú. Komponenty `AimUnderlays3dOffBanner` a `AimUnderlayRowNote` sú nové exporty `AimUnderlays3dToggle.tsx`, preto revert na `main` test nenačíta (INCONCLUSIVE) a každé rozhodnutie je overené chirurgickou mutáciou. Záplaty sú písané mutant -> opravené (`git diff -R`).

| Záplata | Mutácia | Test, ktorý zčervenel |
|---|---|---|
| `view-locked-ignored.patch` | pás a poznámka ignorujú zamknutý pôdorys (2D) | `underlaysOffNote.test.tsx` |
| `row-note-on-off-row.patch` | poznámka aj pri riadku s vypnutým okom | `underlaysOffNote.test.tsx` |
| `banner-always.patch` | pás je vždy, aj pri zapnutom Show in 3D | `underlaysOffNote.test.tsx` |
| `state-always-off.patch` | stav prepínača je vždy Off | `underlaysOffNote.test.tsx` |
| `row-note-never.patch` | poznámka pri riadku sa nikdy nezobrazí | `underlaysOffNote.test.tsx` |

Všetkých 5 skončilo `OBSERVED` (exit 0), obnova overená; podrobnosti v `summary.json`.

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/AimUnderlays3dToggle.tsx \
  --test apps/viewer/src/aim/underlaysOffNote.test.tsx \
  --mutation /tmp/aim-280-mut/state-always-off.patch --ci --json
```
