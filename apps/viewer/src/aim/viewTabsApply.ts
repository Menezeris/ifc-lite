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
 *
 * Pohľad z Presentation v dlaždici (D-161, krok Fork B) je záložka `view:<id>`: žije len v dlaždici
 * (bez dlaždíc zanikne), živá je jedna, ostatné ukazujú snímku. Stav canvasu na dlaždicu odkladá
 * `viewTilesScene.ts`.
 */

import { useViewerStore } from '@/store';
import {
  activateTab, besideRefusal, closeAll, closeTab, docTabId, dropViewTabs, isSceneTab, resolveTabRef, setBeside, syncDocTabs,
  syncViewTabs, viewTabId, type ViewTabsState,
} from './viewTabsPlan.js';
import { runTopView, useAimViewTabs } from './viewTabsStore.js';
import { isTabsMessage, type TabsMessage } from './tabs-protocol.js';
import { isTilesMessage, type TilesMessage } from './tiles-protocol.js';
import {
  SIZE_COUNT, addTile, isTiled, layoutTiles, liveTile, normalizeSizes, reconcileTiles, setTile, singleTiles, tileFrameStyle, tileRects, tileScene, type TileLayout,
  type TilesState,
} from './viewTilesPlan.js';
import { enterScene, forgetStash, leaveScene } from './viewTilesScene.js';
import { hasShot, pruneShots } from './tileShots.js';
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

/** Posledné nastavenie canvasu pre novú živú záložku; `settle` naň počká. */
let entering: Promise<void> = Promise.resolve();

