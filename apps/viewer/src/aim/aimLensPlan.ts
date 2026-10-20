/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čistá logika Lens z chatu (AIM D-096): validácia správ `APPLY_LENS` /
 * `LENS_QUERY`, zlúčenie s doterajšou AIM chat lens a súhrn počtov pre hosta.
 * Store sa tu nečíta; lepidlo je v `aimLens.ts`.
 *
 * Farbu dostanú len pravidlá s farbou (colorize/transparent/hide). Izolácia
 * nejde cez lens: prvky ostanú v pôvodnom vzhľade, viewer ich izoluje vlastným
 * kanálom izolácie (`isolationRules` + `aimLens.ts`). X-ray (D-105) je to isté
 * zjednotenie v kanáli ghost: vybrané plné, zvyšok priesvitný.
 */

import { isFilterGroup, type FilterGroup, type FilterRule } from '@ifc-lite/rules';
import type { AutoColorLegendEntry, AutoColorSpec, Lens, LensRule } from '@ifc-lite/lens';
import { AIM_LENS_MODES, type LensInboundMessage } from './lens-protocol.js';

export const AIM_LENS_NAME = 'AIM chat';
export const MAX_AIM_RULES = 24;
/** Spolu GlobalId v pravidlách `globalId` jednej správy (zóna z AIM, konkrétne prvky). */
export const MAX_AIM_GLOBAL_IDS = 5000;
const MAX_GROUPS = 8;
/** Hodnota modelu, ktorú žiadny model nemá: neznámy model nesmie matchnúť všetko. */
const NO_MODEL = '__aim_no_model__';
const HEX = /^#[0-9a-fA-F]{6}$/;
const AUTO_SOURCES = new Set(['ifcType', 'attribute', 'property', 'quantity', 'classification', 'material', 'model', 'group']);
const ACTIONS = new Set(['colorize', 'transparent', 'hide', 'isolate']);

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
  if (m.xray !== undefined && typeof m.xray !== 'boolean') return null;
  // Izolácia aj X-ray naraz si odporujú (viewer ich drží ako vzájomne výlučné kanály).
  if (m.isolate === true && m.xray === true) return null;
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
      // Farbu potrebuje každé pravidlo okrem čistej izolácie.
      if (r.action !== 'isolate' && (typeof r.color !== 'string' || !HEX.test(r.color))) return null;
      if (!Array.isArray(r.groups) || r.groups.length === 0 || r.groups.length > MAX_GROUPS) return null;
      if (!r.groups.every(isFilterGroup)) return null;
      ids += countGlobalIds(r.groups as FilterGroup[]);
    }
    if (ids > MAX_AIM_GLOBAL_IDS) return null;
  }
  if (m.autoColorScope !== undefined) {
    // Rozsah má zmysel len pri farbách podľa hodnoty (D-119).
    if (m.autoColor === undefined || !Array.isArray(m.autoColorScope)) return null;
    if (m.autoColorScope.length === 0 || m.autoColorScope.length > MAX_GROUPS || !m.autoColorScope.every(isFilterGroup)) return null;
    if (countGlobalIds(m.autoColorScope as FilterGroup[]) > MAX_AIM_GLOBAL_IDS) return null;
  }
  if (m.legend !== undefined && !(LEGEND_SIZES as readonly unknown[]).includes(m.legend)) return null;
  const hasRules = Array.isArray(m.rules) && m.rules.length > 0;
  // Samotná zmena legendy (D-119) lens nemení, len panel.
  const legendOnly = m.legend !== undefined && m.mode === 'add' && !hasRules && m.autoColor === undefined;
  if ((m.mode === 'add' || m.mode === 'replace') && !hasRules && m.autoColor === undefined && !legendOnly) return null;
  // Pravidlo `isolate` bez príznaku izolácie alebo X-ray by nerobilo nič.
  if (hasRules && m.isolate !== true && m.xray !== true && (m.rules as { action: string }[]).some((r) => r.action === 'isolate')) return null;
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

/** Je lens v slote naša (nie "Color by" z tabuľky, ktorá slot zdieľa)? */
export const isAimLens = (lens: Lens | null | undefined): lens is Lens => !!lens && lens.name === AIM_LENS_NAME;

/** Pravidlá správy ako pravidlá Lens (id jedinečné cez `tag`, modely preložené). */
function toLensRules(msg: ApplyLensMessage, models: readonly ModelRef[], tag: string): LensRule[] {
  return (msg.rules ?? []).map((r, i) => ({
    id: `aim-${tag}-${i}`,
    name: r.name,
    enabled: true,
    action: r.action === 'isolate' ? 'colorize' : r.action,
    color: (r.color ?? '#000000').toLowerCase(),
    groups: resolveModelRules(r.groups as FilterGroup[], models),
  }));
}

