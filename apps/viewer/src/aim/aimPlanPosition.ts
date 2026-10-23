/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vypínač a posledná značka polohy kamery na PDF (AIM D-161 bod 8, #282). Stav viewera, nič sa
 * neukladá; po obnove stránky je zapnuté. `latest` drží značku, ktorú práve kreslí niektorá stránka
 * PDF (záložka alebo dlaždica), aby ju `get_viewer_state` vedel prečítať bez ďalšieho odberu kamery.
 */

import { create } from 'zustand';
import { describePlanMarkers, type PlanMarker } from './planPosition.js';

interface AimPlanPositionStore {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}

export const useAimPlanPosition = create<AimPlanPositionStore>((set) => ({
  enabled: true,
  setEnabled: (on) => set({ enabled: on }),
}));

const latest = new Map<string, { docId: string; page: number; marker: PlanMarker }>();

/** Stránka PDF hlási svoju značku (null = nekreslí sa); kľúč je `docId|page`. */
export function reportPlanMarker(docId: string, page: number, marker: PlanMarker | null): void {
  const key = `${docId}|${page}`;
  if (marker) latest.set(key, { docId, page, marker });
  else latest.delete(key);
}

export function planPositionState() {
  return describePlanMarkers(useAimPlanPosition.getState().enabled, [...latest.values()]);
}
