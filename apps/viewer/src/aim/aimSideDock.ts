/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ktoré bočné panely sú naozaj vidno v pravom stĺpci (AIM #212). Jediný zdroj pre
 * zvýraznenie ikon v ráile (`usePanelControls`) aj pre stav panelov v `view_state`
 * a `APPLIED` (`aimPanelsPlan.ts`), aby sa ikona a hlásený stav nerozišli, nech sa
 * panel zatvoril klikom, skratkou alebo cez `SET_PANELS`. Zbalený stĺpec nezobrazuje nič.
 */

export interface SideDockInput {
  sidebarMode: string;
  sidebarActivePanel: string;
  sidebarSecondaryPanel: string | null;
  /** Panely v plávajúcom okne alebo samostatnom okne (stĺpec ich nezobrazuje). */
  detached: ReadonlySet<string>;
}

export interface SideDocked {
  primary: string | null;
  secondary: string | null;
}

/**
 * Primárny panel stĺpca je aktívny, ak nie je odpojený; inak stĺpec padne späť na
 * vlastnosti (zrkadlí `SidebarPanelHost`). Dolná polovica splitu platí, ak je iná ako
 * primárny a nie je odpojená.
 */
export function sideDockedPanels(s: SideDockInput): SideDocked {
  if (s.sidebarMode === 'collapsed') return { primary: null, secondary: null };
  let primary: string | null = null;
  if (!s.detached.has(s.sidebarActivePanel)) primary = s.sidebarActivePanel;
  else if (!s.detached.has('properties')) primary = 'properties';
  const sec = s.sidebarSecondaryPanel;
  const secondary = sec && sec !== primary && !s.detached.has(sec) ? sec : null;
  return { primary, secondary };
}
