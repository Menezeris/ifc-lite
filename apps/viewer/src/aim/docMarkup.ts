/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Značky na PDF k pripomienke (AIM #199 bod 1, nad D-158): obláčik, šípka, text a pin.
 * Čistá logika bez DOM. Tvar je `{type, points[], text?}`, body v % strany (0-100,
 * počiatok vľavo hore) ako `region` v odkaze pripomienky. Host ich uloží pri
 * `bcf_topic from_viewer` do `model_task_documents.markup` a vráti v riadkoch
 * `document_references`; viewer ich kreslí nad stranou a host do snímky.
 */

import type { IssueRegion } from './docIssueModel.js';

export type MarkupType = 'cloud' | 'arrow' | 'text' | 'pin';

export const MARKUP_TYPES: readonly MarkupType[] = ['cloud', 'arrow', 'text', 'pin'];

/** Bod v % strany (0-100). */
export interface MarkupPoint {
  x: number;
  y: number;
}

/**
 * cloud = dva protiľahlé rohy obdĺžnika obláčika, arrow = [chvost, hrot],
 * text = [ľavý dolný roh textu] + text, pin = [bod] + voliteľný text.
 */
export interface MarkupShape {
  type: MarkupType;
  points: MarkupPoint[];
  text?: string;
}

/** Najviac značiek jednej pripomienky (aj strop pre nedôveryhodný vstup z hosta). */
export const MAX_MARKUP = 20;
/** Najdlhší text značky. */
export const MAX_MARKUP_TEXT = 200;
/** Ťah kratší než toto (zlomok strany) obláčik ani šípku nevytvorí. */
export const MIN_MARKUP_DRAG = 0.005;

const POINTS: Record<MarkupType, number> = { cloud: 2, arrow: 2, text: 1, pin: 1 };
const clamp100 = (v: number) => Math.min(100, Math.max(0, v));
const round = (v: number) => +v.toFixed(2);

function cleanText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_MARKUP_TEXT);
  return t || undefined;
}

/** Značky z drôtu (host, uložená téma): neplatné vynechá, body oreže na stranu, najviac MAX_MARKUP. */
export function normalizeMarkup(raw: unknown): MarkupShape[] {
  if (!Array.isArray(raw)) return [];
  const out: MarkupShape[] = [];
  for (const item of raw) {
    if (out.length >= MAX_MARKUP) break;
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const type = s.type as MarkupType;
    if (!MARKUP_TYPES.includes(type) || !Array.isArray(s.points) || s.points.length !== POINTS[type]) continue;
    const points: MarkupPoint[] = [];
    for (const p of s.points as unknown[]) {
      const q = p as Record<string, unknown> | null;
      if (!q || typeof q.x !== 'number' || typeof q.y !== 'number' || !Number.isFinite(q.x) || !Number.isFinite(q.y)) break;
      points.push({ x: round(clamp100(q.x)), y: round(clamp100(q.y)) });
    }
    if (points.length !== POINTS[type]) continue;
    const text = cleanText(s.text);
    if (type === 'text' && !text) continue;
    out.push({ type, points, ...(text && (type === 'text' || type === 'pin') ? { text } : {}) });
  }
  return out;
}

/**
 * Značka z ťahu (px v okne) nad stranou `page`. Obláčik a šípka potrebujú ťah,
 * text a pin sedia na bode pustenia; text bez textu je null.
 */
export function markupFromDrag(
  type: MarkupType,
  page: { left: number; top: number; width: number; height: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  text?: string,
): MarkupShape | null {
  if (page.width <= 0 || page.height <= 0) return null;
  const pt = (p: { x: number; y: number }): MarkupPoint => ({
    x: round(clamp100(((p.x - page.left) / page.width) * 100)),
    y: round(clamp100(((p.y - page.top) / page.height) * 100)),
  });
  const p0 = pt(a);
  const p1 = pt(b);
  const min = MIN_MARKUP_DRAG * 100;
  if (type === 'cloud') {
    if (Math.abs(p1.x - p0.x) < min || Math.abs(p1.y - p0.y) < min) return null;
    return { type, points: [{ x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y) }, { x: Math.max(p0.x, p1.x), y: Math.max(p0.y, p1.y) }] };
  }
  if (type === 'arrow') {
    if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < min) return null;
    return { type, points: [p0, p1] };
  }
  const t = cleanText(text);
  if (type === 'text' && !t) return null;
  return { type, points: [p1], ...(t ? { text: t } : {}) };
}

/**
 * Oblasť pripomienky (zlomky 0-1) okolo značiek s okrajom `pad` (zlomok strany),
 * aby rámik, snímka hosta a priblíženie z chatu ukázali všetky značky. Bez značiek null.
 */
export function markupBounds(shapes: readonly MarkupShape[], pad = 0.02): IssueRegion | null {
  const pts = shapes.flatMap((s) => s.points);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x / 100);
  const ys = pts.map((p) => p.y / 100);
  const x0 = Math.max(0, Math.min(...xs) - pad);
  const y0 = Math.max(0, Math.min(...ys) - pad);
  const x1 = Math.min(1, Math.max(...xs) + pad);
  const y1 = Math.min(1, Math.max(...ys) + pad);
  return { x: +x0.toFixed(4), y: +y0.toFixed(4), w: +(x1 - x0).toFixed(4), h: +(y1 - y0).toFixed(4) };
}

/** Obrys obláčika: oblúky po obvode obdĺžnika v smere hodinových ručičiek (vydutie von). */
export function cloudPath(x0: number, y0: number, x1: number, y1: number, scallop: number): string {
  const edges: Array<[number, number, number, number]> = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];
  const f = (v: number) => +v.toFixed(2);
  let d = `M${f(x0)} ${f(y0)}`;
  for (const [ax, ay, bx, by] of edges) {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / (2 * scallop)));
    const r = len / n / 2;
    for (let i = 1; i <= n; i++) {
      d += `A${f(r)} ${f(r)} 0 0 1 ${f(ax + ((bx - ax) * i) / n)} ${f(ay + ((by - ay) * i) / n)}`;
    }
  }
  return `${d}Z`;
}

/** Hrot šípky: trojuholník [hrot, ľavé krídlo, pravé krídlo] veľkosti `size`. */
export function arrowHead(
  tail: { x: number; y: number },
  head: { x: number; y: number },
  size: number,
): Array<{ x: number; y: number }> {
  const len = Math.hypot(head.x - tail.x, head.y - tail.y) || 1;
  const dx = (head.x - tail.x) / len;
  const dy = (head.y - tail.y) / len;
  const bx = head.x - dx * size;
  const by = head.y - dy * size;
  const half = size / 2;
  return [head, { x: bx - dy * half, y: by + dx * half }, { x: bx + dy * half, y: by - dx * half }];
}
