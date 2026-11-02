/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Rasterizácia PDF podkladu pre 3D mimo hlavného vlákna (AIM, podklad bez zamrznutia). Zapnutie
 * podkladu v 3D kreslilo stranu cez pdf.js v hlavnom vlákne: pri rastrovom PDF (280 dlaždíc JPEG)
 * je to ~2,8 s `drawImage` (zmenšovanie dlaždíc do plátna 4096 px), stránka medzitým trhane reaguje.
 * Klient posiela stranu do Web Workera (`underlayRaster.worker.ts`, pdf.js na OffscreenCanvas) a
 * dostane späť ImageBitmap; hlavnému vláknu ostane upload textúry. Úlohy idú po jednej (pamäť plátna).
 * Keď worker nevie stranu nakresliť (chyba, filter pdf.js bez DOM, prehliadač bez OffscreenCanvas),
 * rovnaká strana sa nakreslí doterajšou cestou v hlavnom vlákne (`fallback`), takže podklad sa ukáže vždy.
 * Modul sa načíta lenivo pri prvom zapnutí podkladu; z vstupu viewera nič neimportuje.
 */

/** Rovnaký tvar ako `RasterizeUnderlayPage` v `useDrawingUnderlay` (volajúci zatvorí bitmapu). */
export type RasterizePage = (pdfUrl: string, page: number, maxTextureDimension: number) => Promise<ImageBitmap>;

export interface UnderlayRasterRequest {
  id: number;
  url: string;
  page: number;
  targetPx: number;
  maxTextureDimension: number;
}

/** `unsupported` = worker v tomto prehliadači nevie kresliť vôbec (ďalšie úlohy idú rovno do hlavného vlákna). */
export type UnderlayRasterResponse =
  | { id: number; image: ImageBitmap }
  | { id: number; error: string; unsupported?: boolean };

/** Časť `Worker`, ktorú klient potrebuje (test podstrčí vlastný). */
export interface UnderlayRasterWorker {
  onmessage: ((event: MessageEvent<UnderlayRasterResponse>) => void) | null;
  onerror: ((event: Event) => void) | null;
  postMessage(message: UnderlayRasterRequest): void;
  terminate(): void;
}

/** Mierka rastra (px na bod PDF): najdlhšia hrana `targetPx`, najviac limit textúry zariadenia. */
export function underlayRasterScale(pageSizePts: readonly [number, number], targetPx: number, maxTextureDimension: number): number {
  return Math.min(targetPx, maxTextureDimension) / Math.max(pageSizePts[0], pageSizePts[1]);
}

export interface UnderlayRasterClientOptions {
  workerFactory: () => UnderlayRasterWorker;
  /** Rasterizácia v hlavnom vlákne, keď worker stranu nenakreslí. */
  fallback: RasterizePage;
  targetPx: number;
  /** Chyba workera do konzoly (pred fallbackom). */
  onWorkerError?: (message: string) => void;
}

/**
 * Rasterizácia cez worker, po jednej úlohe; zlyhanie workera = tá istá strana cez `fallback`.
 * Spadnutý worker (chyba skriptu) alebo `unsupported` vypne worker do konca relácie.
 */
export function createUnderlayRasterClient(opts: UnderlayRasterClientOptions): RasterizePage {
  let worker: UnderlayRasterWorker | null = null;
  let disabled = false;
  let sequence = 0;
  const pending = new Map<number, { resolve: (image: ImageBitmap) => void; reject: (err: Error) => void }>();
  let tail: Promise<unknown> = Promise.resolve();

  const shutDown = (reason: string) => {
    disabled = true;
    worker?.terminate();
    worker = null;
    for (const p of pending.values()) p.reject(new Error(reason));
    pending.clear();
  };

  const ensureWorker = (): UnderlayRasterWorker | null => {
    if (disabled) return null;
    if (worker) return worker;
    try {
      worker = opts.workerFactory();
    } catch (err) {
      disabled = true;
      opts.onWorkerError?.(`worker did not start: ${String(err)}`);
      return null;
    }
    worker.onmessage = (event) => {
      const msg = event.data;
      // pdf.js runs its own (fake) worker in this thread and talks on the same port: not ours
      if (!msg || typeof msg !== 'object' || typeof msg.id !== 'number') return;
      const p = pending.get(msg.id);
      if (!p) {
        if ('image' in msg) msg.image.close();
        return;
      }
      pending.delete(msg.id);
      if ('image' in msg) p.resolve(msg.image);
      else {
        if (msg.unsupported) shutDown(msg.error);
        p.reject(new Error(msg.error));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      shutDown(`worker crashed: ${(event as ErrorEvent).message ?? 'error'}`);
    };
    return worker;
  };

  const inWorker = (url: string, page: number, maxTextureDimension: number): Promise<ImageBitmap> | null => {
    const w = ensureWorker();
    if (!w) return null;
    const id = ++sequence;
    return new Promise<ImageBitmap>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, url, page, targetPx: opts.targetPx, maxTextureDimension });
    });
  };

  const run: RasterizePage = async (url, page, maxTextureDimension) => {
    const job = inWorker(url, page, maxTextureDimension);
    if (job) {
      try {
        return await job;
      } catch (err) {
        opts.onWorkerError?.(err instanceof Error ? err.message : String(err));
      }
    }
    return opts.fallback(url, page, maxTextureDimension);
  };

  // One page at a time: each raster holds a canvas of up to 4096 px on the CPU
  return (url, page, maxTextureDimension) => {
    const result = tail.then(() => run(url, page, maxTextureDimension));
    tail = result.catch(() => undefined);
    return result;
  };
}

/** Klient s workerom pdf.js; volá ho `useDrawingUnderlay` (lenivý import) s rasterizáciou v hlavnom vlákne ako fallback. */
export function underlayRasterInWorker(fallback: RasterizePage, targetPx: number): RasterizePage {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return fallback;
  return createUnderlayRasterClient({
    workerFactory: () => new Worker(new URL('./underlayRaster.worker.ts', import.meta.url), { type: 'module' }) as unknown as UnderlayRasterWorker,
    fallback,
    targetPx,
    onWorkerError: (message) => console.warn(`drawing-underlay: worker raster failed, rasterizing on the main thread (${message})`),
  });
}
