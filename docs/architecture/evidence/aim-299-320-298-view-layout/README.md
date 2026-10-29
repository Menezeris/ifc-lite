<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #299, #320, #298: pomer dlaždíc, šírka a strana panela, RESET_COLORS

Rozširuje existujúce bridge správy (D-114), žiadna nová správa ani tool. Dôkaz mutácií: `mutations/README.md`.

## Čo viewer vedel predtým (zistenie)

- **Dlaždice:** pevné delenie na polovice a tretiny (`TILE_RECTS`), žiadny pomer a žiadna deliaca čiara. Teraz: `ratio` / `sizes` a ťahanie čiary myšou (dvojklik vráti polovice).
- **Panely:** pravý stĺpec (vlastnosti, lens, ...) mal ťahateľnú šírku (`sidebarWidthPct`, 14 až 60 %, uložená) a delič medzi dvoma panelmi stĺpca; plávajúce panely majú pozíciu, šírku a výšku v px a pripnutie (`left`, `right`, `bottom`, `free`). Z chatu sa nič z toho nedalo nastaviť. Stĺpec sa nedá presunúť doľava (pravý stĺpec je pevný), preto `side: "left"` panel vytrhne do plávajúceho okna pripnutého vľavo (to isté, čo "odpojiť panel" a pripnúť k okraju).
- **RESET_COLORS:** rušil farby (`resetColors`) a zvýraznenie FOCUS, **izoláciu nerušil**. Host v MCP-TOOLS.md tvrdil opak. Teraz ju ruší (zmena správania nižšie).

## Špecifikácia pre hosta

### `set_view_mode`, rozloženie dlaždíc (#299)

Posiela sa v `VIEW_TABS` s `action: "layout"` (ako doteraz) a dvomi novými voliteľnými poľami:

| Pole | Typ | Význam |
|---|---|---|
| `ratio` | number, 0 < ratio < 1 | Podiel **prvej** (veľkej) dlaždice pri rozloženiach s dvojicou podielov. Zvyšok je `1 - ratio`. |
| `sizes` | number[] | Váhy všetkých strán, viewer ich normalizuje na súčet 1. |

Naraz len jedno z nich. Počet hodnôt `sizes` podľa `layout`:

| `layout` | `sizes` | Čo je prvá hodnota |
|---|---|---|
| `split_h` | 2 | šírka ľavej dlaždice (tiles[0]) |
| `split_v` | 2 | výška hornej dlaždice (tiles[0]) |
| `three_left` / `three_right` | 2 | šírka veľkej dlaždice (tiles[0]); zvyšok je stĺpec dvoch malých |
| `three_top` / `three_bottom` | 2 | výška veľkej dlaždice (tiles[0]); zvyšok je rad dvoch malých |
| `three_h` | 3 | šírky troch dlaždíc zľava |
| `three_v` | 3 | výšky troch dlaždíc zhora |
| `grid4`, `single` | nemá | `ratio` aj `sizes` sa odmietnu |

Príklady: "väčšia pravá dlaždica s výkresom" = `layout: "split_h", tiles: ["3D", "<výkres>"], ratio: 0.3` (3D 30 %, výkres 70 %); alebo `layout: "three_right", ratio: 0.7` (veľká vpravo 70 %).

Pravidlá: žiadna dlaždica nie je menšia než 10 % (menšia hodnota sa zdvihne a `APPLIED.issues` to povie). Zlý počet `sizes` pri danom `layout` správu **odmietne validácia** (`APPLIED.issues`: "VIEW_TABS: neplatná správa", nič sa nezmení); `sizes` / `ratio` pri `grid4` a `single` tiež. Zmena `layout` bez `ratio` / `sizes` vráti delenie na polovice a tretiny. Ručne ťahaný pomer ostane, kým sa `layout` nezmení.

Čítanie: `get_viewer_state` → `layout.sizes` (podiely v poradí z tabuľky, súčet 1; pole chýba pri polovicích a tretinách).

