/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Knižnica požiadaviek vo vieweri (AIM D-182): stav karty, žiadosti na hosta (`REQLIB_REQUEST`) a uloženie
 * výsledku kontroly z panela validácie. Lenivý modul (karta, lišta IDS, most pri `REQLIB_RESULT`); kanál na hosta
 * je ten istý ako pri IDS (`idsHost.ts`).
 */

import { create } from 'zustand';
import { useViewerStore } from '../store/index.js';
import { idsHostPost } from './idsHost.js';
import { buildReqlibRequest, isReqlibResult, type ReqlibAction } from './reqlib-protocol.js';
import { assignOutcome, idsEngineVersion, runsByModel, saveRunOutcome, sha256Hex, type ReportSpecLike } from './reqlibPlan.js';
import { activeIdsEntry, useAimIds } from './aimIdsStore.js';

/** Host odpovedá z DB a GitHubu; dlhšie čakanie = host nereaguje (starší host bez D-182). */
const TIMEOUT_MS = 60_000;
const DISCONNECTED = 'Spojenie s AIM sa prerušilo; obnov knižnicu.';
const AUTHOR_KEY = 'aim.reqlib.author';

export interface ReqlibState {
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  /** Prebiehajúca akcia (kód alebo cesta), tlačidlá sa vypnú. */
  busy: string | null;
  /** Posledná správa pre používateľa (priradenie, väzba, uloženie výsledku). */
  notice: { kind: 'ok' | 'error'; text: string } | null;
  /** Priradenie čaká na voľbu: nové IDS alebo pokračovanie histórie premenovaného IDS. */
  choice: { path: string; commit: string; sha256: string; code: string; candidates: string[]; message: string } | null;
  author: string;
}

function readAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
}

export const useAimReqlib = create<ReqlibState>()(() => ({
  data: null, loading: false, error: null, busy: null, notice: null, choice: null, author: readAuthor(),
}));

export function setAuthor(author: string): void {
  useAimReqlib.setState({ author });
  try {
    localStorage.setItem(AUTHOR_KEY, author);
  } catch {
    /* súkromné okno: meno ostane len do zatvorenia */
  }
}

