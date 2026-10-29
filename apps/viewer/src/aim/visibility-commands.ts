/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Príkazy hosta na zvýraznenie, výber a viditeľnosť (FOCUS, SELECT, filtre,
 * COLORIZE/HIDE/SHOW/ISOLATE a doplnky z AIM D-101, CLEAR_SELECTION z D-102). Vytiahnuté z `AimBridge`
 * a načítané lenivo (strop veľkosti súboru aj vstupného balíka); pomocné
 * funkcie z modulov vstupu dostáva od volajúceho (`VisibilityDeps`). Čo sa
 * nedá vykonať (nič sa nenašlo), sa zapíše ako problém pre `APPLIED`.
 */

import type { BimContext, EntityRef } from '@ifc-lite/sdk';
import { useViewerStore } from '../store/index.js';
import { fromGlobalIdFromModels, toGlobalIdFromModels } from '../store/globalId.js';
import type { InboundMessage, OpsSelector, resolveGuids, resolveSelector } from './bridge-protocol.js';
import { nextIsolation, type CommandInboundMessage } from './command-protocol.js';
import { frameRefs, revealGatesForRefs } from './frame-refs.js';
import { applyPanelView } from './aimPanelView.js';
import { selectPanel } from './aimPanelViewPlan.js';
import { useAimFocusRoomsStore } from './aimFocusRoomsStore.js';
import { addGlobalIdsToSelection } from './aimMultiSelect.js';
import { isClickGesture, isDismissKey, isSceneTarget } from './focus-dismiss.js';

/** Funkcie z modulov vstupného balíka - lenivý modul ich neimportuje (pravidlo balíka forku). */
export interface VisibilityDeps {
  resolveGuids: typeof resolveGuids;
  resolveSelector: typeof resolveSelector;
  selectPickedGlobalId: (globalId: number | null) => void;
  noteIssue: (text: string) => void;
  track: (p: Promise<unknown>) => void;
  FOCUS_COLOR: string;
  FILTER_COLOR: string;
}

/** Prvky ofarbené posledným FOCUS-om - ďalší FOCUS alebo CLEAR_FOCUS ich vráti do pôvodných farieb. */
let focused: EntityRef[] = [];

/** Alfa zvýraznenia objemu, rovnaká ako priesvitná varianta Lens (D-125). */
const VOLUME_FOCUS_ALPHA = 0.3;

function isVolume(r: EntityRef): boolean {
  const state = useViewerStore.getState();
  const store = state.models.get(r.modelId)?.ifcDataStore ?? state.ifcDataStore;
  const type = store?.entities?.getTypeName?.(r.expressId);
  return type === 'IfcSpace' || type === 'IfcSpatialZone';
}

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

/** Počet a GUIDy zvýraznených prvkov (pre `view_state` a `APPLIED`, #94). */
export function focusSummary(): { count: number; guids: string[] } {
  const models = useViewerStore.getState().models;
  const guids: string[] = [];
  for (const r of focused.slice(0, 50)) {
    const g = models.get(r.modelId)?.ifcDataStore?.entities?.getGlobalId?.(r.expressId);
    if (g) guids.push(g);
  }
  return { count: focused.length, guids };
}

/** Odpojenie mosta: zabudnúť zvýraznené prvky (patria scéne, ktorá už nemusí byť). */
export function forgetFocus(): void {
  focused = [];
  useAimFocusRoomsStore.getState().setFocus([], '');
}

export function clearFocus(bim: BimContext): void {
  if (focused.length > 0) bim.viewer.resetColors(focused);
  forgetFocus();
}

/**
 * Klik do scény bez ťahania a Esc zrušia zvýraznenie z FOCUS, ostatné farby nechajú (#94).
 * Zvýraznenie nie je výber, takže klik do prázdna pri prázdnom výbere nič nezmení v store.
 * Vracia odpojenie poslucháčov.
 */