/** Zapíše nový stav záložiek; karta dokumentu D-075 sa prepne na aktívny dokument. */
export function commit(next: ViewTabsState, tilesNext?: TilesState, opts: { applied?: boolean } = {}): void {
  const store = useAimViewTabs.getState();
  // D-157: pri dlaždiciach nie je "Vedľa"; aktívna záložka mimo dlaždíc sa do jednej dá.
  let tiles = tilesNext ?? { layout: store.layout, tiles: store.tiles, sizes: store.sizes };
  if (isTiled(tiles)) {
    next = { ...next, besideId: null };
    tiles = reconcileTiles(next, tiles, store.sceneId);
    // D-161: pohľad, ktorý nie je v dlaždici, záložku nemá (jeho stav ostáva odložený).
    const keep = (t: { id: string; kind: string }) => t.kind !== 'view' || tiles.tiles.includes(t.id);
    if (next.tabs.some((t) => !keep(t))) next = { ...next, tabs: next.tabs.filter(keep) };
  } else {
    // Späť na jedno okno: canvas ostáva, ako je, a ako záložka 3D; odložené stavy dlaždíc zanikajú.
    next = dropViewTabs(next);
    if (store.layout !== 'single') forgetStash();
  }
  const scene = isTiled(tiles) ? tileScene(next, tiles, store.sceneId) : sceneTabOf(next, store.sceneId);
  const live = liveTile(tiles, scene);
  // Canvas opúšťa záložku: odložiť jej stav a odfotiť, kým je v ňom (aj pri `applied`: tam sa stav už zmenil, snímka by klamala).
  const switching = scene !== store.sceneId && isTiled(tiles);
  if (switching && !opts.applied && store.tabs.some((t) => t.id === store.sceneId)) leaveScene(store.sceneId);
  useAimViewTabs.setState({
    tabs: next.tabs, activeId: next.activeId, besideId: next.besideId, sceneId: scene,
    layout: tiles.layout, tiles: tiles.tiles, sizes: tiles.sizes, frame: live >= 0 ? tileFrameStyle(tileRects(tiles.layout, tiles.sizes)[live]) : null,
  });
  if (switching && !opts.applied) {
    const tab = next.tabs.find((t) => t.id === scene);
    if (tab) entering = Promise.resolve(enterScene(tab.id, tab.viewId));
  }
  pruneShots(new Set(next.tabs.map((t) => t.id)));
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
export function beside(id: string | null, note: Note = () => {}, base?: ViewTabsState): Promise<void> | void {
  const s = base ?? current();
  const tiled = useAimViewTabs.getState().layout !== 'single';
  if (id === null) {
    if (tiled) return void commit(s, singleTiles());
    return void commit(setBeside(s, id));
  }
  // Pohľad z Presentation dostane novú dlaždicu a je v nej živý ("otvor pohľad na novej dlaždici").
  if (s.tabs.find((t) => t.id === id)?.kind === 'view') return openViewInNewTile(id, note);
  if (tiled || besideRefusal(s, s.activeId, id)) return setLayout('split_h', [s.activeId, id], note, s);
  commit(setBeside(s, id));
}

/** Podiely strán z lišty (ťahanie čiary, AIM #299): prepočíta rámec živej dlaždice; `null` = polovice a tretiny; mimo rozloženia s podielmi nič. */
export function resizeTiles(sizes: readonly number[] | null): void {
  const store = useAimViewTabs.getState();
  const shares = sizes ? normalizeSizes(sizes, SIZE_COUNT[store.layout]) : undefined;
  if (shares === null) return;
  const live = liveTile(store, store.sceneId);
  useAimViewTabs.setState({ sizes: shares, frame: live >= 0 ? tileFrameStyle(tileRects(store.layout, shares)[live]) : null });
}

let layoutRun = 0;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Canvas sa po zmene rámca živej dlaždice ešte prekreslí (kamera sa ustáli); na to most počká pred `APPLIED`. */
function settle(): Promise<void> {
  const run = ++layoutRun;
  return (async () => {
    await entering;
    await waitCameraSettled(() => useViewerStore.getState().cameraCallbacks.getViewpoint?.() ?? null);
    for (let i = 0; i < 3 && run === layoutRun; i++) await nextFrame();
  })();
}

/**
 * Rozloženie dlaždíc (lišta aj most): `refs[i]` = id záložky, null = prázdna,
 * undefined = doplniť. Vráti beh, na ktorý most počká pred `APPLIED`: canvas sa
 * po zmene rámca živej dlaždice ešte prekreslí (kamera sa ustáli).
 */
export function setLayout(layout: TileLayout, refs: readonly (string | null | undefined)[] = [], _note: Note = () => {}, base?: ViewTabsState, sizes?: readonly number[] | null): Promise<void> | void {
  const s = base ?? current();
  if (layout === 'single') return void commit(s, singleTiles());
  const store = useAimViewTabs.getState();
  commit(s, layoutTiles(s, { layout: store.layout, tiles: store.tiles }, layout, refs, sizes));
  return settle().then(() => prerenderViews());
}

/**
 * Pohľad z Presentation v neživej dlaždici bez snímky aj bez náhľadu z panela (po načítaní stránky ho panel nemá)
 * sa raz ukáže v canvase a odfotí; potom sa vráti pôvodná živá záložka (D-157 "prerender"). Zásah používateľa
 * (iná živá záložka počas behu) beh ukončí.
 */
async function prerenderViews(): Promise<void> {
  const st = useAimViewTabs.getState();
  const thumbs = new Set(useViewerStore.getState().basketViews.filter((v) => v.thumbnailDataUrl).map((v) => viewTabId(v.id)));
  const need = st.tiles.filter((id): id is string => !!id && id.startsWith('view:') && id !== st.sceneId && !hasShot(id) && !thumbs.has(id));
  if (need.length === 0) return;
  const origin = st.sceneId;
  let expected = origin;
  for (const id of need) {
    if (useAimViewTabs.getState().sceneId !== expected) return;
    activate(id);
    expected = id;
    await settle();
  }
  if (useAimViewTabs.getState().sceneId === expected) activate(origin);
  await settle();
}

/** Zoznam pohľadov z Presentation (id, meno). */
const viewList = () => useViewerStore.getState().basketViews.map((v) => ({ id: v.id, name: v.name }));

/**
 * Záložka pohľadu z Presentation (D-161) podľa id alebo mena (bez ohľadu na veľkosť písmen); otvorí ju.
 * Vráti stav záložiek a id, alebo null (pohľad vo vieweri nie je).
 */
function withViewTab(s: ViewTabsState, ref: string): { next: ViewTabsState; id: string } | null {
  const want = ref.trim().toLowerCase();
  const views = viewList();
  const v = views.find((x) => x.id.toLowerCase() === want || viewTabId(x.id).toLowerCase() === want)
    ?? views.find((x) => x.name.toLowerCase() === want);
  if (!v) return null;
  const tab = { id: viewTabId(v.id), kind: 'view' as const, label: v.name, viewId: v.id };
  return { next: s.tabs.some((t) => t.id === tab.id) ? s : { ...s, tabs: [...s.tabs, tab] }, id: tab.id };
}

/** Záložka do dlaždice z jej hlavičky (`view:<id>` otvorí pohľad z Presentation). */
export function putTile(index: number, ref: string | null): void {
  const store = useAimViewTabs.getState();
  let s = current();
  let id = ref;
  if (ref && !s.tabs.some((t) => t.id === ref)) {
    const v = ref.startsWith('view:') ? withViewTab(s, ref) : null;
    if (!v) return;
    s = v.next;
    id = v.id;
  }
  const tiles = setTile(s, { layout: store.layout, tiles: store.tiles }, index, id);
  commit(id ? activateTab(s, id) : s, tiles);
}

/**
 * "Otvoriť v novej dlaždici" (karta v páse Presentation, D-161): pohľad dostane novú dlaždicu a je v nej
 * živý (aktivuje sa odznova). Bez dlaždíc vzniknú dve vedľa seba.
 */
export function openViewInNewTile(ref: string, note: Note = () => {}): Promise<void> | void {
  const store = useAimViewTabs.getState();
  const v = withViewTab(current(), ref);
  if (!v) return note(`pohľad '${ref}' sa vo vieweri nenašiel`);
  forgetStash(v.id);
  const prev = { layout: store.layout, tiles: store.tiles };
  commit(activateTab(v.next, v.id), addTile(v.next, prev, v.id, store.sceneId));
  return settle();
}

/**
 * `VIEW_ACTIVATE` pri dlaždiciach (D-161): pohľad ide do živej dlaždice (odznova aktivovaný), doterajší obsah
 * dlaždice si stav odloží. `applied` = pohľad už v canvase je (klik na kartu v Presentation), len sa vymení menovka.
 */
export function showViewLive(ref: string, opts: { applied?: boolean } = {}, note: Note = () => {}): Promise<void> | void {
  const store = useAimViewTabs.getState();
  const v = withViewTab(current(), ref);
  if (!v) return note(`pohľad '${ref}' sa vo vieweri nenašiel`);
  if (store.sceneId === v.id) return;
  const cur = { layout: store.layout, tiles: store.tiles };
  const live = liveTile(cur, store.sceneId);
  if (live < 0) return note('pohľad sa neukáže v dlaždici: živé 3D v rozložení nie je');
  if (!opts.applied) forgetStash(v.id);
  // Pohľad, ktorý už má dlaždicu, v nej ožije; inak zaujme živú dlaždicu.
  const tiles = cur.tiles.includes(v.id) ? cur : setTile(v.next, cur, live, v.id);
  commit(activateTab(v.next, v.id), tiles, opts);
  return settle();
}

/** Aktivuje pohľad z Presentation: pri dlaždiciach v živej dlaždici, inak v canvase (ako klik na kartu). */
export async function activateView(viewId: string, note: Note = () => {}): Promise<void> {
  if (useAimViewTabs.getState().layout !== 'single') return showViewLive(viewId, {}, note);
  const { activateBasketViewFromStore } = await import('@/store/basket/basketViewActivator');
  activateBasketViewFromStore(viewId);
}

/** Pohľady z Presentation -> záložky (premenovanie, zmazanie); volá ho lišta pri zmene zoznamu. */
export function syncViews(views: readonly { id: string; name: string }[]): void {
  const s = current();
  const next = syncViewTabs(s, views);
  const ids = new Set(views.map((v) => viewTabId(v.id)));
  for (const t of s.tabs) if (t.kind === 'view' && !ids.has(t.id)) forgetStash(t.id);
  if (next !== s) commit(next);
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

/** Výkres, ktorý vybral host (AIM D-176, `SET_VIEW_MODE documentId`); neznámy alebo nie výkres sa hlási a vráti null (vlastný výber). */
export function hostDrawingDoc(documentId: string | undefined, note: Note): string | null {
  if (documentId === undefined) return null;
  const doc = useViewerStore.getState().viewerDocuments.get(documentId);
  if (doc?.kind === 'drawing') return doc.id;
  note(`SET_VIEW_MODE: dokument ${documentId} ${doc ? 'nie je výkres' : 'nie je v knižnici dokumentov'}, výkres sa vyberie podľa podlažia`);
  return null;
}

/**
 * Pohľad zhora na podlažie a k nemu výkres PDF v dlaždiciach (AIM D-161: nahrádza D-072 split,
 * `SET_VIEW_MODE split`). Bez výkresu podlažia ostane len pohľad zhora a povie sa to.
 */
export async function splitWithDrawing(storeyGuid: string, note: Note, documentId?: string): Promise<void> {
  const docId = hostDrawingDoc(documentId, note) ?? storeyDrawingDoc(storeyGuid);
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
  // D-161: pohľad z Presentation podľa mena alebo id; `beside` ho dá do dlaždice vedľa, `activate` ho aktivuje.
  if (!tab && (msg.action === 'beside' || msg.action === 'activate')) {
    const v = withViewTab(s, ref);
    if (v && msg.action === 'beside') return beside(v.id, note, v.next);
    if (v) return activateView(v.id.slice('view:'.length), note);
  }
  if (!tab) return note(`VIEW_TABS: záložka '${ref}' nie je otvorená`);
  if (msg.action === 'activate') return activate(tab.id);
  if (msg.action === 'beside') return beside(tab.id, note);
  if (tab.kind === '3d') return note('VIEW_TABS: záložka 3D sa nedá zavrieť');
  close(tab.id);
}

/** `VIEW_TABS layout` (AIM D-157): `{plan}` = výkres PDF podlažia (D-161), `{view}` pohľad z Presentation, menovky sa nájdu ako pri `tab`. */
function runLayout(msg: TilesMessage, note: Note): Promise<void> | void {
  let s = current();
  const views: ViewTabsState[] = [];
  const refs = (msg.tiles ?? []).map((w): string | null | undefined => {
    if (w === null) return null;
    if ('view' in w) {
      const v = withViewTab(s, w.view);
      if (!v) return void note(`VIEW_TABS: pohľad '${w.view}' sa vo vieweri nenašiel`);
      views.push(v.next);
      return v.id;
    }
    if ('plan' in w) {
      const docId = storeyDrawingDoc(w.plan);
      if (!docId) return void note(`VIEW_TABS: podlažie ${w.plan} nemá výkres PDF (pôdorys nie je záložka, pohľad zhora je mode=2d)`);
      useViewerStore.getState().openDocument(docId);
      return docTabId(docId);
    }
    const tab = resolveTabRef(s, w.tab);
    if (!tab) {
      const v = withViewTab(s, w.tab);
      if (v) { views.push(v.next); return v.id; }
      note(`VIEW_TABS: záložka '${w.tab}' nie je otvorená`);
    }
    return tab?.id;
  });
  // Záložky pohľadov z `{view}` a mena pohľadu v `{tab}` (D-161) pribudnú pred rozložením.
  for (const v of views) s = { ...s, tabs: [...s.tabs, ...v.tabs.filter((t) => !s.tabs.some((x) => x.id === t.id))] };

  if (refs.some((r) => typeof r === 'string' && r.startsWith('doc:'))) commit(syncDocTabs(current(), openDocs(), null));
  // AIM #299: `ratio` = podiel prvej dlaždice (dvojica podielov), `sizes` váhy všetkých strán.
  const count = SIZE_COUNT[msg.layout];
  const raw = msg.sizes ?? (msg.ratio !== undefined ? [msg.ratio, 1 - msg.ratio] : undefined);
  let sizes: number[] | undefined;
  if (raw) {
    const shares = normalizeSizes(raw, count);
    if (!shares) note(`VIEW_TABS: rozloženie ${msg.layout} ${count === 0 ? 'nemá nastaviteľné podiely' : `berie ${count} podiely`}`);
    else {
      sizes = shares;
      if (raw.length === count && shares.some((v, i) => Math.abs(v - raw[i] / raw.reduce((a, x) => a + x, 0)) > 1e-6)) note('VIEW_TABS: podiel dlaždice je najmenej 10 %, hodnoty sa upravili');
    }
  }
  return setLayout(msg.layout, refs, note, s, sizes);
}
