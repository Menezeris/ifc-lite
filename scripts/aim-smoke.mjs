#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM-FORK (whole file, AIM D-114): smoke test of a deployed viewer, the way
 * the AIM host uses it. A host page embeds the viewer in an iframe, waits for
 * the bridge's READY and asks `QUERY view_state`; the deploy passes when the
 * viewer answers `QUERY_RESULT ok`. It runs after every production deploy
 * (aim-smoke.yml), so a broken merge shows within minutes, not when it is hit.
 *
 *   node scripts/aim-smoke.mjs --url https://ifc-lite-viewer.vercel.app [--timeout-ms 120000]
 *
 * Exit 0 on a pass, 1 with the reason on stderr otherwise.
 */

import { isMainEntry } from './lib/is-main-entry.mjs';

/** The fake host origin the page is served from; the bridge trusts its referrer. */
export const HOST_ORIGIN = 'https://aim-smoke.invalid';
const SOURCE = 'aim-bridge';

/** The host page: embeds `viewerUrl` and reports each bridge step to `window.smoke`. */
export function hostPage(viewerUrl) {
  const target = new URL(viewerUrl);
  return `<!doctype html><meta charset="utf-8"><title>AIM smoke</title>
<iframe id="v" src="${target.href.replace(/"/g, '&quot;')}" style="width:1280px;height:800px;border:0"></iframe>
<script>
  window.smoke = { ready: false, result: null };
  const origin = ${JSON.stringify(target.origin)};
  addEventListener('message', (e) => {
    if (e.origin !== origin || !e.data || e.data.source !== ${JSON.stringify(SOURCE)}) return;
    if (e.data.type === 'READY' && !window.smoke.ready) {
      window.smoke.ready = true;
      document.getElementById('v').contentWindow.postMessage(
        { source: ${JSON.stringify(SOURCE)}, type: 'QUERY', id: 'smoke-1', query: 'view_state' }, origin);
    }
    if (e.data.type === 'QUERY_RESULT' && e.data.id === 'smoke-1') window.smoke.result = e.data;
  });
</script>`;
}

/** Turn what the page saw into a verdict: null on a pass, else the reason. */
export function verdict(state) {
  if (!state || !state.ready) return 'the viewer never sent READY: the AIM bridge did not start';
  if (!state.result) return 'READY came, but QUERY view_state got no QUERY_RESULT';
  if (state.result.ok !== true) return `QUERY view_state failed: ${state.result.error ?? 'no error text'}`;
  return null;
}

export async function main(argv = process.argv.slice(2)) {
  const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const url = arg('--url');
  if (!url) throw new Error('--url is required');
  const timeoutMs = Number(arg('--timeout-ms', '120000'));
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({
    executablePath: process.env.AIM_SMOKE_CHROMIUM || undefined,
    args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(`${HOST_ORIGIN}/**`, (route) => route.fulfill({ contentType: 'text/html', body: hostPage(url) }));
    await page.goto(`${HOST_ORIGIN}/`);
    const deadline = Date.now() + timeoutMs;
    let state = null;
    while (Date.now() < deadline) {
      state = await page.evaluate(() => window.smoke);
      if (state?.result) break;
      await page.waitForTimeout(1000);
    }
    const why = verdict(state);
    if (why) {
      console.error(`AIM smoke FAILED for ${url}: ${why}`);
      for (const e of errors) console.error(`  page error: ${e}`);
      return 1;
    }
    console.log(`AIM smoke passed for ${url}: READY and QUERY view_state answered.`);
    return 0;
  } finally {
    await browser.close();
  }
}

if (isMainEntry(import.meta.url)) process.exitCode = await main();