export function installFocusDismiss(bim: BimContext, target: Document = document): () => void {
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    down = isSceneTarget((e.target as Element | null)?.tagName) ? { x: e.clientX, y: e.clientY } : null;
  };
  const onUp = (e: PointerEvent) => {
    const start = down;
    down = null;
    if (start && focused.length > 0 && isClickGesture(start, { x: e.clientX, y: e.clientY })) clearFocus(bim);
  };
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing = !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
    if (focused.length > 0 && isDismissKey(e.key, typing)) clearFocus(bim);
  };
  target.addEventListener('pointerdown', onDown, true);
  target.addEventListener('pointerup', onUp, true);
  target.addEventListener('keydown', onKey, true);
  return () => {
    target.removeEventListener('pointerdown', onDown, true);
    target.removeEventListener('pointerup', onUp, true);
    target.removeEventListener('keydown', onKey, true);
  };
}

// Ops berú buď explicitné GUIDy, alebo množinový selektor (typy/model)
// rozkladaný viewer-side - "celý VZT.ifc" tak necestuje ako zoznam GUIDov.
function refsForOp(d: VisibilityDeps, type: string, msg: { guids?: string[]; selector?: OpsSelector }): EntityRef[] {
  const models = useViewerStore.getState().models;
  const refs = msg.guids?.length ? d.resolveGuids(models, msg.guids) : msg.selector ? d.resolveSelector(models, msg.selector) : [];
  if (refs.length === 0) d.noteIssue(`${type}: vo vieweri sa nenašiel žiadny prvok`);
  return refs;
}

/** Izolácia na presnú množinu: `isolate` je v store prepínač, rovnaká množina dvakrát by ju zrušila (#95). */
function isolateExactly(bim: BimContext, refs: EntityRef[]): void {
  useViewerStore.getState().clearIsolation();
  if (refs.length > 0) bim.viewer.isolate(refs);
}

/** ISOLATE_ADD / ISOLATE_REMOVE nad aktuálnou izoláciou; id idú späť cez SDK, aby prešli rozkladom zostáv. */
function changeIsolation(bim: BimContext, refs: EntityRef[], op: 'add' | 'remove'): void {
  const state = useViewerStore.getState();
  const ids = refs.map((r) => toGlobalIdFromModels(state.models, r.modelId, r.expressId));
  const next = nextIsolation(state.isolatedEntities, ids, op);
  const nextRefs = next.flatMap((id) => fromGlobalIdFromModels(state.models, id) ?? []);
  if (op === 'remove' && nextRefs.length === 0) {
    state.clearIsolation();
    return;
  }
  isolateExactly(bim, nextRefs);
}

