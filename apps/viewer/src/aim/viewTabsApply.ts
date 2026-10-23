/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vykonanie záložiek viewera (AIM D-132), lenivo z lišty a z mosta. Od D-161 sú
 * záložky len 3D a dokumenty (PDF); pôdorys a uložený pohľad záložku nemajú:
 * pohľad zhora je kamera a rez na bežnom 3D canvase (`runTopView`), uložený pohľad
 * je pohľad z Presentation (`viewsBridge.ts`). Viewer má jeden 3D canvas, jeho
 * jediná scéna je záložka 3D, preto sa stav canvasu pri prepínaní nikam neodkladá.
 * Staršie správy hosta (`VIEW_TABS open` pre pôdorys a uložený pohľad, dlaždica
 * `{plan}`) sa preložia: pôdorys na pohľad zhora, uložený pohľad na záložku 3D,
 * dlaždica podlažia na výkres PDF toho podlažia. Nič nové nepočíta (D-098).
 */

import { useViewerStore } from '@/store';
import {
  activateTab, besideRefusal, closeAll, closeTab, docTabId, isSceneTab, resolveTabRef, setBeside, syncDocTabs,
  type ViewTabsState,
} from './viewTabsPlan.js';
import { runTopView, useAimViewTabs } from './viewTabsStore.js';
import { isTabsMessage, type TabsMessage } from './tabs-protocol.js';
import { isTilesMessage, type TilesMessage } from './tiles-protocol.js';
import {
  TILE_RECTS, isTiled, layoutTiles, liveTile, reconcileTiles, setTile, singleTiles, tileFrameStyle, tileScene, type TileLayout,
  type TilesState,
} from './viewTilesPlan.js';
import { waitCameraSettled } from './cameraSettle.js';

type Note = (issue: string) => void;

/** Záložka, ktorej stav má byť v canvase: aktívna 3D strana, inak tá vedľa, inak doterajšia. */
function sceneTabOf(t: ViewTabsState, current: string): string {
  const active = t.tabs.find((x) => x.id === t.activeId);
  const beside = t.tabs.find((x) => x.id === t.besideId);
  if (isSceneTab(active)) return active!.id;
  if (isSceneTab(beside)) return beside!.id;
  return t.tabs.some((x) => x.id === current) ? current : '3d';
}

/** Zapíše nový stav záložiek; karta dokumentu D-075 sa prepne na aktívny dokument. */
export function commit(next: ViewTabsState, tilesNext?: TilesState): void {
  const store = useAimViewTabs.getState();
  // D-157: pri dlaždiciach nie je "Vedľa"; aktívna záložka mimo dlaždíc sa do jednej dá.
  let tiles = tilesNext ?? { layout: store.layout, tiles: store.tiles };
  if (isTiled(tiles)) {
    next = { ...next, besideId: null };
    tiles = reconcileTiles(next, tiles, store.sceneId);
  }
  const scene = isTiled(tiles) ? tileScene(next, tiles, store.sceneId) : sceneTabOf(next, store.sceneId);
  const live = liveTile(tiles, scene);
  useAimViewTabs.setState({
    tabs: next.tabs, activeId: next.activeId, besideId: next.besideId, sceneId: scene,
    layout: tiles.layout, tiles: tiles.tiles, frame: live >= 0 ? tileFrameStyle(TILE_RECTS[tiles.layout][live]) : null,
  });
  const doc = [next.tabs.find((t) => t.id === next.activeId), next.tabs.find((t) => t.id === next.besideId)].find((t) => t?.kind === 'doc');
  const vs = useViewerStore.getState();
  if (doc?.docId && vs.activeDocTabId !== doc.docId) vs.setActiveDocTab(doc.docId);
}

const current = (): ViewTabsState => {
  const s = useAimViewTabs.getState();
  return { tabs: s.tabs, activeId: s.activeId, besideId: s.besideId };
};

/** Lišta a most: prepnúť, dať vedľa, zavrieť (zavretie dokumentu zavrie aj kartu D-075). */
export function activate(id: string): void {
  commit(activateTab(current(), id));
}

/**
 * "Vedľa": dvojicu, ktorú nevie stredná plocha (dve 3D, dva dokumenty), ako aj "Vedľa"
 * pri dlaždiciach rieši rozloženie dvoch dlaždíc vedľa seba (D-157); `none` dlaždice zruší.
 */
export function beside(id: string | null, note: Note = () => {}): Promise<void> | void {
  const s = current();
  const tiled = useAimViewTabs.getState().layout !== 'single';
  if (id === null) {
    if (tiled) return void commit(s, singleTiles());
    return void commit(setBeside(s, id));
  }
  if (tiled || besideRefusal(s, s.activeId, id)) return setLayout('split_h', [s.activeId, id], note);
  commit(setBeside(s, id));
}

let layoutRun = 0;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Rozloženie dlaždíc (lišta aj most): `refs[i]` = id záložky, null = prázdna,
 * undefined = doplniť. Vráti beh, na ktorý most počká pred `APPLIED`: canvas sa
 * po zmene rámca živej dlaždice ešte prekreslí (kamera sa ustáli).
 */
