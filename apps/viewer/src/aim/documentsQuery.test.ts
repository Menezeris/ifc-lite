/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { foldText, GROUP_BY_FOLDER, groupDocuments, matchesFilter, metaKeys, selectionDocuments, show3dTarget, type QueryDocument } from './documentsQuery';

const plan3: QueryDocument = {
  id: 'd3', name: 'D.1.1.03 Pôdorys 3NP', folder: ['D.1.1 ASR'],
  meta: { 'Časť': 'D.1.1 ASR', Druh: 'DR Výkres', 'Podlažie': '3NP' },
};
const roof: QueryDocument = {
  id: 'd4', name: 'D.1.1.04 Pôdorys strechy', folder: ['D.1.1 ASR'],
  meta: { 'Časť': 'D.1.1 ASR', Druh: 'DR Výkres', 'Podlažie': '4NP; 5NP' },
};
const pbr: QueryDocument = {
  id: 'p1', name: 'Technická správa PBR', folder: ['D.1.3 PBR'],
  meta: { 'Časť': 'D.1.3 PBR', Druh: 'RP Správa' },
};
const local: QueryDocument = { id: 'local:x.pdf:1', name: 'x.pdf' };
const docs = [roof, pbr, plan3, local];

describe('documentsQuery (D-104)', () => {
  it('folds case and diacritics', () => {
    assert.equal(foldText('Pôdorys ŠTRECHY'), 'podorys strechy');
  });

  it('lists the meta keys the host sent, without a field list in the viewer', () => {
    assert.deepEqual(metaKeys(docs), ['Časť', 'Druh', 'Podlažie']);
  });

  it('searches every word in name, folder and metadata', () => {
    assert.ok(matchesFilter(plan3, 'podorys 3np'));
    assert.ok(matchesFilter(pbr, 'sprava pbr'));
    assert.ok(matchesFilter(roof, 'vykres 5np'));
    assert.ok(!matchesFilter(plan3, 'podorys 5np'));
    assert.ok(matchesFilter(local, '  '));
  });

  it('groups by folder with the catch-all bucket last', () => {
    const groups = groupDocuments(docs);
    assert.deepEqual(groups.map(([label, list]) => [label, list.map((d) => d.id)]), [
      ['D.1.1 ASR', ['d3', 'd4']],
      ['D.1.3 PBR', ['p1']],
      ['', ['local:x.pdf:1']],
    ]);
  });

  it('groups by a meta key; several values put the document in each group', () => {
    const groups = groupDocuments(docs, { groupBy: 'Podlažie' });
    assert.deepEqual(groups.map(([label, list]) => [label, list.map((d) => d.id)]), [
      ['3NP', ['d3']],
      ['4NP', ['d4']],
      ['5NP', ['d4']],
      ['', ['p1', 'local:x.pdf:1']],
    ]);
    assert.deepEqual(groupDocuments(docs, { groupBy: 'Druh', filter: 'asr' }).map(([l]) => l), ['DR Výkres']);
    assert.equal(GROUP_BY_FOLDER, '');
  });

  it('joins the AIM card documents with the library and keeps page and path', () => {
    const library = new Map(docs.map((d) => [d.id, d]));
    const items = selectionDocuments(
      [
        { name: 'D.1.1.03 Pôdorys 3NP', href: '/drawing/d3', documentId: 'd3', via: 'priamo' },
        { name: 'Výpis skladieb', href: '/drawing/v9?page=3', documentId: 'v9', page: 3, via: 'cez skupinu S1' },
        { name: 'Starý odkaz', href: '/drawing/old' },
      ],
      library,
    );
    assert.deepEqual(items.map((i) => [i.name, i.doc?.id ?? null, i.page ?? null, i.via ?? null]), [
      ['D.1.1.03 Pôdorys 3NP', 'd3', null, 'priamo'],
      ['Výpis skladieb', null, 3, 'cez skupinu S1'],
      ['Starý odkaz', null, null, null],
    ]);
    // The library entry's metadata is searchable, and so is the path.
    assert.deepEqual(selectionDocuments([{ name: 'x', href: '/x', documentId: 'd3' }], library, 'vykres').length, 1);
    assert.deepEqual(selectionDocuments([{ name: 'x', href: '/x', via: 'cez zónu NJ - 3NP' }], library, 'zonu').length, 1);
    assert.deepEqual(selectionDocuments(undefined, library), []);
  });

  it('marks documents inherited through a relation as the AIM layer (AIM D-129)', () => {
    const items = selectionDocuments(
      [
        { name: 'Typový list', href: '/drawing/t1', via: 'cez typ D1' },
        { name: 'Požiarna správa', href: '/drawing/z1', via: 'cez zónu N1.01', aim: true },
      ],
      new Map(),
    );
    assert.deepEqual(items.map((i) => i.aim ?? false), [false, true]);
  });

  it('asks the host for elements of the page being read, only for host documents', () => {
    assert.deepEqual(show3dTarget('d9', 3), { documentId: 'd9', page: 3 });
    assert.deepEqual(show3dTarget('d9', 0), { documentId: 'd9' });
    assert.deepEqual(show3dTarget('d9', 2.5), { documentId: 'd9' });
    assert.deepEqual(show3dTarget('d9', undefined), { documentId: 'd9' });
    assert.equal(show3dTarget('local:x.pdf:1', 1), null);
    assert.equal(show3dTarget('', 1), null);
  });
});
