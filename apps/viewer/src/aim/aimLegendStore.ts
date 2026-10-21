/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Malá legenda AIM chat lens (AIM D-125, #178): `APPLY_LENS legend: compact`
 * ju zapne namiesto panelu Lens, `large` / `normal` a odpojenie mosta ju vypnú.
 * Samostatný store ako `capturePinsStore`: zdieľajú ho lenivé moduly Lens a
 * vrstvy nad scénou, vstupný balík ho neťahá.
 */

import { create } from 'zustand';

interface AimLegendState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export const useAimLegendStore = create<AimLegendState>((set) => ({
  visible: false,
  setVisible: (visible) => set({ visible }),
}));