/**
 * Pravidlá, ktorých zjednotenie viewer izoluje (`isolate: true`) alebo dá do X-ray
 * (`xray: true`), vrátane farebných; vyhodnocujú sa ako lens, ale do scény sa
 * nedávajú. Bez izolácie a X-ray prázdne.
 */
export function isolationRules(msg: ApplyLensMessage, models: readonly ModelRef[], tag: string): LensRule[] {
  return msg.isolate === true || msg.xray === true ? toLensRules(msg, models, tag) : [];
}

/**
 * Nová AIM chat lens po správe; `null` = lens vypnúť. Do lens idú len pravidlá
 * s farbou; čistá izolácia lens nemení. `tag` robí id pravidiel jedinečné
 * naprieč verziami (počty sa párujú podľa id).
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
  if (msg.mode === 'unisolate') return own;
  if (msg.autoColor) {
    const autoColor: AutoColorSpec = { ...msg.autoColor };
    return { id: slotId, name: AIM_LENS_NAME, rules: [], autoColor };
  }
  const added = toLensRules(msg, models, tag).filter((_, i) => msg.rules?.[i].action !== 'isolate');
  // Tá istá verzia znova (host ops po obnovení stránky) pravidlá nezdvojí.
  const keep = msg.mode === 'add' && own && !own.autoColor ? own.rules.filter((r) => !r.id.startsWith(`aim-${tag}-`)) : [];
  if (msg.mode === 'add' && added.length === 0) return own;
  // Lens farbí prvou zhodou: novšie pravidlá idú dopredu, aby nová farba prebila staršiu.
  let rules = [...added, ...keep];
  if (rules.length > MAX_AIM_RULES) rules = rules.slice(0, MAX_AIM_RULES);
  return rules.length > 0 ? { id: slotId, name: AIM_LENS_NAME, rules } : null;
}

/** Vyhodnotil už useLens práve túto verziu lens? */
export function isEvaluated(lens: Lens, counts: ReadonlyMap<string, number>, legend: readonly AutoColorLegendEntry[]): boolean {
  if (lens.autoColor) return legend.length > 0 || counts.size > 0;
  return lens.rules.filter((r) => r.enabled).every((r) => counts.has(r.id));
}

/** Výsledok izolácie z chatu: počet na pravidlo a izolovaných spolu. */
export interface AimIsolation {
  rev?: string;
  rules: { name: string; count: number }[];
  isolated: number;
  /** Zjednotenie je v X-ray kanáli (zvyšok priesvitný), nie v izolácii (D-105). */
  xray?: true;
}

export interface AimLensSummary {
  active: boolean;
  name?: string;
  rev?: string;
  rules: { name: string; action: string; color: string; count: number }[];
  legend: { name: string; color: string; count: number }[];
  /** Prvky zafarbené alebo skryté niektorým pravidlom. */
  matched: number;
  isolation?: AimIsolation;
}

export function summarizeLens(
  lens: Lens | null,
  counts: ReadonlyMap<string, number>,
  legend: readonly AutoColorLegendEntry[],
  rev?: string,
  isolation?: AimIsolation | null,
): AimLensSummary {
  const iso = isolation ? { isolation } : {};
  if (!lens) return { active: false, rules: [], legend: [], matched: 0, ...iso };
  const rules = lens.rules
    .filter((r) => r.enabled)
    .map((r) => ({ name: r.name, action: r.action, color: r.color, count: counts.get(r.id) ?? 0 }));
  const legendOut = legend.slice(0, 50).map((l) => ({ name: l.name, color: l.color, count: l.count }));
  return {
    active: true,
    name: lens.name,
    ...(rev ? { rev } : {}),
    rules,
    legend: legendOut,
    matched: rules.reduce((s, r) => s + r.count, 0) + legend.reduce((s, l) => s + l.count, 0),
    ...iso,
  };
}

/** Veľkosť legendy z chatu (D-119). */
export const LEGEND_SIZES = ['large', 'normal'] as const;
export type LegendSize = (typeof LEGEND_SIZES)[number];

/** Plávajúce okno veľkej legendy: takmer celý viewer, najviac 960 px široké. */
export function legendPanelRect(width: number, height: number): { x: number; y: number; w: number; h: number } {
  const w = Math.max(320, Math.min(960, width - 96));
  const h = Math.max(320, height - 160);
  return { x: Math.max(16, Math.round((width - w) / 2)), y: 96, w, h };
}
