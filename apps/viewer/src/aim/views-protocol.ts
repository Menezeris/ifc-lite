/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Uložené pohľady (AIM D-161): nositeľom je panel Presentation upstreamu (`BasketView`),
 * trvalou kópiou riadok `saved_views` (D-122) s tým istým `id`. Vlastný lenivý protokol
 * (mimo `bridge-protocol.ts`, ktorý je na rozpočte veľkosti); overuje ho až lenivý
 * `viewsBridge.ts`.
 *
 * Host -> viewer:
 *  - `VIEWS_LOAD {views}`: úplný zoznam pohľadov z DB (po otvorení viewera a po každom zápise hosta).
 *    Pohľady z predošlého zoznamu, ktoré v novom chýbajú, sa vo vieweri zmažú; nové, ešte nepotvrdené
 *    pohľady z viewera sa nedotknú.
 *  - `VIEW_ACTIVATE {id | name}`: aktivuje pohľad v Presentation (kamera, rez, košík).
 *  - `VIEW_CAPTURE {name?, capture_id?}`: uloží to, čo je práve nastavené (prázdny košík = "=", teda
 *    všetko viditeľné); `VIEW_SAVE` ide hostovi s tým istým `capture_id`, `APPLIED.state.view` nesie nový pohľad.
 * Viewer -> host (z odberu store, aj keď pohľad uložil používateľ v paneli):
 *  - `VIEW_SAVE {view, capture_id?}`: vytvor alebo prepíš riadok podľa `view.id`.
 *  - `VIEW_RENAME {id, name}`, `VIEW_DELETE {id}`.
 * Súradnice kamery a rezu sú v IFC svete (m, Z hore), košík ako IFC GlobalId; náhľady sa nenosia (D-135).
 * `underlays` (AIM #325) = PDF podklady v 3D pri uložení (prepínač, viditeľnosť a priehľadnosť každého).
 */

import { SOURCE } from './bridge-core.js';
import { isUnderlaysViewWire, type UnderlaysViewWire } from './underlaysPlan.js';

export const MAX_VIEWS = 500;
/** Strop zoznamu GUID v jednom pohľade; väčší košík ide ako `truncated`. */
export const MAX_BASKET_GUIDS = 5000;
const MAX_TEXT = 200;

export type Vec3Wire = [number, number, number];
export type ViewSource = 'selection' | 'visible' | 'hierarchy' | 'manual';

export interface ViewCameraWire {
  position: Vec3Wire;
  target: Vec3Wire;
  up: Vec3Wire;
  fov: number;
  projection: 'perspective' | 'orthographic';
  ortho_size?: number;
}

export interface ViewSectionPlaneWire {
  name: string;
  /** Os hosta: x = IFC X, y = IFC Z (výška), z = IFC Y. */
  axis: 'x' | 'y' | 'z';
  /** Poloha v % rozsahu modelu pri uložení; `coordinate` (IFC m) je presnejšia a prežije novú revíziu modelu. */
  position_percent: number;
  coordinate?: number;
  flipped: boolean;
  enabled: boolean;
  show_gizmo: boolean;
  show_cap: boolean;
  show_outlines: boolean;
  box?: { min: Vec3Wire; max: Vec3Wire };
}

export interface ViewSectionWire {
  planes: ViewSectionPlaneWire[];
  /** Index aktívnej roviny v `planes`. */
  active: number;
}

/** `all` = všetko viditeľné okrem `hidden_guids` (nezapisuje tisíce GUID); `guids` = zoznam. */
export type ViewBasketWire =
  | { scope: 'all'; hidden_guids: string[] }
  | { scope: 'guids'; guids: string[]; truncated?: boolean };

export interface ViewWire {
  id: string;
  name: string;
  /** Poradie v páse Presentation (0 = prvý). */
  order: number;
  transition_ms: number | null;
  source: ViewSource;
  camera: ViewCameraWire | null;
  section: ViewSectionWire | null;
  basket: ViewBasketWire;
  /** Počet prvkov košíka pri uložení (informatívne). */
  objects: number;
  /** PDF podklady v 3D pri uložení (AIM #325); chýba = pohľad stav podkladov pri obnove nemení. */
  underlays?: UnderlaysViewWire;
}

export interface ViewsLoadMessage { source: typeof SOURCE; type: 'VIEWS_LOAD'; views: ViewWire[] }
export interface ViewActivateMessage { source: typeof SOURCE; type: 'VIEW_ACTIVATE'; id?: string; name?: string }
export interface ViewCaptureMessage { source: typeof SOURCE; type: 'VIEW_CAPTURE'; name?: string; capture_id?: string }
export type ViewsInboundMessage = ViewsLoadMessage | ViewActivateMessage | ViewCaptureMessage;

export type ViewsOutboundMessage =
  | { source: typeof SOURCE; type: 'VIEW_SAVE'; view: ViewWire; capture_id?: string }
  | { source: typeof SOURCE; type: 'VIEW_RENAME'; id: string; name: string }
  | { source: typeof SOURCE; type: 'VIEW_DELETE'; id: string };

/** Typy správ hosta, ktoré posiela `AimBridge` do lenivého modulu. */
export const VIEWS_INBOUND_TYPES: ReadonlySet<string> = new Set(['VIEWS_LOAD', 'VIEW_ACTIVATE', 'VIEW_CAPTURE']);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;
const optional = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || ok(v);
const isBool = (v: unknown) => typeof v === 'boolean';
const isVec = (v: unknown): v is Vec3Wire => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isStrings = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 64);

