/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čistá logika Lens z chatu (AIM D-096): validácia správ `APPLY_LENS` /
 * `LENS_QUERY`, zlúčenie s doterajšou AIM chat lens a súhrn počtov pre hosta.
 * Store sa tu nečíta; lepidlo je v `aimLens.ts`.
 *
 * Lens farbí prvou zhodou (`evaluateLens`), preto izolácia = pravidlá z chatu a
 * za nimi pravidlo "ostatné" so skrytím, ktoré zachytí všetko zvyšné.
 */

import { isFilterGroup, type FilterGroup, type FilterRule } from '@ifc-lite/rules';
import type { AutoColorLegendEntry, AutoColorSpec, Lens, LensRule } from '@ifc-lite/lens';
import { AIM_LENS_MODES, type LensInboundMessage } from './lens-protocol.js';

export const AIM_LENS_NAME = 'AIM chat';
export const MAX_AIM_RULES = 24;
/** Spolu GlobalId v pravidlách `globalId` jednej správy (zóna z AIM, konkrétne prvky). */
export const MAX_AIM_GLOBAL_IDS = 5000;
const MAX_GROUPS = 8;
const REST_PREFIX = 'aim-rest-';
const REST_NAME = 'Ostatné (skryté)';
/** Hodnota modelu, ktorú žiadny model nemá: neznámy model nesmie matchnúť všetko. */
const NO_MODEL = '__aim_no_model__';
const HEX = /^#[0-9a-fA-F]{6}$/;
const AUTO_SOURCES = new Set(['ifcType', 'attribute', 'property', 'quantity', 'classification', 'material', 'model', 'group']);
const ACTIONS = new Set(['colorize', 'transparent', 'hide']);

export type ApplyLensMessage = Extract<LensInboundMessage, { type: 'APPLY_LENS' }>;
export type LensQueryMessage = Extract<LensInboundMessage, { type: 'LENS_QUERY' }>;

const shortStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const optStr = (v: unknown, max: number) => v === undefined || shortStr(v, max);

function countGlobalIds(groups: FilterGroup[]): number {
  let n = 0;
  for (const g of groups) for (const r of g.rules) if (r.kind === 'globalId') n += r.values.length;
  return n;
}

/** Plná validácia správy z hosta; `null` = zahodiť. */
export function parseLensMessage(data: LensInboundMessage): ApplyLensMessage | LensQueryMessage | null {
  const m = data as unknown as Record<string, unknown>;
  if (m.type === 'LENS_QUERY') {
    return shortStr(m.id, 64) && optStr(m.rev, 64) ? (data as LensQueryMessage) : null;
  }
  if (!(AIM_LENS_MODES as readonly unknown[]).includes(m.mode) || !optStr(m.rev, 64)) return null;
  if (m.isolate !== undefined && typeof m.isolate !== 'boolean') return null;
  if (m.autoColor !== undefined) {
    const a = m.autoColor as Record<string, unknown> | null;
    if (!a || typeof a !== 'object' || !AUTO_SOURCES.has(a.source as string)) return null;
    if (!optStr(a.psetName, 200) || !optStr(a.propertyName, 200)) return null;
  }
  if (m.rules !== undefined) {
    if (!Array.isArray(m.rules) || m.rules.length > MAX_AIM_RULES) return null;
    let ids = 0;
    for (const r of m.rules as Record<string, unknown>[]) {
      if (!r || typeof r !== 'object' || !shortStr(r.name, 120) || !ACTIONS.has(r.action as string)) return null;
      if (typeof r.color !== 'string' || !HEX.test(r.color)) return null;
      if (!Array.isArray(r.groups) || r.groups.length === 0 || r.groups.length > MAX_GROUPS) return null;
      if (!r.groups.every(isFilterGroup)) return null;
      ids += countGlobalIds(r.groups as FilterGroup[]);
    }
    if (ids > MAX_AIM_GLOBAL_IDS) return null;
  }
  const hasContent = (Array.isArray(m.rules) && m.rules.length > 0) || m.autoColor !== undefined || m.isolate === true;
  if ((m.mode === 'add' || m.mode === 'replace') && !hasContent) return null;
  return data as ApplyLensMessage;
}

export interface ModelRef {
  name: string;
  /** `sourceFingerprint` - identita, ktorú porovnáva pravidlo `model`. */
  fingerprint?: string;
}

/**
 * Pravidlo `model` od hosta nesie meno modelu federácie (VZT, ASR); Lens
 * porovnáva identitu modelu, ktorú host nepozná. Meno -> identity modelov, ktorých
 * názov ho obsahuje; bez zhody pravidlo nematchne nič.
 */
