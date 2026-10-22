/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { decoderResourcePath } from './pdfDecoderPlan.js';

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

describe('dáta dekodérov pdf.js pre výkresy (AIM #238)', () => {
  it('preloží požiadavky pdf.js na súbory, ktoré pdfjs-dist naozaj nesie', () => {
    for (const [kind, file] of [['wasmUrl', 'jbig2.wasm'], ['wasmUrl', 'openjpeg.wasm'], ['standardFontDataUrl', 'FoxitFixed.pfb'], ['cMapUrl', '78-H.bcmap']]) {
      const path = decoderResourcePath(kind, file);
      assert.ok(path, `${kind}/${file}`);
      assert.ok(existsSync(join(pdfjsRoot, path.replace('/node_modules/pdfjs-dist/', ''))), path);
    }
  });

  it('neznámy druh a meno s cestou odmietne', () => {
    assert.equal(decoderResourcePath('iccUrl', 'x.icc'), null);
    assert.equal(decoderResourcePath('wasmUrl', '../package.json'), null);
  });

  it('výkresy (rasterize.ts) otvárajú PDF s dekodérmi, inak maskovaný text chýba', () => {
    const src = readFileSync(new URL('../lib/pdf/rasterize.ts', import.meta.url), 'utf8');
    assert.match(src, /getDocument\(\{[^}]*\.\.\.pdfDecoderOptions/);
  });
});
