/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Správy ICDD medzi viewerom a hostom AIM (AIMviewer#350, D-181): ribbon AIM, tlačidlo "ICDD".
 * Prácu (export, kontrolu kontajnera) robí host (D-091); viewer posiela len žiadosť a ukazuje stav.
 *
 *   viewer -> host  ICDD_EXPORT {id}  |  ICDD_CHECK {id, name, bytes}  (bytes ako transferable)
 *   host -> viewer  ICDD_STATUS {id, op, phase, message, result?}
 *
 * Vlastný súbor ako `view-protocol.ts`: `bridge-protocol.ts` je na strope veľkosti modulu.
 */

import { SOURCE } from './bridge-core.js';

export type IcddOp = 'export' | 'check';
export type IcddPhase = 'running' | 'done' | 'error';

/** Výsledok exportu (`phase: done`). */
export interface IcddExportResult {
  filename: string;
  payloads: number;
  links: number;
  size_bytes: number;
  ok: boolean;
  errors: string[];
  warnings: string[];
  skipped: string[];
}

/** Výsledok kontroly kontajnera (`phase: done`). */
export interface IcddCheckResult {
  ok: boolean;
  errors: string[];
  same: boolean;
  links_only_in_container: number;
  links_only_in_aim: number;
  payloads_changed: number;
  version_id: string | null;
}

export interface IcddStatusMessage {
  source: typeof SOURCE;
  type: 'ICDD_STATUS';
  id: string;
  op: IcddOp;
  phase: IcddPhase;
  message: string;
  result?: IcddExportResult | IcddCheckResult;
}

export interface IcddExportRequest {
  source: typeof SOURCE;
  type: 'ICDD_EXPORT';
  id: string;
}

export interface IcddCheckRequest {
  source: typeof SOURCE;
  type: 'ICDD_CHECK';
  id: string;
  name: string;
  bytes: ArrayBuffer;
}

export const buildExportRequest = (id: string): IcddExportRequest => ({ source: SOURCE, type: 'ICDD_EXPORT', id });
export const buildCheckRequest = (id: string, name: string, bytes: ArrayBuffer): IcddCheckRequest =>
  ({ source: SOURCE, type: 'ICDD_CHECK', id, name, bytes });

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

export function isExportResult(v: unknown): v is IcddExportResult {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.filename === 'string' && isCount(r.payloads) && isCount(r.links) && isCount(r.size_bytes)
    && typeof r.ok === 'boolean' && isStrings(r.errors) && isStrings(r.warnings) && isStrings(r.skipped);
}

export function isCheckResult(v: unknown): v is IcddCheckResult {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.ok === 'boolean' && isStrings(r.errors) && typeof r.same === 'boolean'
    && isCount(r.links_only_in_container) && isCount(r.links_only_in_aim) && isCount(r.payloads_changed)
    && (r.version_id === null || r.version_id === undefined || typeof r.version_id === 'string');
}

/** Správa `ICDD_STATUS` od hosta; `result` sa overí podľa `op`, zlý tvar výsledku správu zahodí. */
export function isIcddStatusMessage(d: unknown): d is IcddStatusMessage {
  if (!d || typeof d !== 'object') return false;
  const m = d as Record<string, unknown>;
  if (m.source !== SOURCE || m.type !== 'ICDD_STATUS') return false;
  if (typeof m.id !== 'string' || m.id.length === 0 || typeof m.message !== 'string') return false;
  if (m.op !== 'export' && m.op !== 'check') return false;
  if (m.phase !== 'running' && m.phase !== 'done' && m.phase !== 'error') return false;
  if (m.result === undefined) return true;
  return m.op === 'export' ? isExportResult(m.result) : isCheckResult(m.result);
}
