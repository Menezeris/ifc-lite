/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Záložky viewera (AIM D-132, od D-161 len 3D a dokumenty): typy, počiatočný stav a rozloženie strednej
 * plochy. Malý modul vo vstupnom balíku (`ViewerLayout` -> `useAimCenterPanes`);
 * ostatná logika záložiek (`viewTabsPlan.ts`) sa načíta lenivo s lištou.
 */

export type ViewTabKind = '3d' | 'doc';

export interface ViewTab {
  id: string;
  kind: ViewTabKind;
  label: string;
  /** Karta dokumentu: id dokumentu v `viewerDocuments`. */
  docId?: string;
}

export interface ViewTabsState {
  tabs: ViewTab[];
  activeId: string;
  /** Záložka vedľa aktívnej ("Vedľa"); null = aktívna na celú plochu. */
  besideId: string | null;
}

export const TAB_3D: ViewTab = { id: '3d', kind: '3d', label: '3D' };

export const initialTabs = (): ViewTabsState => ({ tabs: [TAB_3D], activeId: TAB_3D.id, besideId: null });

/** 3D záložky zdieľajú jeden canvas (dnes len `3d`; pohľady z Presentation sa v ňom aktivujú bez záložky). */
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
}

/** `tiled` (AIM D-157): pri dlaždiciach je 3D panel na celú plochu a dlaždice kreslí `AimTileGrid`. */
export function centerLayout(s: ViewTabsState, tiled = false): CenterLayout {
  if (tiled) return { collapse3d: false, docPane: false, docId: null };
  const active = byId(s, s.activeId);
  const beside = byId(s, s.besideId);
  const doc = active?.kind === 'doc' ? active : beside?.kind === 'doc' ? beside : undefined;
  return {
    collapse3d: active?.kind === 'doc' && !beside,
    docPane: !!doc,
    docId: doc?.docId ?? null,
  };
}
