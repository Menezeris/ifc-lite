/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zmeny pohľadu mimo príkazov hosta (AIM D-125, #180). Most si po každom
 * potvrdenom príkaze (`APPLIED`) zapamätá stav; pri ďalšom príkaze a v
 * `view_state` povie, čo sa odvtedy zmenilo (napr. izoláciu vypol používateľ),
 * aby Claude nestaval na stave, ktorý už neexistuje. Kamera sa neporovnáva:
 * používateľ ňou hýbe stále. Čistá funkcia bez store (test bez viewera).
 */

export interface ViewSnapshot {
  /** Počet izolovaných prvkov; null = bez izolácie. */
  isolated: number | null;
  /** Počet plných prvkov X-ray (kanál ghost); null = bez X-ray. */
  xray: number | null;
  hidden: number;
  /** Opis rezu (os, poloha, otočenie); null = bez rezu. */
  section: string | null;
  selection: number;
  /** Aktívna lens (`AIM chat`, iná lens) a počet jej pravidiel; null = žiadna. */
  lens: string | null;
}

const count = (label: string, a: number | null, b: number | null): string | null => {
  if (a === b) return null;
  if (b === null) return `${label} zrušená (bolo ${a} prvkov)`;
  if (a === null) return `${label} zapnutá (${b} prvkov)`;
  return `${label} zmenená (${a} -> ${b} prvkov)`;
};

/** Zmeny medzi stavom po poslednom príkaze a teraz, po slovensky; prázdne = nič. */
export function describeViewChanges(prev: ViewSnapshot, now: ViewSnapshot): string[] {
  const out = [
    count('izolácia', prev.isolated, now.isolated),
    count('X-ray', prev.xray, now.xray),
    prev.hidden !== now.hidden ? `skryté prvky ${prev.hidden} -> ${now.hidden}` : null,
    prev.section !== now.section ? `rez ${prev.section ?? 'žiadny'} -> ${now.section ?? 'zrušený'}` : null,
    prev.selection !== now.selection ? `výber ${prev.selection} -> ${now.selection} prvkov` : null,
    prev.lens !== now.lens ? `lens ${prev.lens ?? 'žiadna'} -> ${now.lens ?? 'vypnutá'}` : null,
  ];
  return out.filter((s): s is string => s !== null);
}

/** Opis rezu pre porovnanie: os a poloha na desatinu percenta. */
export function sectionLabel(plane: { axis: string; position: number; flipped?: boolean } | null): string | null {
  if (!plane) return null;
  return `${plane.axis} ${plane.position.toFixed(1)} %${plane.flipped ? ' otočený' : ''}`;
}
