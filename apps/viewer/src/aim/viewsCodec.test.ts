/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BasketView } from '@/store/slices/pinboardSlice';
import type { SectionPlane } from '@/store/types';
import { decodeView, encodeView, fingerprint, type CodecEnv } from './viewsCodec.js';
import { MAX_BASKET_GUIDS } from './views-protocol.js';

// Obálka modelu v render rámci (Y hore): výška 0 až 10 m; rámec je posunutý o 2 m (IFC Z = render Y + 2).
const BOUNDS = { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 10, z: 20 } };
const KEYS = new Map([['m:1', 'G1'], ['m:2', 'G2'], ['m:3', 'G3'], ['m:4', 'G4']]);

const plane = (over: Partial<SectionPlane> = {}): SectionPlane => ({
  id: 'p', name: 'A', showGizmo: true, axis: 'down', position: 50, enabled: true, flipped: false, showCap: true, showOutlines: true,
  capStyle: {} as SectionPlane['capStyle'], ...over,
});

function env(over: Partial<CodecEnv> = {}): CodecEnv {
  return {
    offset: { x: 0, y: 0, z: 0 },
    bounds: BOUNDS,
    guidOfKey: (k) => KEYS.get(k),
    keyOfGuid: (g) => [...KEYS].find(([, v]) => v === g)?.[0],
    visibleKeys: () => new Set(['m:1', 'm:2', 'm:3']),
    hiddenGuids: () => ['G4'],
    makePlane: (name) => plane({ name, position: 0, enabled: false }),
    ...over,
  };
}

const view = (over: Partial<BasketView> = {}): BasketView => ({
  id: 'v1', name: 'Pôdorys 1NP', entityRefs: ['m:1', 'm:2'], thumbnailDataUrl: 'data:x', transitionMs: 500,
  viewpoint: { position: { x: 1, y: 9, z: 3 }, target: { x: 1, y: 0, z: 3 }, up: { x: 0, y: 0, z: -1 }, fov: 0.8, projectionMode: 'orthographic', orthoSize: 12 },
  section: { plane: plane(), planes: [plane()], activeIndex: 0, drawing2D: null, show3DOverlay: false, showHiddenLines: false },
  source: 'manual', createdAt: 1, updatedAt: 2, ...over,
});

