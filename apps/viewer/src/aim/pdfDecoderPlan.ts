/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dáta dekodérov pdf.js (AIM #238): WASM pre CCITT/JBIG2/JPX obrázky a masky, štandardné fonty, CMapy.
 * Bez nich pdf.js 6 obrázok s takou maskou nevykreslí, takže text výkresu uložený ako maskované
 * obrázky (Ghostscript/PDFCreator) chýba a ostane len logo. Tu je len preklad požiadavky pdf.js
 * (`kind`, `filename`) na cestu v `pdfjs-dist`; URL z bundlera dosadí `pdfDecoderData.ts`.
 */
const FOLDERS: Readonly<Record<string, string>> = {
  cMapUrl: 'cmaps',
  standardFontDataUrl: 'standard_fonts',
  wasmUrl: 'wasm',
};

/** Cesta súboru v `pdfjs-dist` (kľúč `import.meta.glob`), null = neznámy druh alebo podozrivé meno. */
export function decoderResourcePath(kind: string, filename: string): string | null {
  const folder = FOLDERS[kind];
  if (!folder || !/^[\w.-]+$/.test(filename)) return null;
  return `/node_modules/pdfjs-dist/${folder}/${filename}`;
}
