/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `BinaryDataFactory` pre pdf.js výkresov (AIM #238), rovnaké zdroje ako `lib/appearance/pdf/browser-backend.ts`:
 * súbory z `pdfjs-dist` servíruje bundler (self-hosted, bez CDN). Načíta sa lenivo s prvým výkresom.
 */
import { decoderResourcePath } from './pdfDecoderPlan.js';

const resources = import.meta.glob('/node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm}/*.{bcmap,pfb,ttf,wasm,js}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

class AimPdfDecoderData {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const path = decoderResourcePath(kind, filename);
    const url = path ? resources[path] : undefined;
    if (!url) throw new Error(`PDF decoder resource ${kind}/${filename} is not bundled.`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load PDF decoder resource ${filename}.`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** Voľby `getDocument`: dekodéry cez hlavné vlákno (worker nepozná URL z bundlera). */
export const pdfDecoderOptions = { BinaryDataFactory: AimPdfDecoderData, useWorkerFetch: false } as const;
