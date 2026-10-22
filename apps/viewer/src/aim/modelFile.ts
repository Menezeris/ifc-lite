/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM D-135: the host federates each model from its immutable revision archive
 * (`.../ifc/archive/<MODEL>/vNNN.ifc.gz`, gzip, cached for a year) instead of the
 * mutable `.../ifc/<MODEL>.ifc`, so the browser downloads a model once per
 * revision and about five times fewer bytes. The archive carries no
 * `Content-Encoding`, so the autoload gets gzip bytes and unpacks them here.
 *
 * The model keeps its plain name (`ASR.ifc`, not `v078.ifc`): the bridge, the
 * revision pairing (`derivations.ts` `modelKey`) and model filters
 * (`"VZT" ~ "VZT.ifc"`) all match a model by its file name.
 */

const ARCHIVE_RE = /\/archive\/([^/]+)\/v\d+\.ifc\.gz$/i;

/** True when the bytes start with the gzip magic number `1f 8b`. */
export function isGzip(head: Uint8Array): boolean {
  return head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;
}

/**
 * File name of an autoloaded model: `<MODEL>.ifc` for a revision archive,
 * otherwise the last path segment (as upstream) without a trailing `.gz`.
 */
export function aimModelFileName(url: URL): string {
  const archive = ARCHIVE_RE.exec(url.pathname);
  if (archive) return `${decodeURIComponent(archive[1])}.ifc`;
  const last = url.pathname.split('/').pop() || 'model.ifc';
  return last.replace(/\.gz$/i, '') || 'model.ifc';
}

/** The fetched model as a `File` for `addModel`: gzip unpacked, plain name kept. */
export async function aimModelFile(url: URL, blob: Blob): Promise<File> {
  const name = aimModelFileName(url);
  if (!isGzip(new Uint8Array(await blob.slice(0, 2).arrayBuffer()))) {
    return new File([blob], name, { type: blob.type || 'application/x-step' });
  }
  const unpacked = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  return new File([unpacked], name, { type: 'application/x-step' });
}
