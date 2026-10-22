/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { routePath, routeToRender } from './aimRoute.js';
import { MAX_ROUTE_POINTS, isViewMessage } from './view-protocol.js';

const S = 'aim-bridge';
const pt = (x: number, y = 2, z = 1.6) => ({ x, y, z });

describe('čiara trasy od hosta, ROUTE_SHOW (AIM D-137)', () => {
  it('body z IFC sveta (Z hore) do render rámca (Y hore, posunutý)', () => {
    const out = routeToRender([pt(101, 2, 1.6), pt(104, 5, 5.1)], { x: 100, y: 0, z: 0 });
    assert.deepEqual(out, [{ x: 1, y: 1.6, z: -2 }, { x: 4, y: 5.1, z: -5 }]);
  });

  it('SVG cesta: lomená čiara, bod za kamerou ju preruší, samotný bod nič nekreslí', () => {
    const screen = (p: { x: number }) => (p.x < 0 ? null : { x: p.x * 10, y: 5 });
    assert.equal(routePath([pt(0), pt(1), pt(2)], screen), 'M0.0 5.0 L10.0 5.0 L20.0 5.0');
    assert.equal(routePath([pt(0), pt(1), pt(-1), pt(3), pt(4)], screen), 'M0.0 5.0 L10.0 5.0 M30.0 5.0 L40.0 5.0');
    assert.equal(routePath([pt(0), pt(-1)], screen), '');
    assert.equal(routePath([], screen), '');
  });

  it('protokol: body ako vektory, prázdne = zmazať, farba #rrggbb, jeden bod ani priveľa nie', () => {
    assert.equal(isViewMessage({ source: S, type: 'ROUTE_SHOW', points: [pt(0), pt(1)], color: '#dc2626' }), true);
    assert.equal(isViewMessage({ source: S, type: 'ROUTE_SHOW', points: [pt(0), pt(1)] }), true);
    assert.equal(isViewMessage({ source: S, type: 'ROUTE_SHOW', points: [] }), true);
    for (const bad of [
      { source: S, type: 'ROUTE_SHOW', points: [pt(0)] },
      { source: S, type: 'ROUTE_SHOW', points: Array(MAX_ROUTE_POINTS + 1).fill(pt(0)) },
      { source: S, type: 'ROUTE_SHOW', points: [pt(0), { x: 1, y: 2 }] },
      { source: S, type: 'ROUTE_SHOW', points: [pt(0), pt(Number.NaN)] },
      { source: S, type: 'ROUTE_SHOW', points: [pt(0), pt(1)], color: 'red' },
      { source: S, type: 'ROUTE_SHOW', points: 'x' },
    ]) assert.equal(isViewMessage(bad), false, JSON.stringify(bad).slice(0, 80));
  });
});
