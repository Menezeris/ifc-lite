/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čistá logika overenia výmer v paneli (AIM D-185 UI): ktorý výsledok patrí k riadku veličiny, rozdiel, čísla
 * v slovenskom zápise a úseky kót z kotiev. Bez store a renderera, testuje `aimVerifyPlan.test.ts`.
 */

import type { VerifyElementWire, VerifyRecipeWire, VerifyStatus, VerifyTargetWire, VerifyUnit } from './verify-protocol.js';

/** Kľúč riadku: `Qto_SpaceBaseQuantities.Height`. */
export const targetKey = (qset: string, quantity: string): string => `${qset}.${quantity}`;

export function findTarget(el: VerifyElementWire | null | undefined, qset: string, quantity: string): VerifyTargetWire | null {
  if (!el) return null;
  const key = targetKey(qset, quantity);
  return el.targets.find((t) => t.target === key) ?? null;
}

export const STATUS_LABEL: Record<VerifyStatus, string> = {
  green: 'Sedí',
  yellow: 'Upozornenie',
  red: 'Nesedí',
  grey: 'Nedá sa overiť',
};

export const STATUS_GLYPH: Record<VerifyStatus, string> = { green: '✓', yellow: '!', red: '✗', grey: '?' };

export type Vec3 = { x: number; y: number; z: number };
export interface Box3 { min: Vec3; max: Vec3 }

/** Rozdiel geometria - súbor, keď sú obe hodnoty. */
export function difference(t: Pick<VerifyTargetWire, 'file_value' | 'computed_value'>): number | null {
  return t.file_value === null || t.computed_value === null ? null : t.computed_value - t.file_value;
}

const DECIMALS: Record<string, number> = { m: 3, m2: 4, m3: 4 };
const UNIT_LABEL: Record<string, string> = { m: 'm', m2: 'm²', m3: 'm³' };

