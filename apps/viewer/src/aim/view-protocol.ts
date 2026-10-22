/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bridge správy pohľadu (AIM D-083 fáza 1): rez, kamera, režim 3D|2D|Split.
 * Host nepozná súradnice scény, preto správy nesú len podlažie (IFC GlobalId),
 * výšku nad jeho úrovňou, preset kamery a GUIDy cieľa - prepočet na rovinu a
 * kameru robí viewer (`viewCommands.ts`). Vlastný súbor, lebo
 * `bridge-protocol.ts` je na rozpočte veľkosti modulu.
 *
 * Spätný kanál (AIM D-085): `QUERY` sa pýta na obálky prvkov a modelu alebo na
 * stav pohľadu, viewer odpovie `QUERY_RESULT` s tým istým `id`. Súradnice v
 * odpovedi aj `coordinate` v `SET_SECTION` sú IFC svet (Z hore, metre), aby
 * jedna pravda o súradniciach ostala vo vieweri.
 */

import { SOURCE, type OpsSelector } from './bridge-protocol.js';
import { isPanelScroll, type PanelScroll } from './aimPanelScrollPlan.js';

/** keep = smer sa nemení, section = kolmo na aktívny rez ako tlačidlo Set view (AIM D-098). */
export const CAMERA_PRESETS = ['top', 'bottom', 'front', 'back', 'left', 'right', 'iso', 'fit_all', 'keep', 'section'] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];
/** Rámovanie pri zachovanom smere: viditeľné prvky (`fitAll`) alebo výber (`frameSelection`). */
export const CAMERA_FITS = ['visible', 'selection'] as const;
export type CameraFit = (typeof CAMERA_FITS)[number];
/** Časť cieľa podľa smeru pohľadu (AIM D-128): tretina obrazu po šírke, výške alebo hĺbke. */
export const CAMERA_AREAS = ['left', 'right', 'top', 'bottom', 'front', 'back'] as const;
export type CameraArea = (typeof CAMERA_AREAS)[number];
/** Násobok obálky pri rámovaní s okrajom (1 = od hrany po hranu, host posiela 1 + okraj v %). */
export const CAMERA_PADDING = { min: 1, max: 4 } as const;
/** Presná póza kamery v IFC svete (Z hore, m); host ju počíta pre relatívne kroky (AIM D-098). */
export interface BridgeViewpoint {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  /** Polovica výšky pohľadu v m, len pri ortografickej projekcii. */
  orthoSize?: number;
}
export const VIEW_MODES = ['3d', '2d', 'split'] as const;
export type BridgeViewMode = (typeof VIEW_MODES)[number];
export type SectionAxis = 'x' | 'y' | 'z';
/** Rez cez prvok: pozdĺž / naprieč jeho dlhšej vodorovnej osi (zvislý), alebo stredom na danej osi. */
export const SECTION_FITS = ['along', 'across', 'center'] as const;
export type SectionFit = (typeof SECTION_FITS)[number];
export const VIEW_QUERIES = ['bounds', 'view_state'] as const;
export type ViewQuery = (typeof VIEW_QUERIES)[number];

/** Panely z chatu (AIM D-127, `drawing` D-136): mená na drôte, mapovanie a vykonanie v `aimPanelsPlan.ts` / `aimPanels.ts`. */
export const PANEL_KEYS = ['lens', 'properties', 'underlays', 'documents', 'lists', 'model_tree', 'drawing'] as const;
export type PanelKey = (typeof PANEL_KEYS)[number];
const PANEL_ACTIONS: readonly unknown[] = ['open', 'close', 'toggle'];
export type PanelsRequest = Partial<Record<PanelKey | 'all', 'open' | 'close' | 'toggle'>>;

/** `panels` zo správy hosta: aspoň jedna položka, `all` len `close` (čistý pohľad). */
export function isPanelsRequest(raw: unknown): raw is PanelsRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const entries = Object.entries(raw as Record<string, unknown>);
  return entries.length > 0 && entries.every(([k, v]) =>
    PANEL_ACTIONS.includes(v) && ((PANEL_KEYS as readonly string[]).includes(k) || (k === 'all' && v === 'close')));
}

