/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Overenie výmer vo vieweri (AIM D-185 UI), lenivý modul: žiadosti na hosta (`VERIFY_REQUEST`), odpovede
 * (`VERIFY_RESULT` pošle most), kóty a zvýraznenie vstupných prvkov pri rozbalení detailu. Kanál na hosta je ten
 * istý ako pri IDS a knižnici požiadaviek (`idsHost.ts`). Viewer nič nepočíta ani neukladá.
 *
 * Pri výbere prvku: posledný uložený beh (`latest`); keď chýba alebo je zo staršej revízie, host prvok overí
 * (`run`) a beh uloží. Ribbon (skupina Overovanie) spustí `run_all` nad celým modelom. Priebežne sa neoveruje.
 */

import { useViewerStore } from '../store/index.js';
import { toast } from '@/components/ui/toast';
import { idsHostPost } from './idsHost.js';
import { useAimVerify, verifyFocus } from './aimVerifyStore.js';
import { anchorGuids, needsRun, segmentsForTargets } from './aimVerifyPlan.js';
import {
  buildVerifyRequest, isVerifyResult, parseRunAll, parseVerifyElement, VERIFY_CHECKS,
  type VerifyAction, type VerifyCheckId, type VerifyElementWire, type VerifyRequestMessage,
} from './verify-protocol.js';
import { showMeasurements } from './measureShow.js';
import { renderBoundsOfGuids, worldOffset } from './viewQueries.js';
import { renderBoxToIfc } from './viewFrame.js';
import { resolveGuids } from './bridge-protocol.js';

/** Načítanie z DB je rýchle; overenie jedného prvku motorom trvá sekundy, celého modelu minúty. */
const TIMEOUT_MS: Record<VerifyAction, number> = { latest: 30_000, run: 180_000, run_all: 20 * 60_000 };
const DISCONNECTED = 'Spojenie s AIM sa prerušilo.';

