/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PDF podklady v 3D zapnúť / vypnúť (AIM D-133 doplnok, #170). Je to stav viewera
 * a nezapisuje sa nikam: `visible` v `_georef` (oko pri výkrese v paneli Underlays)
 * sa ukladá do DB a skrýva podklad aj v 2D paneli pôdorysu, toto skrýva len plochu
 * podkladu v 3D plátne. Kalibrácia, ghost náhľad počas kalibrácie a zamknutý
 * pôdorysný pohľad (kamera zhora, `underlayViewLocked`) ostávajú, lebo to je 2D.
 * Hook `useDrawingUnderlay` číta `hidden` a pre uložené podklady prepíše `visible`.
 */

import { create } from 'zustand';

interface AimUnderlays3dStore {
  /** true = uložené podklady sa v 3D nekreslia. Po obnove stránky true (vypnuté). */
  hidden: boolean;
  setShown: (show: boolean) => void;
}

export const useAimUnderlays3d = create<AimUnderlays3dStore>((set) => ({
  // After a page reload the underlays are off: the PDFs are neither fetched nor rasterized at
  // startup, they turn on with the switch or set_view_mode underlays_3d=true
  hidden: true,
  setShown: (show) => set({ hidden: !show }),
}));

/** Podklady sa v 3D plátne nekreslia: vypnuté a nejde o zamknutý pôdorysný pohľad (2D). */
export function underlaysHiddenIn3d(flags: { hidden: boolean; viewLocked: boolean }): boolean {
  return flags.hidden && !flags.viewLocked;
}

/** Placement pre renderer: pri skrytí `visible: false`, kalibrácia v store ostáva nedotknutá (kópia). */
export function withUnderlay3dVisibility<T extends { visible: boolean }>(placement: T, hide: boolean): T {
  return hide && placement.visible ? { ...placement, visible: false } : placement;
}

/** Skrytý placement bez textúry sa nesťahuje ani nerasterizuje, až kým sa nezapne (štart viewera). */
export function skipUnderlayRaster(placement: { visible: boolean }, hasTexture: boolean): boolean {
  return !placement.visible && !hasTexture;
}
