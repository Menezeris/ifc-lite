/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vykonanie záložiek viewera (AIM D-132), lenivo z lišty a z mosta. Viewer má
 * jeden 3D canvas; záložky 3D, pôdorys a uložený pohľad sa v ňom striedajú.
 * Pri odchode zo záložky sa jej stav uloží (kamera a projekcia cez
 * `getViewpoint`, celá sada rovín rezu, zámok kamery a rez podlažia D-072),
 * pri návrate sa vráti. Prvé otvorenie pôdorysu = `enterDrawingView` (kolmo
 * zhora, zamknuté, rez nad podlahou); uložený pohľad nastaví host príkazmi po
 * `VIEW_TABS open` (D-122 obnova). Nič nové nepočíta: len existujúce cesty
 * viewera (D-098).
 */

import { useViewerStore } from '@/store';
import type { CameraViewpoint, SectionPlane } from '@/store/types';
import { orderedSectionPlanes, sectionPlaneCount } from '@/lib/section/section-plane-set';
import { clearSectionCut } from '@/store/section-active';
import {
  activateTab, besideRefusal, closeAll, closeTab, docTabId, isSceneTab, openTab, planTabId, resolveTabRef, setBeside,
  syncDocTabs, viewTabId, type ViewTab, type ViewTabsState,
} from './viewTabsPlan.js';
import { useAimViewTabs } from './viewTabsStore.js';
import { isTabsMessage, type TabsMessage } from './tabs-protocol.js';

interface SceneSnapshot {
  viewpoint: CameraViewpoint | null;
  projection: 'perspective' | 'orthographic';
  planes: SectionPlane[] | null;
  activeIndex: number;
  sectionVisible: boolean;
  locked: boolean;
  cut: number | null;
  storeyGuid: string | null;
}

/** Stav canvasu podľa záložky; len počas relácie (zabudne sa so záložkou). */
const snapshots = new Map<string, SceneSnapshot>();

type Note = (issue: string) => void;

function capture(): SceneSnapshot {
  const s = useViewerStore.getState();
  const all = orderedSectionPlanes(s.sectionPlane, s.inactiveSectionPlanes);
  const cutting = sectionPlaneCount(s.sectionPlane, s.inactiveSectionPlanes) > 0;
  return {
    viewpoint: s.cameraCallbacks.getViewpoint?.() ?? null,
    projection: s.projectionMode === 'orthographic' ? 'orthographic' : 'perspective',
    planes: cutting ? all.map((p) => ({ ...p, box: p.box ? { min: [...p.box.min], max: [...p.box.max] } : undefined })) : null,
    activeIndex: Math.max(0, all.findIndex((p) => p.id === s.sectionPlane.id)),
    sectionVisible: s.sceneState.section.visible !== false,
    locked: s.underlayViewLocked,
    cut: s.underlayCut,
    storeyGuid: s.underlayActiveStoreyGuid,
  };
}

function restore(snap: SceneSnapshot): void {
  const s = useViewerStore.getState();
  if (snap.planes) {
    s.installSectionPlanes(snap.planes, snap.activeIndex);
    useViewerStore.setState({ sceneState: { ...useViewerStore.getState().sceneState, section: { visible: snap.sectionVisible } } });
  } else {
    clearSectionCut(useViewerStore.getState);
  }
  s.setUnderlayCut(snap.cut);
  s.setUnderlayViewLocked(snap.locked);
  s.setUnderlayActiveStoreyGuid(snap.storeyGuid);
  if (s.projectionMode !== snap.projection) s.setProjectionMode(snap.projection);
  if (snap.viewpoint) s.cameraCallbacks.applyViewpoint?.(snap.viewpoint, false);
}

/** Záložka, ktorej stav má byť v canvase: aktívna 3D strana, inak tá vedľa, inak doterajšia. */
function sceneTabOf(t: ViewTabsState, current: string): string {
  const active = t.tabs.find((x) => x.id === t.activeId);
  const beside = t.tabs.find((x) => x.id === t.besideId);
  if (isSceneTab(active)) return active!.id;
  if (isSceneTab(beside)) return beside!.id;
  return t.tabs.some((x) => x.id === current) ? current : '3d';
}

