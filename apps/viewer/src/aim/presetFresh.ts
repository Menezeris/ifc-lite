/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Smerový preset pre `SET_CAMERA` bez cyklu otáčania ViewCube (AIMviewer#324).
 *
 * `Camera.setPresetView` si pamätá poslednú stranu: opakované kliknutie na tú
 * istú ju otočí o 90° (strop `top` ukáže ďalšiu svetovú stranu hore). Pre
 * tlačidlo to je zámer, pre príkaz hosta nie - rovnaký `preset=top` (s cieľom
 * či bez) by podľa toho, čo bolo predtým, dal inú orientáciu. Diagonálny preset
 * cyklus ukončí (`setPresetDirection` nuluje poslednú stranu aj počítadlo), takže
 * ho zavoláme tesne pred stranou: obe animácie sa začnú z tej istej pózy, druhá
 * prepíše prvú a výsledok je vždy orientácia prvého kliknutia. Rámovanie cieľa
 * po presete smer drží, orientáciu už nemení.
 */

type FaceView = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

/** Časť `cameraCallbacks`, ktorú helper potrebuje. */
export interface PresetCallbacks {
  setPresetView?: (view: FaceView) => void;
  setPresetDirection?: (direction: { x: number; y: number; z: number }) => void;
}

/** Nenulová vodorovná zložka, aby ju `setPresetDirection` neodmietol ako pól. */
const CYCLE_BREAK_DIRECTION = { x: 1, y: 1, z: 1 };

/** Použije stranu vždy ako prvé kliknutie na ňu; false, keď kamera nie je pripravená. */
export function applyFacePreset(cam: PresetCallbacks, view: FaceView): boolean {
  if (!cam.setPresetView) return false;
  cam.setPresetDirection?.(CYCLE_BREAK_DIRECTION);
  cam.setPresetView(view);
  return true;
}
