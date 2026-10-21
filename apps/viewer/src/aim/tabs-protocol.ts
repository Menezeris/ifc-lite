/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Záložky z chatu (AIM D-132, #165): `VIEW_TABS` otvorí pôdorys podlažia alebo
 * uložený pohľad do záložky, prepne, dá vedľa a zavrie. Stav vracia
 * `view_state.tabs`. Vlastný modul, lebo `bridge-protocol.ts` a
 * `view-protocol.ts` sú na rozpočte veľkosti.
 *
 * Uložený pohľad (D-122) otvára host takto: najprv `VIEW_TABS open` (nová
 * záložka sa stane aktívnou a predošlá si zapamätá kameru a rez), potom tie
 * isté príkazy ako obnova pohľadu (rez, izolácia, póza kamery). Viewer si tak
 * nepamätá definíciu pohľadu, len stav záložky počas relácie.
 */

import { SOURCE } from './bridge-protocol.js';

export const TAB_ACTIONS = ['open', 'activate', 'beside', 'unbeside', 'close'] as const;
export type TabAction = (typeof TAB_ACTIONS)[number];

export interface TabOpenWire {
  kind: 'plan' | 'view';
  /** Pôdorys: GlobalId podlažia. */
  storeyGuid?: string;
  /** Uložený pohľad: id riadku `saved_views` a jeho meno. */
  viewId?: string;
  label?: string;
  /** Kamera zamknutá (ťahanie posúva), pri pohľade zhora aj zboku. */
  locked?: boolean;
}

export interface TabsMessage {
  source: typeof SOURCE;
  type: 'VIEW_TABS';
  action: TabAction;
  /** activate / beside / close: id, `3d`, menovka alebo GlobalId podlažia; close aj `all`. */
  tab?: string;
  open?: TabOpenWire;
  /** S open: nová záložka ide vedľa doterajšej aktívnej. */
  beside?: boolean;
}

const MAX_TEXT = 200;
const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;
const optional = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || ok(v);

function isOpen(v: unknown): v is TabOpenWire {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (!optional(o.locked, (x) => typeof x === 'boolean') || !optional(o.label, isText)) return false;
  if (o.kind === 'plan') return isText(o.storeyGuid) && o.viewId === undefined;
  if (o.kind === 'view') return isText(o.viewId) && isText(o.label) && o.storeyGuid === undefined;
  return false;
}

export function isTabsMessage(data: unknown): data is TabsMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  if (m.source !== SOURCE || m.type !== 'VIEW_TABS') return false;
  if (!optional(m.beside, (x) => typeof x === 'boolean')) return false;
  switch (m.action) {
    case 'open':
      return isOpen(m.open) && m.tab === undefined;
    case 'activate':
    case 'beside':
    case 'close':
      return isText(m.tab) && m.open === undefined && m.beside === undefined;
    case 'unbeside':
      return m.tab === undefined && m.open === undefined && m.beside === undefined;
    default:
      return false;
  }
}

/** Rozloženie karty dokumentu pri `DOCUMENT_OPEN` (AIM D-132): záložka na celú plochu, alebo vedľa 3D. */
export function documentLayout(msg: unknown): 'tab' | 'split' {
  return (msg as { layout?: unknown } | null)?.layout === 'split' ? 'split' : 'tab';
}
