/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { BCFProject } from '@ifc-lite/bcf';
import { SOURCE } from './bridge-protocol.js';
import { isBcfLoadMessage, type BcfLoadMessage } from './bcf-protocol.js';
import { loadAimBcfTopics } from './aimBcf.js';

const HOST = 'https://aim.example';
const msg = (over: Record<string, unknown> = {}) => ({
  source: SOURCE,
  type: 'AIM_BCF_LOAD',
  baseUrl: `${HOST}/api/bcf`,
  projectId: 'aim',
  ...over,
});

const project = (n: number): BCFProject => ({
  version: '2.1',
  topics: new Map(Array.from({ length: n }, (_, i) => [`t${i}`, {} as never])),
});

describe('AIM_BCF_LOAD (AIM D-099)', () => {
  it('accepts the host API on the parent origin only', () => {
    assert.equal(isBcfLoadMessage(msg(), HOST), true);
    assert.equal(isBcfLoadMessage(msg(), null), true);
    assert.equal(isBcfLoadMessage(msg({ baseUrl: 'https://evil.example/api/bcf' }), HOST), false);
    assert.equal(isBcfLoadMessage(msg({ baseUrl: 'http://aim.example/api/bcf' }), 'http://aim.example'), false);
    assert.equal(isBcfLoadMessage(msg({ baseUrl: 'http://localhost:3001/api/bcf' }), 'http://localhost:3001'), true);
    assert.equal(isBcfLoadMessage(msg({ baseUrl: 'https://u:p@aim.example/api/bcf' }), HOST), false);
    assert.equal(isBcfLoadMessage(msg({ baseUrl: 'nie url' }), HOST), false);
    assert.equal(isBcfLoadMessage(msg({ projectId: '' }), HOST), false);
    assert.equal(isBcfLoadMessage({ ...msg(), source: 'other' }, HOST), false);
  });

  it('pulls the project without a token and keeps the user\'s own project', async () => {
    const clients: unknown[] = [];
    const pulled = project(2);
    const loadApi = async () => ({
      BcfApiClient: class {
        constructor(options: unknown) {
          clients.push(options);
        }
      } as never,
      fetchProjectAsBCF: (async (_client: unknown, projectId: string, options: { includeSnapshots?: boolean }) => {
        assert.equal(projectId, 'aim');
        assert.equal(options.includeSnapshots, true);
        return { project: pulled, warnings: [] };
      }) as never,
    });
    let current: BCFProject | null = null;
    const deps = { getProject: () => current, setProject: (p: BCFProject) => (current = p), loadApi };

    assert.equal(await loadAimBcfTopics(msg() as BcfLoadMessage, deps), 'loaded');
    assert.equal(current, pulled);
    assert.deepEqual(clients, [{ baseUrl: `${HOST}/api/bcf` }]);
    // A reload after a chat change replaces the AIM project it put there.
    assert.equal(await loadAimBcfTopics(msg() as BcfLoadMessage, deps), 'loaded');

    const own = project(1);
    current = own;
    assert.equal(await loadAimBcfTopics(msg() as BcfLoadMessage, deps), 'kept');
    assert.equal(current, own);
  });

  it('AIM D-158: keeps topics added in the panel, takes the saved copy back, reads document references', async () => {
    const DOC = '11111111-1111-4111-8111-111111111111';
    const ref = `${HOST}/drawing/${DOC}?page=2&region=50_0_25_50#page=2`;
    const host = (topics: Record<string, unknown>[]): BCFProject => ({
      version: '2.1',
      projectId: 'aim',
      topics: new Map(topics.map((t) => [t.guid as string, { comments: [], viewpoints: [], ...t } as never])),
    });
    let pulls = [
      host([{ guid: 'h1', title: 'z chatu', index: 1 }]),
      host([{ guid: 'h1', title: 'z chatu', index: 1 }, { guid: 'n1', title: 'z PDF', index: 2, description: 'Chýba\n\nDokumenty (AIM):\n- D.1.1.09, strana 2' }]),
    ];
    const loadApi = async () => ({
      BcfApiClient: class {} as never,
      fetchProjectAsBCF: (async () => ({ project: pulls.shift()!, warnings: [] })) as never,
    });
    const asked: string[] = [];
    const fetchFn = (async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify([{ guid: 'r1', url: ref, description: 'D.1.1.09, strana 2' }]), { status: 200 });
    }) as unknown as typeof fetch;
    let current: BCFProject | null = null;
    const deps = { getProject: () => current, setProject: (p: BCFProject) => (current = p), loadApi, fetchFn };

    assert.equal(await loadAimBcfTopics(msg() as BcfLoadMessage, deps), 'loaded');
    assert.deepEqual(asked, []);
    // Panel "New topic": two local topics (no host index); the chat then saves n1.
    const withLocal: BCFProject = { ...current!, topics: new Map(current!.topics) };
    for (const guid of ['n1', 'n2']) withLocal.topics.set(guid, { guid, title: guid, comments: [], viewpoints: [] } as never);
    current = withLocal;
    assert.equal(await loadAimBcfTopics(msg() as BcfLoadMessage, deps), 'loaded');
    const topics = current!.topics;
    assert.deepEqual([...topics.keys()], ['h1', 'n1', 'n2']);
    assert.equal(topics.get('n1')!.index, 2);
    assert.equal(topics.get('n2')!.index, undefined);
    assert.deepEqual(asked, [`${HOST}/api/bcf/2.1/projects/aim/topics/n1/document_references`]);
    assert.deepEqual(topics.get('n1')!.documentReferences, [
      { guid: 'r1', url: ref, referencedDocument: ref, isExternal: true, description: 'D.1.1.09, strana 2' },
    ]);
  });

  it('drops a load overtaken by a newer one', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    const loadApi = async () => ({
      BcfApiClient: class {} as never,
      fetchProjectAsBCF: (async () => {
        calls += 1;
        if (calls === 1) await gate;
        return { project: project(calls), warnings: [] };
      }) as never,
    });
    let current: BCFProject | null = null;
    const deps = { getProject: () => current, setProject: (p: BCFProject) => (current = p), loadApi };
    const first = loadAimBcfTopics(msg() as BcfLoadMessage, deps);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(await loadAimBcfTopics(msg() as BcfLoadMessage, deps), 'loaded');
    release();
    assert.equal(await first, 'stale');
    assert.equal(current!.topics.size, 2);
  });
});