describe('pohľad Presentation <-> drôt (AIM D-161)', () => {
  it('kamera ide do IFC sveta (Z hore, posun rámca) a späť na to isté miesto', () => {
    const e = env({ offset: { x: 100, y: 200, z: 2 } });
    const w = encodeView(view(), 0, e);
    assert.equal(w.camera?.projection, 'orthographic');
    assert.equal(w.camera?.ortho_size, 12);
    // render (x, y, z) = (1, 9, 3) -> IFC (x + 100, -z + 200, y + 2): výška je v IFC Z.
    assert.equal(w.camera?.position[2], 11);
    const back = decodeView(w, e).view.viewpoint!;
    assert.deepEqual([back.position.x, back.position.y, back.position.z].map((n) => Math.round(n * 1000) / 1000), [1, 9, 3]);
    assert.deepEqual([back.up.x, back.up.y, back.up.z].map((n) => Math.abs(n) < 1e-9 ? 0 : n), [0, 0, -1]);
    assert.equal(back.fov, 0.8);
  });

  it('rez: súradnica v IFC (m) prežije posun rámca inej revízie modelu', () => {
    const e1 = env({ offset: { x: 0, y: 0, z: 2 } });
    const w = encodeView(view({ section: { plane: plane({ position: 50 }), planes: [plane({ position: 50 })], activeIndex: 0, drawing2D: null, show3DOverlay: false, showHiddenLines: false } }), 0, e1);
    assert.equal(w.section?.planes[0].axis, 'y');
    assert.equal(w.section?.planes[0].coordinate, 7); // 50 % z 10 m = render 5 + posun 2
    // Nová revízia: iný posun rámca (render Y = IFC Z - 3), rovnaká obálka: rez ostane na IFC Z = 7.
    const e2 = env({ offset: { x: 0, y: 0, z: 3 } });
    const section = decodeView(w, e2).view.section!;
    assert.equal(section.plane.position, 40);
    assert.equal(section.plane.enabled, true);
    assert.equal(section.plane.axis, 'down');
    assert.equal(section.activeIndex, 0);
  });

  it('bez obálky (geometria ešte neprišla) sa rez vráti podľa percent', () => {
    const w = encodeView(view(), 0, env({ bounds: null }));
    assert.equal(w.section?.planes[0].coordinate, undefined);
    assert.equal(decodeView(w, env({ bounds: null })).view.section!.plane.position, 50);
  });

  it('viac rovín: poradie, aktívna a štýl sa zachovajú', () => {
    const planes = [plane({ name: 'A', position: 20 }), plane({ name: 'B', axis: 'front', position: 30, flipped: true, showGizmo: false })];
    const w = encodeView(view({ section: { plane: planes[1], planes, activeIndex: 1, drawing2D: null, show3DOverlay: false, showHiddenLines: false } }), 0, env());
    assert.deepEqual(w.section?.planes.map((p) => [p.name, p.axis]), [['A', 'y'], ['B', 'z']]);
    assert.equal(w.section?.active, 1);
    const back = decodeView(w, env()).view.section!;
    assert.deepEqual(back.planes!.map((p) => [p.name, p.axis, p.flipped, p.showGizmo]), [['A', 'down', false, true], ['B', 'front', true, false]]);
    assert.equal(back.plane.name, 'B');
  });

  it('rezný box: obálka v IFC a späť, bez súradnice roviny', () => {
    const box = { min: [1, 2, 3] as [number, number, number], max: [4, 5, 6] as [number, number, number] };
    const w = encodeView(view({ section: { plane: plane({ box }), planes: [plane({ box })], activeIndex: 0, drawing2D: null, show3DOverlay: false, showHiddenLines: false } }), 0, env());
    assert.equal(w.section?.planes[0].coordinate, undefined);
    assert.ok(w.section?.planes[0].box);
    assert.deepEqual(decodeView(w, env()).view.section!.plane.box, box);
  });

  it('košík: výsledok "=" (všetko viditeľné) sa uloží bez zoznamu, ostatné ako GUID', () => {
    const all = view({ source: 'visible', entityRefs: ['m:1', 'm:2', 'm:3'] });
    assert.deepEqual(encodeView(all, 0, env()).basket, { scope: 'all', hidden_guids: ['G4'] });
    // Zdroj "visible", ale používateľ košík upravil: zoznam.
    assert.deepEqual(encodeView(view({ source: 'visible', entityRefs: ['m:1', 'm:3'] }), 0, env()).basket, { scope: 'guids', guids: ['G1', 'G3'] });
    assert.deepEqual(encodeView(view({ source: 'selection', entityRefs: ['m:1', 'm:2', 'm:3'] }), 0, env()).basket, { scope: 'guids', guids: ['G1', 'G2', 'G3'] });
  });

  it('košík "all" sa pri načítaní zloží z viditeľných prvkov bez skrytých; zmiznuté GUID sa spočítajú', () => {
    const w = encodeView(view({ source: 'visible', entityRefs: ['m:1', 'm:2', 'm:3'] }), 0, env());
    assert.deepEqual(decodeView(w, env({ visibleKeys: () => new Set(['m:1', 'm:3', 'm:9']) })).view.entityRefs, ['m:1', 'm:3', 'm:9']);
    const g = encodeView(view({ entityRefs: ['m:1', 'm:2'] }), 0, env());
    const gone = decodeView(g, env({ keyOfGuid: (x) => (x === 'G1' ? 'm:1' : undefined) }));
    assert.deepEqual(gone.view.entityRefs, ['m:1']);
    assert.equal(gone.missing, 1);
  });

  it('veľký košík sa orezá na strop a povie to', () => {
    const many = Array.from({ length: MAX_BASKET_GUIDS + 5 }, (_, i) => `m:${i + 10}`);
    const w = encodeView(view({ entityRefs: many }), 0, env({ guidOfKey: (k) => `G${k}` }));
    assert.equal(w.basket.scope, 'guids');
    assert.equal((w.basket as { guids: string[] }).guids.length, MAX_BASKET_GUIDS);
    assert.equal((w.basket as { truncated?: boolean }).truncated, true);
    assert.equal(w.objects, MAX_BASKET_GUIDS + 5);
  });

  it('náhľad sa nenosí; po načítaní ostane lokálny z predošlého pohľadu', () => {
    const v = view();
    const w = encodeView(v, 3, env());
    assert.equal(JSON.stringify(w).includes('data:x'), false);
    assert.equal(w.order, 3);
    assert.equal(decodeView(w, env(), v).view.thumbnailDataUrl, 'data:x');
    assert.equal(decodeView(w, env()).view.thumbnailDataUrl, null);
  });

  it('odtlačok: nemení ho meno ani poradie, mení ho kamera, rez a košík', () => {
    const e = env();
    const base = fingerprint(view(), e);
    assert.equal(fingerprint(view({ name: 'Iné meno' }), e), base);
    assert.notEqual(fingerprint(view({ transitionMs: null }), e), base);
    assert.notEqual(fingerprint(view({ entityRefs: ['m:1'] }), e), base);
    assert.notEqual(fingerprint(view({ section: null }), e), base);
    assert.notEqual(fingerprint(view({ viewpoint: null }), e), base);
  });

  it('stav podkladov PDF ide s pohľadom (AIM #325) a mení odtlačok; bez neho pole chýba', () => {
    const underlays = { show: true, items: [{ document_id: 'd2', visible: true, opacity: 0.6 }] };
    const withU = env({ underlaysOf: (id) => (id === 'v1' ? underlays : undefined) });
    assert.deepEqual(encodeView(view(), 0, withU).underlays, underlays);
    assert.equal('underlays' in encodeView(view(), 0, env()), false);
    assert.notEqual(fingerprint(view(), withU), fingerprint(view(), env()));
  });
});
