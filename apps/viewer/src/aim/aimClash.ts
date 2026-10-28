/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Most medzi clash v AIM a upstream panelom `clash` (D-164), lenivo pri prvej správe hosta alebo pri prvom
 * zobrazení tlačidla "Uložiť do AIM". Panel, detekcia a kontroly (open, resolved, accepted) sú upstreamu;
 * AIM len naplní jeho vstup (`CLASH_LOAD`: preset so sadami A a B, režim, tolerancia, stavy dvojíc) a pošle
 * hostovi to, čo používateľ nastavil a rozhodol (`CLASH_SAVE`). Tvar správ je v `clash-protocol.ts`, stav
 * a preklad medzi hostom a presetom v `aimClashStore.ts`, čistá logika v `aimClashPlan.ts`.
 */

import { useViewerStore } from '../store/index.js';
import { saveReviews } from '@/lib/clash/persistence';
import { runRequestOf } from '@/lib/clash/run-request';
import { SOURCE } from './bridge-core.js';
import { idsHostPost } from './idsHost.js';
import { MAX_SAVE_REVIEWS, parseClashInbound, parseClashSave, type ClashLoadMessage, type ClashSavedMessage, type ClashSaveMessage } from './clash-protocol.js';
import {
  activePreset, changesOf, clashesOf, filterOf, labelOf, modelByLabel, snapshotOf, testOf, useAimClash, type ClashSlot, type ClashStatus,
} from './aimClashStore.js';
import { buildResults, loadUpdates, testSignature } from './aimClashPlan.js';
import { statusAfterDisconnect } from './aimIdsStatus.js';

export interface ClashDeps {
  noteIssue: (text: string) => void;
}

const store = useViewerStore;
let runSeq = 0;
/** Čo sa odoslalo v `CLASH_SAVE`; podľa toho `CLASH_SAVED` prepojí preset s testom v AIM. */
let pending: { presetId: string; code?: string; testSig: string; reviews: ClashSlot['reviews'] } | null = null;

const setStatus = (status: ClashStatus | null): void => useAimClash.setState({ status });

/** Odpojenie mosta: rozpracované uloženie sa zruší (potvrdenie už nepríde), hotový výsledok ostáva. */
export function stopClash(): void {
  pending = null;
  setStatus(statusAfterDisconnect(useAimClash.getState().status));
}

async function load(msg: ClashLoadMessage, deps: ClashDeps): Promise<void> {
  const { test, results } = msg;
  const s = store.getState();
  const bSide = test.b ?? test.a;
  for (const side of [test.a, bSide]) {
    if (side.model && !modelByLabel(s.models, side.model)) deps.noteIssue(`CLASH_LOAD: model '${side.model}' nie je načítaný, jeho sada nič nenájde`);
  }
  const input = {
    name: test.name, selectorA: test.a.type, selectorB: bSide.type,
    filterA: filterOf(test.a, s.models), filterB: filterOf(bSide, s.models),
    ...(test.description ? { description: test.description } : {}),
  };
  const known = useAimClash.getState().slot?.presetId;
  let presetId = s.clashPresets.some((p) => p.id === known && !p.builtin) ? known : undefined;
  // Jeden preset patrí AIM a nahrádza sa, aby sa v localStorage nezbierali kópie každého otvorenia.
  const saved = presetId ? s.updateClashPreset(presetId, input) : s.createClashPreset({ ...input, severity: 'major' });
  if (!saved.ok) return deps.noteIssue(`CLASH_LOAD: test '${test.name}' sa nepodarilo uložiť do panela clash (${saved.message ?? saved.reason})`);
  presetId ??= store.getState().clashPresets.filter((p) => !p.builtin).at(-1)?.id;
  if (!presetId) return deps.noteIssue(`CLASH_LOAD: test '${test.name}' sa nepodarilo vytvoriť`);
  const id = presetId;
  const v = store.getState();
  v.setClashMode(test.mode);
  if (test.tolerance_mm !== undefined) v.setClashTolerance(test.tolerance_mm / 1000);
  if (test.clearance_mm !== undefined) v.setClashClearance(test.clearance_mm / 1000);
  if (results) {
    // Jedno uloženie naraz (nie jedno na dvojicu): kontroly sa píšu do localStorage celé.
    const updates = loadUpdates(id, results, (key) => store.getState().clashReviews.get(key));
    if (updates.length) {
      const next = new Map(store.getState().clashReviews);
      for (const u of updates) {
        if (u.status === 'open' && !u.comment) next.delete(u.key);
        else next.set(u.key, { status: u.status, updatedAt: Date.now(), ...(u.comment ? { comment: u.comment } : {}) });
      }
      const result = saveReviews(next);
      if (result.ok) store.setState({ clashReviews: next });
      else deps.noteIssue(`CLASH_LOAD: stavy dvojíc sa nepodarilo uložiť (${result.message ?? result.reason})`);
    }
  }
  const after = store.getState();
  const preset = after.clashPresets.find((p) => p.id === id);
  useAimClash.setState({
    slot: preset ? { code: test.code, presetId: id, testSig: testSignature(testOf(after, preset, test.code)), reviews: snapshotOf(after, id) } : null,
    loaded: results ? { ...(msg.run?.id ? { runId: msg.run.id } : {}), results } : null,
    run: results ? { seq: ++runSeq } : null,
  });
  setStatus(null);
  const { applyPanels } = await import('./aimPanels.js');
  applyPanels({ clash: 'open' }, deps.noteIssue);
}

