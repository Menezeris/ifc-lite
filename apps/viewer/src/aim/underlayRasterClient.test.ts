/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createUnderlayRasterClient, underlayRasterScale,
  type UnderlayRasterRequest, type UnderlayRasterResponse, type UnderlayRasterWorker,
} from './underlayRasterClient.js';

/** Falošná bitmapa: `close` zapíše, že sa uvoľnila. */
function bitmap(tag: string): ImageBitmap & { tag: string; closed: boolean } {
  const b = { tag, closed: false, width: 1, height: 1, close() { b.closed = true; } };
  return b as unknown as ImageBitmap & { tag: string; closed: boolean };
}

/** Worker, ktorý odpovedá až na pokyn testu (`answer`), a zaznamenáva požiadavky. */
class FakeWorker implements UnderlayRasterWorker {
  onmessage: ((event: MessageEvent<UnderlayRasterResponse>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  requests: UnderlayRasterRequest[] = [];
  terminated = false;
  postMessage(message: UnderlayRasterRequest): void { this.requests.push(message); }
  terminate(): void { this.terminated = true; }
  answer(response: UnderlayRasterResponse): void { this.onmessage?.({ data: response } as MessageEvent<UnderlayRasterResponse>); }
  crash(): void { this.onerror?.({ message: 'boom', preventDefault() {} } as unknown as Event); }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const workers: FakeWorker[] = [];
  const fallbackCalls: string[] = [];
  const raster = createUnderlayRasterClient({
    workerFactory: () => { const w = new FakeWorker(); workers.push(w); return w; },
    fallback: async (url, page) => { fallbackCalls.push(`${url}#${page}`); return bitmap(`main:${url}`); },
    targetPx: 4096,
  });
  return { workers, fallbackCalls, raster };
}

describe('raster PDF podkladu mimo hlavného vlákna', () => {
  it('strana ide do workera s cieľovou veľkosťou a limitom textúry; hlavné vlákno nekreslí', async () => {
    const { workers, fallbackCalls, raster } = setup();
    const result = raster('https://x/a.pdf', 2, 8192);
    await tick();
    assert.equal(workers.length, 1);
    assert.deepEqual(workers[0].requests[0], { id: 1, url: 'https://x/a.pdf', page: 2, targetPx: 4096, maxTextureDimension: 8192 });
    workers[0].answer({ id: 1, image: bitmap('worker') });
    assert.equal((await result as unknown as { tag: string }).tag, 'worker');
    assert.deepEqual(fallbackCalls, []);
  });

  it('chyba workera pri jednej strane = tá istá strana v hlavnom vlákne, worker ostáva pre ďalšie', async () => {
    const { workers, fallbackCalls, raster } = setup();
    const first = raster('a.pdf', 1, 4096);
    await tick();
    workers[0].answer({ id: 1, error: 'PDF transfer filter needs the DOM' });
    assert.equal((await first as unknown as { tag: string }).tag, 'main:a.pdf');
    assert.deepEqual(fallbackCalls, ['a.pdf#1']);
    const second = raster('b.pdf', 1, 4096);
    await tick();
    assert.equal(workers.length, 1, 'ten istý worker');
    workers[0].answer({ id: 2, image: bitmap('worker-b') });
    assert.equal((await second as unknown as { tag: string }).tag, 'worker-b');
  });

  it('worker bez podpory (unsupported) alebo spadnutý: ďalšie strany idú rovno do hlavného vlákna', async () => {
    const { workers, fallbackCalls, raster } = setup();
    const first = raster('a.pdf', 1, 4096);
    await tick();
    workers[0].answer({ id: 1, error: 'OffscreenCanvas unavailable in workers', unsupported: true });
    await first;
    assert.equal(workers[0].terminated, true);
    await raster('b.pdf', 1, 4096);
    assert.equal(workers.length, 1, 'nový worker sa nespúšťa');
    assert.deepEqual(fallbackCalls, ['a.pdf#1', 'b.pdf#1']);

    const crashed = setup();
    const job = crashed.raster('c.pdf', 1, 4096);
    await tick();
    crashed.workers[0].crash();
    assert.equal((await job as unknown as { tag: string }).tag, 'main:c.pdf');
    await crashed.raster('d.pdf', 1, 4096);
    assert.equal(crashed.workers.length, 1);
    assert.deepEqual(crashed.fallbackCalls, ['c.pdf#1', 'd.pdf#1']);
  });

  it('strany idú po jednej: druhá sa do workera pošle až po dobehnutí prvej', async () => {
    const { workers, raster } = setup();
    const a = raster('a.pdf', 1, 4096);
    const b = raster('b.pdf', 1, 4096);
    await tick();
    assert.equal(workers[0].requests.length, 1);
    workers[0].answer({ id: 1, image: bitmap('a') });
    await a;
    await tick();
    assert.equal(workers[0].requests.length, 2);
    assert.equal(workers[0].requests[1].url, 'b.pdf');
    workers[0].answer({ id: 2, image: bitmap('b') });
    assert.equal((await b as unknown as { tag: string }).tag, 'b');
  });

  it('správa pdf.js bez id a odpoveď bez čakajúcej úlohy sa zahodia, bitmapa sa uvoľní', async () => {
    const { workers, raster } = setup();
    const a = raster('a.pdf', 1, 4096);
    await tick();
    workers[0].onmessage?.({ data: { sourceName: 'worker', targetName: 'main', action: 'ready', data: null } } as unknown as MessageEvent<UnderlayRasterResponse>);
    workers[0].onmessage?.({ data: null } as unknown as MessageEvent<UnderlayRasterResponse>);
    const stray = bitmap('stray');
    workers[0].answer({ id: 99, image: stray });
    assert.equal(stray.closed, true);
    workers[0].answer({ id: 1, image: bitmap('a') });
    await a;
  });

  it('mierka rastra: najdlhšia hrana strany na cieľ, najviac limit textúry', () => {
    assert.equal(underlayRasterScale([3370, 2384], 4096, 8192), 4096 / 3370);
    assert.equal(underlayRasterScale([1000, 2000], 4096, 2048), 2048 / 2000);
  });
});