let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function request(action: VerifyAction, payload: VerifyRequestMessage['payload']): Promise<unknown> {
  const post = idsHostPost();
  if (!post) return Promise.reject(new Error('Viewer nie je pripojený k AIM.'));
  const id = `verify-${Date.now().toString(36)}-${++seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('AIM neodpovedal (starší host bez overovania výmer?).'));
    }, TIMEOUT_MS[action]);
    pending.set(id, { resolve, reject, timer });
    post(buildVerifyRequest(id, action, payload) as unknown as Record<string, unknown>);
  });
}

/** `VERIFY_RESULT` od hosta (most ho sem pošle). */
export function handleVerifyResult(raw: unknown): void {
  if (!isVerifyResult(raw)) return;
  const p = pending.get(raw.id);
  if (!p) return;
  pending.delete(raw.id);
  clearTimeout(p.timer);
  if (raw.ok) p.resolve(raw.data);
  else p.reject(new Error(raw.error ?? 'AIM odmietol požiadavku'));
}

/** Odpojenie mosta: čakajúce žiadosti zlyhajú, výsledok zo starého spojenia sa zahodí. */
export function stopVerify(): void {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(DISCONNECTED));
  }
  pending.clear();
  useAimVerify.setState({ guid: null, status: 'idle', data: null, error: null, open: null, shown: [], pinned: null, runAll: null });
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const current = (guid: string) => useAimVerify.getState().guid === guid;

async function fetchElement(action: 'latest' | 'run', guid: string): Promise<VerifyElementWire | null> {
  const el = parseVerifyElement(await request(action, { global_id: guid }));
  return el && el.global_id === guid ? el : null;
}

/**
 * Výsledok pre vybraný prvok: uložený beh, inak overenie teraz. `force` = znova aj pre ten istý prvok
 * (po behu celého modelu). Odpoveď pre prvok, ktorý už nie je vybraný, sa zahodí.
 */
export async function loadVerification(guid: string, force = false): Promise<void> {
  const st = useAimVerify.getState();
  if (!force && st.guid === guid && st.status !== 'error' && st.status !== 'idle') return;
  const other = st.guid !== guid;
  if ((st.open || st.shown.length > 0) && other) clearAll(); // kóty a zvýraznenie patrili predošlému prvku
  useAimVerify.setState({ guid, status: 'loading', data: null, error: null, ...(other ? { open: null, shown: [] } : {}) });
  try {
    let el = await fetchElement('latest', guid);
    if (!current(guid)) return;
    if (needsRun(el)) {
      useAimVerify.setState({ status: 'running', data: el });
      el = (await fetchElement('run', guid)) ?? el;
      if (!current(guid)) return;
    }
    useAimVerify.setState({ status: 'ready', data: el });
  } catch (e) {
    if (current(guid)) useAimVerify.setState({ status: 'error', error: errText(e) });
  }
}

/** Výber zrušený alebo prvok bez kontroly: zabudne výsledok, zruší kóty a zvýraznenie z detailu. */
export function forgetVerification(): void {
  const st = useAimVerify.getState();
  const had = st.open !== null || st.shown.length > 0;
  useAimVerify.setState({ guid: null, status: 'idle', data: null, error: null, open: null, shown: [], pinned: null });
  if (had) clearAll();
}

/** Výber sa zmenil: rozbalený detail iného prvku sa zavrie aj s kótami a zvýraznením; výsledok ostane. */
export function closeDetailUnless(guid: string | null): void {
  const st = useAimVerify.getState();
  if ((!st.open && st.shown.length === 0) || st.guid === guid) return;
  useAimVerify.setState({ open: null, shown: [] });
  clearAll();
}

/** Ribbon: overiť naraz všetky prvky kontroly v modeli; beh uloží host k revízii. */
export async function runAllVerification(check: VerifyCheckId): Promise<void> {
  if (useAimVerify.getState().runAll?.busy) return;
  const label = VERIFY_CHECKS.find((c) => c.id === check)?.label ?? check;
  useAimVerify.setState({ runAll: { check, busy: true, result: null, error: null } });
  try {
    const result = parseRunAll(await request('run_all', { check }));
    useAimVerify.setState({ runAll: { check, busy: false, result, error: null } });
    const c = result?.counts;
    toast.success(c
      ? `${label}: overených ${result.elements} prvkov, sedí ${c.green}, upozornenie ${c.yellow}, nesedí ${c.red}, nedá sa overiť ${c.grey}.`
      : `${label}: overenie dokončené.`);
    const guid = useAimVerify.getState().guid;
    if (guid) void loadVerification(guid, true);
  } catch (e) {
    useAimVerify.setState({ runAll: { check, busy: false, result: null, error: errText(e) } });
    toast.error(`${label}: ${errText(e)}`);
  }
}

/** Obálka prvku v IFC svete (m, Z hore), pre kótu v strede pôdorysu. */
function ifcBox(guid: string) {
  const state = useViewerStore.getState();
  const { union } = renderBoundsOfGuids(state, [guid], { resolveGuids } as Parameters<typeof renderBoundsOfGuids>[2]);
  return union ? renderBoxToIfc(union, worldOffset(state)) : null;
}

let scene: Promise<typeof import('./aimVerifyScene.js')> | null = null;
const loadScene = () => (scene ??= import('./aimVerifyScene.js'));

/** Kóty rozbaleného detailu a všetkých veličín so zapnutým očkom naraz (D-124 cesta, pripomienka 3). */
function drawMarks(): void {
  const { data, open, shown } = useAimVerify.getState();
  const keys = [...new Set([...(open ? [open] : []), ...shown])];
  const segments = data ? segmentsForTargets(data, keys, ifcBox(data.global_id)) : [];
  showMeasurements({ source: 'aim-bridge', type: 'MEASURE_SHOW', segments });
}

/**
 * Rozbalený detail: orez a kamera podľa druhu veličiny, miestnosť sa v scéne odznačí (panel ostane na nej), kóty
 * a zvýraznenie vstupných prvkov (FOCUS). Miestnosť sa nezvýrazňuje, jej výber a obrys prekryli scénu (pripomienka 4).
 */
export function showTarget(key: string): void {
  const { data } = useAimVerify.getState();
  const t = data?.targets.find((x) => x.target === key);
  if (!data || !t) return;
  const inputs = anchorGuids(t).filter((g) => g !== data.global_id);
  drawMarks();
  verifyFocus()?.(inputs, false); // kameru nastaví pohľad veličiny
  void loadScene().then((m) => {
    if (useAimVerify.getState().open !== key) return;
    m.releaseSceneSelection(data.global_id);
    m.applyVerifyView(key, data.global_id, inputs);
  }).catch((err) => console.warn('[aim-verify] view', err));
}

/** Očko pri riadku: kóta veličiny sa zapne alebo vypne nezávisle od rozbaleného detailu. */
export function toggleShown(key: string): void {
  const { shown } = useAimVerify.getState();
  useAimVerify.setState({ shown: shown.includes(key) ? shown.filter((k) => k !== key) : [...shown, key] });
  drawMarks();
}

/** Klik na prvok v bunke: zvýrazní a priblíži len jeho (panel ostane na miestnosti). */
export function focusElement(guid: string): void {
  verifyFocus()?.([guid]);
}

/** Detail zatvorený: kóty zapnutých veličín ostanú, zvýraznenie a orez sa vrátia. */
export function clearShown(): void {
  drawMarks();
  verifyFocus()?.([]);
  void scene?.then((m) => m.restoreVerifyView());
}

/** Iný prvok alebo zrušený výber: preč sú všetky kóty, zvýraznenie aj orez z overenia. */
function clearAll(): void {
  showMeasurements({ source: 'aim-bridge', type: 'MEASURE_SHOW', segments: [] });
  verifyFocus()?.([]);
  void scene?.then((m) => m.restoreVerifyView());
}