/** Výsledok `CLASH_SAVE` od hosta: preset sa prepojí s testom v AIM (kód), alebo sa ukáže chyba. */
function handleSaved(msg: ClashSavedMessage): void {
  const sent = pending;
  pending = null;
  if (!msg.ok) return setStatus({ kind: 'error', error: msg.error });
  // Bez zapamätaného odoslania (potvrdenie po odpojení mosta) sa preset s AIM neprepojí, len sa ukáže výsledok.
  const code = msg.test_code ?? sent?.code;
  if (sent && code) useAimClash.setState({ slot: { code, presetId: sent.presetId, testSig: sent.testSig, reviews: sent.reviews } });
  setStatus({
    kind: 'saved',
    ...(msg.results !== undefined ? { results: msg.results } : {}),
    ...(msg.reviews !== undefined ? { reviews: msg.reviews } : {}),
    ...(msg.notes ? { notes: msg.notes } : {}),
  });
}

/** Správa hosta o clash (`CLASH_LOAD`, `CLASH_SAVED`); overí sa tu, mimo vstupného balíka. */
export async function runClashMessage(raw: unknown, deps: ClashDeps): Promise<void> {
  const msg = parseClashInbound(raw);
  if (!msg) return deps.noteIssue('CLASH: neplatná správa (CLASH_LOAD, CLASH_SAVED)');
  if (msg.type === 'CLASH_SAVED') return handleSaved(msg);
  return load(msg, deps);
}

/**
 * Tlačidlo "Uložiť do AIM": jedna správa s testom (celým, keď je nový alebo upravený, inak stačí jeho kód), posledným
 * behom tohto pravidla a zmenenými stavmi dvojíc. Host test z AIM s predvoleným kódom neprepíše, beh a stavy uloží.
 */
export function saveToAim(): void {
  const post = idsHostPost();
  const fail = (error: string) => setStatus({ kind: 'error', error });
  if (!post) return fail('not connected');
  const v = store.getState();
  const aim = useAimClash.getState();
  const preset = activePreset(v, aim.slot);
  if (!preset) return fail('open a test from AIM, or run one rule (sets A and B), first');
  const linked = aim.slot?.presetId === preset.id ? aim.slot : null;
  const test = testOf(v, preset, linked?.code);
  const req = runRequestOf(v.clashRawResult);
  const ran = req?.kind === 'preset' && req.presetId === preset.id;
  const run = ran ? buildResults(preset.id, clashesOf(v), labelOf(v.models)) : null;
  const { changes, skipped } = changesOf(v, aim.slot, preset, aim.loaded);
  if (changes.length > MAX_SAVE_REVIEWS) return fail(`too many changed statuses (${changes.length}, the limit is ${MAX_SAVE_REVIEWS}); narrow the test`);
  const testChanged = !linked || testSignature(test) !== linked.testSig;
  if (!testChanged && !run && changes.length === 0) return fail(skipped ? 'the changed statuses are for pairs this run does not contain; run the test again' : 'nothing to save');
  const msg: ClashSaveMessage = {
    source: SOURCE, type: 'CLASH_SAVE',
    ...(testChanged ? { test } : { test_code: linked!.code }),
    ...(run ? { run: { results: run.results, ...(run.truncated ? { truncated: true } : {}) } } : {}),
    ...(changes.length ? { reviews: changes } : {}),
  };
  if (!parseClashSave(msg)) return fail('the message is not valid for AIM');
  pending = { presetId: preset.id, ...(linked ? { code: linked.code } : {}), testSig: testSignature(test), reviews: snapshotOf(v, preset.id) };
  setStatus({ kind: 'saving' });
  post(msg as unknown as Record<string, unknown>);
}
