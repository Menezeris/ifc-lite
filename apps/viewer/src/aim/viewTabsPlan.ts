/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Záložky viewera (AIM D-132, #165): jedna záložka = jeden otvorený pohľad na
 * celú plochu, ako v Revite. Tu je len čistá logika bez store: zoznam, aktívna
 * záložka, "Vedľa" (druhá záložka vedľa aktívnej) a z toho rozloženie strednej
 * plochy. Vykonanie (kamera, rez, zámok, pôdorys) je v `viewTabsApply.ts`,
 * store v `viewTabsStore.ts`.
 *
 * Druhy: `3d` (voľná kamera, vždy prvá, nedá sa zavrieť), `plan` (pôdorys
 * podlažia za behu z IfcBuildingStorey: zamknutý kolmý pohľad zhora s rezom,
 * D-072), `view` (uložený pohľad hosta, D-122: orez a zamknutá kamera) a `doc`
 * (karta dokumentu D-075). Viewer má jeden 3D canvas, preto vedľa seba môže byť
 * najviac jedna 3D záložka; druhá je dokument, alebo pôdorys ako 2D panel plánu
 * (D-072, len s kalibrovaným podkladom).
 */

import { TAB_3D, isSceneTab, type ViewTab, type ViewTabsState } from './viewTabsLayout.js';

export { TAB_3D, centerLayout, initialTabs, isSceneTab, type CenterLayout, type ViewTab, type ViewTabKind, type ViewTabsState } from './viewTabsLayout.js';

export const planTabId = (storeyGuid: string) => `plan:${storeyGuid}`;
export const docTabId = (docId: string) => `doc:${docId}`;
export const viewTabId = (viewId: string) => `view:${viewId}`;

const byId = (s: ViewTabsState, id: string | null) => (id ? s.tabs.find((t) => t.id === id) : undefined);

/**
 * Otvorí záložku (alebo nájde už otvorenú s tým istým id, menovka sa obnoví) a
 * urobí ju aktívnou. `beside` = nová záložka ide vedľa doterajšej aktívnej.
 */
export function openTab(s: ViewTabsState, tab: ViewTab, opts: { beside?: boolean } = {}): ViewTabsState {
  const exists = s.tabs.some((t) => t.id === tab.id);
  const tabs = exists ? s.tabs.map((t) => (t.id === tab.id ? { ...t, ...tab } : t)) : [...s.tabs, tab];
  const next = { ...s, tabs };
  if (opts.beside && tab.id !== s.activeId) {
    const pair = besidePair(next, s.activeId, tab.id);
    if (pair) return { ...next, activeId: pair.active, besideId: pair.beside };
  }
  return activateTab(next, tab.id);
}

/**
 * Prepne na záložku. Keď je to záložka zobrazená vedľa, ostane dvojica (len sa
 * vymení, ktorá je aktívna); inak sa "Vedľa" zruší, ak by nová dvojica nebola
 * prípustná.
 */
export function activateTab(s: ViewTabsState, id: string): ViewTabsState {
  if (!byId(s, id)) return s;
  if (id === s.besideId) return { ...s, activeId: id, besideId: s.activeId };
  const keep = s.besideId && besidePair(s, id, s.besideId);
  return { ...s, activeId: id, besideId: keep ? s.besideId : null };
}

/**
 * Prípustná dvojica vedľa seba: nikdy dve záložky toho istého druhu canvasu
 * (dve 3D, dva dokumenty sú jeden panel), pôdorys vedľa voľnej 3D ide ako 2D
 * panel plánu. Vráti, ktorá je aktívna (3D strana) a ktorá vedľa.
 */
export function besidePair(s: ViewTabsState, a: string, b: string): { active: string; beside: string } | null {
  const ta = byId(s, a);
  const tb = byId(s, b);
  if (!ta || !tb || ta.id === tb.id) return null;
  if (isSceneTab(ta) && tb.kind === 'doc') return { active: ta.id, beside: tb.id };
  if (ta.kind === 'doc' && isSceneTab(tb)) return { active: ta.id, beside: tb.id };
  // Pôdorys vedľa voľnej 3D: 3D je aktívna, pôdorys je 2D panel plánu.
  if (ta.kind === '3d' && tb.kind === 'plan') return { active: ta.id, beside: tb.id };
  if (ta.kind === 'plan' && tb.kind === '3d') return { active: tb.id, beside: ta.id };
  return null;
}

/** Dôvod, prečo dvojica nejde (pre `APPLIED` a lištu), alebo null. */
export function besideRefusal(s: ViewTabsState, a: string, b: string): string | null {
  if (besidePair(s, a, b)) return null;
  const ta = byId(s, a);
  const tb = byId(s, b);
  if (!ta || !tb) return 'záložka nie je otvorená';
  if (ta.id === tb.id) return 'záložka nemôže byť vedľa seba samej';
  if (ta.kind === 'doc' && tb.kind === 'doc') return 'dva dokumenty vedľa seba zatiaľ nejdú';
  return 'viewer má jeden 3D canvas: vedľa 3D ide dokument alebo pôdorys (2D plán), nie druhý 3D pohľad';
}

/** "Vedľa" pre aktívnu záložku; null = zrušiť. */
export function setBeside(s: ViewTabsState, id: string | null): ViewTabsState {
  if (id === null) return { ...s, besideId: null };
  const pair = besidePair(s, s.activeId, id);
  return pair ? { ...s, activeId: pair.active, besideId: pair.beside } : s;
}

/**
 * Zavrie záložku (3D sa zavrieť nedá). Zavretá aktívna prepne na tú vedľa,
 * inak na predchádzajúcu v poradí, ako prehliadač.
 */
export function closeTab(s: ViewTabsState, id: string): ViewTabsState {
  const idx = s.tabs.findIndex((t) => t.id === id);
  if (idx < 0 || s.tabs[idx].kind === '3d') return s;
  const tabs = s.tabs.filter((t) => t.id !== id);
  if (id === s.besideId) return { ...s, tabs, besideId: null };
  if (id !== s.activeId) return { ...s, tabs };
  const fallback = s.besideId ?? tabs[Math.max(0, idx - 1)]?.id ?? TAB_3D.id;
  return { tabs, activeId: fallback, besideId: null };
}

/** Všetky okrem 3D zavreté, aktívna 3D. */
export const closeAll = (s: ViewTabsState): ViewTabsState => ({ tabs: s.tabs.filter((t) => t.kind === '3d'), activeId: TAB_3D.id, besideId: null });

/**
 * Zosúladí záložky dokumentov s kartami D-075 (`docTabs`): nové karty pribudnú
 * na koniec, zavreté zmiznú. Otvorenie karty (nová aktívna karta) ju urobí
 * aktívnou záložkou, okrem `beside` (otvoriť vedľa doterajšej).
 */
export function syncDocTabs(
  s: ViewTabsState,
  docs: readonly { docId: string; label: string }[],
  opened: { docId: string; beside: boolean } | null,
): ViewTabsState {
  const want = new Map(docs.map((d) => [docTabId(d.docId), d]));
  let next = s;
  for (const t of s.tabs) if (t.kind === 'doc' && !want.has(t.id)) next = closeTab(next, t.id);
  const have = new Set(next.tabs.map((t) => t.id));
  const added = docs.filter((d) => !have.has(docTabId(d.docId))).map((d): ViewTab => ({ id: docTabId(d.docId), kind: 'doc', label: d.label, docId: d.docId }));
  next = { ...next, tabs: [...next.tabs.map((t) => (t.kind === 'doc' && want.has(t.id) ? { ...t, label: want.get(t.id)!.label } : t)), ...added] };
  if (opened) {
    const id = docTabId(opened.docId);
    if (byId(next, id) && id !== next.activeId && id !== next.besideId) {
      next = opened.beside && isSceneTab(byId(next, next.activeId)) ? setBeside(next, id) : activateTab(next, id);
    }
  }
  return next;
}

/** Odkaz z chatu: id, `3d`, menovka (bez ohľadu na veľkosť písmen) alebo GlobalId podlažia. */
export function resolveTabRef(s: ViewTabsState, ref: string): ViewTab | undefined {
  const want = ref.trim().toLowerCase();
  if (!want) return undefined;
  return s.tabs.find((t) => t.id.toLowerCase() === want)
    ?? s.tabs.find((t) => t.label.toLowerCase() === want)
    ?? s.tabs.find((t) => t.storeyGuid?.toLowerCase() === want || t.docId?.toLowerCase() === want);
}

/** `view_state.tabs` (AIM D-132): zoznam, aktívna a tá vedľa. */
export function describeTabs(s: ViewTabsState) {
  return s.tabs.map((t) => ({
    id: t.id,
    kind: t.kind,
    label: t.label,
    ...(t.storeyGuid ? { storey_guid: t.storeyGuid } : {}),
    ...(t.docId ? { document_id: t.docId } : {}),
    active: t.id === s.activeId,
    beside: t.id === s.besideId,
  }));
}