/** Číslo s desatinnou čiarkou a jednotkou (dĺžky na mm, plochy a objemy na 4 miesta). */
export function formatValue(v: number | null, unit: VerifyUnit | string): string {
  if (v === null) return '-';
  const d = DECIMALS[unit] ?? 4;
  const s = (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('.', ',');
  return `${s} ${UNIT_LABEL[unit] ?? unit}`.trim();
}

/** Rozdiel so znamienkom; dĺžky v mm (čitateľnejšie pri tolerancii +- 5 mm). */
export function formatDifference(d: number | null, unit: VerifyUnit): string {
  if (d === null) return '-';
  if (unit === 'm') {
    const mm = Math.round(d * 1000);
    return `${mm > 0 ? '+' : ''}${mm} mm`;
  }
  const s = formatValue(d, unit);
  return d > 0 && !s.startsWith('0,0000') ? `+${s}` : s;
}

export function countByStatus(el: VerifyElementWire | null | undefined): Record<VerifyStatus, number> {
  const out: Record<VerifyStatus, number> = { green: 0, yellow: 0, red: 0, grey: 0 };
  for (const t of el?.targets ?? []) out[t.status] += 1;
  return out;
}

/** Uložený beh sa použije, keď je pre aktuálnu revíziu; inak sa prvok overí znova (D-185 UI, bod 3). */
export const needsRun = (el: VerifyElementWire | null): boolean => !el || el.stale || el.targets.length === 0;

/** Prvky, ktoré treba zvýrazniť pri rozbalení detailu: kotvy hlavného receptu a bunky s prvkom. */
export function anchorGuids(t: VerifyTargetWire): string[] {
  const r = t.recipes[0];
  const out = new Set<string>();
  for (const a of r?.anchors ?? []) out.add(a.global_id);
  for (const c of r?.cells ?? []) if (c.global_id) out.add(c.global_id);
  return [...out];
}

/**
 * Úseky kót v IFC svete (m, Z hore). Prednosť majú úseky od hosta; inak zvislá kóta v strede pôdorysu prvku
 * (`box` v IFC svete) od najnižšej po najvyššiu kotvu s výškou. Bez dvoch rôznych výšok kóta nie je.
 */
export function measureSegments(r: VerifyRecipeWire | undefined, box: Box3 | null, offset = 0): { a: Vec3; b: Vec3 }[] {
  if (!r) return [];
  if (r.segments && r.segments.length > 0) {
    return r.segments.map((s) => ({ a: { x: s.a[0], y: s.a[1], z: s.a[2] }, b: { x: s.b[0], y: s.b[1], z: s.b[2] } }));
  }
  if (!box) return [];
  const zs = r.anchors.map((a) => a.z_m).filter((z): z is number => typeof z === 'number');
  if (zs.length < 2) return [];
  const lo = Math.min(...zs);
  const hi = Math.max(...zs);
  if (hi - lo < 1e-6) return [];
  // Posun pozdĺž dlhšej strany pôdorysu (rez pohľadu ide rovnobežne s ňou, kóta ostane v ňom).
  const alongX = box.max.x - box.min.x >= box.max.y - box.min.y;
  const x = (box.min.x + box.max.x) / 2 + (alongX ? offset : 0);
  const y = (box.min.y + box.max.y) / 2 + (alongX ? 0 : offset);
  return [{ a: { x, y, z: lo }, b: { x, y, z: hi } }];
}

/** Text výpočtu na skopírovanie (do e-mailu, BCF): vzorec, bunky, výsledok, porovnanie. */
export function calculationText(t: VerifyTargetWire): string {
  const r = t.recipes[0];
  const lines = [`${t.target}: ${STATUS_LABEL[t.status]}`];
  if (r?.explanation) lines.push(r.explanation);
  for (const c of r?.cells ?? []) lines.push(`${c.key} = ${c.label}${c.ref ? ` (${c.ref})` : ''} = ${formatValue(c.value, c.unit)}`);
  if (r?.expression) lines.push(`= ${r.expression} = ${formatValue(r.computed_value, t.unit)}`);
  else if (r?.formula_text) lines.push(r.formula_text);
  lines.push(`zo súboru ${formatValue(t.file_value, t.unit)}, z geometrie ${formatValue(t.computed_value, t.unit)}, rozdiel ${formatDifference(difference(t), t.unit)}, tolerancia ${t.tolerance.text}`);
  return lines.join('\n');
}

/** Kód prvku -> GlobalId z buniek a kotiev receptu (na odkazy v texte vzorca a poznámky). */
export function refIndex(r: VerifyRecipeWire | undefined): Map<string, string> {
  const out = new Map<string, string>();
  // Číslo miestnosti (1.07) by sa chytilo aj v čísle vzorca ("= 1.07 m"): v texte odkazom nie je.
  const ok = (ref: string) => !/^[\d.,\s-]+$/.test(ref);
  for (const c of r?.cells ?? []) if (c.ref && c.global_id && ok(c.ref)) out.set(c.ref, c.global_id);
  for (const a of r?.anchors ?? []) if (a.ref && ok(a.ref)) out.set(a.ref, a.global_id);
  return out;
}

/**
 * Kódy prvkov, ktoré host neposlal: doplní ich z mena prvku v IFC (kód v AIM je meno prvku), aby bunky, vstupné
 * prvky aj text vzorca ukázali konkrétny prvok (pripomienka 1). Kód od hosta má prednosť.
 */
export function fillRefs(r: VerifyRecipeWire, nameOf: (guid: string) => string | null | undefined): VerifyRecipeWire {
  const name = (guid: string) => {
    const n = nameOf(guid)?.trim();
    return n ? n.slice(0, 100) : undefined;
  };
  return {
    ...r,
    cells: r.cells.map((c) => (c.ref || !c.global_id ? c : { ...c, ...(name(c.global_id) ? { ref: name(c.global_id) } : {}) })),
    anchors: r.anchors.map((a) => (a.ref ? a : { ...a, ...(name(a.global_id) ? { ref: name(a.global_id) } : {}) })),
  };
}

export type TextPart = { text: string } | { ref: string; guid: string };
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Text s kódmi prvkov rozdelený na časti; známe kódy (`refIndex`) sú odkazy. Kód sa nechytí vo vnútri dlhšieho kódu
 * (PD02.10.03 nie v PD02.10.031), bodka alebo čiarka za ním je koniec vety.
 */
export function linkifyRefs(text: string, index: ReadonlyMap<string, string>): TextPart[] {
  if (!text || index.size === 0) return text ? [{ text }] : [];
  const refs = [...index.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(?<![\\w.])(${refs.join('|')})(?!\\w|\\.\\w)`, 'g');
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ ref: m[1], guid: index.get(m[1])! });
    last = at + m[1].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export interface InputRow { role: string; global_id: string; ref?: string; z_m?: number }

/**
 * Vstupné prvky receptu bez buniek (host ich zatiaľ posiela len v `anchors`): každý prvok raz, s úlohou a výškou.
 * Pri recepte s bunkami prázdne, lebo prvky ukazujú bunky.
 */
export function inputRows(r: VerifyRecipeWire | undefined): InputRow[] {
  if (!r || r.cells.length > 0) return [];
  const seen = new Set<string>();
  const out: InputRow[] = [];
  for (const a of r.anchors) {
    const k = `${a.global_id}|${a.role}|${a.z_m ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ role: a.role, global_id: a.global_id, ...(a.ref ? { ref: a.ref } : {}), ...(a.z_m !== undefined ? { z_m: a.z_m } : {}) });
  }
  return out;
}

/** Kóty všetkých zapnutých veličín naraz (očko pri riadku, pripomienka 3); poradie podľa `keys`, bez duplicít. */
export function segmentsForTargets(el: VerifyElementWire | null, keys: readonly string[], box: Box3 | null): { a: Vec3; b: Vec3 }[] {
  if (!el) return [];
  const out: { a: Vec3; b: Vec3 }[] = [];
  const seen = new Set<string>();
  keys.forEach((key, i) => {
    const t = el.targets.find((x) => x.target === key);
    // Kóty z kotiev stoja v strede pôdorysu; ďalšie zapnuté veličiny sa odsunú, aby sa čísla neprekrývali.
    for (const s of measureSegments(t?.recipes[0], box, i * SIDE_BY_SIDE_M)) {
      const id = [s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z].map((n) => n.toFixed(4)).join(',');
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(s);
    }
  });
  return out;
}

/** Rozostup kót viacerých veličín naraz (m). */
export const SIDE_BY_SIDE_M = 0.6;

/** Krátky zápis odvodenej bunky: "72,0000 m² (NetFloorArea)". */
export const derivedLabel = (value: number, unit: string, quantity: string): string =>
  `${formatValue(value, unit)} (${quantity.slice(quantity.lastIndexOf('.') + 1)})`;