/** Výška rezu nad úrovňou podlažia v metroch - rovnaký rozsah ako host. */
export const SECTION_OFFSET_RANGE = { min: -5, max: 20 } as const;
const MAX_GUIDS = 600;
/** Obálky sa vracajú po prvkoch, preto menej než pri ofarbení. */
export const MAX_QUERY_GUIDS = 100;
/** Najviac kót v jednom `MEASURE_SHOW` - rovnaký limit ako host (AIM D-124). */
export const MAX_MEASURE_SEGMENTS = 12;
/** Najviac bodov čiary trasy v jednom `ROUTE_SHOW` - rovnaký limit ako host (AIM D-137). */
export const MAX_ROUTE_POINTS = 400;
type Vec3Wire = { x: number; y: number; z: number };

export type ViewInboundMessage =
  | {
      source: typeof SOURCE;
      type: 'SET_SECTION';
      /** gizmo = len zobraziť/skryť widget aktívneho rezu, rez ostáva (#63). */
      action: 'set' | 'clear' | 'gizmo';
      axis?: SectionAxis;
      storeyGuid?: string;
      offsetM?: number;
      position?: number;
      /** Rez cez obálku týchto prvkov (`fit` along/across zvolí zvislú os sám). */
      guids?: string[];
      fit?: SectionFit;
      /** Poloha roviny v IFC svete (m) na osi rezu: x = IFC X, y = IFC Z (výška), z = IFC Y. */
      coordinate?: number;
      flipped?: boolean;
      /** Widget rezu (quad a obrys roviny); false = čistý pohľad, rez ostáva aktívny. */
      showGizmo?: boolean;
    }
  | {
      source: typeof SOURCE;
      type: 'SET_CAMERA';
      preset: CameraPreset;
      projection?: 'perspective' | 'orthographic';
      /** Cieľ rámovania: GUIDy alebo selektor ako pri COLORIZE. */
      guids?: string[];
      selector?: OpsSelector;
      fit?: CameraFit;
      viewpoint?: BridgeViewpoint;
      /** Okraj rámovania cieľa alebo výberu (AIM D-128), pre `frameBounds`. */
      padding?: number;
      /** Zarámovať len prvky cieľa alebo výberu v danej tretine obrazu (AIM D-128). */
      area?: CameraArea;
    }
  | { source: typeof SOURCE; type: 'SET_VIEW_MODE'; mode: BridgeViewMode; storeyGuid?: string }
  | { source: typeof SOURCE; type: 'QUERY'; id: string; query: ViewQuery; guids?: string[] }
  /** Panely z chatu (AIM D-127): otvoriť, zavrieť, prepnúť; `all` len zavrieť. */
  | { source: typeof SOURCE; type: 'SET_PANELS'; panels: PanelsRequest }
  /** Posun panela vlastností (AIM #183): o stranu hore / dole, na začiatok, na koniec. */
  | { source: typeof SOURCE; type: 'SCROLL_PANEL'; direction: PanelScroll }
  /** Kóty v IFC svete (Z hore, m) do nástroja Measure (AIM D-124); `keep` = pridať k predošlým od hosta. */
  | { source: typeof SOURCE; type: 'MEASURE_SHOW'; segments: { a: Vec3Wire; b: Vec3Wire }[]; keep?: boolean }
  /** Čiara trasy v IFC svete (Z hore, m) od hosta (AIM D-137); nahradí predošlú, prázdne body ju zmažú. */
  | { source: typeof SOURCE; type: 'ROUTE_SHOW'; points: Vec3Wire[]; color?: string };

/** Odpoveď viewera na `QUERY` (viewer -> host). */
export type ViewQueryResult =
  | { source: typeof SOURCE; type: 'QUERY_RESULT'; id: string; ok: true; result: unknown }
  | { source: typeof SOURCE; type: 'QUERY_RESULT'; id: string; ok: false; error: string };

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const inRange = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const optional = <T>(v: T | undefined, ok: (x: T) => boolean) => v === undefined || ok(v);

function isGuidList(v: unknown, max = MAX_GUIDS): v is string[] {
  return Array.isArray(v) && v.length <= max && v.every(isStr);
}

const isAxis = (v: unknown) => v === 'x' || v === 'y' || v === 'z';
const COORD_LIMIT = 1e7;
const isVec = (v: unknown) => {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return inRange(p.x, -COORD_LIMIT, COORD_LIMIT) && inRange(p.y, -COORD_LIMIT, COORD_LIMIT) && inRange(p.z, -COORD_LIMIT, COORD_LIMIT);
};

function isViewpoint(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  if (!isVec(p.position) || !isVec(p.target) || !isVec(p.up)) return false;
  const up = p.up as { x: number; y: number; z: number };
  return Math.hypot(up.x, up.y, up.z) > 1e-6 && optional(p.orthoSize, (o) => inRange(o, 1e-3, COORD_LIMIT));
}

