/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Clash z AIM (D-164, #292): test kolizii (sady A/B, tolerancia, mod) a stavy jeho vysledkov sa otvoria v upstream
 * paneli `clash` a upravene sa ulozia spat do AIM. Vlastny lenivy protokol (mimo `bridge-protocol.ts`, ktory je na
 * rozpocte velkosti); overuje ho az lenivy `aimClash.ts`. Vzor: `ids-protocol.ts` (D-162).
 *
 * Host -> viewer:
 *  - `CLASH_LOAD {test, run?, run_now?}`: otvori panel `clash` s testom. `test.a` a `test.b` su selektory panela
 *    (napr. `IfcDuctSegment|IfcPipeSegment`, `!IfcSpace`), tolerancia a odstup v mm. `run.results` su vysledky
 *    ulozeneho behu (dvojica GUID A/B a stav open/resolved/accepted): viewer ich stavy priradi dvojiciam a `run_now`
 *    (predvolene true, ak je `run`) spusti detekciu, aby ich pouzivatel videl v zozname.
 *  - `CLASH_SAVED {ok, id?, version?, error?, latest_version?}`: vysledok `CLASH_SAVE`; pri `ok` si viewer
 *    zapamata id a verziu testu (dalsie ulozenie ide nad nou), pri konflikte `latest_version` nesie poslednu verziu.
 * Viewer -> host:
 *  - `CLASH_SAVE {test, run?, id?, base_version?}`: tlacidlo "Ulozit do AIM" v paneli. Bez `id` ide o novy test;
 *    `base_version` je verzia, z ktorej sa vychadzalo (host pri inej odpovie 409). `run` nesie posledny beh
 *    (vysledky, stavy, `truncated` ak sa orezali).
 */

import { SOURCE } from './bridge-core.js';

export type ClashAimMode = 'hard' | 'clearance';
export type ClashAimStatus = 'open' | 'resolved' | 'accepted';
export const CLASH_AIM_STATUSES: readonly ClashAimStatus[] = ['open', 'resolved', 'accepted'];

/** Stropy: vysledkov v sprave a dlzka selektora (panel validuje selektor sam, tu len rozumna hranica). */
export const MAX_CLASH_RESULTS = 5000;
const MAX_TEXT = 200;
const MAX_SELECTOR = 500;
/** Hranice panela (`CLASH_BOUNDS`): tolerancia 0 az 1 m, odstup 0 az 5 m. */
export const MAX_TOLERANCE_MM = 1000;
export const MAX_CLEARANCE_MM = 5000;

export interface ClashAimTest {
  id?: string;
  version?: number;
  name: string;
  a: string;
  b: string;
  mode: ClashAimMode;
  tolerance_mm: number;
  clearance_mm?: number;
}
export interface ClashAimResult {
  a_guid: string;
  b_guid: string;
  status: ClashAimStatus;
  distance_mm?: number;
  comment?: string;
}
export interface ClashAimRun {
  results: ClashAimResult[];
  truncated?: boolean;
}

export interface ClashLoadMessage {
  source: typeof SOURCE;
  type: 'CLASH_LOAD';
  test: ClashAimTest;
  run?: ClashAimRun;
  run_now?: boolean;
}
export interface ClashSavedMessage {
  source: typeof SOURCE;
  type: 'CLASH_SAVED';
  ok: boolean;
  id?: string;
  version?: number;
  error?: string;
  latest_version?: number;
}
export type ClashInboundMessage = ClashLoadMessage | ClashSavedMessage;

export interface ClashSaveMessage {
  source: typeof SOURCE;
  type: 'CLASH_SAVE';
  test: ClashAimTest;
  run?: ClashAimRun;
  id?: string;
  base_version?: number;
}

/** Typy sprav hosta, ktore posiela `AimBridge` do leniveho modulu. */
export const CLASH_INBOUND_TYPES: readonly string[] = ['CLASH_LOAD', 'CLASH_SAVED'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;
const isSelector = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_SELECTOR;
const isVersion = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const isMm = (max: number) => (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const optional = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || ok(v);

export const isClashStatus = (v: unknown): v is ClashAimStatus => CLASH_AIM_STATUSES.includes(v as ClashAimStatus);

/** Test v tvare, v akom ho posiela host aj viewer (overi tvar a hranice). */
export function isClashTest(v: unknown): v is ClashAimTest {
  return isObj(v) && isText(v.name) && isSelector(v.a) && isSelector(v.b) && (v.mode === 'hard' || v.mode === 'clearance')
    && isMm(MAX_TOLERANCE_MM)(v.tolerance_mm) && optional(v.clearance_mm, isMm(MAX_CLEARANCE_MM))
    && optional(v.id, isText) && optional(v.version, isVersion);
}

function isResult(v: unknown): v is ClashAimResult {
  return isObj(v) && isText(v.a_guid) && isText(v.b_guid) && isClashStatus(v.status)
    && optional(v.distance_mm, (d) => typeof d === 'number' && Number.isFinite(d))
    && optional(v.comment, (c) => typeof c === 'string' && c.length <= 2000);
}

export function isClashRun(v: unknown): v is ClashAimRun {
  return isObj(v) && Array.isArray(v.results) && v.results.length <= MAX_CLASH_RESULTS && v.results.every(isResult)
    && optional(v.truncated, (t) => typeof t === 'boolean');
}

/** Sprava hosta pre clash (overi tvar). */
export function isClashInbound(data: unknown): data is ClashInboundMessage {
  if (!isObj(data) || data.source !== SOURCE) return false;
  if (data.type === 'CLASH_LOAD') {
    return isClashTest(data.test) && optional(data.run, isClashRun) && optional(data.run_now, (v) => typeof v === 'boolean');
  }
  if (data.type === 'CLASH_SAVED') {
    return typeof data.ok === 'boolean' && optional(data.id, isText) && optional(data.version, isVersion)
      && optional(data.latest_version, isVersion) && optional(data.error, (v) => typeof v === 'string' && v.length <= 2000);
  }
  return false;
}
