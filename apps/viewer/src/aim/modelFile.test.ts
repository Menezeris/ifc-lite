/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { aimModelFile, aimModelFileName, aimModelLastModified, isGzip } from './modelFile.js';

const BASE = 'https://x.supabase.co/storage/v1/object/public/ifc';
const IFC = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n';

describe('aimModelFileName', () => {
  it('revision archive keeps the plain model name', () => {
    assert.equal(aimModelFileName(new URL(`${BASE}/archive/ASR/v078.ifc.gz`)), 'ASR.ifc');
    assert.equal(aimModelFileName(new URL(`${BASE}/archive/VZT/v1234.ifc.gz?x=1`)), 'VZT.ifc');
  });

  it('other URLs: last segment as upstream, trailing .gz dropped', () => {
    assert.equal(aimModelFileName(new URL(`${BASE}/ASR.ifc?rev=78`)), 'ASR.ifc');
    assert.equal(aimModelFileName(new URL('https://example.com/m/house.ifc.gz')), 'house.ifc');
    assert.equal(aimModelFileName(new URL('https://example.com/m/house.ifczip')), 'house.ifczip');
    assert.equal(aimModelFileName(new URL('https://example.com/')), 'model.ifc');
  });
});

describe('isGzip', () => {
  it('reads the gzip magic number only', () => {
    assert.equal(isGzip(new Uint8Array([0x1f, 0x8b, 8])), true);
    assert.equal(isGzip(new Uint8Array([0x1f])), false);
    assert.equal(isGzip(new TextEncoder().encode('ISO-10303-21;')), false);
    assert.equal(isGzip(new Uint8Array([0x50, 0x4b, 3, 4])), false);
  });
});

describe('aimModelFile', () => {
  it('unpacks a gzip archive into an IFC file with the model name', async () => {
    const gz = new Blob([gzipSync(Buffer.from(IFC))], { type: 'application/gzip' });
    const file = await aimModelFile(new URL(`${BASE}/archive/ASR/v078.ifc.gz`), gz);
    assert.equal(file.name, 'ASR.ifc');
    assert.equal(file.type, 'application/x-step');
    assert.equal(await file.text(), IFC);
  });

  it('passes a plain IFC through unchanged', async () => {
    const blob = new Blob([IFC], { type: 'application/octet-stream' });
    const file = await aimModelFile(new URL(`${BASE}/VZT.ifc?rev=4`), blob);
    assert.equal(file.name, 'VZT.ifc');
    assert.equal(file.type, 'application/octet-stream');
    assert.equal(await file.text(), IFC);
  });
});

describe('aimModelLastModified (AIM #308)', () => {
  it('prefers the Last-Modified header: the same archive gives the same mtime on every open', () => {
    const url = new URL(`${BASE}/archive/ASR/v078.ifc.gz`);
    const header = 'Tue, 21 Oct 2026 08:15:00 GMT';
    assert.equal(aimModelLastModified(url, header), Date.parse(header));
    assert.equal(aimModelLastModified(url, header), aimModelLastModified(url, header));
  });

  it('falls back to the archive revision, else 0 (unknown), never the current time', () => {
    assert.equal(aimModelLastModified(new URL(`${BASE}/archive/ASR/v078.ifc.gz`), null), 78);
    assert.equal(aimModelLastModified(new URL(`${BASE}/archive/VZT/v1234.ifc.gz`), 'garbage'), 1234);
    assert.equal(aimModelLastModified(new URL(`${BASE}/ASR.ifc`), null), 0);
  });

  it('the File carries it, gzip or plain', async () => {
    const gz = new Blob([gzipSync(Buffer.from(IFC))]);
    assert.equal((await aimModelFile(new URL(`${BASE}/archive/ASR/v078.ifc.gz`), gz, 78)).lastModified, 78);
    assert.equal((await aimModelFile(new URL(`${BASE}/VZT.ifc`), new Blob([IFC]), 0)).lastModified, 0);
  });
});
