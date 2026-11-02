/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Overenie výmer v paneli vlastností (AIM D-185 UI): jeden pár správ s hostom, vzor ako `REQLIB_REQUEST` (D-182).
 * Host číta `v_verification_latest` a spúšťa `ifc_measure verify=true`; viewer nič nepočíta ani neukladá, len ukáže
 * výsledok pri veličine (fajočka), detail s bunkami vzorca a kóty z kotiev.
 *
 * Viewer -> host: `VERIFY_REQUEST {id, action, payload}`
 *  - `latest` {global_id}: posledný uložený beh prvku pre aktuálnu revíziu (aj zastaraný, s `stale: true`);
 *  - `run` {global_id}: overiť jeden prvok teraz (host beh uloží k revízii, ďalší klik ho už len načíta);
 *  - `run_all` {check}: overiť naraz všetky prvky kontroly v modeli, beh sa uloží k revízii; vráti súhrn.
 * Host -> viewer: `VERIFY_RESULT {id, ok, data?, error?}`, `data` = `VerifyElementWire` alebo `VerifyRunAllWire`.
 * Dáta od hosta sa overia tu (`parseVerifyElement`, `parseRunAll`); čo nesedí, viewer zahodí.
 */

import { SOURCE } from './bridge-core.js';

export const VERIFY_ACTIONS = ['latest', 'run', 'run_all'] as const;
export type VerifyAction = (typeof VERIFY_ACTIONS)[number];

/** Kontroly v ribbone (skupina Overovanie); ďalšie sa pridajú sem a do registra hosta. */
export const VERIFY_CHECKS = [
  { id: 'space_quantities', label: 'Výmery miestností (IfcSpace)', ifcTypes: ['IFCSPACE'] },
] as const;
export type VerifyCheckId = (typeof VERIFY_CHECKS)[number]['id'];

export type VerifyStatus = 'green' | 'yellow' | 'red' | 'grey';
export type VerifyUnit = 'm' | 'm2' | 'm3';

export interface VerifyRequestMessage {
  source: typeof SOURCE;
  type: 'VERIFY_REQUEST';
  id: string;
  action: VerifyAction;
  payload: { global_id?: string; check?: VerifyCheckId };
}

