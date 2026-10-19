/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { BCFProject } from '@ifc-lite/bcf';
import { SOURCE } from './bridge-protocol.js';
import { isBcfLoadMessage, type BcfLoadMessage } from './bcf-protocol.js';
import { loadAimBcfTopics, shouldReplaceBcfProject } from './aimBcf.js';

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

  it('replaces only an empty, missing or previously loaded AIM project', () => {
    const aim = project(2);
    assert.equal(shouldReplaceBcfProject(null, null), true);
    assert.equal(shouldReplaceBcfProject(project(0), null), true);
    assert.equal(shouldReplaceBcfProject(aim, aim), true);
    assert.equal(shouldReplaceBcfProject(project(3), aim), false);
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
        assert.equal(options.includeSnapshots, false);
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
