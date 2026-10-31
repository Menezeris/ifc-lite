<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-173 a D-174: surgical mutation evidence

Zmena: priestor sa nikdy nefarbi plnou farbou (D-173, `aimSpaceColor.ts` volany z `useColorOverlaySync`, krytie podstavy najviac 0,35) a stlpec Lists `source: "host"` (D-174, `aimHostColumns.ts`, hook `getHostValue`, `matched` v stave). Testy importuju moduly, ktore na `main` nie su, takze revert vsetkej produkcie by test neprelozil (INCONCLUSIVE). Kazde hlavne rozhodnutie preto overuje chirurgicka mutacia.

Kazdy patch je zapisany mutant -> opraveny (orientacia `git diff -R` mutovaneho suboru), oracle ho aplikuje spatne. Vsetky behy skoncili `OBSERVED` (exit 0) s overenou restauraciou proti `origin/main`; zaznamy su v `summary.json`.

| Patch | Mutacia | Test, ktory sa zafarbil cerveno |
|---|---|---|
| `space-drop-disabled.patch` | plna farba priestoru sa nevyradi | `aimSpaceColor.test.ts` |
| `space-cap-raised.patch` | strop krytia priestoru 0,6 namiesto 0,35 | `aimSpaceColor.test.ts` |
| `space-fill-alpha-raised.patch` | podstava miestnosti kreslena s krytim 0,45 | `aimSpaceColor.test.ts` |
| `space-sink-bypassed.patch` | kanal do renderera nevola withoutOpaqueSpaces | `spaceColorSink.test.tsx` |
| `host-source-unknown.patch` | OPEN_LIST nepozna zdroj host, sprava sa zahodi | `aimHostColumns.test.ts` |
| `host-values-not-required.patch` | stlpec host bez values je platny | `aimHostColumns.test.ts` |
| `host-ref-source-unknown.patch` | column_ref {source: host} je neplatny (sum, sort, highlight) | `aimHostColumns.test.ts` |
| `host-matched-not-reported.patch` | view_state.list.columns nenesie matched | `aimHostColumns.test.ts` |
| `host-matched-counts-empty.patch` | matched pocita aj riadky bez hodnoty | `aimHostColumns.test.ts` |
| `host-edit-values-ignored.patch` | LIST_UPDATE addColumns zahodi values | `aimHostColumns.test.ts` |
| `host-values-overwrite-lost.patch` | znovu pridany stlpec neprepise stare hodnoty | `aimHostColumns.test.ts` |
| `host-engine-case-removed.patch` | engine nezavola getHostValue (defaultColumnValue vracia null) | `engine.host-column.test.ts` |
| `host-adapter-hook-removed.patch` | provider nema hook getHostValue | `adapterHostColumn.test.ts` |

## Replay

Patche skopiruj mimo stromu (oracle odmieta spinavy strom) a spusti napriklad:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/aimSpaceColor.ts \
  --test apps/viewer/src/aim/aimSpaceColor.test.ts \
  --mutation /tmp/mut/space-drop-disabled.patch --ci --json
```

Stlpce `production` a `test` v `summary.json` davaju `--only` a `--test` pre kazdy patch.
