/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ikona vlastností v ráile ako prepínač (AIM #243). Vlastnosti sú záloha pravého stĺpca,
 * preto ich `toggleWorkspacePanel` pri druhom kliku znova "otvorilo" (zavretie iného panela
 * padne späť na vlastnosti) a stĺpec ostal otvorený. Zavrieť ich znamená zbaliť stĺpec,
 * rovnako ako `SET_PANELS` (`aimPanels.ts`) a ako ikona hierarchie zbalí ľavý panel.
 */

import { sideDockedPanels, type SideDockInput } from './aimSideDock.js';

/** Klik na ikonu vlastností má zbaliť stĺpec, ak sú práve vidno ako primárny panel stĺpca. */
export function propertiesClickCollapses(id: string, s: SideDockInput): boolean {
  return id === 'properties' && sideDockedPanels(s).primary === 'properties';
}
