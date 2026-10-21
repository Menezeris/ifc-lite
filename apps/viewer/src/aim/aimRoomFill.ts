/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pôdorys miestnosti pre výplň v 2D (AIM D-119, #137). Spodná plocha IfcSpace
 * leží na hornej ploche podlahovej dosky a v hĺbke sa s ňou bije, takže farba
 * Lens je v pôdoryse len v pásoch. Vrstva `AimRoomFillLayer` ju preto kreslí
 * nad scénou z trojuholníkov spodnej plochy geometrie miestnosti. Čistá
 * matematika bez store; viewer je Y-up, takže "spodná" = najnižšie Y.
 * D-125 (#175): aj v 3D pri vodorovnom reze a pohľade zhora, len preťaté miestnosti.
 */

export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };

export interface Footprint {
  /** Trojuholníky spodnej plochy, po troch vrcholoch. */
  triangles: Vec3[];
  /** Ťažisko plochy (stred popisu). */
  anchor: Vec3;
  /** Najvyšší bod geometrie miestnosti (Y): rez nad ním miestnosť nepretína (D-125). */
  top: number;
}

/** Tolerancia výšky vrcholu spodnej plochy, m. */
const FLOOR_EPS = 0.02;

/**
 * Trojuholníky na najnižšej úrovni geometrie (všetky tri vrcholy do `eps` od
 * minima Y) a ich ťažisko vážené plochou; bez takých trojuholníkov `null`.
 */
export function spaceFootprint(
  parts: ReadonlyArray<{ positions: ArrayLike<number>; indices: ArrayLike<number>; origin?: readonly number[] }>,
  eps = FLOOR_EPS,
): Footprint | null {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of parts) {
    const oy = p.origin?.[1] ?? 0;
    for (let i = 1; i < p.positions.length; i += 3) {
      minY = Math.min(minY, p.positions[i] + oy);
      maxY = Math.max(maxY, p.positions[i] + oy);
    }
  }
  if (!Number.isFinite(minY)) return null;
  const triangles: Vec3[] = [];
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (const { positions: pos, indices: idx, origin } of parts) {
    // Lokálny rámec prvku: svet = origin + positions (MeshData.origin).
    const [ox, oy, oz] = [origin?.[0] ?? 0, origin?.[1] ?? 0, origin?.[2] ?? 0];
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const v = [idx[t], idx[t + 1], idx[t + 2]].map((i) => ({ x: pos[i * 3] + ox, y: pos[i * 3 + 1] + oy, z: pos[i * 3 + 2] + oz }));
      if (v.some((p) => p.y - minY > eps)) continue;
      const a = Math.abs((v[1].x - v[0].x) * (v[2].z - v[0].z) - (v[2].x - v[0].x) * (v[1].z - v[0].z)) / 2;
      if (a < 1e-9) continue;
      triangles.push(...v);
      area += a;
      cx += (a * (v[0].x + v[1].x + v[2].x)) / 3;
      cz += (a * (v[0].z + v[1].z + v[2].z)) / 3;
    }
  }
  if (area === 0) return null;
  return { triangles, anchor: { x: cx / area, y: minY, z: cz / area }, top: maxY };
}

/** Kamera hľadí zhora (pôdorys v 3D, D-125): smer pohľadu takmer kolmo nadol (viewer je Y-up). */
export function looksDown(position: Vec3, target: Vec3, minCos = 0.95): boolean {
  const d = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
  const len = Math.hypot(d.x, d.y, d.z);
  return len > 0 && -d.y / len >= minCos;
}

/** Pretína vodorovný rez vo výške `cutY` miestnosť (od podlahy po strop)? */
export function cutsRoom(footprint: Footprint, cutY: number): boolean {
  return footprint.anchor.y <= cutY && cutY <= footprint.top;
}

/**
 * SVG cesta z premietnutých trojuholníkov; jedna cesta s `fill-rule: nonzero`
 * nezdvojí priehľadnosť na spoločných hranách. Trojuholník s vrcholom mimo
 * obrazovky (za kamerou) vynechá.
 */
export function footprintPath(triangles: readonly Vec3[], project: (p: Vec3) => Vec2 | null): string {
  const out: string[] = [];
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    const a = project(triangles[i]);
    const b = project(triangles[i + 1]);
    const c = project(triangles[i + 2]);
    if (!a || !b || !c) continue;
    // Rovnaké otočenie všetkých trojuholníkov, inak by sa pri nonzero navzájom vyrušili.
    const cross = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    const [p, q] = cross < 0 ? [c, b] : [b, c];
    out.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${p.x.toFixed(1)} ${p.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}Z`);
  }
  return out.join('');
}

/**
 * Obrys pôdorysu: len hrany, ktoré patria jedinému trojuholníku (vnútorné
 * uhlopriečky triangulácie sa v obryse neukážu). Vrcholy sa párujú na mm.
 */
export function footprintOutline(triangles: readonly Vec3[], project: (p: Vec3) => Vec2 | null): string {
  const key = (p: Vec3) => `${Math.round(p.x * 1000)},${Math.round(p.z * 1000)}`;
  const edges = new Map<string, { a: Vec3; b: Vec3; n: number }>();
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    for (const [a, b] of [[triangles[i], triangles[i + 1]], [triangles[i + 1], triangles[i + 2]], [triangles[i + 2], triangles[i]]]) {
      const [ka, kb] = [key(a), key(b)];
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = edges.get(k);
      if (e) e.n++;
      else edges.set(k, { a, b, n: 1 });
    }
  }
  const out: string[] = [];
  for (const { a, b, n } of edges.values()) {
    if (n !== 1) continue;
    const pa = project(a);
    const pb = project(b);
    if (pa && pb) out.push(`M${pa.x.toFixed(1)} ${pa.y.toFixed(1)}L${pb.x.toFixed(1)} ${pb.y.toFixed(1)}`);
  }
  return out.join('');
}
