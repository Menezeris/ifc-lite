/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výplne podstavy miestností v 3D (AIM D-125 doplnok, #175). Počíta ich lenivá
 * vrstva `AimRoomFill3d`; `useViewportSymbolicUploads` (blok AIM-FORK) ich pridá
 * k výplniam IfcAnnotation, lebo renderer má na výplne jeden kanál. Samostatný
 * malý store (ako `capturePinsStore`), aby eager kód neťahal výpočet.
 */

import { create } from 'zustand';
import type { RoomFill3d } from './aimRoomFill3d.js';

interface AimRoomFill3dState {
  fills: readonly RoomFill3d[];
  setFills: (fills: readonly RoomFill3d[]) => void;
}

const NONE: readonly RoomFill3d[] = [];

export const useAimRoomFill3dStore = create<AimRoomFill3dState>((set) => ({
  fills: NONE,
  setFills: (fills) => set((s) => (fills.length === 0 && s.fills.length === 0 ? s : { fills: fills.length === 0 ? NONE : fills })),
}));
