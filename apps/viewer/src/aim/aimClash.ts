/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Most medzi clash v AIM a upstream panelom `clash` (D-164), lenivo pri prvej správe hosta alebo pri prvom
 * zobrazení tlačidla "Uložiť do AIM". Panel, detekcia a kontroly (open, resolved, accepted) sú upstreamu;
 * AIM len naplní jeho vstup (`CLASH_LOAD`: preset s množinami A a B, režim, tolerancia, stavy dvojíc) a pošle
 * hostovi to, čo používateľ nastavil a rozhodol (`CLASH_SAVE`). Tvar správ je v `clash-protocol.ts`, stav
 * v `aimClashStore.ts`, čistá logika v `aimClashPlan.ts`.
 */

import { useViewerStore } from '../store/index.js';
import { saveReviews } from '@/lib/clash/persistence';
import { SOURCE } from './bridge-core.js';
import { idsHostPost } from './idsHost.js';
import { isClashInbound, type ClashLoadMessage, type ClashSavedMessage, type ClashSaveMessage } from './clash-protocol.js';
import { activePreset, currentSignature, settingsOf, useAimClash, type ClashStatus } from './aimClashStore.js';
import { buildRun, buildTest, reviewUpdates } from './aimClashPlan.js';
import { statusAfterDisconnect } from './aimIdsStatus.js';
import { runRequestOf } from '@/lib/clash/run-request';

export interface ClashDeps {
  noteIssue: (text: string) => void;
}

const store = useViewerStore;
let runSeq = 0;
/** Čo sa odoslalo v `CLASH_SAVE`; podľa toho `CLASH_SAVED` prepojí preset s testom v AIM. */
let pending: { presetId: string; signature: string } | null = null;

const setStatus = (status: ClashStatus | null): void => useAimClash.setState({ status });

/** Odpojenie mosta: rozpracované uloženie sa zruší (potvrdenie už nepríde), hotový výsledok ostáva. */
export function stopClash(): void {
  pending = null;
  setStatus(statusAfterDisconnect(useAimClash.getState().status));
}

async function load(msg: ClashLoadMessage, deps: ClashDeps): Promise<void> {
  const { test, run } = msg;
  const s = store.getState();
  const known = useAimClash.getState().slot?.presetId;
  let presetId = s.clashPresets.some((p) => p.id === known && !p.builtin) ? known : undefined;
  // Jeden preset patrí AIM a nahrádza sa, aby sa v localStorage nezbierali kópie každého otvorenia.
  const saved = presetId
    ? s.updateClashPreset(presetId, { name: test.name.trim(), selectorA: test.a.trim(), selectorB: test.b.trim() })
    : s.createClashPreset({ name: test.name, selectorA: test.a, selectorB: test.b, severity: 'major' });
  if (!saved.ok) return deps.noteIssue(`CLASH_LOAD: test '${test.name}' sa nepodarilo uložiť do panela clash (${saved.message ?? saved.reason})`);
  presetId ??= store.getState().clashPresets.filter((p) => !p.builtin).at(-1)?.id;
  if (!presetId) return deps.noteIssue(`CLASH_LOAD: test '${test.name}' sa nepodarilo vytvoriť`);
  const id = presetId;
  const v = store.getState();
  v.setClashMode(test.mode);
  v.setClashTolerance(test.tolerance_mm / 1000);
  if (test.clearance_mm !== undefined) v.setClashClearance(test.clearance_mm / 1000);
  if (run) {
    // Jedno uloženie naraz (nie jedno na dvojicu): kontroly sa píšu do localStorage celé.
    const updates = reviewUpdates(id, run.results, (key) => store.getState().clashReviews.get(key));
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
    slot: test.id && test.version && preset ? { id: test.id, version: test.version, presetId: id, baseline: currentSignature(after, preset) } : null,
    expected: run?.results ?? null,
    run: msg.run_now ?? !!run ? { seq: ++runSeq } : null,
  });
  setStatus(null);
  const { applyPanels } = await import('./aimPanels.js');
  applyPanels({ clash: 'open' }, deps.noteIssue);
}

/** Výsledok `CLASH_SAVE` od hosta: preset sa prepojí s testom v AIM (id, verzia), alebo sa ukáže konflikt či chyba. */
function handleSaved(msg: ClashSavedMessage): void {
  const sent = pending;
  pending = null;
  if (msg.ok && msg.id && msg.version) {
    // Bez zapamätaného odoslania (potvrdenie po odpojení mosta) sa preset s AIM neprepojí, len sa ukáže výsledok.
    if (sent) useAimClash.setState({ slot: { id: msg.id, version: msg.version, presetId: sent.presetId, baseline: sent.signature } });
    setStatus({ kind: 'saved', id: msg.id, version: msg.version });
    return;
  }
  if (msg.latest_version) setStatus({ kind: 'conflict', latest: msg.latest_version, ...(msg.error ? { error: msg.error } : {}) });
  else setStatus({ kind: 'error', error: msg.error ?? 'unknown' });
}

/** Správa hosta o clash (`CLASH_LOAD`, `CLASH_SAVED`); overí sa tu, mimo vstupného balíka. */
export async function runClashMessage(raw: unknown, deps: ClashDeps): Promise<void> {
  if (!isClashInbound(raw)) return deps.noteIssue('CLASH: neplatná správa (CLASH_LOAD, CLASH_SAVED)');
  if (raw.type === 'CLASH_SAVED') return handleSaved(raw);
  return load(raw, deps);
}

/** Tlačidlo "Uložiť do AIM": test (preset, režim, tolerancia) a posledný beh so stavmi, nad verziou, z ktorej sa vychádzalo. */
export function saveToAim(): void {
  const post = idsHostPost();
  const fail = (error: string) => setStatus({ kind: 'error', error });
  if (!post) return fail('not connected');
  const v = store.getState();
  const slot = useAimClash.getState().slot;
  const preset = activePreset(v, slot);
  if (!preset || !v.clashRawResult || runRequestOf(v.clashRawResult)?.kind !== 'preset') return fail('run a single rule (A and B sets) first');
  const linked = slot?.presetId === preset.id ? slot : null;
  pending = { presetId: preset.id, signature: currentSignature(v, preset) };
  setStatus({ kind: 'saving' });
  const msg: ClashSaveMessage = {
    source: SOURCE, type: 'CLASH_SAVE', test: buildTest(settingsOf(v, preset)),
    run: buildRun(preset.id, v.clashRawResult.clashes, (key) => v.clashReviews.get(key)),
    ...(linked ? { id: linked.id, base_version: linked.version } : {}),
  };
  post(msg as unknown as Record<string, unknown>);
}
