/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Režim canvasu podľa záložky (AIM D-132, #216) - čisté výpočty bez Reactu a
 * store. Režim 3D | 2D | Split sa vo viewer odvodzuje z príznakov podkladov
 * (`useViewMode`), ale záložka 3D je vždy perspektívna a voľná: zvyšný zámok
 * kamery (starý 2D) nie je jej režim. Vykonanie je v `useAimViewCommands.ts`.
 */

import type { ViewTabKind } from './viewTabsLayout.js';

type Mode = '3d' | '2d' | 'split';

/**
 * Režim, podľa ktorého sa rozhoduje FOCUS: v záložke 3D platí len split (pôdorys
 * vedľa), zvyšné 2D sa berie ako 3D. Inak by `show_in_3d` select prepínal 3D
 * záložku do 2D (ortografická kamera zhora, #216).
 */
export function sceneMode(sceneKind: ViewTabKind | undefined, mode: Mode): Mode {
  if (sceneKind === '3d') return mode === 'split' ? 'split' : '3d';
  return mode;
}

export interface SceneFlags {
  viewLocked: boolean;
  splitView: boolean;
  projection: 'perspective' | 'orthographic';
}

export interface Settle3d {
  /** Zrušiť zámok kamery, rez podlažia a 2D režim (`useViewMode.setMode('3d')`). */
  leaveLocked: boolean;
  /** Vrátiť perspektívnu kameru. */
  perspective: boolean;
}

/**
 * Čo ešte treba po aktivácii záložky 3D (`SET_VIEW_MODE 3d`): aktivácia už
 * aktívnej záložky nič nemení, takže zvyšný zámok alebo ortografická kamera by
 * ostali (stav hlásil 2d aj po mode=3d, #216).
 */
export function settle3d(f: SceneFlags): Settle3d {
  return { leaveLocked: f.viewLocked || f.splitView, perspective: f.projection !== 'perspective' };
}
