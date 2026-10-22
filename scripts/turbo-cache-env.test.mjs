/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// AIM-FORK: per-commit variables must not enter the hash of every Turbo task,
// or Vercel Remote Cache misses on every deploy (wasm and all packages rebuild).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const PER_COMMIT = ['VERCEL_GIT_COMMIT_SHA', 'VERCEL_DEPLOYMENT_ID', 'VERCEL_SKEW_PROTECTION_ENABLED', 'GITHUB_SHA'];
const jsonc = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8').replace(/^\s*\/\/.*$/gm, ''));

test('root turbo.json keeps per-commit variables out of the shared build hash', () => {
  const env = jsonc('turbo.json').tasks.build.env ?? [];
  for (const name of PER_COMMIT) assert.ok(!env.includes(name), `${name} in root build env invalidates every package`);
});

test('the viewer build task still sees the per-commit variables it stamps', () => {
  const env = jsonc('apps/viewer/turbo.json').tasks.build.env;
  assert.ok(env.includes('$TURBO_EXTENDS$'), 'viewer must keep the root VITE_* list');
  for (const name of PER_COMMIT) assert.ok(env.includes(name), `${name} missing from the viewer build task`);
});
