/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Kóty od hosta v nástroji Measure (AIM D-124) bez väzby na store viewera:
 * prevod IFC svet -> render rámec a pamäť kót od hosta. Store dosadí
 * `measureShow.ts`; test ho dáva zo `createMeasurementSlice`.
 */

import type { MeasurePoint, Measurement } from '@/store/types';
import type { ViewInboundMessage } from './view-protocol.js';
import { ifcPointToRender, type Vec3 } from './viewFrame.js';

export type MeasureMessage = Extract<ViewInboundMessage, { type: 'MEASURE_SHOW' }>;

/** Časť store, ktorú kóta potrebuje (test ju dáva zo `createMeasurementSlice`). */
export interface MeasureStore {
  measurements: Measurement[];
  pendingMeasurePoint: MeasurePoint | null;
  addMeasurePoint: (point: MeasurePoint) => void;
  completeMeasurement: (endPoint: MeasurePoint) => void;
  deleteMeasurement: (id: string) => void;
}

/** Merania vložené hostom; ďalší `MEASURE_SHOW` bez `keep` ich zmaže. */
let hostIds: string[] = [];

const at = (p: Vec3): MeasurePoint => ({ ...p, screenX: 0, screenY: 0 });

/**
 * Vloží úseky (IFC svet) ako merania; vráti id nových meraní. Rozpracovaný bod
 * používateľa (`pendingMeasurePoint`) ostane, `completeMeasurement` ho inak spotrebuje.
 */
export function addHostMeasurements(
  get: () => MeasureStore,
  setPending: (p: MeasurePoint | null) => void,
  msg: Pick<MeasureMessage, 'segments' | 'keep'>,
  offset: Vec3,
): string[] {
  if (!msg.keep) {
    const present = new Set(get().measurements.map((m) => m.id));
    for (const id of hostIds) if (present.has(id)) get().deleteMeasurement(id);
    hostIds = [];
  }
  const pending = get().pendingMeasurePoint;
  const added: string[] = [];
  for (const seg of msg.segments) {
    get().addMeasurePoint(at(ifcPointToRender(seg.a, offset)));
    get().completeMeasurement(at(ifcPointToRender(seg.b, offset)));
    const last = get().measurements.at(-1);
    if (last) added.push(last.id);
  }
  setPending(pending);
  hostIds.push(...added);
  return added;
}
