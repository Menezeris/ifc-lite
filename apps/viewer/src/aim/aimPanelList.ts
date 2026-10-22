/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zoznam panelov pre chat (AIM D-150, #179), odvodený z registra panelov upstreamu
 * (`WORKSPACE_PANELS`), nie z ručného zoznamu: nový panel v UI sa tu objaví sám a
 * test (`aimPanelList.test.ts`) stráži, že žiadny nechýba.
 *
 * Meno na drôte = id v registri; výnimky sú historické mená z D-127, ktoré host už
 * používa (`underlays` -> `drawing-underlay`, `model_tree` -> `hierarchy`). Klávesová
 * skratka je Alt+N podľa poradia v registri (prvých desať, 1-9 a 0), rovnako ako
 * `ActivityBar` (`ALT_KEY`).
 */

import { WORKSPACE_PANELS, type PanelRegion, type WorkspacePanelId } from '@/lib/panels/registry';

/** Historické mená z D-127 (host ich pozná): meno na drôte -> id v registri. */
const LEGACY_WIRE: Readonly<Record<string, WorkspacePanelId>> = {
  underlays: 'drawing-underlay',
  model_tree: 'hierarchy',
};

const WIRE_OF = new Map<WorkspacePanelId, string>(Object.entries(LEGACY_WIRE).map(([wire, id]) => [id, wire]));

/** Meno panela na drôte pre id v registri. */
export const wireName = (id: WorkspacePanelId): string => WIRE_OF.get(id) ?? id;

/** Mená všetkých panelov UI na drôte, v poradí registra. */
export const PANEL_KEYS: readonly string[] = WORKSPACE_PANELS.map((p) => wireName(p.id));
export type PanelKey = string;

const ID_OF = new Map<string, WorkspacePanelId>(WORKSPACE_PANELS.map((p) => [wireName(p.id), p.id]));

export const isPanelKey = (k: string): boolean => ID_OF.has(k);

/** Panel upstreamu (`WorkspacePanelId`) pre meno na drôte. */
export function panelIdOf(key: PanelKey): WorkspacePanelId {
  const id = ID_OF.get(key);
  if (!id) throw new Error(`Neznámy panel '${key}'`);
  return id;
}

/** Alt+N podľa poradia v registri (1-9, potom 0); ďalšie panely skratku nemajú. */
export function shortcutOf(id: WorkspacePanelId): string | undefined {
  const i = WORKSPACE_PANELS.findIndex((p) => p.id === id);
  return i >= 0 && i < 10 ? `Alt+${i < 9 ? i + 1 : 0}` : undefined;
}

export interface PanelCatalogRow {
  key: PanelKey;
  /** Kde sa otvára: side = pravý stĺpec, bottom = spodný pás, left = ľavý stĺpec. */
  home: PanelRegion;
  shortcut?: string;
}

/** Katalóg panelov (meno, domov, skratka) pre `view_state`. */
export function panelCatalog(): PanelCatalogRow[] {
  return WORKSPACE_PANELS.map((p) => {
    const shortcut = shortcutOf(p.id);
    return { key: wireName(p.id), home: p.region, ...(shortcut ? { shortcut } : {}) };
  });
}