function isSelector(v: unknown): v is OpsSelector {
  if (!v || typeof v !== 'object') return false;
  const sel = v as { types?: unknown; model?: unknown };
  const types = sel.types === undefined || (Array.isArray(sel.types) && sel.types.length <= 100 && sel.types.every(isStr));
  return types && optional(sel.model, isStr) && (sel.types !== undefined || sel.model !== undefined);
}
const isId = (v: unknown) => isStr(v) && v.length <= 64;

export function isViewMessage(data: unknown): data is ViewInboundMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  if (m.source !== SOURCE) return false;
  switch (m.type) {
    case 'SET_SECTION': {
      if (m.action === 'clear') return true;
      if (m.action === 'gizmo') return typeof m.showGizmo === 'boolean';
      if (m.action !== 'set') return false;
      if (!optional(m.flipped, (f) => typeof f === 'boolean')) return false;
      if (!optional(m.showGizmo, (f) => typeof f === 'boolean')) return false;
      if (isStr(m.storeyGuid)) {
        // Rez nad podlažím je vždy vodorovný.
        return (m.axis === undefined || m.axis === 'y')
          && optional(m.offsetM, (o) => inRange(o, SECTION_OFFSET_RANGE.min, SECTION_OFFSET_RANGE.max));
      }
      if (m.guids !== undefined) {
        // along/across si os zvolí podľa obálky; stredom treba os povedať.
        if (!isGuidList(m.guids, MAX_QUERY_GUIDS) || m.guids.length === 0) return false;
        if (m.fit === 'along' || m.fit === 'across') return m.axis === undefined;
        return (m.fit === undefined || m.fit === 'center') && isAxis(m.axis);
      }
      if (m.coordinate !== undefined) return isAxis(m.axis) && inRange(m.coordinate, -1e7, 1e7);
      return isAxis(m.axis) && inRange(m.position, 0, 100);
    }
    case 'SET_CAMERA': {
      const valid = (CAMERA_PRESETS as readonly unknown[]).includes(m.preset)
        && optional(m.projection, (p) => p === 'perspective' || p === 'orthographic')
        && optional(m.guids, isGuidList)
        && optional(m.selector, isSelector)
        && optional(m.fit, (f) => (CAMERA_FITS as readonly unknown[]).includes(f))
        && optional(m.viewpoint, isViewpoint)
        && optional(m.padding, (p) => inRange(p, CAMERA_PADDING.min, CAMERA_PADDING.max))
        && optional(m.area, (a) => (CAMERA_AREAS as readonly unknown[]).includes(a));
      if (!valid) return false;
      // Jeden cieľ rámovania; póza nahrádza smer presetu.
      const targets = [m.guids !== undefined && (m.guids as string[]).length > 0, m.selector !== undefined, m.fit !== undefined];
      if (targets.filter(Boolean).length > 1) return false;
      // Póza od hosta je hotový výsledok: rámovanie po nej by ju zahodilo.
      if (m.viewpoint !== undefined && targets.some(Boolean)) return false;
      return m.viewpoint === undefined || m.preset === 'keep';
    }
    case 'SET_VIEW_MODE':
      return (VIEW_MODES as readonly unknown[]).includes(m.mode) && optional(m.storeyGuid, isStr);
    case 'MEASURE_SHOW':
      return Array.isArray(m.segments)
        && m.segments.length > 0
        && m.segments.length <= MAX_MEASURE_SEGMENTS
        && m.segments.every((s) => !!s && typeof s === 'object' && isVec((s as { a?: unknown }).a) && isVec((s as { b?: unknown }).b))
        && optional(m.keep, (k) => typeof k === 'boolean');
    case 'ROUTE_SHOW':
      return Array.isArray(m.points)
        && m.points.length !== 1
        && m.points.length <= MAX_ROUTE_POINTS
        && m.points.every(isVec)
        && optional(m.color, (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c));
    case 'SET_PANELS':
      return isPanelsRequest(m.panels);
    case 'SCROLL_PANEL':
      return isPanelScroll(m.direction);
    case 'QUERY':
      return isId(m.id)
        && (VIEW_QUERIES as readonly unknown[]).includes(m.query)
        && optional(m.guids, (g) => isGuidList(g, MAX_QUERY_GUIDS));
    default:
      return false;
  }
}
