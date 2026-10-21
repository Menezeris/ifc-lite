/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výsledok zvýraznenia vlastnosti z chatu (AIM D-113, D-127) a značka "focus z
 * chatu", bez UI: zapisuje ho lenivý `aimPanelView`, číta `view_state` (APPLIED).
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
  propertyFocus: PropertyFocusState | null;
  setPropertyFocus: (focus: PropertyFocusState | null) => void;
}

export const useAimInspectorStore = create<AimInspectorState>((set) => ({
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
