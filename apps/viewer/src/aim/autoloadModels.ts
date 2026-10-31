/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `?models=` autoload pre AIM hosta (AIM #308), lenivo z useModelUrlAutoload.ts.
 *
 * - Sťahovanie všetkých URL štartuje naraz (VZT sa stiahne, kým sa parsuje ASR),
 *   parsovanie ide ďalej po jednom v poradí URL: WASM parser nie je reentrantný a
 *   federované pridanie musí vidieť RTC kotvu skoršieho modelu.
 * - Každý model ide cez cache parsovaného modelu (`federatedCache`, IndexedDB) s nižším
 *   prahom: opakované otvorenie tej istej revízie preskočí parsovanie aj tesseláciu.
 * - Hostovi posiela priebeh po modeloch (LOAD_PROGRESS) a správu, že geometria modelu je
 *   na scéne (FIRST_GEOMETRY), aby mohol zložiť prekrytie skôr než po MODELS_LOADED.
 *
 * Modul neimportuje nič zo vstupného balíka (store, bridge-protocol): dostane to v `deps`.
 */

import type { SOURCE } from './bridge-core.js';
import { aimModelFile, aimModelFileName, aimModelLastModified } from './modelFile.js';
import { pruneModelCache, type PruneTarget } from './cachePrune.js';

/** Prah cache pre modely z AIM (bez neho platí CACHE_SIZE_THRESHOLD 10 MiB; VZT má 9,98 MB). */
export const AIM_CACHE_MIN_SIZE = 1024 * 1024;

export type LoadPhase = 'download' | 'process' | 'done' | 'error';

/** Správy pre hosta, časť OutboundMessage (bridge-protocol.ts). */
export type LoadProgressMessage =
  | { source: typeof SOURCE; type: 'LOAD_PROGRESS'; model: string; phase: LoadPhase; percent: number; index: number; total: number }
  | { source: typeof SOURCE; type: 'FIRST_GEOMETRY'; model: string; index: number; total: number };

export interface AutoloadDeps {
  addModel: (file: File, options: { federatedCache: { minSize: number } }) => Promise<string | null>;
  /** Chyba jedného modelu (sťahovanie alebo načítanie); `retry` zopakuje len ten model. */
  fail: (err: unknown, retry: () => void) => void;
  /** Priebeh načítania z viewera (store `progress`); vráti odhlásenie. */
  watchProgress: (fn: (percent: number) => void) => () => void;
  fetch?: (url: string) => Promise<Response>;
  post?: (msg: LoadProgressMessage) => void;
  nextFrame?: () => Promise<void>;
  /** Po autoloade: staré revízie načítaných modelov z cache preč (cachePrune.ts). */
  prune?: (targets: PruneTarget[]) => Promise<unknown>;
}

/** Telo odpovede ako Blob, s priebehom podľa Content-Length (bez neho len 0 a 100). */
export async function readBody(res: Response, onPercent: (percent: number) => void): Promise<Blob> {
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || total <= 0) return res.blob();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.byteLength;
    onPercent(Math.min(99, Math.floor((received / total) * 100)));
  }
  return new Blob(parts as BlobPart[], { type: res.headers.get('content-type') ?? '' });
}

/**
 * Riedenie priebehu: rovnaká fáza sa pošle, až keď percento stúpne aspoň o `step`,
 * nová fáza a 100 vždy. Host kreslí pásik, nie graf, takže stačí po niekoľkých percentách.
 */
export function progressThrottle(post: (phase: LoadPhase, percent: number) => void, step = 5) {
  let last: { phase: LoadPhase; percent: number } | null = null;
  return (phase: LoadPhase, percent: number) => {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    if (last && last.phase === phase && p < 100 && p < last.percent + step) return;
    last = { phase, percent: p };
    post(phase, p);
  };
}

function postToHost(msg: LoadProgressMessage): void {
  if (window.parent === window) return;
  // Ten istý cieľ ako most (AimBridge.tsx): pôvod hosta z referreru pri štarte.
  const origin = document.referrer ? new URL(document.referrer).origin : '*';
  window.parent.postMessage(msg, origin);
}

/** Ďalší snímok (ohraničene: skrytá karta rAF nespúšťa). */
function nextFrameOrTimeout(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 250);
    requestAnimationFrame(done);
  });
}

/** Načíta `urls` (absolútne, overené) do federácie; skončí, keď prešli všetky. */
export async function autoloadModels(urls: string[], deps: AutoloadDeps): Promise<void> {
  const doFetch = deps.fetch ?? ((u: string) => fetch(u));
  const post = deps.post ?? postToHost;
  const nextFrame = deps.nextFrame ?? nextFrameOrTimeout;
  const total = urls.length;
  const loaded: PruneTarget[] = [];

  const download = async (url: URL, report: (phase: LoadPhase, percent: number) => void): Promise<File> => {
    report('download', 0);
    const res = await doFetch(url.href);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const blob = await readBody(res, (p) => report('download', p));
    // Archív revízie je gzip a nesie názov modelu (D-135); lastModified drží cache (AIM #308).
    return aimModelFile(url, blob, aimModelLastModified(url, res.headers.get('last-modified')));
  };

  const load = async (index: number, file: Promise<File>, report: (phase: LoadPhase, percent: number) => void) => {
    const url = new URL(urls[index]);
    const model = aimModelFileName(url);
    let unwatch: (() => void) | null = null;
    try {
      const ready = await file;
      report('process', 0);
      unwatch = deps.watchProgress((p) => report('process', p));
      const id = await deps.addModel(ready, { federatedCache: { minSize: AIM_CACHE_MIN_SIZE } });
      unwatch();
      unwatch = null;
      if (id) {
        loaded.push({ fileName: ready.name, fileSize: ready.size });
        await nextFrame(); // model je v store, geometria sa nahrá do GPU pri najbližšom snímku
        post({ source: 'aim-bridge', type: 'FIRST_GEOMETRY', model, index, total });
        report('done', 100);
      } else {
        // addModel nevrátil id: model sa nezaregistroval, host nesmie dostať "done 100" (fail hlási už addModel).
        report('error', 0);
      }
    } catch (err) {
      unwatch?.();
      report('error', 0);
      deps.fail(err, () => {
        const again = reporter(index);
        void load(index, download(url, again), again);
      });
    }
  };

  const reporter = (index: number) => {
    const model = aimModelFileName(new URL(urls[index]));
    return progressThrottle((phase, percent) =>
      post({ source: 'aim-bridge', type: 'LOAD_PROGRESS', model, phase, percent, index, total }));
  };

  // Všetky sťahovania naraz; zamietnutie sa ošetrí až pri poradí modelu (žiadne unhandled rejection).
  const reports = urls.map((_, i) => reporter(i));
  const files = urls.map((u, i) => {
    const p = download(new URL(u), reports[i]);
    p.catch(() => {});
    return p;
  });
  for (let i = 0; i < total; i++) await load(i, files[i], reports[i]);
  // Na pozadí: MODELS_LOADED (koniec autoloadu) na upratanie cache nečaká.
  if (loaded.length > 0) void (deps.prune ?? pruneModelCache)(loaded);
}
