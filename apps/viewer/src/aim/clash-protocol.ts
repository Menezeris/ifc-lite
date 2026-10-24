/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Clash z AIM (D-164, #292): test kolízií (sady A/B, režim, tolerancia) a stavy jeho výsledkov sa otvoria v upstream
 * paneli `clash` a upravené sa uložia späť do AIM. Zrkadlo `lib/viewer-clash.ts` v AIMviewer (#307); tvar sa mení
 * len spolu s ním. Vlastný lenivý protokol (mimo `bridge-protocol.ts`, ktorý je na rozpočte veľkosti); overuje ho až
 * lenivý `aimClash.ts`. Vzor: `ids-protocol.ts` (D-162).
 *
 * Host -> viewer:
 *  - `CLASH_LOAD {test, run?, results?, results_total?, results_truncated?}`: otvorí panel `clash` s testom (kód
 *    testu v AIM, sady A/B ako selektor tried + model + podlažie, režim, mm). `results` (stav `review` a poznámka
 *    z AIM) prídu, keď chat otvoril uložený beh: viewer ich stavy priradí dvojiciam a spustí detekciu, aby ich
 *    používateľ videl v zozname. Strop 3000 výsledkov (najzávažnejšie prvé).
 *  - `CLASH_SAVED {ok, test_code?, run_id?, results?, reviews?, notes?}` alebo `{ok: false, error}`: výsledok `CLASH_SAVE`.
 * Viewer -> host:
 *  - `CLASH_SAVE {test?, test_code?, run?, reviews?}`: tlačidlo "Uložiť do AIM" v paneli. Jedna správa: test (ak je
 *    upravený alebo nový, inak stačí `test_code`), posledný beh jedného pravidla a zmenené stavy dvojíc.
 *    Dvojice sa poznajú podľa `{model, guid}`, kľúč kolízie skladá host; vzdialenosť je v m, tolerancia a odstup v mm.
 */

import { SOURCE } from './bridge-core.js';

export const CLASH_STATUSES = ['open', 'resolved', 'accepted'] as const;
export type ClashReviewState = (typeof CLASH_STATUSES)[number];
export type ClashKind = 'hard' | 'clearance';
export type ClashSeverityWire = 'critical' | 'major' | 'minor' | 'info';
const KINDS: readonly ClashKind[] = ['hard', 'clearance'];
const SEVERITIES: readonly ClashSeverityWire[] = ['critical', 'major', 'minor', 'info'];

/** Stropy hosta: výsledky v `CLASH_LOAD` 3000, v `CLASH_SAVE` 10 000 a 2000 zmien stavu. */
export const MAX_LOAD_RESULTS = 3000;
export const MAX_SAVE_RESULTS = 10_000;
export const MAX_SAVE_REVIEWS = 2000;
const MAX_TEXT = 200;
const MAX_COMMENT = 2000;

export interface ClashSideWire {
  /** Selektor IFC tried upstream: `IfcDuct*|IfcPipe*`, `!IfcSpace`, `*`. */
  type: string;
  model?: string;
  storey?: string;
}
export interface ClashTestWire {
  code?: string;
  name: string;
  description?: string;
  a: ClashSideWire;
  b?: ClashSideWire;
  mode: ClashKind;
  clearance_mm?: number;
  tolerance_mm?: number;
}
export interface ClashElementWire {
  model: string;
  guid: string;
  type?: string;
  name?: string;
}
export interface ClashResultWire {
  kind: ClashKind;
  severity: ClashSeverityWire;
  /** m; záporné = hĺbka prieniku. */
  distance: number;
  a: ClashElementWire;
  b: ClashElementWire;
  storey?: string | null;
  center?: number[] | null;
  /** Len host -> viewer: stav a poznámka z AIM. */
  review?: ClashReviewState;
  comment?: string;
}
export interface ClashReviewWire {
  a: ClashElementWire;
  b: ClashElementWire;
  status: ClashReviewState;
  comment?: string;
}
export interface ClashSaveWire {
  test_code?: string;
  test?: ClashTestWire;
  run?: { models?: Record<string, unknown>; truncated?: boolean; results: ClashResultWire[] };
  reviews?: ClashReviewWire[];
}

export interface ClashLoadMessage {
  source: typeof SOURCE;
  type: 'CLASH_LOAD';
  test: ClashTestWire & { code: string };
  run?: { id: string };
  results?: ClashResultWire[];
  results_total?: number;
  results_truncated?: boolean;
}
export type ClashSavedMessage = { source: typeof SOURCE; type: 'CLASH_SAVED' } & (
  | { ok: true; test_code?: string; run_id?: string; results?: number; reviews?: number; notes?: string[] }
  | { ok: false; error: string }
);
export type ClashInboundMessage = ClashLoadMessage | ClashSavedMessage;
export type ClashSaveMessage = { source: typeof SOURCE; type: 'CLASH_SAVE' } & ClashSaveWire;

/** Typy správ hosta, ktoré posiela `AimBridge` do lenivého modulu. */
export const CLASH_INBOUND_TYPES: readonly string[] = ['CLASH_LOAD', 'CLASH_SAVED'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const oneOf = <T extends string>(v: unknown, set: readonly T[]): v is T => typeof v === 'string' && (set as readonly string[]).includes(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const absent = (v: unknown): boolean => v === undefined || v === null;

function side(v: unknown): ClashSideWire | null {
  if (!isObj(v) || !isText(v.type)) return null;
  if (!absent(v.model) && !isText(v.model)) return null;
  if (!absent(v.storey) && !isText(v.storey)) return null;
  return { type: v.type.trim(), ...(v.model ? { model: (v.model as string).trim() } : {}), ...(v.storey ? { storey: (v.storey as string).trim() } : {}) };
}

/** Test v tvare hosta (`parseClashTest` z AIMviewer); null = neplatný. */
export function parseClashTest(v: unknown): ClashTestWire | null {
  if (!isObj(v) || !isText(v.name) || !oneOf(v.mode, KINDS)) return null;
  const a = side(v.a);
  if (!a) return null;
  let b: ClashSideWire | null = null;
  if (!absent(v.b)) {
    b = side(v.b);
    if (!b) return null;
  }
  if (!absent(v.code) && !isText(v.code, 80)) return null;
  if (!absent(v.description) && typeof v.description !== 'string') return null;
  for (const k of ['clearance_mm', 'tolerance_mm'] as const) {
    if (!absent(v[k]) && (!isNum(v[k]) || (v[k] as number) < 0 || (v[k] as number) > 100_000)) return null;
  }
  if (v.mode === 'clearance' && !(isNum(v.clearance_mm) && v.clearance_mm > 0)) return null;
  return {
    ...(v.code ? { code: (v.code as string).trim() } : {}),
    name: v.name.trim(),
    ...(typeof v.description === 'string' && v.description.trim() ? { description: v.description.trim().slice(0, MAX_COMMENT) } : {}),
    a,
    ...(b ? { b } : {}),
    mode: v.mode,
    ...(v.mode === 'clearance' ? { clearance_mm: v.clearance_mm as number } : {}),
    ...(isNum(v.tolerance_mm) ? { tolerance_mm: v.tolerance_mm } : {}),
  };
}

function element(v: unknown): ClashElementWire | null {
  if (!isObj(v) || !isText(v.model) || !isText(v.guid, 64)) return null;
  const type = typeof v.type === 'string' && v.type ? v.type.slice(0, MAX_TEXT) : undefined;
  const name = typeof v.name === 'string' && v.name ? v.name.slice(0, MAX_TEXT) : undefined;
  return { model: v.model.trim(), guid: v.guid.trim(), ...(type ? { type } : {}), ...(name ? { name } : {}) };
}

function result(v: unknown): ClashResultWire | null {
  if (!isObj(v) || !oneOf(v.kind, KINDS) || !isNum(v.distance)) return null;
  const a = element(v.a);
  const b = element(v.b);
  if (!a || !b) return null;
  if (!absent(v.review) && !oneOf(v.review, CLASH_STATUSES)) return null;
  if (!absent(v.comment) && (typeof v.comment !== 'string' || v.comment.length > MAX_COMMENT)) return null;
  const center = Array.isArray(v.center) && v.center.length === 3 && v.center.every(isNum) ? (v.center as number[]) : null;
  return {
    kind: v.kind,
    severity: oneOf(v.severity, SEVERITIES) ? v.severity : 'info',
    distance: v.distance,
    a, b,
    storey: typeof v.storey === 'string' && v.storey ? v.storey.slice(0, MAX_TEXT) : null,
    center,
    ...(v.review ? { review: v.review as ClashReviewState } : {}),
    ...(typeof v.comment === 'string' && v.comment ? { comment: v.comment } : {}),
  };
}

function review(v: unknown): ClashReviewWire | null {
  if (!isObj(v) || !oneOf(v.status, CLASH_STATUSES)) return null;
  const a = element(v.a);
  const b = element(v.b);
  if (!a || !b) return null;
  if (v.comment !== undefined && typeof v.comment !== 'string') return null;
  const comment = typeof v.comment === 'string' ? v.comment.slice(0, MAX_COMMENT) : undefined;
  return { a, b, status: v.status, ...(comment !== undefined ? { comment } : {}) };
}

/** Uloženie po overení tvaru, ako ho overuje host (`parseClashSave`); null = neplatné. Zlý riadok = celá správa neplatná. */
export function parseClashSave(data: unknown): ClashSaveWire | null {
  if (!isObj(data)) return null;
  const out: ClashSaveWire = {};
  if (data.test_code !== undefined) {
    if (!isText(data.test_code, 80)) return null;
    out.test_code = data.test_code.trim();
  }
  if (data.test !== undefined) {
    const t = parseClashTest(data.test);
    if (!t) return null;
    out.test = t;
  }
  if (data.run !== undefined) {
    const r = data.run;
    if (!isObj(r) || !Array.isArray(r.results) || r.results.length > MAX_SAVE_RESULTS) return null;
    const rows = r.results.map(result);
    if (rows.some((x) => x === null)) return null;
    out.run = { results: rows as ClashResultWire[], ...(isObj(r.models) ? { models: r.models } : {}), ...(r.truncated === true ? { truncated: true } : {}) };
  }
  if (data.reviews !== undefined) {
    if (!Array.isArray(data.reviews) || data.reviews.length > MAX_SAVE_REVIEWS) return null;
    const rows = data.reviews.map(review);
    if (rows.some((x) => x === null)) return null;
    out.reviews = rows as ClashReviewWire[];
  }
  if (!out.test && !out.run && !out.reviews) return null;
  return out;
}

/** Správa hosta pre clash (overí tvar). */
export function parseClashInbound(data: unknown): ClashInboundMessage | null {
  if (!isObj(data) || data.source !== SOURCE) return null;
  if (data.type === 'CLASH_LOAD') {
    const test = parseClashTest(data.test);
    if (!test?.code) return null;
    let results: ClashResultWire[] | undefined;
    if (data.results !== undefined) {
      if (!Array.isArray(data.results) || data.results.length > MAX_LOAD_RESULTS) return null;
      const rows = data.results.map(result);
      if (rows.some((x) => x === null)) return null;
      results = rows as ClashResultWire[];
    }
    const run = isObj(data.run) && isText(data.run.id) ? { id: data.run.id } : undefined;
    return {
      source: SOURCE, type: 'CLASH_LOAD', test: test as ClashLoadMessage['test'],
      ...(run ? { run } : {}),
      ...(results ? { results, ...(isNum(data.results_total) ? { results_total: data.results_total } : {}), ...(data.results_truncated === true ? { results_truncated: true } : {}) } : {}),
    };
  }
  if (data.type === 'CLASH_SAVED') {
    if (data.ok === false) return isText(data.error, 2000) ? { source: SOURCE, type: 'CLASH_SAVED', ok: false, error: data.error } : null;
    if (data.ok !== true) return null;
    const notes = Array.isArray(data.notes) ? data.notes.filter((n): n is string => typeof n === 'string').map((n) => n.slice(0, 300)).slice(0, 5) : [];
    return {
      source: SOURCE, type: 'CLASH_SAVED', ok: true,
      ...(isText(data.test_code, 80) ? { test_code: data.test_code } : {}),
      ...(isText(data.run_id, 80) ? { run_id: data.run_id } : {}),
      ...(isNum(data.results) ? { results: data.results } : {}),
      ...(isNum(data.reviews) ? { reviews: data.reviews } : {}),
      ...(notes.length ? { notes } : {}),
    };
  }
  return null;
}
