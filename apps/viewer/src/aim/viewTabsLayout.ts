/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Záložky viewera (AIM D-132, od D-161 3D, dokumenty a pohľady v dlaždiciach): typy, počiatočný stav a rozloženie strednej
 * plochy. Malý modul vo vstupnom balíku (`ViewerLayout` -> `useAimCenterPanes`);
 * ostatná logika záložiek (`viewTabsPlan.ts`) sa načíta lenivo s lištou.
 */

/** `req` = karta knižnice požiadaviek (D-182), plocha ako dokument, bez dlaždíc. */
export type ViewTabKind = '3d' | 'doc' | 'view' | 'req';

export interface ViewTab {
  id: string;
  kind: ViewTabKind;
  label: string;
  /** Karta dokumentu: id dokumentu v `viewerDocuments`. */
  docId?: string;
  /** Pohľad z Presentation (D-161, dlaždice): `BasketView.id`. Záložka žije len v dlaždici. */
  viewId?: string;
}

export interface ViewTabsState {
  tabs: ViewTab[];
  activeId: string;
  /** Záložka vedľa aktívnej ("Vedľa"); null = aktívna na celú plochu. */
  besideId: string | null;
}

export const TAB_3D: ViewTab = { id: '3d', kind: '3d', label: '3D' };

/** Karta knižnice požiadaviek (D-182): jedna, otvára ju tlačidlo v ribbone AIM. */
export const REQ_TAB: ViewTab = { id: 'req', kind: 'req', label: 'Requirements library' };

export const initialTabs = (): ViewTabsState => ({ tabs: [TAB_3D], activeId: TAB_3D.id, besideId: null });

/** 3D záložky (`3d`, pohľad z Presentation v dlaždici) zdieľajú jeden canvas. */
export const isSceneTab = (t: ViewTab | undefined) => !!t && t.kind !== 'doc' && t.kind !== 'req';
/** Záložka v paneli vedľa 3D (dokument alebo knižnica požiadaviek). */
export const isPaneTab = (t: ViewTab | undefined) => !!t && (t.kind === 'doc' || t.kind === 'req');

const byId = (s: ViewTabsState, id: string | null) => (id ? s.tabs.find((t) => t.id === id) : undefined);

/** Rozloženie strednej plochy pre `ViewerLayout` (AIM-FORK blok, `useAimCenterPanes`). */
export interface CenterLayout {
  /** 3D canvas zbalený (dokument na celú plochu). */
  collapse3d: boolean;
  /** Panel dokumentu viditeľný (aktívny alebo vedľa). */
  docPane: boolean;
  /** Dokument, ktorý má panel ukázať. */
  docId: string | null;
  /** Panel ukazuje knižnicu požiadaviek (D-182) namiesto dokumentu. */
  library: boolean;
}

/** Dlaždice (AIM D-157) platia mimo mobilu; jedno miesto pre `useAimCenterPanes` aj `AimCenterPane`. */
export const isTiled = (layout: string, isMobile: boolean): boolean => layout !== 'single' && !isMobile;

/** `tiled` (AIM D-157): pri dlaždiciach je 3D panel na celú plochu a dlaždice kreslí `AimTileGrid`. */
export function centerLayout(s: ViewTabsState, tiled = false): CenterLayout {
  if (tiled) return { collapse3d: false, docPane: false, docId: null, library: false };
  const active = byId(s, s.activeId);
  const beside = byId(s, s.besideId);
  const pane = isPaneTab(active) ? active : isPaneTab(beside) ? beside : undefined;
  return {
    collapse3d: isPaneTab(active) && !beside,
    docPane: !!pane,
    docId: pane?.kind === 'doc' ? pane.docId ?? null : null,
    library: pane?.kind === 'req',
  };
}
