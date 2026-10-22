/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čiara trasy od hosta (AIM D-137): body v render rámci a farba. Samostatný
 * zustand store (ako `aimLegendStore`), kreslí ho `AimRouteLayer`.
 */

import { create } from 'zustand';

import type { Vec3 } from './viewFrame.js';

interface AimRouteState {
  /** Body lomenej čiary v render rámci; prázdne = žiadna čiara. */
  points: Vec3[];
  color: string;
  setRoute: (points: Vec3[], color: string) => void;
}

export const ROUTE_DEFAULT_COLOR = '#dc2626';

export const useAimRouteStore = create<AimRouteState>((set) => ({
  points: [],
  color: ROUTE_DEFAULT_COLOR,
  setRoute: (points, color) => set({ points, color }),
}));
