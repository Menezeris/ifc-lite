/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Web Worker: jedna strana PDF podkladu na OffscreenCanvas cez pdf.js (legacy build ako
 * `lib/pdf/rasterize.ts`), výsledok ako ImageBitmap (transfer). Klient je `underlayRasterClient.ts`.
 * Rovnaké voľby dokumentu a dekodéry (`pdfDecoderData.ts`) ako v hlavnom vlákne; písma sa kreslia ako
 * krivky (`disableFontFace`, worker nemá `document.fonts`). Filtre pdf.js, ktoré potrebujú DOM (SVG),
 * worker nevie: vtedy hlási chybu a stranu nakreslí hlavné vlákno.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { pdfDecoderOptions } from './pdfDecoderData.js';
import { underlayRasterScale, type UnderlayRasterRequest, type UnderlayRasterResponse } from './underlayRasterClient.js';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Rovnaké ako `DOCUMENT_OPTIONS` v `lib/pdf/rasterize.ts`: Range požiadavky, bez celého sťahovania. */
const DOCUMENT_OPTIONS = { disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144 } as const;

interface OffscreenTarget { canvas: OffscreenCanvas | null; context: OffscreenCanvasRenderingContext2D | null }

class OffscreenCanvasFactory {
  create(width: number, height: number): OffscreenTarget {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new UnsupportedError('OffscreenCanvas 2D context unavailable');
    return { canvas, context };
  }
  reset(target: OffscreenTarget, width: number, height: number): void {
    if (!target.canvas) return;
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target: OffscreenTarget): void {
    if (target.canvas) target.canvas.width = target.canvas.height = 0;
    target.canvas = null;
    target.context = null;
  }
}

/** SVG filtre pdf.js potrebujú DOM: identita prejde, iné hodia chybu (stranu potom nakreslí hlavné vlákno). */
class NoDomFilterFactory {
  addFilter(maps?: number[][] | null): string {
    if (!maps || maps.every((map) => map.every((value, index) => value === index))) return 'none';
    throw new Error('PDF transfer filter needs the DOM');
  }
  addHCMFilter(): string { return 'none'; }
  addHighlightHCMFilter(): string { return 'none'; }
  addAlphaFilter(): string { throw new Error('PDF alpha filter needs the DOM'); }
  addLuminosityFilter(): string { throw new Error('PDF luminosity filter needs the DOM'); }
  destroy(): void {}
}

class UnsupportedError extends Error {}

async function rasterize(req: UnderlayRasterRequest): Promise<ImageBitmap> {
  if (typeof OffscreenCanvas === 'undefined') throw new UnsupportedError('OffscreenCanvas unavailable in workers');
  const loadingTask = getDocument({
    // A URL object: pdf.js resolves a string against `window.location`, which a worker does not have
    url: new URL(req.url, self.location.href),
    ...DOCUMENT_OPTIONS,
    ...pdfDecoderOptions,
    CanvasFactory: OffscreenCanvasFactory,
    FilterFactory: NoDomFilterFactory,
    disableFontFace: true,
    useSystemFonts: false,
  } as Parameters<typeof getDocument>[0]);
  try {
    const doc = await loadingTask.promise;
    const page = await doc.getPage(req.page);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: underlayRasterScale([base.width, base.height], req.targetPx, req.maxTextureDimension) });
    const factory = new OffscreenCanvasFactory();
    const target = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvas = target.canvas!;
    const context = target.context!;
    // White paper, as on the main thread (`rasterizePdfPage`)
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return canvas.transferToImageBitmap();
  } finally {
    void loadingTask.destroy();
  }
}

self.onmessage = async (event: MessageEvent<UnderlayRasterRequest>) => {
  const req = event.data;
  let response: UnderlayRasterResponse;
  try {
    const image = await rasterize(req);
    (self as unknown as Worker).postMessage({ id: req.id, image } satisfies UnderlayRasterResponse, [image]);
    return;
  } catch (err) {
    response = { id: req.id, error: err instanceof Error ? err.message : String(err), ...(err instanceof UnsupportedError ? { unsupported: true } : {}) };
  }
  (self as unknown as Worker).postMessage(response);
};
