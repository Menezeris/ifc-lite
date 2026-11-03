/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav overenia výmer pre vybraný prvok (AIM D-185 UI). Malý store vo vstupnom balíku, aby ho fajočka pri riadku
 * veličiny čítala bez lenivého načítania; žiadosti na hosta, kóty a detail sú v lenivom `aimVerify.ts`.
 */

import { create } from 'zustand';
import type { VerifyElementWire, VerifyRunAllWire } from './verify-protocol.js';

/** Kontroly v ribbone (skupina Overovanie); ďalšie sa pridajú sem a do registra hosta. Tu, nie v protokole,
 *  aby vstupný balík nenesol overovanie tvaru správ. */
export const VERIFY_CHECKS = [
  { id: 'space_quantities', label: 'Výmery miestností (IfcSpace)', ifcTypes: ['IFCSPACE'] },
] as const;
export type VerifyCheckId = (typeof VERIFY_CHECKS)[number]['id'];

/** Prvok, ktorý pokrýva niektorá kontrola (IFC trieda bez ohľadu na veľkosť písmen). */
export const isVerifiable = (entityType: string | undefined): boolean =>
  !!entityType && VERIFY_CHECKS.some((c) => (c.ifcTypes as readonly string[]).includes(entityType.toUpperCase()));


export interface AimVerifyState {
  /** GlobalId prvku, ku ktorému patrí výsledok (alebo prebiehajúca žiadosť). */
  guid: string | null;
  /** Vybraný prvok, ktorého výmery ukazuje panel (nastaví most pri výbere); fajočky len keď sa zhoduje s `guid`. */
  panelGuid: string | null;
  status: 'idle' | 'loading' | 'running' | 'ready' | 'error';
  data: VerifyElementWire | null;
  error: string | null;
  /** Rozbalený detail: `Qto_X.Name`. */
  open: string | null;
  /** Veličiny so zapnutou kótou (očko pri riadku), aby šlo ukázať viac kót naraz; rozbalený detail ju má vždy. */
  shown: string[];
  /** Miestnosť odznačená v scéne pri rozbalení detailu (pripomienka 4): panel vlastností ostane na nej, kým sa
   *  výber nezmení. Platí len kým `panelGuid` (prvok panela) je ten istý. */
  pinned: string | null;
  /** Beh celého modelu z ribbonu. */
  runAll: { check: string; busy: boolean; result: VerifyRunAllWire | null; error: string | null } | null;
}

export const useAimVerify = create<AimVerifyState>()(() => ({
  guid: null, panelGuid: null, status: 'idle', data: null, error: null, open: null, shown: [], pinned: null, runAll: null,
}));

/** `frame: false` = zvýrazniť bez rámovania kamery. */
type Focus = (guids: string[], frame?: boolean) => void;
let focus: Focus | null = null;
/** `AimBridge` podá zvýraznenie (tá istá cesta ako `FOCUS` od hosta); prázdny zoznam ho zruší. */
export const setVerifyFocus = (next: Focus | null): void => { focus = next; };
export const verifyFocus = (): Focus | null => focus;

/** Panel vlastností ostane na prvku, ktorý overenie odznačilo v scéne (`PropertiesPanel`, AIM-FORK). */
export const useAimPanelPinned = (): boolean => useAimVerify((s) => s.pinned !== null && s.pinned === s.panelGuid);

/** Riadok `Qto_X.Name` má výsledok overenia (len vtedy sa načíta lenivá fajočka). */
export const hasTarget = (s: AimVerifyState, key: string): boolean =>
  s.panelGuid !== null && s.data?.global_id === s.panelGuid && s.data.targets.some((t) => t.target === key);