function isCamera(v: unknown): boolean {
  if (!isObj(v)) return false;
  return isVec(v.position) && isVec(v.target) && isVec(v.up) && isNum(v.fov)
    && (v.projection === 'perspective' || v.projection === 'orthographic') && optional(v.ortho_size, isNum);
}

function isPlane(v: unknown): boolean {
  if (!isObj(v)) return false;
  const box = v.box;
  return typeof v.name === 'string' && v.name.length <= MAX_TEXT && (v.axis === 'x' || v.axis === 'y' || v.axis === 'z')
    && isNum(v.position_percent) && optional(v.coordinate, isNum)
    && isBool(v.flipped) && isBool(v.enabled) && isBool(v.show_gizmo) && isBool(v.show_cap) && isBool(v.show_outlines)
    && (box === undefined || (isObj(box) && isVec(box.min) && isVec(box.max)));
}

function isSection(v: unknown): boolean {
  if (!isObj(v)) return false;
  return Array.isArray(v.planes) && v.planes.length >= 1 && v.planes.length <= 16 && v.planes.every(isPlane)
    && Number.isInteger(v.active) && (v.active as number) >= 0 && (v.active as number) < v.planes.length;
}

function isBasket(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (v.scope === 'all') return isStrings(v.hidden_guids, MAX_BASKET_GUIDS);
  return v.scope === 'guids' && isStrings(v.guids, MAX_BASKET_GUIDS) && optional(v.truncated, isBool);
}

export function isViewWire(v: unknown): v is ViewWire {
  if (!isObj(v)) return false;
  return isText(v.id) && isText(v.name) && Number.isInteger(v.order) && (v.transition_ms === null || isNum(v.transition_ms))
    && (v.source === 'selection' || v.source === 'visible' || v.source === 'hierarchy' || v.source === 'manual')
    && (v.camera === null || isCamera(v.camera)) && (v.section === null || isSection(v.section))
    && isBasket(v.basket) && isNum(v.objects) && optional(v.underlays, isUnderlaysViewWire);
}

/** Správa hosta pre pohľady (overí tvar; `views` s neplatným riadkom sa celé zahodí). */
export function isViewsInbound(data: unknown): data is ViewsInboundMessage {
  if (!isObj(data) || data.source !== SOURCE || typeof data.type !== 'string') return false;
  switch (data.type) {
    case 'VIEWS_LOAD':
      return Array.isArray(data.views) && data.views.length <= MAX_VIEWS && data.views.every(isViewWire);
    case 'VIEW_ACTIVATE':
      return (data.id !== undefined || data.name !== undefined) && optional(data.id, isText) && optional(data.name, isText);
    case 'VIEW_CAPTURE':
      return optional(data.name, isText) && optional(data.capture_id, isText);
    default:
      return false;
  }
}
