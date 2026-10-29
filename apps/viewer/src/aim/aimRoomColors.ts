/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Farby miestností pre výplň podstavy (AIM #319). Okrem Lens a výberu sa do
 * výplne dostanú aj miestnosti zvýraznené príkazom FOCUS (`show_in_3d`): ich
 * priesvitný objem sa v rendereri zmieša s pôvodnou farbou IfcSpace (takmer biela)
 * a v pôdoryse ho zakryje podlaha, takže bez výplne nie je vidieť oranžovú.
 * Čistá matematika bez store.
 */

export interface RoomColorInput {
  /** Farby aktívnej Lens podľa globalId. */
  lens: ReadonlyMap<number, string>;
  /** Vybrané prvky (globalId). */
  selected: Iterable<number>;
  /** Je to miestnosť s geometriou, ktorú výplň vie nakresliť? */
  isRoom: (id: number) => boolean;
  /** Miestnosti zvýraznené FOCUS-om (globalId). */
  focused: Iterable<number>;
  selectedColor: string;
  focusColor: string;
}

/** Lens, k tomu vybrané miestnosti farbou výberu; zvýraznenie z FOCUS prebíja oboje (príkaz hosta je posledné slovo). */
export function roomColorMap(input: RoomColorInput): Map<number, string> {
  const colors = new Map(input.lens);
  for (const id of input.selected) if (input.isRoom(id) && !colors.has(id)) colors.set(id, input.selectedColor);
  for (const id of input.focused) if (input.isRoom(id)) colors.set(id, input.focusColor);
  return colors;
}
