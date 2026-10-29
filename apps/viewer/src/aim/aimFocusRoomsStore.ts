/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Miestnosti zvýraznené príkazom FOCUS (AIM #319), globalId. Zapisuje ich lenivý
 * `visibility-commands`, číta výplň `AimRoomFillLayer`; malý store (ako
 * `aimRoomFill3dStore`), aby eager kód neťahal lenivý modul.
 */

import { create } from 'zustand';

interface AimFocusRoomsState {
  ids: ReadonlySet<number>;
  color: string;
  setFocus: (ids: Iterable<number>, color: string) => void;
}

const NONE: ReadonlySet<number> = new Set();

export const useAimFocusRoomsStore = create<AimFocusRoomsState>((set) => ({
  ids: NONE,
  color: '#f97316',
  setFocus: (ids, color) => set((s) => {
    const next = new Set(ids);
    return next.size === 0 && s.ids.size === 0 ? s : { ids: next.size === 0 ? NONE : next, color };
  }),
}));
