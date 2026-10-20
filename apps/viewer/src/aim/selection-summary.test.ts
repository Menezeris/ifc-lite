/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  MAX_SELECTION_GUIDS, MAX_SELECTION_ITEMS, MAX_SUMMARY_GROUPS, MAX_VISIBILITY_GUIDS, summarizeSelection, visibilityGuids, type SelectedEntityInfo,
} from './selectionSummary.js';

const cw = (n: number) => ({ guid: `CW${n}`, ifc_type: 'IfcCurtainWall', name: `Plášť ${n}` });
function plate(i: number, storey: string, wall: number, type = 'IfcPlate', model = 'ASR.ifc'): SelectedEntityInfo {
  return { guid: `G${i}`, name: `Panel ${i}`, ifc_type: type, storey, model, parent: cw(wall) };
}

/** Obvodový plášť z issue #64: 1810 častí na 1NP až 4NP, vzorka z čela výberu je celá z 1NP. */
function curtainWallSelection(): SelectedEntityInfo[] {
  const out: SelectedEntityInfo[] = [];
  const storeys = [['1NP', 600], ['2NP', 500], ['3NP', 400], ['4NP', 310]] as const;
  let i = 0;
  for (const [storey, n] of storeys) {
    for (let k = 0; k < n; k++, i++) out.push(plate(i, storey, i % 55, i % 3 === 0 ? 'IfcMember' : 'IfcPlate'));
  }
  return out;
}

describe('súhrn výberu pre view_state (AIM D-093)', () => {
  it('súhrn pokrýva celý výber, aj keď zoznamy sú orezané', () => {
    const r = summarizeSelection(curtainWallSelection());
    assert.strictEqual(r.count, 1810);
    assert.strictEqual(r.summary.of, 1810);
    assert.deepStrictEqual(r.summary.by_storey, [
      { key: '1NP', count: 600 }, { key: '2NP', count: 500 }, { key: '3NP', count: 400 }, { key: '4NP', count: 310 },
    ]);
    assert.deepStrictEqual(r.summary.by_ifc_type.map((g) => g.key), ['IfcPlate', 'IfcMember']);
    assert.strictEqual(r.summary.by_ifc_type.reduce((s, g) => s + g.count, 0), 1810);
    assert.strictEqual(r.guids.length, MAX_SELECTION_GUIDS);
    assert.strictEqual(r.items.length, MAX_SELECTION_ITEMS);
    assert.strictEqual(r.truncated, true);
  });

  it('rodičovská zostava sa ráta podľa GUID a nesie triedu a názov', () => {
    const r = summarizeSelection(curtainWallSelection());
    assert.strictEqual(r.summary.by_parent.length, MAX_SUMMARY_GROUPS);
    assert.strictEqual(r.summary.by_parent.reduce((s, g) => s + g.count, 0), 1810);
    const first = r.summary.by_parent[0];
    assert.strictEqual(first.ifc_type, 'IfcCurtainWall');
    assert.match(first.key, /^IfcCurtainWall Plášť \d+$/);
    assert.ok(first.guid?.startsWith('CW'));
    assert.strictEqual(r.summary.by_parent.at(-1)?.key, '(ostatné)');
    // Dva rodičia s rovnakým názvom zostanú dve skupiny.
    const twins = summarizeSelection([
      { ...plate(1, '1NP', 0), parent: { guid: 'A', ifc_type: 'IfcCurtainWall', name: 'CW' } },
      { ...plate(2, '1NP', 0), parent: { guid: 'B', ifc_type: 'IfcCurtainWall', name: 'CW' } },
    ]);
    assert.deepStrictEqual(twins.summary.by_parent.map((g) => g.guid).sort(), ['A', 'B']);
  });

  it('položka nesie identitu; model len pri viacerých modeloch', () => {
    const one = summarizeSelection([plate(1, '2NP', 7)]);
    assert.deepStrictEqual(one.items, [{
      guid: 'G1', name: 'Panel 1', ifc_type: 'IfcPlate', storey: '2NP',
      parent_guid: 'CW7', parent_type: 'IfcCurtainWall', parent_name: 'Plášť 7',
    }]);
    assert.strictEqual(one.summary.by_model, undefined);
    assert.strictEqual(one.truncated, false);
    const two = summarizeSelection([plate(1, '1NP', 0), plate(2, '1NP', 0, 'IfcPlate', 'TZB.ifc')]);
    assert.strictEqual(two.items[1].model, 'TZB.ifc');
    assert.deepStrictEqual(two.summary.by_model, [{ key: 'ASR.ifc', count: 1 }, { key: 'TZB.ifc', count: 1 }]);
  });

  it('prvok bez GUID, podlažia a rodiča: v súhrne ako neznáme, nie v zoznamoch', () => {
    const r = summarizeSelection([
      { guid: null, name: null, ifc_type: 'IfcWall', storey: null, model: null, parent: null },
      plate(1, '1NP', 0),
    ]);
    assert.strictEqual(r.count, 2);
    assert.deepStrictEqual(r.guids, ['G1']);
    assert.strictEqual(r.truncated, true);
    assert.deepStrictEqual(r.summary.by_storey, [{ key: '(neznáme)', count: 1 }, { key: '1NP', count: 1 }].sort((a, b) => a.key.localeCompare(b.key)));
    assert.ok(r.summary.by_parent.some((g) => g.key === '(bez zostavy)' && g.count === 1));
  });
});

describe('skryté a izolované GUIDy pre view_state (AIM D-122)', () => {
  const guidOf = (id: number) => (id % 10 === 0 ? null : `G${id % 700}`);

  it('vráti GUIDy v poradí kanála, bez prvkov bez GUID a bez duplicít', () => {
    assert.deepStrictEqual(visibilityGuids([1, 10, 2, 701, 3], guidOf), ['G1', 'G2', 'G3']);
  });

  it('zoznam má strop mosta, aj keď je skrytých prvkov viac', () => {
    const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
    const r = visibilityGuids(ids, (id) => `G${id}`);
    assert.strictEqual(r.length, MAX_VISIBILITY_GUIDS);
    assert.strictEqual(r[0], 'G1');
    assert.strictEqual(visibilityGuids(ids, (id) => `G${id}`, 3).length, 3);
  });

  it('prázdny kanál = prázdny zoznam', () => {
    assert.deepStrictEqual(visibilityGuids(new Set<number>(), guidOf), []);
  });
});
