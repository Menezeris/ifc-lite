/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čisté funkcie pre clash z AIM (D-164): z čoho sa skladá `CLASH_SAVE` (test, výsledky behu, zmenené stavy dvojíc),
 * ktoré stavy z `CLASH_LOAD` sa priradia dvojiciam, podpis testu pre "upravené" a opis pre `view_state.clash_local`.
 * Bez importov viewera, aby ich šlo skúšať bez neho (v CI chýba wasm).
 */

import {
  MAX_SAVE_RESULTS, type ClashElementWire, type ClashKind, type ClashResultWire, type ClashReviewState, type ClashReviewWire,
  type ClashSeverityWire, type ClashSideWire, type ClashTestWire,
} from './clash-protocol.js';

/** Kľúč kontroly dvojice: pravidlo a oba GUID zoradené, ako `clashReviewKey` z `@ifc-lite/clash`. */
export const pairKey = (rule: string, a: string, b: string): string => (a <= b ? `${rule} ${a} ${b}` : `${rule} ${b} ${a}`);

export interface ReviewState { status: ClashReviewState; comment?: string }

const mm = (m: number): number => Math.round(m * 1_000_000) / 1000;

/** Test z panela: preset a globálne nastavenie (tolerancia a odstup v m, ako ich drží viewer). */
export interface TestInput {
  code?: string;
  name: string;
  a: ClashSideWire;
  b: ClashSideWire;
  mode: ClashKind;
  tolerance: number;
  clearance: number;
}

const sameSide = (x: ClashSideWire, y: ClashSideWire): boolean => x.type === y.type && x.model === y.model && x.storey === y.storey;

/** Test pre `CLASH_SAVE`: strana B sa vynechá, keď je rovnaká ako A (kolízie v rámci A); odstup len v móde clearance, aspoň 1 mm (host inak test odmietne). */
export function buildTest(i: TestInput): ClashTestWire {
  return {
    ...(i.code ? { code: i.code } : {}),
    name: i.name, a: i.a, ...(sameSide(i.a, i.b) ? {} : { b: i.b }), mode: i.mode, tolerance_mm: mm(i.tolerance),
    ...(i.mode === 'clearance' ? { clearance_mm: Math.max(mm(i.clearance), 1) } : {}),
  };
}

/** Podpis testu pre "upravené"; názov a kód doň nepatria (menia sa len v AIM). */
export function testSignature(t: ClashTestWire): string {
  return JSON.stringify([t.a, t.b ?? t.a, t.mode, t.tolerance_mm ?? 0, t.mode === 'clearance' ? t.clearance_mm ?? 0 : 0]);
}

/** Kolízia v tvare, ktorý potrebuje beh (podmnožina `Clash`). */
export interface ClashRich {
  rule: string;
  status: 'hard' | 'clearance' | 'touch';
  severity: ClashSeverityWire;
  distance: number;
  a: { key: string; model: string; tag: string; name?: string };
  b: { key: string; model: string; tag: string; name?: string };
}

const SEVERITY_RANK: Record<ClashSeverityWire, number> = { critical: 0, major: 1, minor: 2, info: 3 };

const elementOf = (e: ClashRich['a'], labelOf: (modelId: string) => string): ClashElementWire => ({
  model: labelOf(e.model), guid: e.key, type: e.tag, ...(e.name ? { name: e.name } : {}),
});

/**
 * Výsledky behu jedného pravidla pre `CLASH_SAVE`: najzávažnejšie prvé, nad stropom hosta sa orežú a `truncated` to
 * povie. `touch` (dotyk bez prieniku) AIM nepozná, preto sa neposiela.
 */
export function buildResults(rule: string, clashes: readonly ClashRich[], labelOf: (modelId: string) => string): { results: ClashResultWire[]; truncated: boolean } {
  const mine = clashes.filter((c) => c.rule === rule && c.status !== 'touch')
    .sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || x.distance - y.distance);
  const results = mine.slice(0, MAX_SAVE_RESULTS).map((c): ClashResultWire => ({
    kind: c.status as ClashKind, severity: c.severity, distance: c.distance, a: elementOf(c.a, labelOf), b: elementOf(c.b, labelOf),
  }));
  return { results, truncated: mine.length > results.length };
}

/** Stavy pravidla (kľúče `pairKey`) zo všetkých kontrol viewera. */
export function reviewSnapshot(rule: string, reviews: Iterable<[string, ReviewState]>): Map<string, ReviewState> {
  const out = new Map<string, ReviewState>();
  for (const [key, r] of reviews) if (key.startsWith(`${rule} `)) out.set(key, { status: r.status, ...(r.comment ? { comment: r.comment } : {}) });
  return out;
}

export interface ReviewUpdate { key: string; status: ClashReviewState; comment?: string }

