/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM-FORK (whole file, AIM D-116): tests for the pure parts of
 * aim-smoke.mjs. The browser run itself is exercised by aim-smoke.yml against
 * the live deploy.
 *
 * Run: `node --test scripts/aim-smoke.test.mjs`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { hostPage, verdict } from './aim-smoke.mjs';

test('a deploy passes only when READY came and view_state answered ok', () => {
  assert.equal(verdict({ ready: true, result: { ok: true, result: {} } }), null);
  assert.match(verdict(null), /never sent READY/);
  assert.match(verdict({ ready: false, result: null }), /never sent READY/);
  assert.match(verdict({ ready: true, result: null }), /no QUERY_RESULT/);
  assert.match(verdict({ ready: true, result: { ok: false, error: 'neplatná otázka' } }), /failed: neplatná otázka/);
});

test('the host page embeds the viewer and only trusts its origin', () => {
  const page = hostPage('https://ifc-lite-viewer.vercel.app/?x="1"');
  assert.match(page, /<iframe id="v" src="https:\/\/ifc-lite-viewer\.vercel\.app\/\?x=%221%22"/);
  assert.match(page, /const origin = "https:\/\/ifc-lite-viewer\.vercel\.app";/);
  assert.match(page, /if \(e\.origin !== origin \|\| /, 'a message from another origin is ignored');
  assert.match(page, /query: 'view_state'/);
  assert.throws(() => hostPage('not a url'));
});
