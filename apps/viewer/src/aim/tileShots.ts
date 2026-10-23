/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Snímky 3D dlaždíc (AIM D-157): viewer má jeden 3D canvas, preto 3D dlaždica
 * mimo živej ukazuje posledný obraz svojej záložky. Snímka sa robí synchrónne
 * pri odchode záložky z canvasu (kópia posledného zobrazeného snímku do 2D
 * canvasu, zmenšená), nie z renderera; nič sa neprekresľuje navyše. Len počas
 * relácie, zabudne sa so záložkou.
 */

import { useAimViewTabs } from './viewTabsStore.js';

/** Dlhšia strana snímky v px (4 dlaždice x 1600 px = pamäť pár MB). */
const MAX_SIDE = 1600;

const shots = new Map<string, HTMLCanvasElement>();

const viewportCanvas = () => document.querySelector<HTMLCanvasElement>('canvas[data-viewport="main"]');

const bump = () => useAimViewTabs.setState((s) => ({ shots: s.shots + 1 }));

/** Odfotí 3D canvas ako snímku záložky `id`; false = canvas nie je alebo je prázdny. */
export function shoot(id: string): boolean {
  const src = viewportCanvas();
  if (!src || src.width === 0 || src.height === 0) return false;
  const k = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const out = shots.get(id) ?? document.createElement('canvas');
  out.width = Math.max(1, Math.round(src.width * k));
  out.height = Math.max(1, Math.round(src.height * k));
  const ctx = out.getContext('2d');
  if (!ctx) return false;
  try {
    ctx.drawImage(src, 0, 0, out.width, out.height);
  } catch {
    return false;
  }
  shots.set(id, out);
  bump();
  return true;
}

export const shotOf = (id: string) => shots.get(id) ?? null;
export const hasShot = (id: string) => shots.has(id);

/** Zabudne snímky zavretých záložiek. */
export function pruneShots(open: ReadonlySet<string>): void {
  let changed = false;
  for (const id of shots.keys()) {
    if (!open.has(id)) {
      shots.delete(id);
      changed = true;
    }
  }
  if (changed) bump();
}
