/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Záložky viewera (AIM D-132): typy, počiatočný stav a rozloženie strednej
 * plochy. Malý modul vo vstupnom balíku (`ViewerLayout` -> `useAimCenterPanes`);
 * ostatná logika záložiek (`viewTabsPlan.ts`) sa načíta lenivo s lištou.
 */

export type ViewTabKind = '3d' | 'plan' | 'view' | 'doc';

export interface ViewTab {
  id: string;
  kind: ViewTabKind;
  label: string;
  /** Pôdorys: GlobalId podlažia. */
  storeyGuid?: string;
  /** Karta dokumentu: id dokumentu v `viewerDocuments`. */
  docId?: string;
  /** Uložený pohľad: kamera zamknutá (ťahanie posúva, neotáča). */
  locked?: boolean;
}

export interface ViewTabsState {
  tabs: ViewTab[];
  activeId: string;
  /** Záložka vedľa aktívnej ("Vedľa"); null = aktívna na celú plochu. */
  besideId: string | null;
}

export const TAB_3D: ViewTab = { id: '3d', kind: '3d', label: '3D' };

export const initialTabs = (): ViewTabsState => ({ tabs: [TAB_3D], activeId: TAB_3D.id, besideId: null });

/** 3D záložky zdieľajú jeden canvas (3d, pôdorys, uložený pohľad). */
export const isSceneTab = (t: ViewTab | undefined) => !!t && t.kind !== 'doc';

const byId = (s: ViewTabsState, id: string | null) => (id ? s.tabs.find((t) => t.id === id) : undefined);

/** Rozloženie strednej plochy pre `ViewerLayout` (AIM-FORK blok, `useAimCenterPanes`). */
export interface CenterLayout {
  /** 3D canvas zbalený (dokument na celú plochu). */
  collapse3d: boolean;
  /** Panel dokumentu viditeľný (aktívny alebo vedľa). */
  docPane: boolean;
  /** Dokument, ktorý má panel ukázať. */
  docId: string | null;
  /** Pôdorys ako 2D panel plánu vedľa voľnej 3D (D-072 split). */
  planBeside: string | null;
}

/** `tiled` (AIM D-157): pri dlaždiciach je 3D panel na celú plochu a dlaždice kreslí `AimTileGrid`. */
export function centerLayout(s: ViewTabsState, tiled = false): CenterLayout {
  if (tiled) return { collapse3d: false, docPane: false, docId: null, planBeside: null };
  const active = byId(s, s.activeId);
  const beside = byId(s, s.besideId);
  const doc = active?.kind === 'doc' ? active : beside?.kind === 'doc' ? beside : undefined;
  return {
    collapse3d: active?.kind === 'doc' && !beside,
    docPane: !!doc,
    docId: doc?.docId ?? null,
    // Len vedľa voľnej 3D; pri dokumente je pôdorys sám 3D stranou (zamknutý pohľad v canvase).
    planBeside: active?.kind === '3d' && beside?.kind === 'plan' ? (beside.storeyGuid ?? null) : null,
  };
}

/** Výška hlavičky dlaždice (menovka a výber záložky) v px; 3D canvas začína pod ňou (AIM D-157). */
export const TILE_HEADER_PX = 24;

/** Obdĺžnik dlaždice v zlomkoch strednej plochy (`viewTilesPlan.ts`). */
export interface TileFrame { x: number; y: number; w: number; h: number }

const pct = (v: number) => `${Math.round(v * 1e4) / 100}%`;

/**
 * Poloha 3D canvasu v živej dlaždici: pod hlavičkou, 1 px od okraja (deliaca čiara
 * dlaždíc). null = celá plocha, bez polohovania.
 */
export function tileFrameStyle(f: TileFrame | null): Record<string, string> | undefined {
  if (!f) return undefined;
  return {
    position: 'absolute',
    left: `calc(${pct(f.x)} + 1px)`,
    top: `calc(${pct(f.y)} + ${TILE_HEADER_PX + 1}px)`,
    width: `calc(${pct(f.w)} - 2px)`,
    height: `calc(${pct(f.h)} - ${TILE_HEADER_PX + 2}px)`,
  };
}