Ručné ťahanie: nové, tenká čiara medzi dlaždicami (kurzor zmeny veľkosti), ťahá sa myšou, dvojklik vráti polovice. Pri `three_h` / `three_v` sú dve čiary. Malé dlaždice v `three_left` / `three_right` / `three_top` / `three_bottom` sa delia vždy na polovice.

### `set_view_mode`, šírka a strana panela (#320)

Posiela sa v `SET_PANELS` (rovnaká správa ako `panels`) novým voliteľným poľom `panel_layout`. `panels` je teraz tiež voliteľné, ale aspoň jedno z dvoch musí byť:

```json
{ "type": "SET_PANELS", "panels": { "properties": "open" },
  "panel_layout": { "panel": "properties", "width_pct": 40 } }
```

| Pole | Typ | Význam |
|---|---|---|
| `panel_layout.panel` | string | meno panela ako v `panels` (get_viewer_state → panels) |
| `panel_layout.width_pct` | number, 5 až 90 | šírka v % šírky okna viewera |
| `panel_layout.side` | `left` / `right` / `bottom` / `free` | kam panel pripnúť; aspoň jedno z `width_pct`, `side` |

Správanie podľa toho, kde panel je (`panels.<meno>.where`):

- **`right` (pravý stĺpec):** `width_pct` nastaví šírku celého stĺpca (14 až 60 %, mimo rozsah sa zúži; ide o stĺpec, takže platí pre oba panely splitu a uloží sa ako pri ťahaní). Na stránke ostane `right_width_pct` v `panels`. `side: "right"` nič nemení. `side: "left" | "bottom" | "free"` panel vytrhne zo stĺpca do plávajúceho okna pripnutého k okraju (`free` = voľne); `width_pct` sa potom použije na toto okno.
- **`floating`:** `width_pct` = šírka okna v px (% okna, najmenej 240 px, najviac 90 % okna). `side` ho znova pripne.
- **`bottom` (spodný pás), `left` (hierarchia), `window` (samostatné okno):** šírku a stranu viewer nemení a to povie v `APPLIED.issues` (spodný pás má celú šírku; výška pásu sa nenastavuje).
- Panel, ktorý nie je otvorený, sa **nemení** (issue "nie je otvorený"): pošli `panels: { <meno>: "open" }` v tej istej správe, otvorí sa pred nastavením.

"Panel properties širší, ťahaný doľava" = `panel_layout: { panel: "properties", width_pct: 40 }` (pravý stĺpec rastie doľava, ako keď ho ťahá používateľ). Výška plávajúcich panelov a pozícia `x/y` sa z chatu nenastavujú (zatiaľ nikto nepýtal).

Čítanie: `get_viewer_state` → `panels.<meno>` (`where`, `snap`, `size`) a `panels.right_width_pct`.

### `reset_colors` (#298), zmena správania

`RESET_COLORS` teraz zruší **farby, zvýraznenie FOCUS aj izoláciu** (ako hovorí MCP-TOOLS.md). Predtým rušil len farby a FOCUS; izolácia ostávala.

- Skrytie (`HIDE`) ostáva, ruší ho `SHOW_ALL`.
- `CLEAR_FILTER` a `CLEAR_FOCUS` izoláciu **nerušia** (zmena je len pri `RESET_COLORS`).
- Ghosting (X-ray) sa nemení.
- Kto potreboval "zruš farby, ale nechaj izoláciu", dnes nemá nástroj: ostane `CLEAR_FILTER` (ruší farby od filtra aj FOCUS, izoláciu nechá).

## Kód

- `viewTilesPlan.ts` (`SIZE_COUNT`, `normalizeSizes`, `tileRects`, `tileDividers`, `sizesFromDrag`), `tiles-protocol.ts` (`ratio`, `sizes`), `viewTabsApply.ts` (`resizeTiles`, `setLayout`), `AimTileGrid.tsx` (čiary).
- `view-protocol.ts` (`PanelLayoutRequest`), `aimPanelsPlan.ts` (`planPanelLayout`), `aimPanels.ts` (`applyPanelLayout`).
- `visibility-commands.ts` (`RESET_COLORS`).
- Nič v upstream súboroch, žiadny `AIM-FORK` blok; režim `check-aim-fork-only`: `aim-only`.