export interface VerifyResultMessage {
  source: typeof SOURCE;
  type: 'VERIFY_RESULT';
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** Pomenovaný vstup vzorca ("bunka"): hodnota a prvok, z ktorého pochádza. */
export interface VerifyCellWire {
  key: string;
  label: string;
  value: number;
  unit: string;
  global_id?: string;
  ref?: string;
}

export interface VerifyRecipeWire {
  recipe: string;
  status: VerifyStatus;
  /** Ako sa počíta, jednou-dvoma vetami pre človeka. */
  explanation: string;
  method?: string;
  computed_value: number | null;
  /** Výraz nad kľúčmi buniek, napr. `A - B`. */
  expression?: string;
  cells: VerifyCellWire[];
  /** Dnešný text vzorca s číslami, keď recept bunky nemá. */
  formula_text?: string;
  note?: string;
  anchors: { global_id: string; role: string; z_m?: number }[];
  /** Úseky kót v IFC svete (m, Z hore); bez nich viewer kótuje v strede pôdorysu z `z_m` kotiev. */
  segments?: { a: [number, number, number]; b: [number, number, number] }[];
}

export interface VerifyTargetWire {
  /** `Qto_SpaceBaseQuantities.Height` */
  target: string;
  status: VerifyStatus;
  unit: VerifyUnit;
  file_value: number | null;
  computed_value: number | null;
  tolerance: { text: string; abs: number | null };
  definition?: string;
  spec?: { label: string; url: string };
  file_meta?: { method_of_measurement?: string; formula?: string };
  /** `[0]` je hlavný recept (určuje stav), ďalšie sú kontrolné výpočty. */
  recipes: VerifyRecipeWire[];
}

export interface VerifyElementWire {
  version: 1;
  global_id: string;
  model: string;
  revision: number;
  current_revision: number;
  stale: boolean;
  checked_at: string;
  registry_version: number;
  engine?: string;
  /** Host stránka "Ako to funguje?" (D-185), otvára sa cez `AIM_NAVIGATE`. */
  help_href?: string;
  targets: VerifyTargetWire[];
}

export interface VerifyRunAllWire {
  check: string;
  model?: string;
  revision?: number;
  elements: number;
  counts: Record<VerifyStatus, number>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 4000): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const numOrNull = (v: unknown): number | null => num(v) ?? null;
const STATUSES: readonly VerifyStatus[] = ['green', 'yellow', 'red', 'grey'];
const status = (v: unknown): VerifyStatus | undefined => (STATUSES.includes(v as VerifyStatus) ? (v as VerifyStatus) : undefined);
const UNITS: readonly VerifyUnit[] = ['m', 'm2', 'm3'];
/** Len http(s) a cesty hosta; `javascript:` a iné schémy sa zahodia. */
export const safeHref = (v: unknown): string | undefined => {
  const s = str(v, 2000);
  if (!s) return undefined;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return /^https?:\/\//i.test(s) ? s : undefined;
};
const MAX_ITEMS = 64;

export function buildVerifyRequest(id: string, action: VerifyAction, payload: VerifyRequestMessage['payload']): VerifyRequestMessage {
  return { source: SOURCE, type: 'VERIFY_REQUEST', id, action, payload };
}

/** Odpoveď hosta (overí obálku, obsah overí `parseVerifyElement` / `parseRunAll`). */
export function isVerifyResult(data: unknown): data is VerifyResultMessage {
  if (!isObj(data) || data.source !== SOURCE || data.type !== 'VERIFY_RESULT') return false;
  if (typeof data.id !== 'string' || !data.id || data.id.length > 100 || typeof data.ok !== 'boolean') return false;
  return data.error === undefined || (typeof data.error === 'string' && data.error.length <= 4000);
}

function parseCell(raw: unknown): VerifyCellWire | null {
  if (!isObj(raw)) return null;
  const key = str(raw.key, 8);
  const label = str(raw.label, 300);
  const value = num(raw.value);
  if (!key || !label || value === undefined) return null;
  return { key, label, value, unit: str(raw.unit, 16) ?? '', global_id: str(raw.global_id, 64), ref: str(raw.ref, 100) };
}

const vec3 = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && v.length === 3 && v.every((c) => num(c) !== undefined) ? [v[0], v[1], v[2]] : null;

function parseRecipe(raw: unknown): VerifyRecipeWire | null {
  if (!isObj(raw)) return null;
  const recipe = str(raw.recipe, 200);
  const st = status(raw.status);
  if (!recipe || !st) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
  const anchors = list(raw.anchors).flatMap((a) => {
    if (!isObj(a)) return [];
    const global_id = str(a.global_id, 64);
    if (!global_id) return [];
    return [{ global_id, role: str(a.role, 200) ?? '', z_m: num(a.z_m) }];
  });
  const segments = list(raw.segments).flatMap((s) => {
    if (!isObj(s)) return [];
    const a = vec3(s.a);
    const b = vec3(s.b);
    return a && b ? [{ a, b }] : [];
  });
  return {
    recipe,
    status: st,
    explanation: str(raw.explanation) ?? str(raw.method) ?? '',
    method: str(raw.method),
    computed_value: numOrNull(raw.computed_value),
    expression: str(raw.expression, 500),
    cells: list(raw.cells).map(parseCell).filter((c): c is VerifyCellWire => c !== null),
    formula_text: str(raw.formula_text),
    note: str(raw.note),
    anchors,
    ...(segments.length > 0 ? { segments } : {}),
  };
}

function parseTarget(raw: unknown): VerifyTargetWire | null {
  if (!isObj(raw)) return null;
  const target = str(raw.target, 200);
  const st = status(raw.status);
  const unit = UNITS.includes(raw.unit as VerifyUnit) ? (raw.unit as VerifyUnit) : undefined;
  if (!target || !target.includes('.') || !st || !unit) return null;
  const recipes = (Array.isArray(raw.recipes) ? raw.recipes.slice(0, 8) : []).map(parseRecipe).filter((r): r is VerifyRecipeWire => r !== null);
  if (recipes.length === 0) return null;
  const tol = isObj(raw.tolerance) ? raw.tolerance : {};
  const spec = isObj(raw.spec) ? raw.spec : null;
  const specUrl = spec ? safeHref(spec.url) : undefined;
  const meta = isObj(raw.file_meta) ? raw.file_meta : null;
  const fileMeta = meta ? { method_of_measurement: str(meta.method_of_measurement, 500), formula: str(meta.formula, 500) } : undefined;
  return {
    target,
    status: st,
    unit,
    file_value: numOrNull(raw.file_value),
    computed_value: numOrNull(raw.computed_value),
    tolerance: { text: str(tol.text, 300) ?? '', abs: numOrNull(tol.abs) },
    definition: str(raw.definition),
    ...(spec && specUrl ? { spec: { label: str(spec.label, 200) ?? specUrl, url: specUrl } } : {}),
    ...(fileMeta && (fileMeta.method_of_measurement || fileMeta.formula) ? { file_meta: fileMeta } : {}),
    recipes,
  };
}

/** Výsledok jedného prvku od hosta, alebo `null`, keď tvar nesedí. */
export function parseVerifyElement(raw: unknown): VerifyElementWire | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  const global_id = str(raw.global_id, 64);
  if (!global_id) return null;
  const targets = (Array.isArray(raw.targets) ? raw.targets.slice(0, MAX_ITEMS) : []).map(parseTarget).filter((t): t is VerifyTargetWire => t !== null);
  const revision = num(raw.revision) ?? 0;
  return {
    version: 1,
    global_id,
    model: str(raw.model, 200) ?? '',
    revision,
    current_revision: num(raw.current_revision) ?? revision,
    stale: raw.stale === true,
    checked_at: str(raw.checked_at, 64) ?? '',
    registry_version: num(raw.registry_version) ?? 0,
    engine: str(raw.engine, 100),
    help_href: safeHref(raw.help_href),
    targets,
  };
}

export function parseRunAll(raw: unknown): VerifyRunAllWire | null {
  if (!isObj(raw)) return null;
  const check = str(raw.check, 100);
  const elements = num(raw.elements);
  if (!check || elements === undefined) return null;
  const c = isObj(raw.counts) ? raw.counts : {};
  const counts = { green: num(c.green) ?? 0, yellow: num(c.yellow) ?? 0, red: num(c.red) ?? 0, grey: num(c.grey) ?? 0 };
  return { check, model: str(raw.model, 200), revision: num(raw.revision), elements, counts };
}
