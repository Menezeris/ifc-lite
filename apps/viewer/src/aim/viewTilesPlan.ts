/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dlaždice záložiek (AIM D-157, #210), ako Tile Windows v Revite: stredná plocha
 * sa rozdelí na 2 až 4 dlaždice a každá ukazuje jednu otvorenú záložku. Tu je
 * len čistá logika bez store (rozloženia, obdĺžniky, priradenie záložiek);
 * vykonanie je vo `viewTilesApply.ts`, kreslenie v `AimTileGrid.tsx`.
 *
 * Viewer má jeden 3D canvas (D-132): práve jedna 3D záložka (3D, pôdorys,
 * uložený pohľad) je v ňom živá, ostatné 3D dlaždice ukazujú jej poslednú
 * snímku, kým na ne používateľ neklikne. Dokument je v dlaždici vždy živý.
 * Dlaždica 0 je pri rozloženiach s tromi oknami tá veľká.
 */

import { isSceneTab, type ViewTab, type ViewTabsState } from './viewTabsLayout.js';

export const TILE_LAYOUTS = [
  'single', 'split_h', 'split_v',
  'three_left', 'three_right', 'three_top', 'three_bottom', 'three_h', 'three_v',
  'grid4',
] as const;
export type TileLayout = (typeof TILE_LAYOUTS)[number];

/** Obdĺžnik dlaždice v zlomkoch strednej plochy (0 až 1). */
export interface TileRect { x: number; y: number; w: number; h: number }

const H = 1 / 2;
const T = 1 / 3;
const r = (x: number, y: number, w: number, h: number): TileRect => ({ x, y, w, h });

export const TILE_RECTS: Record<TileLayout, readonly TileRect[]> = {
  single: [r(0, 0, 1, 1)],
  split_h: [r(0, 0, H, 1), r(H, 0, H, 1)],
  split_v: [r(0, 0, 1, H), r(0, H, 1, H)],
  three_left: [r(0, 0, H, 1), r(H, 0, H, H), r(H, H, H, H)],
  three_right: [r(H, 0, H, 1), r(0, 0, H, H), r(0, H, H, H)],
  three_top: [r(0, 0, 1, H), r(0, H, H, H), r(H, H, H, H)],
  three_bottom: [r(0, H, 1, H), r(0, 0, H, H), r(H, 0, H, H)],
  three_h: [r(0, 0, T, 1), r(T, 0, T, 1), r(2 * T, 0, T, 1)],
  three_v: [r(0, 0, 1, T), r(0, T, 1, T), r(0, 2 * T, 1, T)],
  grid4: [r(0, 0, H, H), r(H, 0, H, H), r(0, H, H, H), r(H, H, H, H)],
};

/** Menovky pre prepínač v lište (poradie = `TILE_LAYOUTS`). */
export const TILE_LAYOUT_LABELS: Record<TileLayout, string> = {
  single: '1 okno',
  split_h: '2 vedľa seba',
  split_v: '2 pod sebou',
  three_left: '3: veľké vľavo',
  three_right: '3: veľké vpravo',
  three_top: '3: veľké hore',
  three_bottom: '3: veľké dole',
  three_h: '3 vedľa seba',
  three_v: '3 pod sebou',
  grid4: '4 (2x2)',
};

/** Výška hlavičky dlaždice (menovka a výber záložky) v px; 3D canvas začína pod ňou. */
export const TILE_HEADER_PX = 24;

const pct = (v: number) => `${Math.round(v * 1e4) / 100}%`;

/**
 * Poloha 3D canvasu v živej dlaždici (štýl obalu canvasu v `ViewerLayout`): pod
 * hlavičkou, 1 px od okraja (deliaca čiara dlaždíc).
 */
export function tileFrameStyle(f: TileRect): Record<string, string> {
  return {
    position: 'absolute',
    left: `calc(${pct(f.x)} + 1px)`,
    top: `calc(${pct(f.y)} + ${TILE_HEADER_PX + 1}px)`,
    width: `calc(${pct(f.w)} - 2px)`,
    height: `calc(${pct(f.h)} - ${TILE_HEADER_PX + 2}px)`,
  };
}

export const isTileLayout = (v: unknown): v is TileLayout => typeof v === 'string' && (TILE_LAYOUTS as readonly string[]).includes(v);

export interface TilesState {
  layout: TileLayout;
  /** Id záložky v každej dlaždici; null = prázdna dlaždica (výber záložky). */
  tiles: (string | null)[];
}

export const singleTiles = (): TilesState => ({ layout: 'single', tiles: [] });
export const isTiled = (t: TilesState) => t.layout !== 'single';

const tabOf = (s: ViewTabsState, id: string | null) => (id ? s.tabs.find((t) => t.id === id) : undefined);

/**
 * Rozloženie s dlaždicami. `requested[i]`: id záložky, null = prázdna, undefined =
 * doplniť. Doplní sa z doterajších dlaždíc, aktívnej, tej vedľa a ostatných
 * otvorených v poradí lišty; jedna záložka je najviac v jednej dlaždici.
 */
export function layoutTiles(
  s: ViewTabsState,
  prev: TilesState,
  layout: TileLayout,
  requested: readonly (string | null | undefined)[] = [],
): TilesState {
  if (layout === 'single') return singleTiles();
  const n = TILE_RECTS[layout].length;
  const used = new Set<string>();
  const out: (string | null | undefined)[] = [];
  for (let i = 0; i < n; i++) {
    const id = requested[i];
    if (id && tabOf(s, id) && !used.has(id)) {
      used.add(id);
      out.push(id);
    } else {
      out.push(id === null ? null : undefined);
    }
  }
  const pool = [...prev.tiles, s.activeId, s.besideId, ...s.tabs.map((t) => t.id)]
    .filter((id): id is string => !!id && !!tabOf(s, id));
  const tiles = out.map((id) => {
    if (id !== undefined) return id;
    const next = pool.find((p) => !used.has(p));
    if (!next) return null;
    used.add(next);
    return next;
  });
  return { layout, tiles };
}

/**
 * Kam dať záložku, ktorá ešte nie je v dlaždici: prázdna dlaždica, potom dlaždica
 * rovnakého druhu (dokument za dokument, 3D za 3D) mimo živej 3D, potom
 * posledná mimo živej 3D.
 */
export function placeTab(s: ViewTabsState, t: TilesState, id: string, liveId: string | null): TilesState {
  if (!isTiled(t) || t.tiles.includes(id) || !tabOf(s, id)) return t;
  const scene = isSceneTab(tabOf(s, id));
  let idx = t.tiles.indexOf(null);
  if (idx < 0) idx = lastIndex(t.tiles, (x) => x !== liveId && isSceneTab(tabOf(s, x)) === scene);
  if (idx < 0) idx = lastIndex(t.tiles, (x) => x !== liveId);
  if (idx < 0) idx = t.tiles.length - 1;
  return { ...t, tiles: t.tiles.map((x, i) => (i === idx ? id : x)) };
}

function lastIndex<T>(xs: readonly T[], ok: (x: T) => boolean): number {
  for (let i = xs.length - 1; i >= 0; i--) if (ok(xs[i])) return i;
  return -1;
}

/** Rozloženie o jednu dlaždicu väčšie (D-161, "Otvoriť v novej dlaždici"); `grid4` je strop. */
export const GROW_LAYOUT: Record<TileLayout, TileLayout> = {
  single: 'split_h', split_h: 'three_left', split_v: 'three_top',
  three_left: 'grid4', three_right: 'grid4', three_top: 'grid4', three_bottom: 'grid4', three_h: 'grid4', three_v: 'grid4',
  grid4: 'grid4',
};

/**
 * Záložka do novej dlaždice: prázdna dlaždica, inak väčšie rozloženie (doterajšie dlaždice ostanú
 * na svojich indexoch, nová je posledná), pri `grid4` nahradí poslednú mimo živej 3D.
 */
export function addTile(s: ViewTabsState, t: TilesState, id: string, liveId: string | null): TilesState {
  if (!tabOf(s, id)) return t;
  if (t.tiles.includes(id)) return t;
  if (!isTiled(t)) return { layout: 'split_h', tiles: [s.activeId, id] };
  if (t.tiles.includes(null)) return placeTab(s, t, id, liveId);
  const layout = GROW_LAYOUT[t.layout];
  if (layout === t.layout) return placeTab(s, t, id, liveId);
  return { layout, tiles: [...t.tiles, id] };
}

/** Záložka do konkrétnej dlaždice; keď už je v inej, dlaždice sa vymenia. */
export function setTile(s: ViewTabsState, t: TilesState, index: number, id: string | null): TilesState {
  if (!isTiled(t) || index < 0 || index >= t.tiles.length) return t;
  if (id !== null && !tabOf(s, id)) return t;
  const from = id === null ? -1 : t.tiles.indexOf(id);
  const tiles = [...t.tiles];
  if (from >= 0) tiles[from] = tiles[index];
  tiles[index] = id;
  return { ...t, tiles };
}

/**
 * Po zmene záložiek: zavreté zmiznú (dlaždicu dostane neukázaná otvorená
 * záložka, inak ostane prázdna) a aktívna záložka mimo dlaždíc sa do jednej dá.
 */
export function reconcileTiles(s: ViewTabsState, t: TilesState, liveId: string | null): TilesState {
  if (!isTiled(t)) return t;
  const open = (id: string | null) => !!tabOf(s, id);
  const kept = t.tiles.map((id) => (open(id) ? id : null));
  const used = new Set(kept.filter((id): id is string => id !== null));
  const spare = s.tabs.map((x) => x.id).filter((id) => !used.has(id) && id !== s.activeId);
  const tiles = kept.map((id, i) => {
    if (id !== null || t.tiles[i] === null) return id;
    return spare.shift() ?? null;
  });
  return placeTab(s, { ...t, tiles }, s.activeId, liveId);
}

/**
 * Ktorá záložka má byť v 3D canvase pri dlaždiciach: aktívna 3D záložka,
 * inak doterajšia, ak je v dlaždici, inak prvá 3D dlaždica, inak doterajšia.
 */
export function tileScene(s: ViewTabsState, t: TilesState, current: string): string {
  const active = tabOf(s, s.activeId);
  if (isSceneTab(active)) return active!.id;
  if (t.tiles.includes(current)) return current;
  const first = t.tiles.find((id) => isSceneTab(tabOf(s, id)));
  return first ?? current;
}

/** Index dlaždice so živým 3D canvasom, alebo -1 (3D nie je v rozložení). */
export const liveTile = (t: TilesState, sceneId: string) => (isTiled(t) ? t.tiles.indexOf(sceneId) : -1);

/** `view_state.layout` (AIM D-157): rozloženie, dlaždice a živá 3D dlaždica. */
export function describeLayout(s: ViewTabsState, t: TilesState, sceneId: string) {
  if (!isTiled(t)) return { kind: 'single' as TileLayout };
  const live = liveTile(t, sceneId);
  return {
    kind: t.layout,
    tiles: t.tiles.map((id, index) => {
      const tab: ViewTab | undefined = tabOf(s, id);
      return {
        index,
        tab: id,
        ...(tab ? { label: tab.label, kind: tab.kind } : {}),
        // Pohľad z Presentation v dlaždici (D-161).
        ...(tab?.viewId ? { view_id: tab.viewId, view: tab.label } : {}),
        // 3D dlaždica mimo živej ukazuje snímku, kým na ňu používateľ neklikne.
        ...(tab && isSceneTab(tab) ? { live: index === live } : {}),
      };
    }),
    live_tab: live >= 0 ? sceneId : null,
  };
}
