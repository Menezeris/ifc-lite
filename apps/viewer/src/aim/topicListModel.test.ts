/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { BCFTopic } from '@ifc-lite/bcf';
import { EMPTY_TOPIC_FILTER, documentOptions, filterTopics, topicOpenAction } from './topicListModel.js';

const DOC = '11111111-2222-3333-4444-555555555555';
const DOC2 = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const cam = { cameraViewPoint: { x: 0, y: 0, z: 0 }, cameraDirection: { x: 0, y: 1, z: 0 }, cameraUpVector: { x: 0, y: 0, z: 1 } };

const topic = (guid: string, o: { cam?: boolean; guids?: string[]; doc?: string } = {}): BCFTopic => ({
  guid,
  title: guid,
  comments: [],
  viewpoints: o.cam || o.guids
    ? [{ guid: `${guid}-vp`, ...(o.cam ? { perspectiveCamera: { ...cam, fieldOfView: 60 } } : {}), ...(o.guids ? { components: { selection: o.guids.map((ifcGuid) => ({ ifcGuid })) } } : {}) }]
    : [],
  ...(o.doc ? { documentReferences: [{ url: `/drawing/${o.doc}?page=2&region=10_10_20_20`, referencedDocument: '', isExternal: true }] } : {}),
}) as unknown as BCFTopic;

const topics = [
  topic('a', { cam: true, guids: ['2Abc'] }),
  topic('b', { doc: DOC }),
  topic('c', { cam: true, doc: DOC2, guids: ['3Xyz'] }),
  topic('d'),
];
const ids = (f: Partial<typeof EMPTY_TOPIC_FILTER>) => filterTopics(topics, { ...EMPTY_TOPIC_FILTER, ...f }).map((t) => t.guid);

test('context filter matches bcf_topic_list context', () => {
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ context: '3d' }), ['a', 'c']);
  assert.deepEqual(ids({ context: 'pdf' }), ['b', 'c']);
  assert.deepEqual(ids({ context: 'both' }), ['c']);
  assert.deepEqual(ids({ context: 'none' }), ['d']);
});

test('document, entity and project filters', () => {
  assert.deepEqual(ids({ document: DOC }), ['b']);
  assert.deepEqual(ids({ entity: '3x' }), ['c']);
  assert.deepEqual(ids({ projectOnly: true }), ['b', 'd']);
  assert.deepEqual(ids({ context: 'pdf', projectOnly: true }), ['b']);
});

test('documentOptions counts topics per document', () => {
  assert.deepEqual(documentOptions(topics), [{ docId: DOC, count: 1 }, { docId: DOC2, count: 1 }]);
});

test('click opens 3D viewpoint first, then document page with region', () => {
  assert.deepEqual(topicOpenAction(topics[0]), { kind: '3d', viewpointGuid: 'a-vp' });
  assert.deepEqual(topicOpenAction(topics[2]), { kind: '3d', viewpointGuid: 'c-vp' });
  const pdf = topicOpenAction(topics[1]);
  assert.equal(pdf?.kind, 'pdf');
  if (pdf?.kind === 'pdf') {
    assert.equal(pdf.target.page, 2);
    assert.deepEqual(pdf.target.region, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  }
  assert.equal(topicOpenAction(topics[3]), null);
});
