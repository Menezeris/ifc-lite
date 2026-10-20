/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Moderný build pdf.js 6 volá Map.getOrInsertComputed a Math.sumPrecise, ktoré Safari pod 26.2
 * (celý iOS 18) a Chrome pod 147 nemajú: strana výkresu sa nevykreslí (AIM #97). Oba moduly,
 * ktoré pdf.js v prehliadači načítajú, preto berú legacy build; typové importy ostávajú.
 */
const LOADERS = ['../lib/appearance/pdf/browser-backend.ts', '../lib/pdf/rasterize.ts'];

/** Runtime odkazy na pdf.js: statický/dynamický import a URL workera, bez `import type` a `typeof import`. */
function runtimeRefs(source: string): string[] {
  const code = source.replace(/^import type .*$/gm, '').replace(/typeof import\('[^']*'\)/g, '');
  return [...code.matchAll(/(?:from|import\(|new URL\()\s*'(pdfjs-dist[^']*)'/g)].map((m) => m[1]);
}

describe('pdf.js legacy build v prehliadači (AIM #97)', () => {
  for (const file of LOADERS) {
    it(`${file.split('/').pop()} načíta pdf.js aj jeho worker z legacy buildu`, () => {
      const refs = runtimeRefs(readFileSync(new URL(file, import.meta.url), 'utf8'));
      assert.ok(refs.length >= 2, `čakám import pdf.js aj worker, mám ${JSON.stringify(refs)}`);
      for (const ref of refs) assert.match(ref, /^pdfjs-dist\/legacy\/build\//, `${ref} nie je legacy build`);
    });
  }
});
