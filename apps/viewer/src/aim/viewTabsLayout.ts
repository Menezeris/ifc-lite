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

export function centerLayout(s: ViewTabsState): CenterLayout {
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
