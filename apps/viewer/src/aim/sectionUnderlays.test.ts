/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { combineSections, mergeSectionUnderlays, sectionEntries, sectionSave } from './sectionUnderlays.js';
import { calibratedDrawings, describeUnderlays, planUnderlaySet, restoreUnderlays, snapshotUnderlays } from './underlaysPlan.js';
import { underlaysAtCut } from './underlayAtCut.js';

const K = (0.0254 / 72) * 100;
const SECTION = {
  page: 1, page_size: [1190, 842], affine: [K, 0, -2, 0, K, -1],
  plane: { origin: [0, 5, 0], u: [1, 0, 0], v: [0, 0, 1] }, opacity: 0.6, visible: true, source: 'auto', mark: 'A',
};
const PLAN_V1 = { version: 1, storey_guid: 'G-1NP', storey_z: 0, page: 1, page_size: [100, 100], affine: [1, 0, 0, 0, 1, 0], calibration: [], opacity: 0.7, visible: true, discipline: null, calibrated_at: null };
const plan = { id: 'plan-1np', name: 'Pôdorys 1NP', pdfUrl: 'p.pdf', placement: { version: 1 as const, storeyGuid: 'G-1NP', storeyZ: 0, page: 1, pageSize: [100, 100] as [number, number], affine: [1, 0, 0, 0, 1, 0] as [number, number, number, number, number, number], calibration: [], opacity: 0.7, visible: true, discipline: null, calibratedAt: null } };

describe('podklady rezov z georefV2 (AIMviewer #284, D-179)', () => {
  it('rez A: položka s plane = jeden zvislý podklad pod id dokumentu; v1 georef takého dokumentu sa ignoruje', () => {
    const sections = sectionEntries([{ documentId: 'rez-a', name: 'REZ-A', pdfUrl: 'a.pdf', georef: PLAN_V1, georefV2: { calibrations: [SECTION] } }]);
    assert.deepEqual(sections.map((s) => [s.id, s.index, s.placement.page]), [['rez-a', 0, 1]]);
    const merged = mergeSectionUnderlays([plan, { id: 'rez-a', name: 'REZ-A', pdfUrl: 'a.pdf', placement: null }], sections);
    assert.deepEqual(merged.map((d) => d.id), ['plan-1np', 'rez-a']);
    assert.ok(merged[1].placement && 'plane' in merged[1].placement);
  });

  it('bez plane nič (pôdorys ide z v1); georef s calibrations[] sa berie ako v2', () => {
    assert.equal(sectionEntries([{ documentId: 'p', name: 'P', pdfUrl: 'p.pdf', georefV2: { calibrations: [{ ...SECTION, plane: undefined }] } }]).length, 0);
    assert.equal(sectionEntries([{ documentId: 'r', name: 'R', pdfUrl: 'r.pdf', georef: { version: 2, calibrations: [SECTION] } }]).length, 1);
  });

  it('viac strán jedného dokumentu = záznam na kalibráciu (id#index), drôt nesie id dokumentu', () => {
    const sections = sectionEntries([{ documentId: 'rezy', name: 'Rezy', pdfUrl: 'r.pdf', georefV2: { calibrations: [SECTION, { ...SECTION, page: 2 }] } }]);
    assert.deepEqual(sections.map((s) => s.id), ['rezy#0', 'rezy#1']);
    const map = new Map(mergeSectionUnderlays([plan], sections).map((d) => [d.id, d]));
    const docOf = (id: string) => sections.find((s) => s.id === id)?.documentId ?? id;
    const list = calibratedDrawings(map as never, docOf);
    const described = describeUnderlays(list, {});
    assert.deepEqual(described.map((d) => [d.document_id, d.page, d.kind, d.storey_guid]), [
      ['plan-1np', 1, 'plan', 'G-1NP'], ['rezy', 1, 'section', null], ['rezy', 2, 'section', null],
    ]);
    // SET_UNDERLAYS_3D s document_id dokumentu zapne obe strany; only vypne pôdorys
    const { overrides, unknown } = planUnderlaySet(list, {}, [{ document_id: 'rezy', visible: false, opacity: 0.3 }], true);
    assert.deepEqual(unknown, []);
    assert.deepEqual(overrides, { 'rezy#0': { visible: false, opacity: 0.3 }, 'rezy#1': { visible: false, opacity: 0.3 }, 'plan-1np': { visible: false } });
    // Uložený pohľad: jedna položka na dokument, obnova sa rozbalí na obe strany
    const snap = snapshotUnderlays(list, overrides, true);
    assert.deepEqual(snap.items.map((i) => i.document_id), ['plan-1np', 'rezy']);
    assert.deepEqual(Object.keys(restoreUnderlays(snap, list).overrides).sort(), ['plan-1np', 'rezy#0', 'rezy#1']);
  });

  it('rez z UNDERLAYS_LOAD má prednosť pred tým istým z DOCUMENTS_LOAD', () => {
    const a = sectionEntries([{ documentId: 'rez-a', name: 'z podkladov', pdfUrl: 'a.pdf', georefV2: { calibrations: [SECTION] } }]);
    const b = sectionEntries([{ documentId: 'rez-a', name: 'z knižnice', pdfUrl: 'a.pdf', georefV2: { calibrations: [SECTION] } },
      { documentId: 'rez-b', name: 'REZ-B', pdfUrl: 'b.pdf', georefV2: { calibrations: [SECTION] } }]);
    assert.deepEqual(combineSections(a, b).map((s) => [s.id, s.name]), [['rez-a', 'z podkladov'], ['rez-b', 'REZ-B']]);
  });

  it('UNDERLAY_SAVE: zmena polohy = source manual, len opacity zdroj nechá; polia hosta ostanú', () => {
    const [e] = sectionEntries([{ documentId: 'rez-a', name: 'REZ-A', pdfUrl: 'a.pdf', georefV2: { calibrations: [SECTION] } }]);
    const op = sectionSave(e, { ...e.placement, opacity: 0.2 })!;
    assert.deepEqual([op.documentId, op.page, op.calibrationIndex, op.georef.source, op.georef.mark, op.georef.opacity], ['rez-a', 1, 0, 'auto', 'A', 0.2]);
    const moved = sectionSave(e, { ...e.placement, affine: [K, 0, -1.9, 0, K, -1] })!;
    assert.equal(moved.georef.source, 'manual');
    assert.equal(sectionSave(e, plan.placement), null);
  });

  it('vodorovný rez: rez sa nekreslí, pôdorys podlažia áno; bez rezu oba', () => {
    const sec = { placement: { storeyZ: 0, plane: {} } };
    const p1 = { placement: { storeyZ: 0 } };
    const p2 = { placement: { storeyZ: 3.2 } };
    assert.deepEqual(underlaysAtCut([sec, p1, p2], 1.2, false), [p1]);
    assert.deepEqual(underlaysAtCut([sec, p1, p2], null, false), [sec, p1, p2]);
  });
});
