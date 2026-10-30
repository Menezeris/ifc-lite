/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Most medzi panelom Presentation a trvalými pohľadmi hosta (AIM D-161), lenivo pri prvej správe o
 * pohľadoch. Nositeľom pohľadu je `BasketView` upstreamu (`pinboardSlice`, bez zmeny), trvalou kópiou
 * riadok `saved_views` s tým istým `id`. Napojenie je cez `useViewerStore.subscribe`: čo používateľ
 * urobí v paneli (uloží, premenuje, zmaže, upraví), ide hostovi ako `VIEW_SAVE`, `VIEW_RENAME`, `VIEW_DELETE`;
 * `VIEWS_LOAD` pohľady naplní, `VIEW_ACTIVATE` jeden aktivuje a `VIEW_CAPTURE` uloží aktuálny stav
 * rovnakou cestou ako tlačidlo Uložiť (košík sa najprv postaví z viditeľných prvkov, `viewCaptureBasket.ts`). Tvar správ je v `views-protocol.ts`,
 * prevod pohľadu v `viewsCodec.ts`. Stav PDF podkladov v 3D (AIM #325) si most drží k pohľadu sám
 * (`BasketView` ho nemá): zachytí ho pri uložení alebo prepísaní pohľadu a obnoví pri jeho aktivácii.
 */

import { useViewerStore } from '@/store';
import { entityRefToString, stringToEntityRef } from '@/store/types';
import { resolveEntityRef } from '@/store/resolveEntityRef';
import { executeBasketSaveView } from '@/store/basket/basketCommands';
import { getVisibleBasketEntityRefsFromStore } from '@/store/basketVisibleSet';
import { prepareCaptureBasket } from './viewCaptureBasket.js';
import { createSectionPlane } from '@/lib/section/section-plane-set';
import type { BasketView } from '@/store/slices/pinboardSlice';
import { MAX_BASKET_GUIDS, isViewsInbound, type ViewCaptureMessage, type ViewsLoadMessage, type ViewsOutboundMessage, type ViewWire } from './views-protocol.js';
import { decodeView, encodeView, fingerprint, type CodecEnv } from './viewsCodec.js';
import { visibilityGuids } from './selectionSummary.js';
import { worldOffset, type GuidHelpers } from './viewQueries.js';
import { SOURCE } from './bridge-core.js';
import { useAimViewTabs, withTabs } from './viewTabsStore.js';
import { captureUnderlays, restoreUnderlaysView } from './underlaysApply.js';
import type { UnderlaysViewWire } from './underlaysPlan.js';

/** Čo dodá `AimBridge` (kanál na hosta, hlásenie problémov, sledovanie asynchrónnych krokov, pomocníci GUID). */
export interface ViewsDeps {
  post: (msg: ViewsOutboundMessage) => void;
  noteIssue: (text: string) => void;
  track: (p: Promise<unknown>) => void;
  guids: GuidHelpers;
}

/** Ticho po poslednej zmene pohľadov, kým sa pošlú hostovi (zlúči rýchle zmeny a dobehnutie náhľadu). */
const FLUSH_DELAY_MS = 150;
/** Naraz zmizlo toľko pohľadov alebo viac spolu so zmenou modelov: je to reset relácie, nie zmazanie používateľom. */
const MASS_REMOVAL = 3;

interface Session {
  deps: ViewsDeps;
  unsubscribe: () => void;
  /** Id z posledného `VIEWS_LOAD`; len tie môže host odobrať. */
  synced: Set<string>;
  /** Posledný zoznam hosta, z ktorého sa pohľady naplnia znova po novom súbore (`session-reset`). */
  known: ViewWire[];
  /** Čo o pohľade vie host: odtlačok obsahu a meno. */
  sent: Map<string, { fp: string; name: string }>;
  /** Posledný objekt pohľadu, ktorý sme spracovali (rovnaký objekt = nezmenený, nepočíta sa znova). */
  seen: Map<string, BasketView>;
  captureIds: Map<string, string>;
  timer: ReturnType<typeof setTimeout> | null;
  /** Panel sa vyprázdnil novým súborom: nič sa nemaže, pohľady sa naplnia znova po načítaní modelov. */
  resetPending: boolean;
  /** Modely pri poslednom odoslaní: hromadné zmiznutie pohľadov je reset len spolu so zmenou modelov. */
  modelsAtFlush: ReturnType<typeof state>['models'];
  /** Stav PDF podkladov v 3D uložený s pohľadom (AIM #325). */
  underlays: Map<string, UnderlaysViewWire>;
}

let session: Session | null = null;

const state = () => useViewerStore.getState();

function makeEnv(g: GuidHelpers): CodecEnv {
  const s = state();
  const underlays = session?.underlays;
  let visible: ReadonlySet<string> | null = null;
  return {
    offset: worldOffset(s),
    bounds: g.sectionRenderBounds(s),
    guidOfKey: (key) => g.guidForEntity(s.models, stringToEntityRef(key)),
    keyOfGuid: (guid) => {
      const ref = g.resolveGuids(s.models, [guid])[0];
      return ref ? entityRefToString(ref) : undefined;
    },
    visibleKeys: () => (visible ??= new Set(getVisibleBasketEntityRefsFromStore(true).map(entityRefToString))),
    hiddenGuids: () => visibilityGuids(s.hiddenEntities, (id) => g.guidForEntity(s.models, resolveEntityRef(id)), MAX_BASKET_GUIDS + 1),
    makePlane: (name) => createSectionPlane(name, s.sectionPlane),
    underlaysOf: (id) => underlays?.get(id),
  };
}

function post(msg: { type: ViewsOutboundMessage['type'] } & Record<string, unknown>) {
  session?.deps.post({ source: SOURCE, ...msg } as ViewsOutboundMessage);
}

/** Pošle hostovi, čo sa od posledného razu zmenilo v páse Presentation (nový, upravený, premenovaný, zmazaný pohľad). */
function flush(): void {
  const sess = session;
  if (!sess) return;
  sess.timer = null;
  if (sess.resetPending) return;
  const views = state().basketViews;
  const ids = new Set(views.map((v) => v.id));
  const env = makeEnv(sess.deps.guids);
  views.forEach((v, order) => {
    const prev = sess.seen.get(v.id);
    if (prev === v) return;
    sess.seen.set(v.id, v);
    // Nový pohľad alebo prepísaný aktuálnou kamerou: podklady sa zachytia, ako sú teraz (premenovanie ich nemení).
    if (!prev || prev.viewpoint !== v.viewpoint) {
      const u = captureUnderlays();
      if (u) sess.underlays.set(v.id, u);
      else sess.underlays.delete(v.id);
    }
    const known = sess.sent.get(v.id);
    const fp = fingerprint(v, env);
    if (known && known.fp === fp) {
      if (known.name !== v.name) {
        sess.sent.set(v.id, { fp, name: v.name });
        post({ type: 'VIEW_RENAME', id: v.id, name: v.name });
      }
      return;
    }
    sess.sent.set(v.id, { fp, name: v.name });
    const captureId = sess.captureIds.get(v.id);
    sess.captureIds.delete(v.id);
    post({ type: 'VIEW_SAVE', view: encodeView(v, order, env), ...(captureId ? { capture_id: captureId } : {}) });
  });
  const removed = [...sess.sent.keys()].filter((id) => !ids.has(id));
  const modelsChanged = state().models !== sess.modelsAtFlush;
  sess.modelsAtFlush = state().models;
  const forget = (id: string) => { sess.sent.delete(id); sess.seen.delete(id); sess.captureIds.delete(id); sess.underlays.delete(id); };
  // Viac pohľadov naraz spolu s výmenou modelov je reset relácie (nový súbor), hosta sa to netýka;
  // hromadné zmazanie rukou (modely nezmenené) sa hostovi hlási.
  if (removed.length >= MASS_REMOVAL && modelsChanged) return void removed.forEach(forget);
  for (const id of removed) {
    forget(id);
    post({ type: 'VIEW_DELETE', id });
  }
}

const schedule = (): void => {
  if (!session || session.timer !== null) return;
  session.timer = setTimeout(flush, FLUSH_DELAY_MS);
};

/** Pohľady z hosta do Presentation: nové a zmenené sa prepíšu, odobrané hostom zmiznú, lokálne nepotvrdené ostanú. */
function hydrate(wires: readonly ViewWire[]): void {
  const sess = session;
  if (!sess) return;
  // Zápis do store vyvolá odber: bez tohto by sa naplnenie po novom súbore spustilo znova (rekurzia).
  sess.resetPending = false;
  const sorted = [...wires].sort((a, b) => a.order - b.order);
  const incoming = new Set(sorted.map((w) => w.id));
  for (const w of sorted) {
    if (w.underlays) sess.underlays.set(w.id, w.underlays);
    else sess.underlays.delete(w.id);
  }
  const env = makeEnv(sess.deps.guids);
  const current = state().basketViews;
  const byId = new Map(current.map((v) => [v.id, v]));
  const decoded = sorted.map((w) => {
    const { view, missing } = decodeView(w, env, byId.get(w.id));
    if (missing > 0) console.warn(`[aim-views] pohľad '${w.name}' má ${missing} prvkov, ktoré model už nemá`);
    return view;
  });
  const local = current.filter((v) => !incoming.has(v.id) && !sess.synced.has(v.id));
  const next = [...decoded, ...local];
  const activeId = state().activeBasketViewId;
  useViewerStore.setState({ basketViews: next, activeBasketViewId: activeId !== null && next.some((v) => v.id === activeId) ? activeId : null });
  // Čo prišlo od hosta, hostovi sa neposiela späť.
  for (const v of decoded) {
    sess.seen.set(v.id, v);
    sess.sent.set(v.id, { fp: fingerprint(v, env), name: v.name });
  }
  for (const id of [...sess.sent.keys()]) if (!incoming.has(id) && sess.synced.has(id)) { sess.sent.delete(id); sess.seen.delete(id); sess.underlays.delete(id); }
  sess.synced = incoming;
  sess.known = sorted;
}

function start(deps: ViewsDeps): Session {
  const sess: Session = {
    deps, unsubscribe: () => {}, synced: new Set(), known: [], sent: new Map(), seen: new Map(), captureIds: new Map(),
    timer: null, resetPending: false, modelsAtFlush: state().models, underlays: new Map(),
  };
  session = sess;
  sess.unsubscribe = useViewerStore.subscribe((s, prev) => {
    if (s.basketViews !== prev.basketViews) {
      // Nový súbor (`session-reset`) vyprázdni panel a vymení modely naraz; zmazanie rukou nemení modely.
      if (prev.basketViews.length > 0 && s.basketViews.length === 0 && s.models !== prev.models) sess.resetPending = true;
      schedule();
    }
    // Aktivácia pohľadu (klik na kartu, VIEW_ACTIVATE) obnoví aj podklady, ak ich pohľad nesie (AIM #325).
    if (s.activeBasketViewId !== prev.activeBasketViewId && s.activeBasketViewId !== null) applyUnderlays(sess, s.activeBasketViewId);
    if (sess.resetPending && s.models.size > 0 && !s.geometryStreamingActive && sess.known.length > 0) hydrate(sess.known);
  });
  return sess;
}

function applyUnderlays(sess: Session, viewId: string): void {
  const u = sess.underlays.get(viewId);
  if (u) restoreUnderlaysView(u);
}

/** Odpojenie mosta: odber store a časovač zaniknú, pohľady v paneli ostanú. */
export function stopViewsBridge(): void {
  if (!session) return;
  session.unsubscribe();
  if (session.timer !== null) clearTimeout(session.timer);
  session = null;
}

/** Aktivuje pohľad v Presentation (kamera, rez a košík), rovnako ako klik na jeho kartu. */
async function activate(id: string | undefined, name: string | undefined, noteIssue: (t: string) => void): Promise<void> {
  const views = state().basketViews;
  const view = id !== undefined ? views.find((v) => v.id === id) : views.find((v) => v.name.toLowerCase() === name?.trim().toLowerCase());
  if (!view) return noteIssue(`VIEW_ACTIVATE: pohľad '${id ?? name}' sa vo vieweri nenašiel`);
  // Opätovná aktivácia toho istého pohľadu nemení `activeBasketViewId`, odber by podklady neobnovil.
  if (session) applyUnderlays(session, view.id);
  // Pri dlaždiciach ide pohľad do živej dlaždice (D-161), jej doterajší obsah si stav odloží.
  if (useAimViewTabs.getState().layout !== 'single') return withTabs((m) => m.showViewLive(view.id, {}, noteIssue));
  const { activateBasketViewFromStore } = await import('@/store/basket/basketViewActivator');
  activateBasketViewFromStore(view.id);
}

/**
 * Uloží to, čo je práve nastavené (košík, kamera, rezy), ako tlačidlo Uložiť v paneli. Pri izolácii
 * (Lens, trieda, podlažie, skrytie) je košík to, čo je vidieť; bez nej výber, inak všetko viditeľné (#315).
 */
async function capture(msg: ViewCaptureMessage, deps: ViewsDeps): Promise<void> {
  const source = prepareCaptureBasket();
  if (source === null) return deps.noteIssue('VIEW_CAPTURE: nič na uloženie, model nemá viditeľné prvky');
  const id = await executeBasketSaveView(source === 'empty' ? 'manual' : source);
  if (!id) return deps.noteIssue('VIEW_CAPTURE: pohľad sa nepodarilo uložiť');
  if (msg.name) state().renameBasketView(id, msg.name);
  if (msg.capture_id && session) session.captureIds.set(id, msg.capture_id);
  // Host ho má dostať pred `APPLIED`, nie až po oneskorení odberu.
  if (session) {
    if (session.timer !== null) clearTimeout(session.timer);
    flush();
  }
}

/** Správa hosta o pohľadoch (`VIEWS_LOAD`, `VIEW_ACTIVATE`, `VIEW_CAPTURE`); overí sa tu, mimo vstupného balíka. */
export function runViewsMessage(raw: unknown, deps: ViewsDeps): Promise<void> | void {
  if (!isViewsInbound(raw)) return deps.noteIssue('pohľady: neplatná správa (VIEWS_LOAD, VIEW_ACTIVATE, VIEW_CAPTURE)');
  // Relácia trvá do odpojenia mosta; kanál a pomocníci sú pri každej správe tí istí, len nová obálka.
  (session ??= start(deps)).deps = deps;
  switch (raw.type) {
    case 'VIEWS_LOAD':
      return hydrate((raw as ViewsLoadMessage).views);
    case 'VIEW_ACTIVATE':
      return activate(raw.id, raw.name, deps.noteIssue);
    case 'VIEW_CAPTURE':
      return capture(raw, deps);
  }
}
