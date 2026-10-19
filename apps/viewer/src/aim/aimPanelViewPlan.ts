/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Panel vlastností z chatu (AIM D-113): validácia `panel` v správe `SELECT` a
 * čo z neho viewer nastaví. Bez store; aplikácia je v `aimPanelView.ts`, volá ju
 * lenivý `visibility-commands.ts` (vstupný balík validáciu nenesie).
 */

import type { InspectorTab } from './aimInspectorStore.js';

export type PanelSection = 'properties' | 'quantities';

export interface AimPanelView {
  tab?: InspectorTab;
  section?: PanelSection;
  focus?: { pset: string; property: string };
}

const TABS = new Set<string>(['aim', 'ifc']);
const SECTIONS = new Set<string>(['properties', 'quantities']);
const name = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;

/** Plná validácia `panel` zo správy hosta; `null` = neplatné (správa sa zahodí). */
export function parsePanelView(raw: unknown): AimPanelView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const out: AimPanelView = {};
  if (p.tab !== undefined) {
    if (typeof p.tab !== 'string' || !TABS.has(p.tab)) return null;
    out.tab = p.tab as InspectorTab;
  }
  if (p.section !== undefined) {
    if (typeof p.section !== 'string' || !SECTIONS.has(p.section)) return null;
    out.section = p.section as PanelSection;
  }
  if (p.focus !== undefined) {
    const f = p.focus as Record<string, unknown> | null;
    if (!f || typeof f !== 'object' || !name(f.pset) || !name(f.property)) return null;
    out.focus = { pset: f.pset, property: f.property };
  }
  return out;
}

/**
 * `panel` zo správy SELECT: `undefined` = bez panela (výber ako doteraz),
 * `null` = neplatný panel, správa sa zahodí celá (nič sa nevyberie).
 */
export function selectPanel(raw: unknown): AimPanelView | undefined | null {
  return raw === undefined ? undefined : parsePanelView(raw);
}

/** Čo sa má nastaviť: focus vlastnosti žije v sekcii Properties pod záložkou IFC. */
export function panelPlan(view: AimPanelView): { tab?: InspectorTab; section?: PanelSection; focus?: { pset: string; property: string } } {
  if (view.focus) return { tab: 'ifc', section: 'properties', focus: view.focus };
  return { ...(view.tab ? { tab: view.tab } : {}), ...(view.section ? { tab: view.tab ?? 'ifc', section: view.section } : {}) };
}