export function setLayout(layout: TileLayout, refs: readonly (string | null | undefined)[] = [], _note: Note = () => {}): Promise<void> | void {
  const s = current();
  if (layout === 'single') return void commit(s, singleTiles());
  const store = useAimViewTabs.getState();
  commit(s, layoutTiles(s, { layout: store.layout, tiles: store.tiles }, layout, refs));
  const run = ++layoutRun;
  return (async () => {
    await waitCameraSettled(() => useViewerStore.getState().cameraCallbacks.getViewpoint?.() ?? null);
    for (let i = 0; i < 3 && run === layoutRun; i++) await nextFrame();
  })();
}

/** Záložka do dlaždice z jej hlavičky. */
export function putTile(index: number, id: string | null): void {
  const store = useAimViewTabs.getState();
  const s = current();
  const tiles = setTile(s, { layout: store.layout, tiles: store.tiles }, index, id);
  commit(id ? activateTab(s, id) : s, tiles);
}

export function close(id: string): void {
  const s = current();
  if (id === 'all') {
    for (const t of s.tabs) if (t.docId) useViewerStore.getState().closeDocTab(t.docId);
    return commit(closeAll(current()), singleTiles());
  }
  const tab = s.tabs.find((t) => t.id === id);
  if (tab?.docId) useViewerStore.getState().closeDocTab(tab.docId);
  commit(closeTab(current(), id));
}

/**
 * Karty dokumentov D-075 -> záložky; volá ho lišta pri zmene kariet. Nová aktívna
 * karta sa stane aktívnou záložkou (alebo ide vedľa 3D).
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
  commit(next);
}

/** Výkres PDF podlažia (`storeyGuid` dokumentu), ktorý je v knižnici viewera; kalibrovaný má prednosť. */
export function storeyDrawingDoc(storeyGuid: string): string | null {
  const s = useViewerStore.getState();
  const docs = [...s.viewerDocuments.values()].filter((d) => d.storeyGuid === storeyGuid && d.kind === 'drawing');
  const calibrated = (id: string) => [...s.underlayDrawings.values()].some((d) => d.id === id && d.placement !== null);
  return (docs.find((d) => calibrated(d.id)) ?? docs[0])?.id ?? null;
}

/**
 * Pohľad zhora na podlažie a k nemu výkres PDF v dlaždiciach (AIM D-161: nahrádza D-072 split,
 * `SET_VIEW_MODE split`). Bez výkresu podlažia ostane len pohľad zhora a povie sa to.
 */
export async function splitWithDrawing(storeyGuid: string, note: Note): Promise<void> {
  const docId = storeyDrawingDoc(storeyGuid);
  if (!docId) return note('split: podlažie nemá výkres PDF v knižnici dokumentov, ostáva pohľad zhora na 3D');
  const vs = useViewerStore.getState();
  vs.openDocument(docId);
  // Karta dokumentu D-075 -> záložka hneď, aby ju dlaždica našla.
  commit(syncDocTabs(current(), openDocs(), null));
  await setLayout('split_h', ['3d', docTabId(docId)], note);
}

/** `VIEW_TABS` z mosta (AIM D-132); overí sa tu, mimo vstupného balíka. */
export function runTabsMessage(raw: unknown, note: Note): Promise<void> | void {
  if (isTilesMessage(raw)) return runLayout(raw, note);
  if (!isTabsMessage(raw)) return note('VIEW_TABS: neplatná správa');
  const msg: TabsMessage = raw;
  const s = current();
  if (msg.action === 'open' && msg.open) {
    // D-161: pôdorys a uložený pohľad nemajú záložku. Pôdorys = pohľad zhora na 3D, uložený pohľad = 3D
    // (rez, izoláciu a kameru pošle host hneď po otvorení ako obnovu pohľadu, D-122).
    const o = msg.open;
    activate('3d');
    if (o.kind !== 'plan') return;
    const top = runTopView(o.storeyGuid!, note);
    return msg.beside ? Promise.resolve(top).then(() => splitWithDrawing(o.storeyGuid!, note)) : top;
  }
  if (msg.action === 'unbeside') return beside(null, note);
  const ref = msg.tab ?? '';
  if (msg.action === 'close' && ref.trim().toLowerCase() === 'all') return close('all');
  const tab = resolveTabRef(s, ref);
  if (!tab) return note(`VIEW_TABS: záložka '${ref}' nie je otvorená`);
  if (msg.action === 'activate') return activate(tab.id);
  if (msg.action === 'beside') return beside(tab.id, note);
  if (tab.kind === '3d') return note('VIEW_TABS: záložka 3D sa nedá zavrieť');
  close(tab.id);
}

/** `VIEW_TABS layout` (AIM D-157): `{plan}` = výkres PDF podlažia (D-161), menovky sa nájdu ako pri `tab`. */
function runLayout(msg: TilesMessage, note: Note): Promise<void> | void {
  const s = current();
  const refs = (msg.tiles ?? []).map((w): string | null | undefined => {
    if (w === null) return null;
    if ('plan' in w) {
      const docId = storeyDrawingDoc(w.plan);
      if (!docId) return void note(`VIEW_TABS: podlažie ${w.plan} nemá výkres PDF (pôdorys nie je záložka, pohľad zhora je mode=2d)`);
      useViewerStore.getState().openDocument(docId);
      return docTabId(docId);
    }
    const tab = resolveTabRef(s, w.tab);
    if (!tab) note(`VIEW_TABS: záložka '${w.tab}' nie je otvorená`);
    return tab?.id;
  });
  if (refs.some((r) => typeof r === 'string' && r.startsWith('doc:'))) commit(syncDocTabs(current(), openDocs(), null));
  return setLayout(msg.layout, refs, note);
}
