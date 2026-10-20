/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Stav prepínača AIM | IFC (D-077) a značka "focus z chatu" (AIM D-113), bez
 * UI: číta ho `AimInspectorTabs` aj lenivý `visibility-commands` (SELECT s
 * `panel`), takže lenivý modul nepotiahne komponent záložiek.
 */

import { create } from 'zustand';
import type { PropertyFocusTarget } from '../store/slices/uiSlice.js';

export type InspectorTab = 'aim' | 'ifc';

interface AimInspectorState {
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
}

export const useAimInspectorStore = create<AimInspectorState>((set) => ({
  tab: 'aim',
  setTab: (tab) => set({ tab }),
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