export function resolveModelRules(groups: FilterGroup[], models: readonly ModelRef[]): FilterGroup[] {
  const resolve = (rule: FilterRule): FilterRule => {
    if (rule.kind !== 'model') return rule;
    const values = rule.values.flatMap((want) => {
      const w = want.trim().toLowerCase();
      const hits = models.filter((m) => m.fingerprint && w && m.name.toLowerCase().includes(w));
      return hits.length > 0 ? hits.map((m) => m.fingerprint as string) : [`${NO_MODEL}:${want}`];
    });
    return { ...rule, values: [...new Set(values)] };
  };
  return groups.map((g) => ({ ...g, rules: g.rules.map(resolve) }));
}

const isRest = (r: LensRule) => r.id.startsWith(REST_PREFIX);

function restRule(tag: string): LensRule {
  return {
    id: `${REST_PREFIX}${tag}`,
    name: REST_NAME,
    enabled: true,
    action: 'hide',
    color: '#9e9e9e',
    groups: [{ combinator: 'AND', rules: [{ kind: 'globalId', op: 'notIn', values: [] }] }],
  };
}

/** Je lens v slote naša (nie "Color by" z tabuľky, ktorá slot zdieľa)? */
export const isAimLens = (lens: Lens | null | undefined): lens is Lens => !!lens && lens.name === AIM_LENS_NAME;

/**
 * Nová AIM chat lens po správe; `null` = lens vypnúť. `tag` robí id pravidiel
 * jedinečné naprieč verziami (počty sa párujú podľa id).
 */
export function nextAimLens(
  prev: Lens | null,
  msg: ApplyLensMessage,
  slotId: string,
  models: readonly ModelRef[],
  tag: string,
): Lens | null {
  if (msg.mode === 'clear') return null;
  const own = isAimLens(prev) ? prev : null;
  if (msg.mode === 'unisolate') {
    if (!own) return null;
    const rules = own.rules.filter((r) => !isRest(r));
    return rules.length > 0 || own.autoColor ? { ...own, rules } : null;
  }
  if (msg.autoColor) {
    const autoColor: AutoColorSpec = { ...msg.autoColor };
    return { id: slotId, name: AIM_LENS_NAME, rules: [], autoColor };
  }
  const added: LensRule[] = (msg.rules ?? []).map((r, i) => ({
    id: `aim-${tag}-${i}`,
    name: r.name,
    enabled: true,
    action: r.action,
    color: r.color.toLowerCase(),
    groups: resolveModelRules(r.groups as FilterGroup[], models),
  }));
  // Tá istá verzia znova (host ops po obnovení stránky) pravidlá nezdvojí.
  const keep = msg.mode === 'add' && own && !own.autoColor ? own.rules.filter((r) => !r.id.startsWith(`aim-${tag}-`)) : [];
  const isolate = msg.isolate === true || keep.some(isRest);
  let rules = [...keep.filter((r) => !isRest(r)), ...added];
  if (rules.length > MAX_AIM_RULES - 1) rules = rules.slice(rules.length - (MAX_AIM_RULES - 1));
  if (isolate) rules.push(restRule(tag));
  return rules.length > 0 ? { id: slotId, name: AIM_LENS_NAME, rules } : null;
}

/** Vyhodnotil už useLens práve túto verziu lens? */
export function isEvaluated(lens: Lens, counts: ReadonlyMap<string, number>, legend: readonly AutoColorLegendEntry[]): boolean {
  if (lens.autoColor) return legend.length > 0 || counts.size > 0;
  return lens.rules.filter((r) => r.enabled).every((r) => counts.has(r.id));
}

export interface AimLensSummary {
  active: boolean;
  name?: string;
  rev?: string;
  rules: { name: string; action: string; color: string; count: number }[];
  legend: { name: string; color: string; count: number }[];
  /** Prvky zafarbené alebo skryté niektorým pravidlom (bez "ostatné"). */
  matched: number;
  hidden_rest: number;
}

export function summarizeLens(
  lens: Lens | null,
  counts: ReadonlyMap<string, number>,
  legend: readonly AutoColorLegendEntry[],
  rev?: string,
): AimLensSummary {
  if (!lens) return { active: false, rules: [], legend: [], matched: 0, hidden_rest: 0 };
  const rules = lens.rules
    .filter((r) => r.enabled && !isRest(r))
    .map((r) => ({ name: r.name, action: r.action, color: r.color, count: counts.get(r.id) ?? 0 }));
  const rest = lens.rules.find(isRest);
  const legendOut = legend.slice(0, 50).map((l) => ({ name: l.name, color: l.color, count: l.count }));
  return {
    active: true,
    name: lens.name,
    ...(rev ? { rev } : {}),
    rules,
    legend: legendOut,
    matched: rules.reduce((s, r) => s + r.count, 0) + legend.reduce((s, l) => s + l.count, 0),
    hidden_rest: rest ? counts.get(rest.id) ?? 0 : 0,
  };
}