/** Vykoná príkaz; false = správa nie je príkaz viditeľnosti (AimBridge ju spracuje sám). */
export function runVisibilityCommand(
  msg: InboundMessage | CommandInboundMessage,
  bim: BimContext,
  d: VisibilityDeps,
): boolean {
  switch (msg.type) {
    case 'FOCUS': {
      const refs = d.resolveGuids(useViewerStore.getState().models, msg.guids);
      // Prázdny FOCUS zruší predošlé zvýraznenie (inak by oranžová ostala navždy, #94).
      clearFocus(bim);
      if (refs.length === 0) {
        if (msg.guids.length > 0) d.noteIssue('FOCUS: vo vieweri sa nenašiel žiadny prvok');
        return true;
      }
      // Explicitné ofarbenie (oranžová ako v pôvodnom AIM three.js vieweri). Výber
      // nemení: zvýraznenie a výber sú pre hosta dva príkazy (FOCUS / SELECT, #97 V1).
      // Objemy (IfcSpace, IfcSpatialZone) priesvitne, aby neprekryli prvky vnútri (ako Lens, D-125).
      const volumes = refs.filter((r) => isVolume(r));
      const solids = refs.filter((r) => !isVolume(r));
      if (solids.length > 0) bim.viewer.colorize(solids, d.FOCUS_COLOR);
      if (volumes.length > 0) bim.viewer.colorizeRgba(volumes, hexToRgba(d.FOCUS_COLOR, VOLUME_FOCUS_ALPHA));
      focused = refs;
      // Priesvitný objem splynie s farbou miestnosti, preto aj nepriesvitná výplň podstavy (3D aj zhora, #319).
      const state = useViewerStore.getState();
      useAimFocusRoomsStore.getState().setFocus(volumes.map((r) => toGlobalIdFromModels(state.models, r.modelId, r.expressId)), d.FOCUS_COLOR);
      d.track(frameRefs(bim, refs, 'FOCUS', d.noteIssue));
      return true;
    }
    case 'SELECT': {
      // Výber ako klik myšou (D-082): ENTITY_SELECTED musí ísť hostovi, preto nie je programový.
      const panel = selectPanel(msg.panel);
      if (panel === null) {
        d.noteIssue('SELECT: neplatný panel (section properties|quantities, focus pset + property)');
        return true;
      }
      const state = useViewerStore.getState();
      // Prvý GUID nesie panel; ďalšie (AIM #217) sa pridajú ako Ctrl+klik. Neznáme sa preskočia.
      const wanted = [...new Set([msg.guid, ...(msg.guids ?? [])])];
      const refs = wanted.flatMap((g) => d.resolveGuids(state.models, [g]).slice(0, 1));
      const [ref] = refs;
      if (!ref) {
        d.noteIssue('SELECT: prvok sa vo vieweri nenašiel');
        return true;
      }
      if (refs.length < wanted.length) d.noteIssue(`SELECT: vo vieweri sa nenašlo ${wanted.length - refs.length} z ${wanted.length} prvkov`);
      clearFocus(bim); // oranžová by prekryla selekčné zvýraznenie
      d.selectPickedGlobalId(toGlobalIdFromModels(state.models, ref.modelId, ref.expressId));
      // Ostatné naraz: rad Ctrl+klikov bol pri stovkách prvkov O(N^2) a APPLIED meškalo (#273).
      addGlobalIdsToSelection(refs.slice(1).map((extra) => toGlobalIdFromModels(state.models, extra.modelId, extra.expressId)));
      useViewerStore.getState().openPanelInHome('properties', 'programmatic');
      d.track(frameRefs(bim, refs, 'SELECT', d.noteIssue));
      if (panel) d.track(applyPanelView(panel, ref, d.noteIssue));
      return true;
    }
    case 'CLEAR_SELECTION':
      // Ako klik do prázdna: výber zruší a hostovi ide ENTITY_DESELECTED (D-102).
      d.selectPickedGlobalId(null);
      return true;
    case 'HIGHLIGHT_FILTER': {
      bim.viewer.resetColors(); // plný reset zhodí aj focus - filter ho nahrádza
      forgetFocus();
      const refs = d.resolveGuids(useViewerStore.getState().models, msg.guids);
      revealGatesForRefs(refs); // ako COLORIZE: miestnosť v skrytej triede by inak nebolo vidieť
      if (refs.length > 0) bim.viewer.colorize(refs, d.FILTER_COLOR);
      return true;
    }
    case 'CLEAR_FILTER':
    case 'RESET_COLORS':
      bim.viewer.resetColors();
      forgetFocus();
      return true;
    case 'CLEAR_FOCUS':
      clearFocus(bim);
      return true;
    case 'COLORIZE': {
      const refs = refsForOp(d, msg.type, msg);
      // Ofarbená miestnosť v skrytej triede by nebola vidieť; zapne sa ako pri Lens (D-119).
      revealGatesForRefs(refs);
      if (refs.length > 0) bim.viewer.colorize(refs, msg.color);
      return true;
    }
    case 'HIDE': {
      const refs = refsForOp(d, msg.type, msg);
      if (refs.length > 0) bim.viewer.hide(refs);
      return true;
    }
    case 'SHOW': {
      const refs = refsForOp(d, msg.type, msg);
      // "Zobraz miestnosti": skrytá trieda (IfcSpace, IfcSpatialZone) sa zapne, inak by show nemal čo ukázať (D-119).
      revealGatesForRefs(refs);
      if (refs.length > 0) bim.viewer.show(refs);
      return true;
    }
    case 'ISOLATE': {
      const refs = refsForOp(d, msg.type, msg);
      revealGatesForRefs(refs);
      if (refs.length > 0) isolateExactly(bim, refs);
      return true;
    }
    case 'ISOLATE_ADD':
    case 'ISOLATE_REMOVE': {
      const refs = refsForOp(d, msg.type, msg);
      if (msg.type === 'ISOLATE_ADD') revealGatesForRefs(refs);
      if (refs.length > 0) changeIsolation(bim, refs, msg.type === 'ISOLATE_ADD' ? 'add' : 'remove');
      return true;
    }
    case 'SHOW_ALL':
      bim.viewer.resetVisibility();
      return true;
    default:
      return false;
  }
}
