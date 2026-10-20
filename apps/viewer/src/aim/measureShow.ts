/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Kóta od hosta (AIM D-124): `MEASURE_SHOW` vloží úseky do nástroja Measure
 * ako hotové merania, tou istou cestou ako dva kliky (`addMeasurePoint` +
 * `completeMeasurement`). Kreslí ich upstream `MeasurementSceneLayer` aj bez
 * otvoreného nástroja, so vzdialenosťou a jednotkami viewera; vlastný renderer
 * tu nie je (D-098). Body chodia v IFC svete (Z hore, m) a prevedú sa do render
 * rámca ako póza kamery od hosta. Kóty od hosta si modul pamätá: ďalšia správa
 * bez `keep` ich nahradí, merania používateľa nechá. Lenivý modul.
 */

import { useViewerStore } from '@/store';
import { bcfWorldOffset } from '@/hooks/bcf/viewpoint-world-frame';
import type { MeasurePoint, Measurement } from '@/store/types';
import type { ViewInboundMessage } from './view-protocol.js';
import { ifcPointToRender, type Vec3 } from './viewFrame.js';

type MeasureMessage = Extract<ViewInboundMessage, { type: 'MEASURE_SHOW' }>;

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

export function showMeasurements(msg: MeasureMessage): void {
  const state = useViewerStore.getState();
  addHostMeasurements(
    () => useViewerStore.getState(),
    (p) => useViewerStore.setState({ pendingMeasurePoint: p }),
    msg,
    bcfWorldOffset(state.models, state.geometryResult),
  );
  // Čiary kreslí overlay zo `screenX/Y`; slučka ich prepočíta až pri pohybe kamery.
  const project = state.cameraCallbacks.projectToScreen;
  if (project) useViewerStore.getState().updateMeasurementScreenCoords(project);
}