let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function request(action: ReqlibAction, payload: Record<string, unknown>): Promise<unknown> {
  const post = idsHostPost();
  if (!post) return Promise.reject(new Error('Viewer nie je pripojený k AIM.'));
  const id = `reqlib-${Date.now().toString(36)}-${++seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('AIM neodpovedal (starší host bez knižnice požiadaviek?).'));
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    post(buildReqlibRequest(id, action, payload) as unknown as Record<string, unknown>);
  });
}

/** `REQLIB_RESULT` od hosta (most ho sem pošle). */
export function handleReqlibResult(raw: unknown): void {
  if (!isReqlibResult(raw)) return;
  const p = pending.get(raw.id);
  if (!p) return;
  pending.delete(raw.id);
  clearTimeout(p.timer);
  if (raw.ok) p.resolve(raw.data);
  else p.reject(new Error(raw.error ?? 'AIM odmietol požiadavku'));
}

/**
 * Odpojenie mosta: čakajúce žiadosti zlyhajú hneď a karta zahodí všetko zo starého spojenia (katalóg, hlásenie,
 * voľbu priradenia s commitom a sha spred odpojenia). Ostane chyba, karta sa znova načíta cez "Obnoviť".
 */
export function stopReqlib(): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(DISCONNECTED));
  }
  pending.clear();
  useAimReqlib.setState({ data: null, notice: null, choice: null, busy: null, loading: false, error: DISCONNECTED });
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function loadCatalog(): Promise<void> {
  useAimReqlib.setState({ loading: true, error: null });
  try {
    const data = (await request('catalog', {})) as Record<string, unknown>;
    useAimReqlib.setState({ data, loading: false });
  } catch (e) {
    useAimReqlib.setState({ loading: false, error: errText(e) });
  }
}

function requireAuthor(): string | null {
  const author = useAimReqlib.getState().author.trim();
  if (!author) useAimReqlib.setState({ notice: { kind: 'error', text: 'Zadaj svoje meno (kto priraďuje alebo ukladá).' } });
  return author || null;
}

async function act(key: string, action: ReqlibAction, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  useAimReqlib.setState({ busy: key, notice: null });
  try {
    return ((await request(action, payload)) ?? {}) as Record<string, unknown>;
  } catch (e) {
    useAimReqlib.setState({ notice: { kind: 'error', text: errText(e) } });
    return null;
  } finally {
    useAimReqlib.setState({ busy: null });
  }
}

/** "Priradiť k projektu"; `opts` = odpoveď na voľbu pri premenovanom kóde. */
export async function assign(item: { path: string; commit: string; sha256: string }, opts: { continue_code?: string; as_new?: boolean } = {}): Promise<void> {
  const author = requireAuthor();
  if (!author) return;
  const out = await act(item.path, 'assign', { ...item, author, ...opts });
  if (!out) return;
  const outcome = assignOutcome(out);
  if (outcome.kind === 'choice') {
    useAimReqlib.setState({ choice: { ...item, code: outcome.code, candidates: outcome.candidates, message: outcome.message } });
    return;
  }
  useAimReqlib.setState({ choice: null, notice: outcome });
  await loadCatalog();
}

export const cancelChoice = () => useAimReqlib.setState({ choice: null });

export async function bind(code: string, model: string, bound: boolean): Promise<void> {
  const author = requireAuthor();
  if (!author) return;
  const out = await act(`${code}|${model}`, 'bind', { code, model, bound, author });
  if (out) await loadCatalog();
}

/** IDS z projektu do IDS Studia alebo Data validation (host pošle `IDS_LOAD`). */
export async function openIds(code: string, version: number, target: 'studio' | 'validation'): Promise<void> {
  await act(`${code}|open`, 'open', { code, version, target });
}

/**
 * "Uložiť výsledok do AIM" v paneli validácie: posledný beh nad neupraveným IDS z AIM, po modeloch, s verziou
 * nástroja. Revíziu modelu doplní host (vie, ktorú viewer načítal). Vráti text pre lištu.
 */
export async function saveRunToAim(): Promise<{ ok: boolean; text: string }> {
  const slot = useAimIds.getState().validation;
  const v = useViewerStore.getState();
  const entry = activeIdsEntry(v);
  const report = v.idsValidationReport;
  if (!slot?.code || !slot.version || !entry || slot.entryId !== entry.id) return { ok: false, text: 'IDS nie je z AIM: najprv ho ulož do AIM.' };
  if (entry.xml !== slot.baseline) return { ok: false, text: 'IDS je upravené: ulož ho ako pracovnú kópiu a kontrolu spusti znova.' };
  if (!report || report.source.kind !== 'ids' || report.specificationResults.length === 0) return { ok: false, text: 'Najprv spusti kontrolu.' };
  const author = requireAuthor() ?? '';
  if (!author) return { ok: false, text: 'Zadaj svoje meno v karte Requirements library.' };
  const specs = report.specificationResults as unknown as ReportSpecLike[];
  const modelIds = [...new Set([...report.modelInfo.map((m) => m.modelId), ...specs.flatMap((s) => s.entityResults.map((e) => e.modelId ?? ''))].filter(Boolean))];
  const packages = typeof __PACKAGE_VERSIONS__ !== 'undefined' ? __PACKAGE_VERSIONS__ : [];
  try {
    const runs = runsByModel(specs, modelIds, (id) => v.models.get(id)?.name ?? id);
    const out = await request('save_run', {
      code: slot.code,
      version: slot.version,
      ids_sha256: await sha256Hex(entry.xml),
      engine_version: idsEngineVersion(packages),
      author,
      runs,
    });
    return saveRunOutcome(out);
  } catch (e) {
    return { ok: false, text: errText(e) };
  }
}
