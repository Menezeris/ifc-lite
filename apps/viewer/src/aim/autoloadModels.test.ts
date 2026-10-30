/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AIM_CACHE_MIN_SIZE, autoloadModels, progressThrottle, type AutoloadDeps, type LoadProgressMessage } from './autoloadModels.js';

// AIM #308: VZT sa sťahuje počas parsovania ASR, parsovanie ostáva po jednom,
// každý model ide cez cache a host dostane priebeh a prvú geometriu.

const BASE = 'https://x.supabase.co/storage/v1/object/public/ifc/archive';
const ASR = `${BASE}/ASR/v078.ifc.gz`;
const VZT = `${BASE}/VZT/v012.ifc.gz`;
const IFC = 'ISO-10303-21;\nEND-ISO-10303-21;\n';
const LAST_MODIFIED = 'Tue, 21 Oct 2026 08:15:00 GMT';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const ok = () => new Response(IFC, { headers: { 'last-modified': LAST_MODIFIED, 'content-length': String(IFC.length) } });

function harness(fetchImpl: (url: string) => Promise<Response>, addModel?: AutoloadDeps['addModel']) {
  const log: string[] = [];
  const posts: LoadProgressMessage[] = [];
  const failures: Array<{ err: unknown; retry: () => void }> = [];
  const added: Array<{ file: File; options: Parameters<AutoloadDeps['addModel']>[1] }> = [];
  let active = 0;
  let maxActive = 0;
  const deps: AutoloadDeps = {
    fetch: (url) => { log.push(`fetch ${url.split('/')[url.split('/').length - 2]}`); return fetchImpl(url); },
    addModel: addModel ?? (async (file, options) => {
      active++; maxActive = Math.max(maxActive, active);
      log.push(`add ${file.name}`);
      added.push({ file, options });
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return file.name;
    }),
    fail: (err, retry) => { failures.push({ err, retry }); },
    watchProgress: () => () => {},
    post: (msg) => { posts.push(msg); },
    nextFrame: async () => {},
  };
  return { deps, log, posts, failures, added, maxActive: () => maxActive };
}

describe('autoloadModels', () => {
  it('starts every download before the first model is parsed', async () => {
    const asrParse = deferred<string | null>();
    const h = harness(async () => ok(), async (file) => {
      h.log.push(`add ${file.name}`);
      return file.name === 'ASR.ifc' ? asrParse.promise : file.name;
    });
    const run = autoloadModels([ASR, VZT], h.deps);
    await new Promise((r) => setTimeout(r, 10));
    // ASR sa parsuje (addModel nevrátil) a VZT je už stiahnuté.
    assert.deepEqual(h.log, ['fetch ASR', 'fetch VZT', 'add ASR.ifc']);
    asrParse.resolve('asr');
    await run;
    assert.deepEqual(h.log, ['fetch ASR', 'fetch VZT', 'add ASR.ifc', 'add VZT.ifc']);
  });

  it('parses one model at a time in URL order, even when the later download finishes first', async () => {
    const asrBody = deferred<Response>();
    const h = harness((url) => (url === ASR ? asrBody.promise : Promise.resolve(ok())));
    const run = autoloadModels([ASR, VZT], h.deps);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(h.added.map((a) => a.file.name), [], 'VZT waits for ASR');
    asrBody.resolve(ok());
    await run;
    assert.deepEqual(h.added.map((a) => a.file.name), ['ASR.ifc', 'VZT.ifc']);
    assert.equal(h.maxActive(), 1);
  });

  it('each model opts into the parsed-model cache below the 10 MiB default, with a stable mtime', async () => {
    const h = harness(async () => ok());
    await autoloadModels([ASR, VZT], h.deps);
    for (const { file, options } of h.added) {
      assert.equal(options.federatedCache.minSize, AIM_CACHE_MIN_SIZE);
      assert.equal(file.lastModified, Date.parse(LAST_MODIFIED));
    }
    assert.ok(AIM_CACHE_MIN_SIZE < 9_976_176, 'VZT (9,976,176 B) is cached');
  });

  it('a failed download does not stop the next model; its retry reloads only that model', async () => {
    let asrAttempts = 0;
    const h = harness(async (url) => {
      if (url === ASR && asrAttempts++ === 0) return new Response('', { status: 404, statusText: 'Not Found' });
      return ok();
    });
    await autoloadModels([ASR, VZT], h.deps);
    assert.equal(h.failures.length, 1);
    assert.match(String(h.failures[0].err), /404/);
    assert.deepEqual(h.added.map((a) => a.file.name), ['VZT.ifc']);
    h.failures[0].retry();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(h.added.map((a) => a.file.name), ['VZT.ifc', 'ASR.ifc']);
  });

  it('tells the host each model\'s progress and when its geometry is on the scene', async () => {
    const h = harness(async () => ok(), async (file) => (file.name === 'VZT.ifc' ? null : file.name));
    await autoloadModels([ASR, VZT], h.deps);
    const asr = h.posts.filter((m) => m.model === 'ASR.ifc').map((m) => (m.type === 'LOAD_PROGRESS' ? `${m.phase} ${m.percent}` : m.type));
    assert.deepEqual(asr.filter((s) => !s.startsWith('download')).slice(0, 3), ['process 0', 'FIRST_GEOMETRY', 'done 100']);
    assert.equal(asr[0], 'download 0');
    const first = h.posts.find((m) => m.type === 'FIRST_GEOMETRY');
    assert.deepEqual(first, { source: 'aim-bridge', type: 'FIRST_GEOMETRY', model: 'ASR.ifc', index: 0, total: 2 });
    // VZT sa nezaregistroval (addModel vrátil null): bez FIRST_GEOMETRY.
    assert.equal(h.posts.some((m) => m.type === 'FIRST_GEOMETRY' && m.model === 'VZT.ifc'), false);
  });
});

describe('progressThrottle', () => {
  it('posts a new phase and 100 always, otherwise only steps of at least 5 points', () => {
    const out: string[] = [];
    const report = progressThrottle((phase, percent) => out.push(`${phase} ${percent}`));
    for (const p of [0, 2, 4, 5, 7, 11, 9, 100]) report('process', p);
    report('done', 100);
    assert.deepEqual(out, ['process 0', 'process 5', 'process 11', 'process 100', 'done 100']);
  });
});
