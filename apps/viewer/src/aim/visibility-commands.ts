/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Príkazy hosta na zvýraznenie, výber a viditeľnosť (FOCUS, SELECT, filtre,
 * COLORIZE/HIDE/SHOW/ISOLATE a doplnky z AIM D-101). Vytiahnuté z `AimBridge`
 * (strop veľkosti súboru). Čo sa nedá vykonať (nič sa nenašlo), sa zapíše
 * ako problém pre `APPLIED` namiesto tichého no-op.
 */

import type { BimContext, EntityRef } from '@ifc-lite/sdk';
import { useViewerStore } from '../store/index.js';
import { fromGlobalIdFromModels, toGlobalIdFromModels } from '../store/globalId.js';
import { selectPickedGlobalId } from '../components/viewer/viewport-selection.js';
import { FILTER_COLOR, FOCUS_COLOR, resolveGuids, resolveSelector, type InboundMessage, type OpsSelector } from './bridge-protocol.js';
import { nextIsolation, type CommandInboundMessage } from './command-protocol.js';
import { noteIssue } from './command-gate.js';

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

export function clearFocus(bim: BimContext): void {
  if (focused.length > 0) bim.viewer.resetColors(focused);
  focused = [];
}

// Ops berú buď explicitné GUIDy, alebo množinový selektor (typy/model)
// rozkladaný viewer-side - "celý VZT.ifc" tak necestuje ako zoznam GUIDov.
function refsForOp(type: string, msg: { guids?: string[]; selector?: OpsSelector }): EntityRef[] {
  const models = useViewerStore.getState().models;
  const refs = msg.guids?.length ? resolveGuids(models, msg.guids) : msg.selector ? resolveSelector(models, msg.selector) : [];
  if (refs.length === 0) noteIssue(`${type}: vo vieweri sa nenašiel žiadny prvok`);
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

const VISIBILITY_TYPES = new Set<string>(['FOCUS', 'SELECT', 'HIGHLIGHT_FILTER', 'CLEAR_FILTER', 'RESET_COLORS', 'COLORIZE', 'HIDE', 'SHOW', 'ISOLATE', 'SHOW_ALL']);

/** Príkaz pre `runVisibilityCommand` (ide bránou príkazov), nie dáta panelov a dokumentov. */
export function isVisibilityCommand(msg: InboundMessage): boolean {
  return VISIBILITY_TYPES.has(msg.type);
}

/**
 * Vykoná príkaz; false = správa nie je príkaz viditeľnosti (AimBridge ju spracuje sám).
 * `programmatic` = selekcie z FOCUS, ktoré sa hostovi neposielajú späť ako ENTITY_SELECTED.
 */
export function runVisibilityCommand(
  msg: InboundMessage | CommandInboundMessage,
  bim: BimContext,
  programmatic: { current: Set<string> | null },
): boolean {
  switch (msg.type) {
    case 'FOCUS': {
      const refs = resolveGuids(useViewerStore.getState().models, msg.guids);
      // Prázdny FOCUS zruší predošlé zvýraznenie (inak by oranžová ostala navždy, #94).
      clearFocus(bim);
      if (refs.length === 0) {
        if (msg.guids.length > 0) noteIssue('FOCUS: vo vieweri sa nenašiel žiadny prvok');
        return true;
      }
      // Explicitné ofarbenie (oranžová ako v pôvodnom AIM three.js vieweri):
      // multi-select cez SDK highlight v 3D sám nezobrazí.
      bim.viewer.colorize(refs, FOCUS_COLOR);
      focused = refs;
      programmatic.current = new Set(refs.map((r) => `${r.modelId}:${r.expressId}`));
      bim.viewer.select(refs);
      bim.viewer.flyTo(refs);
      return true;
    }
    case 'SELECT': {
      // Výber ako klik myšou (D-082): ENTITY_SELECTED musí ísť hostovi, preto nie je programový.
      const state = useViewerStore.getState();
      const [ref] = resolveGuids(state.models, [msg.guid]);
      if (!ref) {
        noteIssue('SELECT: prvok sa vo vieweri nenašiel');
        return true;
      }
      clearFocus(bim); // oranžová by prekryla selekčné zvýraznenie
      programmatic.current = null;
      selectPickedGlobalId(toGlobalIdFromModels(state.models, ref.modelId, ref.expressId));
      useViewerStore.getState().openPanelInHome('properties', 'programmatic');
      bim.viewer.flyTo([ref]);
      return true;
    }
    case 'HIGHLIGHT_FILTER': {
      bim.viewer.resetColors(); // plný reset zhodí aj focus - filter ho nahrádza
      focused = [];
      const refs = resolveGuids(useViewerStore.getState().models, msg.guids);
      if (refs.length > 0) bim.viewer.colorize(refs, FILTER_COLOR);
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
      const refs = refsForOp(msg.type, msg);
      if (refs.length > 0) bim.viewer.colorize(refs, msg.color);
      return true;
    }
    case 'HIDE': {
      const refs = refsForOp(msg.type, msg);
      if (refs.length > 0) bim.viewer.hide(refs);
      return true;
    }
    case 'SHOW': {
      const refs = refsForOp(msg.type, msg);
      if (refs.length > 0) bim.viewer.show(refs);
      return true;
    }
    case 'ISOLATE': {
      const refs = refsForOp(msg.type, msg);
      if (refs.length > 0) isolateExactly(bim, refs);
      return true;
    }
    case 'ISOLATE_ADD':
    case 'ISOLATE_REMOVE': {
      const refs = refsForOp(msg.type, msg);
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
