/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čisté funkcie pre clash z AIM (D-164): z čoho sa skladá `CLASH_SAVE`, ktoré stavy sa pri `CLASH_LOAD` priradia
 * dvojiciam, podpis pre "upravené" a opis pre `view_state.clash_local`. Bez importov viewera, aby ich šlo
 * skúšať bez neho (v CI chýba wasm).
 */

import {
  MAX_CLASH_RESULTS, type ClashAimMode, type ClashAimResult, type ClashAimRun, type ClashAimStatus, type ClashAimTest,
} from './clash-protocol.js';

/** Kľúč kontroly dvojice: pravidlo a oba GUID zoradené, ako `clashReviewKey` z `@ifc-lite/clash`. */
export const pairKey = (rule: string, a: string, b: string): string => (a <= b ? `${rule} ${a} ${b}` : `${rule} ${b} ${a}`);

/** Vstup z panela: preset a globálne nastavenie (v m), čo viewer drží. */
export interface ClashSettingsInput {
  name: string;
  selectorA: string;
  selectorB: string;
  mode: ClashAimMode;
  tolerance: number;
  clearance: number;
}

const mm = (m: number): number => Math.round(m * 1_000_000) / 1000;

/** Test pre `CLASH_SAVE`; odstup sa posiela len v móde clearance. */
export function buildTest(s: ClashSettingsInput): ClashAimTest {
  return {
    name: s.name, a: s.selectorA, b: s.selectorB, mode: s.mode, tolerance_mm: mm(s.tolerance),
    ...(s.mode === 'clearance' ? { clearance_mm: mm(s.clearance) } : {}),
  };
}

/** Kolízia v tvare, ktorý potrebuje beh (podmnožina `Clash`). */
export interface ClashLike {
  rule: string;
  a: { key: string };
  b: { key: string };
  distance: number;
}

/** Výsledky behu pre `CLASH_SAVE`: len kolízie pravidla testu, so stavom z kontrol; strop dáva `truncated`. */
export function buildRun(
  rule: string,
  clashes: readonly ClashLike[],
  review: (key: string) => { status: ClashAimStatus; comment?: string } | undefined,
): ClashAimRun {
  const mine = clashes.filter((c) => c.rule === rule);
  const results: ClashAimResult[] = mine.slice(0, MAX_CLASH_RESULTS).map((c) => {
    const r = review(pairKey(rule, c.a.key, c.b.key));
    return {
      a_guid: c.a.key, b_guid: c.b.key, status: r?.status ?? 'open', distance_mm: mm(c.distance),
      ...(r?.comment ? { comment: r.comment.slice(0, 2000) } : {}),
    };
  });
  return { results, ...(mine.length > results.length ? { truncated: true } : {}) };
}

export interface ReviewUpdate { key: string; status: ClashAimStatus; comment?: string }

/** Stavy z uloženého behu, ktoré sa líšia od toho, čo už viewer drží (ostatné sa nechávajú). */
export function reviewUpdates(
  rule: string,
  results: readonly ClashAimResult[],
  current: (key: string) => { status: ClashAimStatus; comment?: string } | undefined,
): ReviewUpdate[] {
  const out: ReviewUpdate[] = [];
  for (const r of results) {
    const key = pairKey(rule, r.a_guid, r.b_guid);
    const now = current(key);
    if ((now?.status ?? 'open') === r.status && (now?.comment ?? '') === (r.comment ?? '')) continue;
    out.push({ key, status: r.status, ...(r.comment ? { comment: r.comment } : {}) });
  }
  return out;
}

export interface Counts { open: number; resolved: number; accepted: number }

export function countStatuses(results: readonly { status: ClashAimStatus }[]): Counts {
  const c: Counts = { open: 0, resolved: 0, accepted: 0 };
  for (const r of results) c[r.status] += 1;
  return c;
}

/** Koľko uložených dvojíc sa v čerstvom behu našlo a koľko nie (zmenený model, iná tolerancia). */
export function matchRun(expected: readonly ClashAimResult[], found: readonly ClashLike[], rule: string): { found: number; missing: number } {
  const keys = new Set(found.filter((c) => c.rule === rule).map((c) => pairKey(rule, c.a.key, c.b.key)));
  const hit = expected.filter((r) => keys.has(pairKey(rule, r.a_guid, r.b_guid))).length;
  return { found: hit, missing: expected.length - hit };
}

/** Kontroly pravidla testu (kľúče `pairKey`) ako riadky výsledkov: to, čo používateľ rozhodol, nezávisle od behu. */
export function reviewRows(rule: string, reviews: Iterable<[string, { status: ClashAimStatus; comment?: string }]>): ClashAimResult[] {
  const rows: ClashAimResult[] = [];
  for (const [key, r] of reviews) {
    const [id, a, b] = key.split(' ');
    if (id !== rule || !a || !b) continue;
    rows.push({ a_guid: a, b_guid: b, status: r.status, ...(r.comment ? { comment: r.comment } : {}) });
  }
  return rows;
}

/** Podpis testu a stavov, podľa ktorého sa pozná "upravené, neuložené". */
export function signature(test: Pick<ClashAimTest, 'a' | 'b' | 'mode' | 'tolerance_mm' | 'clearance_mm'>, results: readonly ClashAimResult[]): string {
  const rows = results.map((r) => `${pairKey('', r.a_guid, r.b_guid)}|${r.status}|${r.comment ?? ''}`).sort();
  return JSON.stringify([test.a, test.b, test.mode, test.tolerance_mm, test.mode === 'clearance' ? test.clearance_mm ?? 0 : 0, rows]);
}

export interface ClashLocalInput {
  test: { id: string; version: number } | null;
  name: string | null;
  mode: ClashAimMode;
  tolerance_mm: number;
  hasRun: boolean;
  running: boolean;
  counts: Counts | null;
  total: number;
  dirty: boolean;
  missing?: number;
}

/** `view_state.clash_local`: otvorený test, beh, počty podľa stavu a či je upravený; `undefined`, keď nič nie je. */
export function describeClash(i: ClashLocalInput): Record<string, unknown> | undefined {
  if (!i.test && !i.hasRun && !i.name) return undefined;
  return {
    ...(i.test ? { test: { id: i.test.id, version: i.test.version } } : {}),
    ...(i.name ? { name: i.name } : {}),
    mode: i.mode, tolerance_mm: i.tolerance_mm, running: i.running,
    run: i.hasRun ? { total: i.total, ...(i.counts ?? {}), ...(i.missing ? { missing_from_saved: i.missing } : {}) } : null,
    edited: i.dirty,
  };
}
