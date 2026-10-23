/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_LOCAL_XML, briefIdsLocal, buildIdsLocal, type IdsLocalInput } from './aimIdsLocal.js';

const base = (over: Partial<IdsLocalInput> = {}): IdsLocalInput => ({ slots: { studio: null, validation: null }, studio: null, validation: null, ...over });
const studio = (xml: string | null, docId = 'd1') => ({ docId, title: 'Miestnosti', specs: 2, xml });

describe('view_state.ids_local (D-162)', () => {
  it('nič otvorené = bez kľúča', () => {
    assert.equal(buildIdsLocal(base(), true), undefined);
  });

  it('Studio z AIM: kód, verzia a dirty podľa XML proti základu', () => {
    const slots = { studio: { code: 'DEMO_MIESTNOSTI', version: 3, docId: 'd1', baseline: '<a/>' }, validation: null };
    const clean = buildIdsLocal(base({ slots, studio: studio('<a/>') }), false)?.studio as Record<string, unknown>;
    assert.equal(clean.code, 'DEMO_MIESTNOSTI');
    assert.equal(clean.version, 3);
    assert.equal(clean.from_aim, true);
    assert.equal(clean.dirty, false);
    const edited = buildIdsLocal(base({ slots, studio: studio('<b/>') }), false)?.studio as Record<string, unknown>;
    assert.equal(edited.dirty, true);
  });

  it('Studio s iným dokumentom ako v prepojení nie je z AIM a je neuložené', () => {
    const slots = { studio: { code: 'A', version: 1, docId: 'd1', baseline: '<a/>' }, validation: null };
    const s = buildIdsLocal(base({ slots, studio: studio('<a/>', 'd2') }), false)?.studio as Record<string, unknown>;
    assert.equal(s.from_aim, false);
    assert.equal(s.dirty, true);
    assert.equal('code' in s, false);
  });

  it('XML sa pridá len na požiadanie a len do stropu; inak veľkosť a príznak', () => {
    const small = buildIdsLocal(base({ studio: studio('<a/>') }), true)?.studio as Record<string, unknown>;
    assert.equal(small.xml, '<a/>');
    assert.equal(small.bytes, 4);
    const brief = buildIdsLocal(base({ studio: studio('<a/>') }), false)?.studio as Record<string, unknown>;
    assert.equal('xml' in brief, false);
    const big = buildIdsLocal(base({ studio: studio('x'.repeat(MAX_LOCAL_XML + 1)) }), true)?.studio as Record<string, unknown>;
    assert.equal('xml' in big, false);
    assert.equal(big.xml_truncated, true);
  });

  it('panel validácie: výsledky po špecifikáciách s identifikátorom', () => {
    const out = buildIdsLocal(base({
      slots: { studio: null, validation: { code: 'DEMO_POZIARNA_ODOLNOST', version: 1, entryId: 'e1', baseline: '<v/>' } },
      validation: {
        title: 'Požiarna odolnosť', specs: 2, entryId: 'e1', xml: '<v/>',
        identifiers: new Map([['s1', 'PO-STENY']]),
        report: {
          model: 'ASR',
          summary: { totalSpecifications: 2, passedSpecifications: 1, failedSpecifications: 1, totalEntitiesChecked: 30, totalEntitiesPassed: 25, totalEntitiesFailed: 5 },
          specs: [
            { id: 's1', name: 'Steny', status: 'fail', applicableCount: 20, passedCount: 15, failedCount: 5 },
            { id: 's2', name: 'Dvere', status: 'pass', applicableCount: 10, passedCount: 10, failedCount: 0 },
          ],
        },
      },
    }), false)?.validation as Record<string, unknown>;
    assert.equal(out.from_aim, true);
    assert.equal(out.dirty, false);
    const results = out.results as { specs_failed: number; elements_failed: number; specs: Array<Record<string, unknown>> };
    assert.equal(results.specs_failed, 1);
    assert.equal(results.elements_failed, 5);
    assert.deepEqual(results.specs[0], { id: 's1', identifier: 'PO-STENY', name: 'Steny', status: 'fail', applicable: 20, passed: 15, failed: 5 });
    assert.equal('identifier' in results.specs[1], false);
  });

  it('briefIdsLocal vyhodí XML z oboch častí, zvyšok ostane', () => {
    const brief = briefIdsLocal({ studio: { title: 'A', xml: '<a/>', bytes: 4 }, validation: { title: 'B', xml: '<b/>' } });
    assert.deepEqual(brief, { studio: { title: 'A', bytes: 4 }, validation: { title: 'B' } });
  });
});
