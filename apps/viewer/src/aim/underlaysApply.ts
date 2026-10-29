/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Store glue pre podklady v 3D (AIM #323, #325): `SET_UNDERLAYS_3D` z chatu, stav pre `get_viewer_state`
 * a pre uložený pohľad. Výpočty sú v `underlaysPlan.ts`.
 */

import { useViewerStore } from '@/store';
import { useAimUnderlays3d } from './aimUnderlays3d.js';
import {
  calibratedDrawings, describeUnderlays, planUnderlaySet, restoreUnderlays, snapshotUnderlays,
  type UnderlayItemWire, type UnderlaysViewWire,
} from './underlaysPlan.js';

interface UnderlaySetMessage {
  show?: boolean;
  underlays?: UnderlayItemWire[];
  only?: boolean;
  persist?: boolean;
}

const drawings = () => calibratedDrawings(useViewerStore.getState().underlayDrawings);

/**
 * `SET_UNDERLAYS_3D`: prepínač 3D a prepisy jednotlivých podkladov. `persist` zapíše `visible` a `opacity`
 * do kalibrácie cez uloženie hostovi (celý doterajší placement, poloha ostane) a prepis toho podkladu zruší.
 */
export function applyUnderlaySet(msg: UnderlaySetMessage, noteIssue: (text: string) => void): void {
  const u = useAimUnderlays3d.getState();
  if (msg.show !== undefined) u.setShown(msg.show);
  if (!msg.underlays) return;
  const { overrides, unknown } = planUnderlaySet(drawings(), u.overrides, msg.underlays, msg.only === true);
  if (unknown.length > 0) noteIssue(`SET_UNDERLAYS_3D: podklad ${unknown.join(', ')} nie je medzi kalibrovanými vo vieweri`);
  if (msg.persist) {
    const store = useViewerStore.getState();
    for (const it of msg.underlays) {
      const placement = store.underlayDrawings.get(it.document_id)?.placement;
      const o = overrides[it.document_id];
      if (!placement || !o) continue;
      store.updateUnderlayPlacementLive(it.document_id, { ...placement, visible: o.visible ?? placement.visible, opacity: o.opacity ?? placement.opacity });
      store.commitUnderlayPlacement(it.document_id);
      delete overrides[it.document_id];
    }
  }
  u.setOverrides(overrides);
}

/** Kalibrované podklady a ich stav v 3D (`get_viewer_state.underlays`). */
export function underlaysState() {
  return describeUnderlays(drawings(), useAimUnderlays3d.getState().overrides);
}

/** Stav podkladov pre uložený pohľad; bez kalibrovaných podkladov nič (pohľad ich potom pri obnove nemení). */
export function captureUnderlays(): UnderlaysViewWire | undefined {
  const list = drawings();
  if (list.length === 0) return undefined;
  const u = useAimUnderlays3d.getState();
  return snapshotUnderlays(list, u.overrides, !u.hidden);
}

/** Obnova stavu podkladov z uloženého pohľadu. */
export function restoreUnderlaysView(w: UnderlaysViewWire): void {
  const { shown, overrides } = restoreUnderlays(w);
  const u = useAimUnderlays3d.getState();
  u.setOverrides(overrides);
  u.setShown(shown);
}
