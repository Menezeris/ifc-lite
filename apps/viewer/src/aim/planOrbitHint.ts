/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pokus o orbit v zamknutom pôdoryse (AIM #188, D-132) - čisté rozhodnutia bez
 * Reactu a store. Pôdorys je kolmý pohľad zhora, ťah sa v ňom mení na posun
 * (`useMouseControls.ts`), takže orbit nedá žiadnu odozvu. Ponuka prepnúť do 3D
 * sa ukáže, keď sa ťahá gestom, ktoré by v 3D orbitovalo (`orbit`, alebo
 * pravé tlačidlo ako `fly`), nie gestom posunu (`pan`, nástroj, stredné
 * tlačidlo, Shift). Gesto rozhoduje upstream `resolveNavigationPointerGesture`
 * (D-098), tu sa len vyhodnotí.
 */

import type { ViewTabKind } from './viewTabsLayout.js';

export type DragGesture = 'fly' | 'orbit' | 'pan' | 'tool';

/** Ťah menší než toto (px) je klik, nie pokus o orbit; ako `didDrag` v upstreame. */
export const ORBIT_ATTEMPT_PX = 5;

/** Ponuka zmizne sama po tomto čase (ms). */
export const OFFER_TIMEOUT_MS = 8000;

/** Gesto, ktoré by v 3D otáčalo pohľad. */
export const isOrbitGesture = (g: DragGesture): boolean => g === 'orbit' || g === 'fly';

export interface Press { x: number; y: number; orbit: boolean }

export const startPress = (x: number, y: number, gesture: DragGesture): Press => ({ x, y, orbit: isOrbitGesture(gesture) });

/** Pokus o orbit nastal: ťah orbitovým gestom prešiel prah. */
export function orbitAttempted(p: Press | null, x: number, y: number): boolean {
  return p !== null && p.orbit && (Math.abs(x - p.x) > ORBIT_ATTEMPT_PX || Math.abs(y - p.y) > ORBIT_ATTEMPT_PX);
}

export interface SceneFlags {
  /** Druh záložky, ktorej stav je v canvase. */
  sceneKind: ViewTabKind | undefined;
  viewLocked: boolean;
  splitView: boolean;
}

/** Ponuka patrí len zamknutému pôdorysu v záložke (nie 3D, nie split vedľa voľnej 3D). */
export const inLockedPlan = (f: SceneFlags): boolean => f.sceneKind === 'plan' && f.viewLocked && !f.splitView;

export type OfferKey = 'accept' | 'dismiss' | null;

/**
 * Kláves k ponuke: Enter a medzerník prijmú, Esc zavrie. Ak je fokus na
 * ovládacom prvku (tlačidlo, pole, výber), kláves patrí jemu.
 */
export function offerKey(key: string, targetTag: string, editable: boolean): OfferKey {
  if (key === 'Escape') return 'dismiss';
  if (key !== 'Enter' && key !== ' ') return null;
  if (editable || ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(targetTag)) return null;
  return 'accept';
}
