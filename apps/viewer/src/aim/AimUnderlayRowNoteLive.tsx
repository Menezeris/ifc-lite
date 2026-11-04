/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Poznámka pri riadku podkladu (#280) so zamknutým pôdorysom čítaným zo store. Samostatný modul,
 * aby `DrawingUnderlayPanel.tsx` (na rozpočte veľkosti modulu) potreboval len import a jeden
 * riadok, a aby `AimUnderlays3dToggle.tsx` ostal bez store (test beží bez WASM). Oko riadku ukazuje a prepína
 * stav podkladu v 3D v tejto relácii (`useAimRowPlacement`, `toggleAimUnderlay`), nie uložené `visible`.
 */

import { useViewerStore } from '@/store';
import { AimUnderlayRowNote } from './AimUnderlays3dToggle.js';
import { useAimUnderlays3d } from './aimUnderlays3d.js';
import { underlayOn } from './underlaysPlan.js';

export function AimUnderlayRowNoteLive({ visible }: { visible: boolean }) {
  const viewLocked = useViewerStore((s) => s.underlayViewLocked);
  return <AimUnderlayRowNote visible={visible} viewLocked={viewLocked} />;
}

/** Placement riadku panela s `visible` = podklad je v 3D zapnutý v tejto relácii (pri štarte vypnutý). */
export function useAimRowPlacement<T extends { visible: boolean }>(placement: T | null, id: string): T | null {
  const on = useAimUnderlays3d((s) => underlayOn(s.overrides[id]));
  return placement && placement.visible !== on ? { ...placement, visible: on } : placement;
}

/** Oko riadku: prepne podklad v 3D v tejto relácii; kalibrácia v DB sa nemení. */
export function toggleAimUnderlay(id: string): void {
  const u = useAimUnderlays3d.getState();
  u.setUnderlayOn(id, !underlayOn(u.overrides[id]));
}
