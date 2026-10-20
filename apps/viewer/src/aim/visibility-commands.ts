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

/** Funkcie z modulov vstupného balíka - lenivý modul ich neimportuje (pravidlo balíka forku). */
export interface VisibilityDeps {
  resolveGuids: typeof resolveGuids;
  resolveSelector: typeof resolveSelector;
  selectPickedGlobalId: (globalId: number | null) => void;
  noteIssue: (text: string) => void;
  track: (p: Promise<unknown>) => void;
  /** Pohľad pred zarámovaním (2D/split na podlaží cieľa alebo 3D, #97 V1); kľúč podlažia `modelId:expressId`. */
  prepareFocusView: (storeyKeys: readonly (string | null)[]) => void;
  FOCUS_COLOR: string;
  FILTER_COLOR: string;
}

/** Prvky ofarbené posledným FOCUS-om - ďalší FOCUS alebo CLEAR_FOCUS ich vráti do pôvodných farieb. */
let focused: EntityRef[] = [];

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
}

export function clearFocus(bim: BimContext): void {
  if (focused.length > 0) bim.viewer.resetColors(focused);
  focused = [];
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
      bim.viewer.colorize(refs, d.FOCUS_COLOR);
      focused = refs;
      const models = useViewerStore.getState().models;
      d.prepareFocusView(refs.map((r) => {
        const storey = models.get(r.modelId)?.ifcDataStore?.spatialHierarchy?.elementToStorey.get(r.expressId);
        return storey === undefined ? null : `${r.modelId}:${storey}`;
      }));
      d.track(frameRefs(bim, refs, 'FOCUS', d.noteIssue));
      return true;
    }
    case 'SELECT': {
      // Výber ako klik myšou (D-082): ENTITY_SELECTED musí ísť hostovi, preto nie je programový.
      const panel = selectPanel(msg.panel);
      if (panel === null) {
        d.noteIssue('SELECT: neplatný panel (tab aim|ifc, section properties|quantities, focus pset + property)');
        return true;
      }
      const state = useViewerStore.getState();
      const [ref] = d.resolveGuids(state.models, [msg.guid]);
      if (!ref) {
        d.noteIssue('SELECT: prvok sa vo vieweri nenašiel');
        return true;
      }
      clearFocus(bim); // oranžová by prekryla selekčné zvýraznenie
      d.selectPickedGlobalId(toGlobalIdFromModels(state.models, ref.modelId, ref.expressId));
      useViewerStore.getState().openPanelInHome('properties', 'programmatic');
      d.track(frameRefs(bim, [ref], 'SELECT', d.noteIssue));
      if (panel) d.track(applyPanelView(panel, ref, d.noteIssue));
      return true;
    }
    case 'CLEAR_SELECTION':
      // Ako klik do prázdna: výber zruší a hostovi ide ENTITY_DESELECTED (D-102).
      d.selectPickedGlobalId(null);
      return true;
    case 'HIGHLIGHT_FILTER': {
      bim.viewer.resetColors(); // plný reset zhodí aj focus - filter ho nahrádza
      focused = [];
      const refs = d.resolveGuids(useViewerStore.getState().models, msg.guids);
      if (refs.length > 0) bim.viewer.colorize(refs, d.FILTER_COLOR);
      return true;
    }
    case 'CLEAR_FILTER':
    case 'RESET_COLORS':
      bim.viewer.resetColors();
      focused = [];
      return true;
    case 'CLEAR_FOCUS':
      clearFocus(bim);
      return true;
    case 'COLORIZE': {
      const refs = refsForOp(d, msg.type, msg);
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
