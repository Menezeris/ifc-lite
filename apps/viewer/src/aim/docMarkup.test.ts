/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { BCFProject, BCFTopic } from '@ifc-lite/bcf';
import { SOURCE } from './bridge-protocol.js';
import type { BcfLoadMessage } from './bcf-protocol.js';
import { loadAimBcfTopics } from './aimBcf.js';
import { describeLocalTopics, docIssueReference, docSnapshotUrl, issuesOnPage, topicDocTargets } from './docIssueModel.js';
import {
  MAX_MARKUP,
  MAX_MARKUP_TEXT,
  arrowHead,
  cloudPath,
  markupBounds,
  markupFromDrag,
  normalizeMarkup,
  type MarkupShape,
} from './docMarkup.js';

const DOC = '11111111-1111-4111-8111-111111111111';
const HOST = 'https://aim.example';
const PAGE = { left: 100, top: 50, width: 200, height: 400 };

const topic = (guid: string, over: Partial<BCFTopic> = {}): BCFTopic => ({ guid, title: guid, comments: [], viewpoints: [], ...over } as BCFTopic);
const project = (topics: BCFTopic[]): BCFProject => ({ version: '2.1', projectId: 'aim', topics: new Map(topics.map((t) => [t.guid, t])) });

const SHAPES: MarkupShape[] = [
  { type: 'cloud', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] },
  { type: 'arrow', points: [{ x: 50, y: 50 }, { x: 60, y: 45 }] },
  { type: 'text', points: [{ x: 12, y: 18 }], text: 'chýba prestup' },
  { type: 'pin', points: [{ x: 70, y: 80 }] },
];

