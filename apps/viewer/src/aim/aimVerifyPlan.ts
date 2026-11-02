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
export function measureSegments(r: VerifyRecipeWire | undefined, box: Box3 | null): { a: Vec3; b: Vec3 }[] {
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
  const x = (box.min.x + box.max.x) / 2;
  const y = (box.min.y + box.max.y) / 2;
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
