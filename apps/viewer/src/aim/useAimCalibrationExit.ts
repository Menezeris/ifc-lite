/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zámok kamery po kalibrácii podkladu (AIM D-161). Tlačidlo Calibrate v paneli
 * Underlays zapne `enterDrawingView` (kolmo zhora, zamknuté, rez podlažia), aby sa dali
 * presne vybrať body na modeli. Po uložení ani zrušení kalibrácie ho nič nevypínalo:
 * vracala ho až záložka 3D, ktorá už neexistuje ako prepínač režimov. Teraz skončenie
 * kalibrácie zavolá `exitDrawingView` (zámok a rez preč), takže orbit funguje hneď.
 */

import { useEffect } from 'react';
import { useViewerStore } from '@/store';

/** Kalibrácia práve skončila (uložením aj zrušením) a pohľad zostal zamknutý. */
export function calibrationEndedLocked(prevCalibrating: boolean, calibrating: boolean, viewLocked: boolean): boolean {
  return prevCalibrating && !calibrating && viewLocked;
}

export function useAimCalibrationExit(exitDrawingView: () => void): void {
  useEffect(() => {
    let prev = useViewerStore.getState().underlayCalibration !== null;
    return useViewerStore.subscribe((s) => {
      const now = s.underlayCalibration !== null;
      const ended = calibrationEndedLocked(prev, now, s.underlayViewLocked);
      prev = now;
      if (ended) exitDrawingView();
    });
  }, [exitDrawingView]);
}