/** Stavy z `CLASH_LOAD`, ktoré sa líšia od toho, čo viewer už drží (ostatné sa nechávajú). Výsledok bez `review` nič nemení. */
export function loadUpdates(rule: string, results: readonly ClashResultWire[], current: (key: string) => ReviewState | undefined): ReviewUpdate[] {
  const out: ReviewUpdate[] = [];
  for (const r of results) {
    if (!r.review) continue;
    const key = pairKey(rule, r.a.guid, r.b.guid);
    const now = current(key);
    if ((now?.status ?? 'open') === r.review && (now?.comment ?? '') === (r.comment ?? '')) continue;
    out.push({ key, status: r.review, ...(r.comment ? { comment: r.comment } : {}) });
  }
  return out;
}

/** Dvojice (kľúč a prvky s modelom), ktoré viewer pozná, aby sa zmenený stav dal poslať ako `{model, guid}`. */
export function knownPairs(rule: string, rows: readonly { a: ClashElementWire; b: ClashElementWire }[]): Map<string, { a: ClashElementWire; b: ClashElementWire }> {
  return new Map(rows.map((r) => [pairKey(rule, r.a.guid, r.b.guid), { a: r.a, b: r.b }]));
}

/**
 * Zmenené stavy voči tomu, čo viewer dostal (alebo naposledy uložil): len zmenené dvojice, poznámka len keď sa mení
 * (prázdna ju maže). Dvojica, ktorú viewer nepozná (nie je v behu ani v načítaných výsledkoch), sa nepošle: `skipped`.
 */
export function reviewChanges(
  current: ReadonlyMap<string, ReviewState>,
  baseline: ReadonlyMap<string, ReviewState>,
  known: ReadonlyMap<string, { a: ClashElementWire; b: ClashElementWire }>,
): { changes: ClashReviewWire[]; skipped: number } {
  const changes: ClashReviewWire[] = [];
  let skipped = 0;
  for (const key of [...new Set([...current.keys(), ...baseline.keys()])].sort()) {
    const now = current.get(key);
    const was = baseline.get(key);
    const status = now?.status ?? 'open';
    const commentChanged = (now?.comment ?? '') !== (was?.comment ?? '');
    if (status === (was?.status ?? 'open') && !commentChanged) continue;
    const pair = known.get(key);
    if (!pair) { skipped += 1; continue; }
    changes.push({ a: pair.a, b: pair.b, status, ...(commentChanged ? { comment: now?.comment ?? '' } : {}) });
  }
  return { changes, skipped };
}

export interface RunCounts {
  total: number;
  by_status: { hard: number; clearance: number };
  by_review: { open: number; resolved: number; accepted: number };
}

/** Počty behu pre `clash_local`: podľa druhu (dotyk sa nepočíta) a podľa stavu kontroly. */
export function countRun(rule: string, clashes: readonly ClashRich[], review: (key: string) => ClashReviewState | undefined): RunCounts {
  const c: RunCounts = { total: 0, by_status: { hard: 0, clearance: 0 }, by_review: { open: 0, resolved: 0, accepted: 0 } };
  for (const k of clashes) {
    if (k.rule !== rule || k.status === 'touch') continue;
    c.total += 1;
    c.by_status[k.status] += 1;
    c.by_review[review(pairKey(rule, k.a.key, k.b.key)) ?? 'open'] += 1;
  }
  return c;
}

/** Koľko uložených dvojíc sa v čerstvom behu našlo a koľko nie (zmenený model, iná tolerancia). */
export function matchRun(expected: readonly ClashResultWire[], found: readonly ClashRich[], rule: string): { found: number; missing: number } {
  const keys = new Set(found.filter((c) => c.rule === rule).map((c) => pairKey(rule, c.a.key, c.b.key)));
  const hit = expected.filter((r) => keys.has(pairKey(rule, r.a.guid, r.b.guid))).length;
  return { found: hit, missing: expected.length - hit };
}

export interface ClashLocalInput {
  test: ClashTestWire | null;
  fromAim: boolean;
  dirty: boolean;
  run: (RunCounts & { id?: string }) | null;
  selected: { a: ClashElementWire; b: ClashElementWire } | null;
  reviews: ClashReviewWire[];
  missing?: number;
}

/** `view_state.clash_local` v tvare, ktorý čaká host; `undefined`, keď nie je otvorený žiadny test. */
export function describeClash(i: ClashLocalInput): Record<string, unknown> | undefined {
  if (!i.test) return undefined;
  const pick = (e: ClashElementWire) => ({ model: e.model, guid: e.guid });
  return {
    test: i.test, from_aim: i.fromAim, dirty: i.dirty,
    ...(i.run ? { run: { ...(i.run.id ? { id: i.run.id } : {}), total: i.run.total, by_status: i.run.by_status, by_review: i.run.by_review, source: 'local', ...(i.missing ? { missing_from_saved: i.missing } : {}) } } : {}),
    ...(i.selected ? { selected: { a: pick(i.selected.a), b: pick(i.selected.b) } } : {}),
    ...(i.reviews.length ? { reviews: i.reviews } : {}),
  };
}
