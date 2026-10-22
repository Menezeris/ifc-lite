/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Farby AIM chat lens do renderera (AIM D-125 doplnok, #175). Malý modul bez
 * závislostí: volá ho eager `useLens` (blok AIM-FORK), logika lens je lenivá.
 *
 * Renderer farbu s alfou 0,3 (akcia `transparent`) kreslí nepriehľadne a zmiešanú
 * so 70 % pôvodnej farby miestnosti, takže ofarbené miestnosti a zóny sú bledá
 * azúrová hmota. Prvky z varianty `~vol` (IfcSpace, IfcSpatialZone) sa preto do
 * renderera neposielajú: ostanú natívne priesvitné, farbu Lens miestnosti nesie
 * podstava (`AimRoomFill3d`); `lensColorMap`, počty a súhrn sa nemenia.
 */

/** Prípona id priesvitnej varianty pravidla pre miestnosti a zóny (D-125). */
export const VOLUME_SUFFIX = '~vol';
/** Meno AIM chat lens (rovnaké ako `AIM_LENS_NAME` v `aimLensPlan.ts`). */
const AIM_LENS = 'AIM chat';

export function paintedColors<T>(
  colors: Map<number, T>,
  lens: { name: string; rules: readonly { id: string }[] } | null | undefined,
  ruleIds: ReadonlyMap<string, readonly number[]>,
): Map<number, T> {
  if (!lens || lens.name !== AIM_LENS) return colors;
  const skip = lens.rules.filter((r) => r.id.endsWith(VOLUME_SUFFIX)).flatMap((r) => ruleIds.get(r.id) ?? []);
  if (skip.length === 0) return colors;
  const out = new Map(colors);
  for (const id of skip) out.delete(id);
  return out;
}