describe('značky na PDF (AIM #199)', () => {
  it('normalizácia z drôtu: zlý typ, počet bodov, nečíslo a text bez textu vypadnú; body sa orežú na 0-100', () => {
    assert.deepEqual(normalizeMarkup(SHAPES), SHAPES);
    assert.deepEqual(normalizeMarkup(null), []);
    assert.deepEqual(normalizeMarkup('x'), []);
    assert.deepEqual(normalizeMarkup([
      { type: 'circle', points: [{ x: 1, y: 1 }] },
      { type: 'arrow', points: [{ x: 1, y: 1 }] },
      { type: 'pin', points: [{ x: 'a', y: 1 }] },
      { type: 'pin', points: [{ x: Number.NaN, y: 1 }] },
      { type: 'text', points: [{ x: 1, y: 1 }], text: '   ' },
      { type: 'pin', points: [{ x: -5, y: 120.456 }], text: '  A \n B ' },
      { type: 'cloud', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], text: 'obláčik text nenesie' },
    ]), [
      { type: 'pin', points: [{ x: 0, y: 100 }], text: 'A B' },
      { type: 'cloud', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
    ]);
    const many = Array.from({ length: MAX_MARKUP + 5 }, () => SHAPES[3]);
    assert.equal(normalizeMarkup(many).length, MAX_MARKUP);
    const long = normalizeMarkup([{ type: 'text', points: [{ x: 1, y: 1 }], text: 'x'.repeat(500) }]);
    assert.equal(long[0].text!.length, MAX_MARKUP_TEXT);
  });

  it('ťah -> značka v % strany: obláčik zoradí rohy, šípka drží smer, malý ťah nič; text a pin na bode pustenia', () => {
    assert.deepEqual(markupFromDrag('cloud', PAGE, { x: 200, y: 250 }, { x: 120, y: 90 }), {
      type: 'cloud', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }],
    });
    assert.deepEqual(markupFromDrag('arrow', PAGE, { x: 200, y: 250 }, { x: 120, y: 90 }), {
      type: 'arrow', points: [{ x: 50, y: 50 }, { x: 10, y: 10 }],
    });
    assert.equal(markupFromDrag('cloud', PAGE, { x: 200, y: 250 }, { x: 200.5, y: 300 }), null);
    assert.equal(markupFromDrag('arrow', PAGE, { x: 200, y: 250 }, { x: 200.5, y: 250.5 }), null);
    assert.deepEqual(markupFromDrag('pin', PAGE, { x: 0, y: 0 }, { x: 400, y: 250 }), { type: 'pin', points: [{ x: 100, y: 50 }] });
    assert.deepEqual(markupFromDrag('text', PAGE, { x: 0, y: 0 }, { x: 150, y: 150 }, ' D12 '), { type: 'text', points: [{ x: 25, y: 25 }], text: 'D12' });
    assert.equal(markupFromDrag('text', PAGE, { x: 0, y: 0 }, { x: 150, y: 150 }, ''), null);
    assert.equal(markupFromDrag('pin', { ...PAGE, width: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), null);
  });

  it('oblasť pripomienky obalí všetky značky s okrajom a ostane na strane; bez značiek null', () => {
    assert.deepEqual(markupBounds(SHAPES), { x: 0.08, y: 0.16, w: 0.64, h: 0.66 });
    assert.deepEqual(markupBounds([{ type: 'pin', points: [{ x: 0, y: 100 }] }]), { x: 0, y: 0.98, w: 0.02, h: 0.02 });
    assert.equal(markupBounds([]), null);
  });

  it('obláčik: oblúky po celom obvode v smere hodinových ručičiek (vydutie von), počet podľa dĺžky hrany', () => {
    const d = cloudPath(0, 0, 100, 50, 10);
    assert.ok(d.startsWith('M0 0') && d.endsWith('Z'));
    const arcs = d.match(/A[^A-Z]+/g)!;
    // 100 / 20 = 5 oblúkov na dlhých hranách, 50 / 20 -> 3 na krátkych.
    assert.equal(arcs.length, 5 + 3 + 5 + 3);
    assert.ok(arcs.every((a) => / 0 0 1 /.test(a)));
    assert.ok(arcs[0].startsWith('A10 10'));
    assert.ok(arcs.at(-1)!.endsWith(' 0 0'));
  });

  it('hrot šípky: špička v hrote, krídla kolmo za ňou', () => {
    const [tip, l, r] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    assert.deepEqual(tip, { x: 100, y: 0 });
    assert.deepEqual([l, r].map((p) => [p.x, p.y]).sort((a, b) => a[1] - b[1]), [[80, -10], [80, 10]]);
  });

  it('odkaz pripomienky nesie značky: rámik strany ich má, view_state ich dá hostovi, snímka ich pýta', () => {
    const target = { docId: DOC, page: 2, region: markupBounds(SHAPES), markup: SHAPES };
    const ref = docIssueReference(HOST, 'D.1.1.09', target);
    assert.deepEqual(ref.markup, SHAPES);
    assert.ok(!ref.url!.includes('markup'), 'URL odkazu ostáva v tvare D-158');
    const p = project([topic('n1', { documentReferences: [ref] }), topic('n2', { documentReferences: [docIssueReference(HOST, 'D', { docId: DOC, page: 2, region: null })] })]);
    const [withMarkup, plain] = issuesOnPage(p, DOC, 2);
    assert.deepEqual(withMarkup.markup, SHAPES);
    assert.deepEqual(plain.markup, []);
    assert.deepEqual(topicDocTargets(p.topics.get('n1')!)[0].markup, SHAPES);
    const local = describeLocalTopics(p, 'aim').topics;
    assert.deepEqual(local[0].document_references[0], { url: ref.url, description: ref.description, markup: SHAPES });
    assert.equal('markup' in local[1].document_references[0], false);
    const snap = new URL(docSnapshotUrl(HOST, target)!);
    assert.deepEqual(JSON.parse(snap.searchParams.get('markup')!), SHAPES);
    assert.equal(new URL(docSnapshotUrl(HOST, { ...target, markup: undefined })!).searchParams.has('markup'), false);
  });

  it('uložená pripomienka z hosta: značky z riadku document_references sa načítajú a overia', async () => {
    const url = `${HOST}/drawing/${DOC}?page=2&region=8_16_64_66#page=2`;
    const pulled: BCFProject = project([topic('h1', { index: 1, description: 'x\n\nDokumenty (AIM):\n- D, strana 2' })]);
    const loadApi = async () => ({
      BcfApiClient: class {} as never,
      fetchProjectAsBCF: (async () => ({ project: pulled, warnings: [] })) as never,
    });
    const fetchFn = (async () => new Response(JSON.stringify([
      { guid: 'r1', url, markup: [...SHAPES, { type: 'zlá' }] },
      { guid: 'r2', url, markup: 'nie pole' },
    ]), { status: 200 })) as unknown as typeof fetch;
    let current: BCFProject | null = null;
    const msg = { source: SOURCE, type: 'AIM_BCF_LOAD', baseUrl: `${HOST}/api/bcf`, projectId: 'aim' } as BcfLoadMessage;
    assert.equal(await loadAimBcfTopics(msg, { getProject: () => current, setProject: (x) => (current = x), loadApi, fetchFn }), 'loaded');
    const issues = issuesOnPage(current, DOC, 2);
    assert.deepEqual(issues.map((i) => i.markup), [SHAPES, []]);
    assert.equal(issues[0].label, '#1');
  });
});
