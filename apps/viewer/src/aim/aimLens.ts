/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lens z chatu vo vieweri (AIM D-096): `APPLY_LENS` vloží AIM chat lens do
 * dočasného slotu `AUTO_COLOR_FROM_LIST_ID` (ten istý ako "Color by" z tabuľky:
 * upstream ho neukladá do localStorage ani neexportuje), aktivuje ju a otvorí
 * panel Lens; vyhodnotenie, farby, skrytie a počty robí upstream `useLens`.
 * `LENS_QUERY` počká na vyhodnotenie verzie `rev` a vráti počty hosťovi.
 * Načítava sa lenivo z `AimBridge` pri prvej správe Lens.
 */

import { useViewerStore } from '@/store';
import { AUTO_COLOR_FROM_LIST_ID } from '@/lib/lens/persistence';
import type { LensInboundMessage } from './lens-protocol.js';
import type { ViewQueryResult } from './view-protocol.js';
import {
  isAimLens, isEvaluated, nextAimLens, parseLensMessage, summarizeLens,
  type ApplyLensMessage, type LensQueryMessage,
} from './aimLensPlan.js';

const SLOT = AUTO_COLOR_FROM_LIST_ID;
const POLL_MS = 100;
const WAIT_MS = 6000;

/** Posledná použitá verzia od hosta (na párovanie `LENS_QUERY`). */
let appliedRev: string | undefined;
let seq = 0;

type State = ReturnType<typeof useViewerStore.getState>;
const slotLens = (s: State) => s.savedLenses.find((l) => l.id === SLOT) ?? null;

function applyLens(msg: ApplyLensMessage): void {
  const state = useViewerStore.getState();
  const prev = slotLens(state);
  const models = [...state.models.values()].map((m) => ({ name: m.name, fingerprint: m.sourceFingerprint }));
  const next = nextAimLens(prev, msg, SLOT, models, msg.rev ?? `s${++seq}`);
  appliedRev = msg.rev;
  const others = state.savedLenses.filter((l) => l.id !== SLOT);
  if (!next) {
    // "Color by" z tabuľky v tom istom slote chat nevypína.
    if (!isAimLens(prev)) return;
    useViewerStore.setState({ savedLenses: others, activeLensId: state.activeLensId === SLOT ? null : state.activeLensId });
    return;
  }
  useViewerStore.setState({ savedLenses: [...others, next], activeLensId: SLOT, lensPanelVisible: true });
}

function answerLensQuery(msg: LensQueryMessage, origin: string, started = Date.now()): void {
  const reply = (r: ViewQueryResult) => window.parent.postMessage(r, origin);
  const state = useViewerStore.getState();
  const lens = state.activeLensId === SLOT && isAimLens(slotLens(state)) ? slotLens(state) : null;
  const revReady = !msg.rev || appliedRev === msg.rev;
  const ready = revReady && (!lens || isEvaluated(lens, state.lensRuleCounts, state.lensAutoColorLegend));
  if (!ready && Date.now() - started < WAIT_MS) {
    setTimeout(() => answerLensQuery(msg, origin, started), POLL_MS);
    return;
  }
  if (!revReady) {
    reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: false, error: 'Lens s touto verziou do viewera neprišla.' });
    return;
  }
  const result = { ...summarizeLens(lens, state.lensRuleCounts, state.lensAutoColorLegend, msg.rev), ...(ready ? {} : { pending: true }) };
  reply({ source: msg.source, type: 'QUERY_RESULT', id: msg.id, ok: true, result });
}

export function handleLensMessage(data: LensInboundMessage, origin: string): void {
  const msg = parseLensMessage(data);
  if (!msg) {
    console.warn('[aim-bridge] neplatná správa Lens', data.type);
    if (data.type === 'LENS_QUERY' && typeof data.id === 'string') {
      window.parent.postMessage({ source: data.source, type: 'QUERY_RESULT', id: data.id, ok: false, error: 'neplatná otázka' }, origin);
    }
    return;
  }
  if (msg.type === 'LENS_QUERY') answerLensQuery(msg, origin);
  else applyLens(msg);
}
