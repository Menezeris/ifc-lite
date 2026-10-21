/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav AIM karty v paneli vlastností (D-077; od AIM D-127 bez prepínača AIM | IFC,
 * karta je zbalený blok nad IFC obsahom) a výsledok zvýraznenia vlastnosti z chatu
 * (AIM D-113, D-127), bez UI: číta ho `AimInspectorTabs`, lenivý `aimPanelView`
 * aj `view_state` (APPLIED), takže lenivé moduly nepotiahnu komponent karty.
 */

import { create } from 'zustand';
import type { PropertyFocusTarget } from '../store/slices/uiSlice.js';

/** Zvýraznená vlastnosť z chatu (AIM D-127): kde sa našla, alebo že na prvku nie je. */
export interface PropertyFocusState {
  pset: string;
  property: string;
  found: boolean;
  section?: 'properties' | 'quantities';
  /** true = riadok je v psete zdedenom z typu. */
  from_type?: boolean;
}

interface AimInspectorState {
  /** AIM karta nad IFC obsahom: predvolene zbalená (AIM D-127). */
  cardOpen: boolean;
  setCardOpen: (open: boolean) => void;
  propertyFocus: PropertyFocusState | null;
  setPropertyFocus: (focus: PropertyFocusState | null) => void;
}

export const useAimInspectorStore = create<AimInspectorState>((set) => ({
  cardOpen: false,
  setCardOpen: (cardOpen) => set({ cardOpen }),
  propertyFocus: null,
  setPropertyFocus: (propertyFocus) => set({ propertyFocus }),
}));

/**
 * Focus vlastnosti z chatu len zvýrazní riadok. Upstream `pendingPropertyFocus`
 * (skok z bSDD karty) zapína režim úprav; tento objekt ho zapínať nemá, preto
 * ho panel spozná podľa identity (WeakSet, nič sa nepridáva do typu upstreamu).
 */
const readOnlyFocus = new WeakSet<PropertyFocusTarget>();

export function markReadOnlyFocus(focus: PropertyFocusTarget): PropertyFocusTarget {
  readOnlyFocus.add(focus);
  return focus;
}

export function isReadOnlyFocus(focus: PropertyFocusTarget): boolean {
  return readOnlyFocus.has(focus);
}
