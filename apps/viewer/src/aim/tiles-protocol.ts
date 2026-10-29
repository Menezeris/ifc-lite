/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dlaždice z chatu (AIM D-157, #210): `VIEW_TABS` s akciou `layout` nastaví
 * rozloženie a záložku každej dlaždice. Vlastný modul (mimo `tabs-protocol.ts`,
 * ktorý číta aj vstupný balík), overuje ho až lenivé vykonanie záložiek.
 *
 * Dlaždica na drôte: `{tab}` = otvorená záložka (id, `3d`, menovka alebo GlobalId
 * podlažia), `{plan}` = pôdorys podlažia podľa GlobalId (otvorí sa, ak nie je),
 * `{view}` = pohľad z Presentation (id alebo meno, D-161), null = prázdna dlaždica. Chýbajúce dlaždice doplní viewer otvorenými záložkami.
 */

import { SOURCE } from './bridge-protocol.js';
import { SIZE_COUNT, TILE_RECTS, isTileLayout, type TileLayout } from './viewTilesPlan.js';

export type TileWire = { tab: string } | { plan: string } | { view: string } | null;

export interface TilesMessage {
  source: typeof SOURCE;
  type: 'VIEW_TABS';
  action: 'layout';
  layout: TileLayout;
  tiles?: TileWire[];
  /** Podiel prvej (veľkej) dlaždice 0 až 1 pri rozloženiach s dvojicou podielov (AIM #299); súčasne so `sizes` nie. */
  ratio?: number;
  /** Váhy strán (AIM #299): 2 pri `split_*` a `three_left/right/top/bottom` (veľká : zvyšok), 3 pri `three_h` / `three_v`; viewer ich normalizuje. */
  sizes?: number[];
}

const MAX_TEXT = 200;
const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;

function isTile(v: unknown): v is TileWire {
  if (v === null) return true;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  const o = v as Record<string, unknown>;
  if (keys.length !== 1) return false;
  return keys[0] === 'tab' ? isText(o.tab) : keys[0] === 'plan' ? isText(o.plan) : keys[0] === 'view' ? isText(o.view) : false;
}

export function isTilesMessage(data: unknown): data is TilesMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  if (m.source !== SOURCE || m.type !== 'VIEW_TABS' || m.action !== 'layout' || !isTileLayout(m.layout)) return false;
  const count = SIZE_COUNT[m.layout];
  if (m.sizes !== undefined && m.ratio !== undefined) return false;
  if (m.ratio !== undefined && (count !== 2 || typeof m.ratio !== 'number' || !(m.ratio > 0 && m.ratio < 1))) return false;
  if (m.sizes !== undefined && (count === 0 || !Array.isArray(m.sizes) || m.sizes.length !== count || !m.sizes.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e6))) return false;
  if (m.tiles === undefined) return true;
  return Array.isArray(m.tiles) && m.tiles.length <= TILE_RECTS[m.layout].length && m.tiles.every(isTile);
}