/** Prvé zobrazenie záložky bez uloženého stavu. */
function enterFresh(tab: ViewTab, note: Note): void {
  const s = useViewerStore.getState();
  if (tab.kind === 'plan') {
    const deps = useAimViewTabs.getState().deps;
    const storey = deps?.storeys.find((x) => x.guid === tab.storeyGuid);
    if (deps && storey) deps.enterDrawingView(storey.info);
    else note('VIEW_TABS: podlažie pôdorysu sa vo vieweri nenašlo');
    return;
  }
  if (tab.kind === 'view') {
    // Čistý canvas; rez, izoláciu a kameru pošle host hneď po otvorení (D-122 obnova).
    clearSectionCut(useViewerStore.getState);
    s.setUnderlayCut(null);
    s.setUnderlayActiveStoreyGuid(null);
    s.setUnderlayViewLocked(tab.locked === true);
    if (tab.locked && s.projectionMode !== 'orthographic') s.setProjectionMode('orthographic');
    return;
  }
  // 3D bez uloženého stavu (len pri štarte): voľná kamera bez zámku.
  s.setUnderlayCut(null);
  s.setUnderlayViewLocked(false);
}

/** Pôdorys ako 2D panel plánu vedľa voľnej 3D (D-072 split) zapne alebo vypne. */
function syncPlanBeside(next: ViewTabsState, note: Note): void {
  const s = useViewerStore.getState();
  const deps = useAimViewTabs.getState().deps;
  const active = next.tabs.find((t) => t.id === next.activeId);
  const beside = next.tabs.find((t) => t.id === next.besideId);
  const guid = active?.kind === '3d' && beside?.kind === 'plan' ? beside.storeyGuid : undefined;
  if (!guid) {
    if (s.underlaySplitView) deps?.exitSplitView();
    return;
  }
  const storey = deps?.storeys.find((x) => x.guid === guid);
  if (!deps || !storey) return note('VIEW_TABS: podlažie pôdorysu sa vo vieweri nenašlo');
  if (!deps.storeyHasDrawing(guid)) return note('pôdorys vedľa 3D zatiaľ len s kalibrovaným podkladom (D-072); bez neho otvor pôdorys v záložke, alebo rez podlažia a panel drawing (2D výkres rezu z modelu, D-136)');
  if (s.underlaySplitView && s.underlayActiveStoreyGuid === guid) return;
  // Split si nastaví vlastnú kameru (home); 3D záložka si ju po návrate vráti zo stavu.
  const keep = capture();
  deps.enterSplitView(storey.info);
  if (keep.viewpoint) s.cameraCallbacks.applyViewpoint?.(keep.viewpoint, false);
}

/**
 * Zapíše nový stav záložiek: keď sa mení záložka v canvase, odloží stav
 * doterajšej a vráti (alebo prvýkrát nastaví) novú; karta dokumentu D-075 sa
 * prepne na aktívny dokument.
 */
export function commit(next: ViewTabsState, note: Note = () => {}): void {
  const store = useAimViewTabs.getState();
  const prevScene = store.sceneId;
  const scene = sceneTabOf(next, prevScene);
  if (scene !== prevScene) {
    if (store.tabs.some((t) => t.id === prevScene)) snapshots.set(prevScene, capture());
    // Panel plánu vedľa 3D patrí 3D záložke; pred prepnutím canvasu sa zavrie.
    if (useViewerStore.getState().underlaySplitView) store.deps?.exitSplitView();
    const snap = snapshots.get(scene);
    const tab = next.tabs.find((t) => t.id === scene);
    if (snap) restore(snap);
    else if (tab) enterFresh(tab, note);
  }
  for (const id of snapshots.keys()) if (!next.tabs.some((t) => t.id === id)) snapshots.delete(id);
  useAimViewTabs.setState({ tabs: next.tabs, activeId: next.activeId, besideId: next.besideId, sceneId: scene });
  syncPlanBeside(next, note);
  const doc = [next.tabs.find((t) => t.id === next.activeId), next.tabs.find((t) => t.id === next.besideId)].find((t) => t?.kind === 'doc');
  const vs = useViewerStore.getState();
  if (doc?.docId && vs.activeDocTabId !== doc.docId) vs.setActiveDocTab(doc.docId);
}

const current = (): ViewTabsState => {
  const s = useAimViewTabs.getState();
  return { tabs: s.tabs, activeId: s.activeId, besideId: s.besideId };
};

/** Lišta a most: prepnúť, dať vedľa, zavrieť (zavretie dokumentu zavrie aj kartu D-075). */
export function activate(id: string, note?: Note): void {
  commit(activateTab(current(), id), note);
}

export function beside(id: string | null, note: Note = () => {}): void {
  const s = current();
  if (id !== null) {
    const refusal = besideRefusal(s, s.activeId, id);
    if (refusal) return note(`VIEW_TABS: ${refusal}`);
  }
  commit(setBeside(s, id), note);
}

