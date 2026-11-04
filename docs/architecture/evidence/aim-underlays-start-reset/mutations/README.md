<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM start reset: every PDF underlay off, rasterized only when turned on

Samuel (2026-11-02): the production AIM viewer froze at startup ("Stránka nereaguje"). The earlier change (`../aim-underlays-off-at-start/`) started the 3D switch off, but the base visibility of each underlay was still its saved `visible` from the calibration: as soon as anything turned the switch on (`SET_UNDERLAYS_3D show:true`, the chat's `calibrate_underlay show_in_3d` for a single underlay, a saved view, the panel switch), every underlay saved as visible was fetched and rasterized at once (pdf.js on the main thread at 4096 px), and the locked plan view rasterized the saved-visible underlays of every storey.

Now the base is off: only a session override turns an underlay on in 3D (the row eye in the Underlays panel, a chat item, a saved view), so the saved `visible` no longer turns anything on and nothing is fetched or rasterized until it is turned on. The locked plan view draws only the underlay of its storey. `persist` from the chat keeps the visibility override. In the embedded viewer the class visibility (spaces, openings, site...) saved in localStorage is not restored at startup.

## Measurement (local build, Playwright, swiftshader)

Host page embedding the viewer, `AC20-FZK-Haus.ifc`, `UNDERLAYS_LOAD` with 14 calibrated underlays saved as visible, each a 39 MB raster PDF of 20 x 14 = 280 JPEG tiles (like SF.01). Long tasks in the viewer frame over 45 s after `READY`:

| Scenario | main (`3f20edcf`) | this branch |
|---|---|---|
| `UNDERLAYS_LOAD` only | 0 PDF, 8.2 s total, max 1.3 s | 0 PDF, 6.8 s total, max 1.3 s |
| + `SET_UNDERLAYS_3D show:true` | 14 PDF, 30.8 s total, max 5.3 s | 0 PDF, 6.9 s total, max 1.2 s |
| + `show:true` with one item (`doc-0` visible) | 14 PDF, 24.4 s total, max 5.1 s | 1 PDF, 10.1 s total, max 2.9 s |

Live on the branch: `QUERY view_state` at startup reported no section, 0 hidden, no isolation, empty selection, `underlays_3d: false`, 0 of 14 underlays on; with `ifc-lite-ifc-spaces-visible=true` seeded in localStorage the visible set had no `IfcSpace` (main: 7). In the Underlays panel all 14 eyes showed off; clicking one fetched exactly that PDF and turned Show in 3D on.

## Mutations

Each patch is written mutant to fixed (`git diff -R` of the mutated file); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `saved-visible-turns-on.patch` | `underlaysPlan.ts` | without an override the saved state turns the underlay on | `underlaysPlan.test.ts` |
| `locked-all-storeys.patch` | `underlaysPlan.ts` | the locked plan view draws the underlays of every storey | `underlaysPlan.test.ts` |
| `overridden-flag-only-override.patch` | `underlaysPlan.ts` | `overridden` in `get_viewer_state` reflects only an explicit override, not a state that differs from the saved one | `underlaysPlan.test.ts` |
| `persist-drops-visible.patch` | `underlaysApply.ts` | `persist` drops the visibility override, so the saved underlay goes dark | `underlaySectionSync.test.ts` |
| `eye-keeps-3d-off.patch` | `aimUnderlays3d.ts` | the row eye turns one underlay on but leaves Show in 3D off | `underlaySectionSync.test.ts` |
| `locked-storey-not-passed.patch` | `useDrawingUnderlay.ts` | the hook does not pass the active storey of the locked plan view | `underlaySectionSync.test.ts` |

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/underlaysPlan.ts \
  --test apps/viewer/src/aim/underlaysPlan.test.ts \
  --mutation /tmp/mut/saved-visible-turns-on.patch --ci --json
```

`--only` is the module of the row, `--test` its test (copy the patches outside the tree first).
