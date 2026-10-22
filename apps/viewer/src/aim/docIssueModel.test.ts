/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { BCFProject, BCFTopic } from '@ifc-lite/bcf';
import { readBCF, writeBCF } from '@ifc-lite/bcf';
import {
  describeLocalTopics,
  docIssueReference,
  docIssueUrl,
  issuesOnPage,
  mergeAimProject,
  newTopicGuid,
  parseDocIssueUrl,
  regionFromDrag,
} from './docIssueModel.js';

const DOC = '11111111-1111-4111-8111-111111111111';
const HOST = 'https://aim.example';

const topic = (guid: string, over: Partial<BCFTopic> = {}): BCFTopic => ({
  guid,
  title: guid,
  comments: [],
  viewpoints: [],
  ...over,
} as BCFTopic);

const project = (topics: BCFTopic[], projectId = 'aim'): BCFProject => ({
  version: '2.1',
  ...(projectId ? { projectId } : {}),
  topics: new Map(topics.map((t) => [t.guid, t])),
});

const onPage = (page: number, region = { x: 0.5, y: 0, w: 0.25, h: 0.5 }) => ({
  documentReferences: [docIssueReference(HOST, 'Pôdorys 1NP', { docId: DOC, page, region })],
});

describe('pripomienka na PDF (AIM D-158)', () => {
  it('ťah nad stranou -> oblasť v zlomkoch, orezaná do strany; malý ťah je klik', () => {
    const page = { left: 100, top: 50, width: 400, height: 200 };
    assert.deepEqual(regionFromDrag(page, { x: 500, y: 150 }, { x: 300, y: 50 }), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
    assert.deepEqual(regionFromDrag(page, { x: 0, y: 0 }, { x: 200, y: 100 }), { x: 0, y: 0, w: 0.25, h: 0.25 });
    assert.equal(regionFromDrag(page, { x: 200, y: 100 }, { x: 201, y: 101 }), null);
    assert.equal(regionFromDrag({ ...page, width: 0 }, { x: 0, y: 0 }, { x: 9, y: 9 }), null);
  });

  it('odkaz má tvar BCF API hosta a rozloží sa späť (aj bez oblasti, aj relatívny)', () => {
    const t = { docId: DOC, page: 2, region: { x: 0.5, y: 0, w: 0.255, h: 0.5 } };
    const url = docIssueUrl(HOST, t);
    assert.equal(url, `${HOST}/drawing/${DOC}?page=2&region=50_0_25.5_50#page=2`);
    assert.deepEqual(parseDocIssueUrl(url), t);
    assert.deepEqual(parseDocIssueUrl(docIssueUrl(null, { docId: DOC, page: 3, region: null })), { docId: DOC, page: 3, region: null });
    assert.equal(parseDocIssueUrl('https://cde.example/x.pdf#page=2'), null);
    assert.equal(parseDocIssueUrl(`${HOST}/drawing/nie-uuid?page=2`), null);
    assert.equal(parseDocIssueUrl(`${HOST}/drawing/${DOC}?page=0`), null);
    const ref = docIssueReference(HOST, 'Pôdorys 1NP', t);
    assert.equal(ref.referencedDocument, url);
    assert.equal(ref.description, 'Pôdorys 1NP, strana 2, oblasť x 50 %, y 0 %, 25,5 x 50 %');
  });

  it('rámiky strany: len odkazy na tento dokument a stranu; uložená téma má #N, lokálna N1...', () => {
    const p = project([
      topic('a', { index: 7, ...onPage(2) }),
      topic('b', onPage(2)),
      topic('c', onPage(1)),
      topic('d'),
    ]);
    assert.deepEqual(
      issuesOnPage(p, DOC, 2).map((i) => [i.guid, i.label, i.saved]),
      [['a', '#7', true], ['b', 'N1', false]],
    );
    assert.deepEqual(issuesOnPage(p, DOC.toUpperCase(), 1).map((i) => i.label), ['N2']);
    assert.deepEqual(issuesOnPage(null, DOC, 2), []);
  });

  it('nová téma panela: prvá, ktorá pred otvorením formulára nebola', () => {
    const p = project([topic('a'), topic('b')]);
    assert.equal(newTopicGuid(new Set(['a']), p), 'b');
    assert.equal(newTopicGuid(new Set(['a', 'b']), p), null);
    assert.equal(newTopicGuid(new Set(), null), null);
  });

  it('view_state vypíše len lokálne témy projektu AIM, bez snímky, s odkazom na PDF', () => {
    const p = project([
      topic('host', { index: 1 }),
      topic('mine', {
        ...onPage(2),
        topicType: 'Issue',
        creationAuthor: 'Samuel',
        comments: [{ guid: 'c', comment: 'pozri', author: 'Samuel', date: '2026-10-22T10:00:00Z' } as never],
        viewpoints: [{
          guid: 'vp',
          snapshot: 'data:image/png;base64,AAAA',
          perspectiveCamera: { cameraViewPoint: { x: 1, y: 2, z: 3 }, cameraDirection: { x: 0, y: 1, z: 0 }, cameraUpVector: { x: 0, y: 0, z: 1 }, fieldOfView: 60 },
          components: { selection: [{ ifcGuid: 'G1' }, { ifcGuid: 'G2' }] },
        } as never],
      }),
    ]);
    const d = describeLocalTopics(p, 'aim');
    assert.equal(d.count, 1);
    const [t] = d.topics;
    assert.equal(t.guid, 'mine');
    assert.equal(t.creation_author, 'Samuel');
    assert.deepEqual(t.comments, [{ author: 'Samuel', date: '2026-10-22T10:00:00Z', comment: 'pozri' }]);
    assert.deepEqual(t.viewpoint, {
      guid: 'vp',
      perspective_camera: { camera_view_point: { x: 1, y: 2, z: 3 }, camera_direction: { x: 0, y: 1, z: 0 }, camera_up_vector: { x: 0, y: 0, z: 1 }, field_of_view: 60 },
      components: { selection: [{ ifc_guid: 'G1' }, { ifc_guid: 'G2' }] },
    });
    assert.equal(t.document_references[0].url, `${HOST}/drawing/${DOC}?page=2&region=50_0_25_50#page=2`);
    assert.deepEqual(describeLocalTopics(p, null), { count: 0, topics: [] });
    assert.deepEqual(describeLocalTopics(project([topic('x')], 'other'), 'aim'), { count: 0, topics: [] });
  });

  it('obnova z hosta: témy hosta sa nahradia, lokálne ostanú, uložená lokálna nie je dvakrát; projekt používateľa sa nemení', () => {
    const previous = project([topic('h1', { index: 1 })]);
    const current = project([topic('h1', { index: 1, title: 'starý' }), topic('n1'), topic('n2')]);
    const fresh = project([topic('h1', { index: 1, title: 'nový' }), topic('n2', { index: 2 })]);
    const merged = mergeAimProject(current, fresh, previous)!;
    assert.deepEqual([...merged.topics.keys()], ['h1', 'n2', 'n1']);
    assert.equal(merged.topics.get('h1')!.title, 'nový');
    assert.equal(merged.topics.get('n2')!.index, 2);
    assert.equal(mergeAimProject(null, fresh, null), fresh);
    assert.equal(mergeAimProject(previous, fresh, previous), fresh);
    assert.equal(mergeAimProject(project([]), fresh, previous), fresh);
    assert.equal(mergeAimProject(project([topic('f')], ''), fresh, previous), null);
    assert.equal(mergeAimProject(project([topic('f')]), fresh, null), null);
  });

  it('export .bcfzip (2.1 aj 3.0) nesie DocumentReference a dá sa znova načítať', async () => {
    for (const version of ['2.1', '3.0'] as const) {
      const p: BCFProject = {
        version,
        projectId: 'aim',
        topics: new Map([['3f2504e0-4f89-41d3-9a0c-0305e82c3301', topic('3f2504e0-4f89-41d3-9a0c-0305e82c3301', {
          title: 'Chýba popis miestnosti',
          creationDate: '2026-10-22T10:00:00Z',
          creationAuthor: 'Samuel',
          topicType: 'Issue',
          topicStatus: 'Open',
          ...onPage(2),
        })]]),
      };
      const blob = await writeBCF(p);
      const back = await readBCF(blob);
      const [t] = [...back.topics.values()];
      const refs = t.documentReferences ?? [];
      assert.equal(refs.length, 1, version);
      assert.deepEqual(parseDocIssueUrl(refs[0].url ?? refs[0].referencedDocument), { docId: DOC, page: 2, region: { x: 0.5, y: 0, w: 0.25, h: 0.5 } }, version);
      assert.equal(refs[0].description, 'Pôdorys 1NP, strana 2, oblasť x 50 %, y 0 %, 25 x 50 %', version);
    }
  });
});
