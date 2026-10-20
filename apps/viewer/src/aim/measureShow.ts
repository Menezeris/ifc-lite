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
import { addHostMeasurements, type MeasureMessage } from './hostMeasurements.js';

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
