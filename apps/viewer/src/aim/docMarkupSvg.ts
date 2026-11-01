/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Značky pripomienky (AIM #199) ako SVG nad stranou PDF. Súradnice sú v `viewBox`
 * so šírkou 1000 a výškou podľa pomeru strany, takže oblúky obláčika a hrot šípky
 * ostanú pri zoome karty neskreslené (strana sa zväčšuje rovnomerne).
 */

import { arrowHead, cloudPath, type MarkupShape } from './docMarkup.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1000;
/** A4 na výšku, kým strana nemá rozmer. */
const DEFAULT_ASPECT = 297 / 210;

export const MARKUP_COLOR = '#dc2626';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Pomer výška / šírka strany z jej elementu. */
export function pageAspect(pageEl: HTMLElement): number {
  const r = pageEl.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r.height / r.width : DEFAULT_ASPECT;
}

function label(x: number, y: number, text: string, size: number): SVGTextElement {
  const t = el('text', {
    x, y, fill: MARKUP_COLOR, stroke: '#fff', 'stroke-width': size / 5, 'paint-order': 'stroke',
    'font-size': size, 'font-family': 'system-ui, sans-serif', 'font-weight': 600,
  });
  t.textContent = text;
  return t;
}

/** SVG vrstva so značkami cez celú stranu (rodič = element strany, `position: relative`). */
export function markupSvg(shapes: readonly MarkupShape[], aspect: number, dashed = false): SVGSVGElement {
  const H = W * aspect;
  const svg = el('svg', { viewBox: `0 0 ${W} ${+H.toFixed(2)}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' });
  const px = (p: { x: number; y: number }) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H });
  const stroke = { stroke: MARKUP_COLOR, 'stroke-width': 3, fill: 'none', 'stroke-linejoin': 'round', ...(dashed ? { 'stroke-dasharray': '10 6' } : {}) };
  for (const s of shapes) {
    if (s.type === 'cloud') {
      const [a, b] = s.points.map(px);
      const scallop = Math.max(6, Math.min(18, Math.min(b.x - a.x, b.y - a.y) / 4));
      svg.appendChild(el('path', { d: cloudPath(a.x, a.y, b.x, b.y, scallop), ...stroke }));
    } else if (s.type === 'arrow') {
      const [a, b] = s.points.map(px);
      const head = arrowHead(a, b, 22);
      const base = { x: (head[1].x + head[2].x) / 2, y: (head[1].y + head[2].y) / 2 };
      svg.appendChild(el('line', { x1: a.x, y1: a.y, x2: base.x, y2: base.y, ...stroke }));
      svg.appendChild(el('polygon', { points: head.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '), fill: MARKUP_COLOR }));
    } else if (s.type === 'text') {
      const p = px(s.points[0]);
      svg.appendChild(label(p.x, p.y, s.text ?? '', 22));
    } else {
      const p = px(s.points[0]);
      // Špendlík: kvapka s hrotom presne v bode.
      svg.appendChild(el('path', {
        d: `M${p.x} ${p.y}c-4-10-12-16-12-24a12 12 0 1 1 24 0c0 8-8 14-12 24z`,
        fill: MARKUP_COLOR, stroke: '#fff', 'stroke-width': 2,
      }));
      svg.appendChild(el('circle', { cx: p.x, cy: p.y - 24, r: 4, fill: '#fff' }));
      if (s.text) svg.appendChild(label(p.x + 16, p.y - 28, s.text, 18));
    }
  }
  return svg;
}
