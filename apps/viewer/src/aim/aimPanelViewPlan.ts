/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Panel vlastností z chatu (AIM D-113): validácia `panel` v správe `SELECT` a
 * čo z neho viewer nastaví. Bez store; aplikácia je v `aimPanelView.ts`, volá ju
 * lenivý `visibility-commands.ts` (vstupný balík validáciu nenesie).
 *
 * AIM D-127: panel má len IFC obsah (prepínač AIM | IFC zmizol), `tab` sa ešte
 * prijme kvôli starším odkazom, ale nič nenastaví. Zvýraznená vlastnosť môže
 * byť aj výmera (Qto) alebo vlastnosť zdedená z typu a drží sa do ďalšieho výberu.
 */

export type PanelSection = 'properties' | 'quantities';

export interface AimPanelView {
  tab?: 'aim' | 'ifc';
  section?: PanelSection;
  focus?: { pset: string; property: string };
}

const TABS = new Set<string>(['aim', 'ifc']);
const SECTIONS = new Set<string>(['properties', 'quantities']);
const name = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;

/** Plná validácia `panel` zo správy hosta; `null` = neplatné (správa sa zahodí). */
export function parsePanelView(raw: unknown): AimPanelView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const out: AimPanelView = {};
  if (p.tab !== undefined) {
    if (typeof p.tab !== 'string' || !TABS.has(p.tab)) return null;
    out.tab = p.tab as 'aim' | 'ifc';
  }
  if (p.section !== undefined) {
    if (typeof p.section !== 'string' || !SECTIONS.has(p.section)) return null;
    out.section = p.section as PanelSection;
  }
  if (p.focus !== undefined) {
    const f = p.focus as Record<string, unknown> | null;
    if (!f || typeof f !== 'object' || !name(f.pset) || !name(f.property)) return null;
    out.focus = { pset: f.pset, property: f.property };
  }
  return out;
}

/**
 * `panel` zo správy SELECT: chýbajúci aj `null` = bez panela (výber ako doteraz),
 * výsledok `null` = neplatný panel, správa sa zahodí celá (nič sa nevyberie).
 */
export function selectPanel(raw: unknown): AimPanelView | undefined | null {
  return raw === undefined || raw === null ? undefined : parsePanelView(raw);
}

/** Výmery: sady `Qto_` aj `BaseQuantities` sú v sekcii Quantities. */
export const isQuantitySetName = (pset: string): boolean => /^(Qto_|BaseQuantities$)/i.test(pset.trim());

/** Čo sa má nastaviť: sekcia podľa focusu (výmera = Quantities), inak podľa `section`. */
export function panelPlan(view: AimPanelView): { section?: PanelSection; focus?: { pset: string; property: string } } {
  if (view.focus) return { section: isQuantitySetName(view.focus.pset) ? 'quantities' : 'properties', focus: view.focus };
  return view.section ? { section: view.section } : {};
}

/** Poradie sekcií, v ktorých sa vlastnosť hľadá: najprv podľa mena sady, potom druhá. */
export function focusSections(pset: string): PanelSection[] {
  return isQuantitySetName(pset) ? ['quantities', 'properties'] : ['properties', 'quantities'];
}

const same = (a: string | null | undefined, b: string) => (a ?? '').trim() === b.trim();
const sameLoose = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Kľúč riadka upstream panela je `<entityId>:<pset>:<vlastnosť>` (`PropertySetCard`).
 * Vráti id entity riadka (výskyt alebo typ), ak riadok patrí hľadanej vlastnosti.
 */
export function propKeyEntity(key: string, pset: string, property: string): number | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const id = Number(key.slice(0, i));
  if (!Number.isInteger(id)) return null;
  const rest = key.slice(i + 1);
  if (same(rest, `${pset}:${property}`) || sameLoose(rest, `${pset}:${property}`)) return id;
  return null;
}

/** Index mena v zozname: presná zhoda, inak bez ohľadu na veľkosť písmen; -1 = nie je. */
export function matchName(names: ReadonlyArray<string | null | undefined>, want: string): number {
  const exact = names.findIndex((n) => same(n, want));
  return exact >= 0 ? exact : names.findIndex((n) => sameLoose(n, want));
}