export function close(id: string, note?: Note): void {
  const s = current();
  if (id === 'all') {
    for (const t of s.tabs) if (t.docId) useViewerStore.getState().closeDocTab(t.docId);
    return commit(closeAll(current()), note);
  }
  const tab = s.tabs.find((t) => t.id === id);
  if (tab?.docId) useViewerStore.getState().closeDocTab(tab.docId);
  commit(closeTab(current(), id), note);
}

/** Pôdorys podlažia do záložky (z lišty aj z chatu). */
export function openPlan(storeyGuid: string, opts: { beside?: boolean } = {}, note: Note = () => {}): void {
  const storey = useAimViewTabs.getState().deps?.storeys.find((x) => x.guid === storeyGuid);
  if (!storey) return note('VIEW_TABS: podlažie sa vo vieweri nenašlo');
  const tab: ViewTab = { id: planTabId(storeyGuid), kind: 'plan', label: storey.name, storeyGuid };
  const s = current();
  if (opts.beside) {
    const refusal = besideRefusal(openTab(s, tab), s.activeId, tab.id);
    if (refusal) return note(`VIEW_TABS: ${refusal}`);
  }
  commit(openTab(s, tab, opts), note);
}

/**
 * Karty dokumentov D-075 -> záložky; volá ho `useAimCenterPanes` pri zmene
 * kariet. Nová aktívna karta sa stane aktívnou záložkou (alebo ide vedľa 3D).
 */
export function syncDocs(docs: readonly { docId: string; label: string }[], openedDocId: string | null): void {
  // Kartu z mosta rozloží `showDoc` (aj keď už bola aktívnou kartou D-075).
  const fromBridge = openedDocId !== null && openedDocId === useAimViewTabs.getState().bridgeDocId;
  if (fromBridge) useAimViewTabs.setState({ bridgeDocId: null });
  commit(syncDocTabs(current(), docs, openedDocId && !fromBridge ? { docId: openedDocId, beside: false } : null));
}

const openDocs = () => {
  const s = useViewerStore.getState();
  return s.docTabs.map((t) => ({ docId: t.docId, label: s.viewerDocuments.get(t.docId)?.name ?? t.docId }));
};

/**
 * `DOCUMENT_OPEN` (AIM D-132): `tab` = dokument na celú plochu, `split` = vedľa
 * 3D strany (aktívnej, inak tej, ktorá je v canvase).
 */
export function showDoc(docId: string, layout: 'tab' | 'split', note: Note = () => {}): void {
  let next = syncDocTabs(current(), openDocs(), null);
  const id = docTabId(docId);
  if (!next.tabs.some((t) => t.id === id)) return note('DOCUMENT_OPEN: dokument nie je v knižnici viewera');
  if (layout === 'tab') next = { ...activateTab(next, id), besideId: null };
  else {
    const active = next.tabs.find((t) => t.id === next.activeId);
    const scene = isSceneTab(active) ? next.activeId : useAimViewTabs.getState().sceneId;
    next = setBeside({ ...activateTab(next, scene), besideId: null }, id);
  }
  commit(next, note);
}

/** `VIEW_TABS` z mosta (AIM D-132); overí sa tu, mimo vstupného balíka. */
export function runTabsMessage(raw: unknown, note: Note): void {
  if (!isTabsMessage(raw)) return note('VIEW_TABS: neplatná správa');
  const msg: TabsMessage = raw;
  const s = current();
  if (msg.action === 'open' && msg.open) {
    const o = msg.open;
    if (o.kind === 'plan') return openPlan(o.storeyGuid!, { beside: msg.beside }, note);
    const tab: ViewTab = { id: viewTabId(o.viewId!), kind: 'view', label: o.label!, locked: o.locked === true };
    // Znova otvorený pohľad začína od definície, nie od stavu z minulého otvorenia.
    snapshots.delete(tab.id);
    if (msg.beside) {
      const refusal = besideRefusal(openTab(s, tab), s.activeId, tab.id);
      if (refusal) return note(`VIEW_TABS: ${refusal}`);
    }
    const reopened = useAimViewTabs.getState().sceneId === tab.id;
    commit(openTab(s, tab, { beside: msg.beside }), note);
    if (reopened) enterFresh(tab, note);
    return;
  }
  if (msg.action === 'unbeside') return beside(null, note);
  const ref = msg.tab ?? '';
  if (msg.action === 'close' && ref.trim().toLowerCase() === 'all') return close('all', note);
  const tab = resolveTabRef(s, ref);
  if (!tab) return note(`VIEW_TABS: záložka '${ref}' nie je otvorená`);
  if (msg.action === 'activate') return activate(tab.id, note);
  if (msg.action === 'beside') return beside(tab.id, note);
  if (tab.kind === '3d') return note('VIEW_TABS: záložka 3D sa nedá zavrieť');
  close(tab.id, note);
}
