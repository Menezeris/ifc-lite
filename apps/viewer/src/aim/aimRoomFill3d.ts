/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Výplň podstavy miestnosti v 3D perspektíve (AIM D-125 doplnok, #175). Spodná
 * plocha IfcSpace leží na doske, teda pod podlahovou krytinou (IfcCovering), a
 * farba Lens na objeme je v rendereri zmiešaná s pôvodnou farbou miestnosti.
 * Podstava sa preto kreslí ako výplň renderera (kanál výplní IfcAnnotation:
 * hĺbkový test, bez zápisu hĺbky) kúsok nad vrchom krytiny, vo farbe Lens ako v
 * pôdoryse. Čistá matematika bez store; viewer je Y-up.
 */

import type { Footprint } from './aimRoomFill.js';

/** Výplň v tvare `SymbolicFillInput` renderera (body [x, z] lokálne k `origin`). */
export interface RoomFill3d {
  points: Float32Array;
  holesOffsets: Uint32Array;
  worldY: number;
  origin: [number, number, number];
  color: [number, number, number, number];
  definesExtent: false;
}

/** Obálka prvku vo svete (krytina). */
export interface Box3 {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

/** Priehľadnosť výplne, rovnaká ako v pôdoryse (`AimRoomFillLayer`). */
export const FILL_ALPHA = 0.45;
/**
 * Výplň nad vrchom krytiny, m. Výplne renderera majú záporný depth bias, ktorý ich
 * v reverse-Z odtlačí od kamery: 3 mm nad krytinou výplň zmizla, 2 cm už nie (živo, #175).
 */
export const LIFT = 0.03;
/** Najvyššia krytina nad spodkom miestnosti, ktorá sa ráta za podlahovú, m. */
export const MAX_RISE = 0.25;
/** Krytina tesne pod spodkom miestnosti (zaokrúhlenie modelu), m. */
const BELOW = 0.05;
/** Najmenší prekryv obálok v pôdoryse, m² (susedná miestnosť sa len dotýka). */
const MIN_OVERLAP = 0.05;

/**
 * Výška výplne: najvyšší vrch krytiny, ktorá v pôdoryse prekrýva miestnosť a leží
 * pri jej spodku (nie podhľad), plus `LIFT`; bez takej krytiny spodok miestnosti.
 */
export function floorLevel(fp: Footprint, coverings: readonly Box3[]): number {
  const floor = fp.anchor.y;
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const p of fp.triangles) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  let top = floor;
  for (const c of coverings) {
    if (c.maxY < floor - BELOW || c.maxY > floor + MAX_RISE || c.minY > floor + MAX_RISE) continue;
    const ox = Math.min(maxX, c.maxX) - Math.max(minX, c.minX);
    const oz = Math.min(maxZ, c.maxZ) - Math.max(minZ, c.minZ);
    if (ox <= 0 || oz <= 0 || ox * oz < MIN_OVERLAP) continue;
    top = Math.max(top, c.maxY);
  }
  return top + LIFT;
}

/** `#rrggbb` -> RGBA 0..1 s danou alfou; zlý vstup `null`. */
export function hexRgba(hex: string, alpha: number): [number, number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

type P2 = { x: number; z: number };

/** Plocha slučky so znamienkom (x, z). */
function loopArea(loop: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

function inside(p: P2, loop: readonly P2[]): boolean {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [a, b] = [loop[i], loop[j]];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

/** Vrcholy ležiace vnútri úsečky a-b (T-spoj triangulácie), zoradené od a. */
function splitAt(a: P2, b: P2, verts: readonly P2[]): P2[] {
  const [dx, dz] = [b.x - a.x, b.z - a.z];
  const len2 = dx * dx + dz * dz;
  const on: { t: number; p: P2 }[] = [];
  for (const p of verts) {
    const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
    if (t <= 1e-6 || t >= 1 - 1e-6) continue;
    const cross = (p.x - a.x) * dz - (p.z - a.z) * dx;
    if (Math.abs(cross) / Math.sqrt(len2) < 5e-4) on.push({ t, p });
  }
  return [a, ...on.sort((u, v) => u.t - v.t).map((o) => o.p), b];
}

/**
 * Obrysy pôdorysu z trojuholníkov: hrany jediného trojuholníka spojené do slučiek
 * (vrcholy párované na mm, hrany rozdelené na T-spojoch). Najväčšia slučka je
 * obrys, slučky v ňom diery (stĺp, šachta), ostatné samostatné obrysy (miestnosť
 * z viac častí). Nedá sa uzavrieť = `null` (výplň potom po trojuholníkoch).
 */
export function footprintRings(triangles: Footprint['triangles']): { outer: P2[]; holes: P2[][] }[] | null {
  const key = (p: P2) => `${Math.round(p.x * 1000)},${Math.round(p.z * 1000)}`;
  const verts = new Map<string, P2>();
  for (const p of triangles) verts.set(key(p), p);
  const vertList = [...verts.values()];
  const count = new Map<string, number>();
  const edges: [P2, P2][] = [];
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    for (const [a0, b0] of [[triangles[i], triangles[i + 1]], [triangles[i + 1], triangles[i + 2]], [triangles[i + 2], triangles[i]]]) {
      if (key(a0) === key(b0)) continue;
      const chain = splitAt(a0, b0, vertList);
      for (let j = 0; j + 1 < chain.length; j++) {
        const [a, b] = [chain[j], chain[j + 1]];
        const [ka, kb] = [key(a), key(b)];
        if (ka === kb) continue;
        const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        count.set(k, (count.get(k) ?? 0) + 1);
        edges.push([a, b]);
      }
    }
  }
  const next = new Map<string, P2[]>();
  for (const [a, b] of edges) {
    const [ka, kb] = [key(a), key(b)];
    if (count.get(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`) !== 1) continue;
    const list = next.get(ka);
    if (list) list.push(b); else next.set(ka, [b]);
  }
  const loops: P2[][] = [];
  for (const [start, targets] of next) {
    while (targets.length > 0) {
      const loop: P2[] = [];
      let cur = targets.pop() as P2;
      for (let guard = 0; guard <= edges.length; guard++) {
        loop.push({ x: cur.x, z: cur.z });
        const k = key(cur);
        if (k === start) break;
        const out = next.get(k);
        if (!out || out.length === 0) break;
        cur = out.pop() as P2;
      }
      if (loop.length < 3 || key(loop[loop.length - 1]) !== start) return null;
      loops.push(loop);
    }
  }
  loops.sort((a, b) => Math.abs(loopArea(b)) - Math.abs(loopArea(a)));
  const polys: { outer: P2[]; holes: P2[][] }[] = [];
  for (const loop of loops) {
    const owner = polys.find((p) => inside(loop[0], p.outer) && !p.holes.some((h) => inside(loop[0], h)));
    if (owner) owner.holes.push(loop);
    else polys.push({ outer: loop, holes: [] });
  }
  return polys;
}

/**
 * Výplne podstavy: jeden polygón (obrys s dierami) na súvislú časť miestnosti;
 * renderer robí z každej výplne s `origin` samostatný buffer, preto nie po
 * trojuholníkoch (tie len ako záloha, keď sa obrys nedá uzavrieť). Body sú lokálne
 * k ťažisku, aby veľké súradnice nestratili presnosť vo float32.
 */
export function roomFills(fp: Footprint, worldY: number, hex: string, alpha = FILL_ALPHA): RoomFill3d[] {
  const color = hexRgba(hex, alpha);
  if (!color) return [];
  const origin: [number, number, number] = [fp.anchor.x, worldY, fp.anchor.z];
  const tris = fp.triangles;
  const polys = footprintRings(tris) ?? Array.from({ length: Math.floor(tris.length / 3) }, (_, i) => ({ outer: tris.slice(i * 3, i * 3 + 3), holes: [] }));
  return polys.map(({ outer, holes }) => {
    const rings = [outer, ...holes];
    const points = new Float32Array(rings.reduce((n, r) => n + r.length * 2, 0));
    const holesOffsets = new Uint32Array(holes.length);
    let v = 0;
    rings.forEach((ring, r) => {
      if (r > 0) holesOffsets[r - 1] = v;
      for (const p of ring) {
        points[v * 2] = p.x - origin[0];
        points[v * 2 + 1] = p.z - origin[2];
        v++;
      }
    });
    return { points, holesOffsets, worldY: 0, origin, color, definesExtent: false as const };
  });
}

/** Pri vodorovnom reze (`cutY`) len miestnosti s podstavou pod rezom; bez rezu všetky. */
export function fillsRoom(level: number, cutY: number | null): boolean {
  return cutY === null || level <= cutY;
}
