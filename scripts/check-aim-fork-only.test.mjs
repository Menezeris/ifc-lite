/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM-FORK (whole file, AIM D-103, D-116): tests for check-aim-fork-only.mjs. The
 * classification runs against throwaway git repositories, never this
 * checkout, so a change to the fork's own files cannot make them pass.
 *
 * Run: `node --test scripts/check-aim-fork-only.test.mjs`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  bundleRaiseOnly, classify, forkBlocks, hunkInsideBlocks, parseHunks, relatedTests, viewerOnly, MAX_RELATED_TESTS,
} from './check-aim-fork-only.mjs';

const UPSTREAM = [
  'export function Hint() {',
  '  const key = pick();',
  '  // >>> AIM-FORK: host hides the hint (D-101)',
  '  if (hidden()) return null;',
  '  // <<< AIM-FORK',
  '  return render(key);',
  '}',
  '',
].join('\n');

const BUNDLE = JSON.stringify({
  family: 'bundle',
  entries: [
    { id: 'engine-wasm-brotli', ceiling: 100, tolerance: { kind: 'relative', value: 0.005 } },
    { id: 'viewer-entry-js-bytes', ceiling: 1_000_000, tolerance: { kind: 'relative', value: 0.001 }, provenance: { commit: 'a' } },
    { id: 'viewer-eager-js-bytes', ceiling: 5_000_000, tolerance: { kind: 'relative', value: 0.001 }, provenance: { commit: 'a' } },
  ],
}, null, 2);

function withRepo(base, change, run) {
  const dir = mkdtempSync(join(tmpdir(), 'aim-fork-only-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const write = (files) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) { rmSync(join(dir, path)); continue; }
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    git(['add', '-A']);
    git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'c', '--allow-empty']);
    return git(['rev-parse', 'HEAD']).trim();
  };
  try {
    git(['init', '-q']);
    const b = write(base);
    const h = write(change);
    return run({ base: b, head: h, git, readViewerSources: () => new Map() });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HINT = 'apps/viewer/src/components/Hint.tsx';

test('a PR inside apps/viewer/src/aim only is aim-only', () => {
  withRepo({ [HINT]: UPSTREAM }, { 'apps/viewer/src/aim/x.ts': 'export const x = 1;\n' }, (repo) => {
    assert.equal(classify(repo).mode, 'aim-only');
  });
});

test('an edit inside an existing AIM-FORK block is fork-blocks', () => {
  const changed = UPSTREAM.replace('if (hidden()) return null;', 'if (hidden() || parked()) return null;');
  withRepo({ [HINT]: UPSTREAM }, { [HINT]: changed }, (repo) => {
    assert.deepEqual(classify(repo), { mode: 'fork-blocks', reasons: [], outside: [], relatedTests: [] });
  });
});

test('an upstream line replaced inside a NEW block is fork-blocks (the documented way)', () => {
  const changed = UPSTREAM.replace('  return render(key);', '  // >>> AIM-FORK: pass the gizmo flag\n  return render(key, gizmo());\n  // <<< AIM-FORK');
  withRepo({ [HINT]: UPSTREAM }, { [HINT]: changed }, (repo) => {
    assert.equal(classify(repo).mode, 'fork-blocks');
  });
});

test('one changed line outside the blocks is upstream mode, still the fast lane (D-116)', () => {
  const changed = UPSTREAM.replace('const key = pick();', 'const key = pick(1);');
  withRepo({ [HINT]: UPSTREAM }, { [HINT]: changed }, (repo) => {
    const result = classify(repo);
    assert.equal(result.mode, 'upstream');
    assert.deepEqual(result.reasons, []);
    assert.match(result.outside[0], /1 change\(s\) outside AIM-FORK blocks, first at new line 2/);
  });
});

test('deleting upstream lines next to a block is upstream; deleting a whole block is fork-blocks', () => {
  withRepo({ [HINT]: UPSTREAM }, { [HINT]: UPSTREAM.replace('  return render(key);\n', '') }, (repo) => {
    assert.equal(classify(repo).mode, 'upstream');
  });
  const noBlock = UPSTREAM.replace(/ {2}\/\/ >>> AIM-FORK[^\n]*\n[^\n]*\n[^\n]*<<< AIM-FORK\n/, '');
  withRepo({ [HINT]: UPSTREAM }, { [HINT]: noBlock }, (repo) => {
    assert.equal(classify(repo).mode, 'fork-blocks');
  });
});

test('workflows, scripts, packages, new and deleted upstream files are upstream mode and say where', () => {
  const yml = '# >>> AIM-FORK: x\non: push\n# <<< AIM-FORK\n';
  withRepo({ '.github/workflows/a.yml': yml }, { '.github/workflows/a.yml': yml.replace('push', 'pull_request') }, (repo) => {
    const result = classify(repo);
    assert.equal(result.mode, 'upstream');
    assert.match(result.outside[0], /outside apps\/viewer/);
  });
  withRepo({ [HINT]: UPSTREAM }, { 'apps/viewer/src/new.ts': 'x\n' }, (repo) => {
    assert.match(classify(repo).outside[0], /new upstream file/);
  });
  withRepo({ [HINT]: UPSTREAM }, { [HINT]: null }, (repo) => {
    assert.match(classify(repo).outside[0], /deleted upstream file/);
  });
});

test('only a release batch, an upstream sync or the ci:full label runs the full CI', () => {
  withRepo({ [HINT]: UPSTREAM }, { 'apps/viewer/src/aim/x.ts': 'x\n' }, (repo) => {
    assert.equal(classify(repo).mode, 'aim-only');
    assert.equal(classify({ ...repo, headRef: 'sync/upstream-2026-10-19' }).mode, 'full');
    assert.equal(classify({ ...repo, headRef: 'release/aim-2026-10-20' }).mode, 'full');
    assert.equal(classify({ ...repo, headRef: 'claude/release/aim-x' }).mode, 'aim-only');
    const labelled = classify({ ...repo, labels: ['llm-reviewed', 'ci:full'] });
    assert.equal(labelled.mode, 'full');
    assert.deepEqual(labelled.reasons, ['label ci:full']);
    assert.deepEqual(labelled.relatedTests, []);
  });
});

test('an unbalanced marker proves nothing', () => {
  assert.equal(forkBlocks('// >>> AIM-FORK\nx\n'), null);
  assert.equal(forkBlocks('x\n// <<< AIM-FORK\n'), null);
  assert.deepEqual(forkBlocks('a\n{/* >>> AIM-FORK: x */}<A />{/* <<< AIM-FORK */}\nb\n'), [[2, 2]]);
  assert.deepEqual(forkBlocks('a\n// AIM-FORK (D-098): next 2 lines, x\nb\nc\nd\n'), [[2, 4]]);
});

test('hunks: pure additions and deletions are placed by their gap', () => {
  assert.deepEqual(parseHunks('@@ -3 +3,2 @@\n@@ -9,2 +10,0 @@\n'), [{ a: 3, b: 1, c: 3, d: 2 }, { a: 9, b: 2, c: 10, d: 0 }]);
  assert.equal(hunkInsideBlocks({ a: 5, b: 0, c: 6, d: 1 }, [[5, 7]], []), true);
  assert.equal(hunkInsideBlocks({ a: 5, b: 0, c: 8, d: 1 }, [[5, 7]], []), false);
  assert.equal(hunkInsideBlocks({ a: 5, b: 1, c: 5, d: 0 }, [[5, 7]], []), true);
  assert.equal(hunkInsideBlocks({ a: 5, b: 1, c: 7, d: 0 }, [[5, 7]], []), false);
});

test('bundle.json: only a viewer ceiling raise within the pre-approved limit plus tolerance passes', () => {
  const raise = (entry, eager) => {
    const doc = JSON.parse(BUNDLE);
    doc.entries[1].ceiling += entry;
    doc.entries[1].provenance = { commit: 'b' };
    doc.entries[2].ceiling += eager;
    return JSON.stringify(doc);
  };
  assert.equal(bundleRaiseOnly(BUNDLE, raise(2048 + 1000, 10240)), null);
  assert.match(bundleRaiseOnly(BUNDLE, raise(2048 + 1001, 0)), /viewer-entry-js-bytes rises by 3049 B/);
  assert.match(bundleRaiseOnly(BUNDLE, raise(0, 10240 + 5001)), /viewer-eager-js-bytes/);
  const wasm = JSON.parse(BUNDLE);
  wasm.entries[0].ceiling = 200;
  assert.match(bundleRaiseOnly(BUNDLE, JSON.stringify(wasm)), /more than the viewer ceilings/);
  withRepo({ 'tests/perf-ratchets/bundle.json': BUNDLE }, { 'tests/perf-ratchets/bundle.json': raise(1000, 1000) }, (repo) => {
    assert.equal(classify(repo).mode, 'aim-only');
  });
});

test('related tests follow imports transitively, through @/ and relative paths', () => {
  const sources = new Map([
    ['apps/viewer/src/components/Hint.tsx', 'export const Hint = 1;'],
    ['apps/viewer/src/components/Panel.tsx', "import { Hint } from './Hint';"],
    ['apps/viewer/src/components/Panel.test.tsx', "import { Panel } from './Panel.js';"],
    ['apps/viewer/src/lib/other.test.ts', "import { Hint } from '@/components/Hint';"],
    ['apps/viewer/src/lib/lazy.test.ts', "const m = await import('../components/Panel');"],
    ['apps/viewer/src/lib/unrelated.test.ts', "import x from 'react';"],
  ]);
  assert.deepEqual(relatedTests(['apps/viewer/src/components/Hint.tsx'], sources), [
    'apps/viewer/src/components/Panel.test.tsx',
    'apps/viewer/src/lib/lazy.test.ts',
    'apps/viewer/src/lib/other.test.ts',
  ]);
});

test('past the cap the fast lane runs no related tests, and stays the fast lane', () => {
  const sources = new Map([[HINT, 'export const x = 1;']]);
  for (let i = 0; i <= MAX_RELATED_TESTS; i += 1) sources.set(`apps/viewer/src/t${i}.test.ts`, "import { x } from '@/components/Hint';");
  const changed = UPSTREAM.replace('if (hidden()) return null;', 'if (parked()) return null;');
  withRepo({ [HINT]: UPSTREAM }, { [HINT]: changed }, (repo) => {
    const result = classify({ ...repo, readViewerSources: () => sources });
    assert.equal(result.mode, 'fork-blocks');
    assert.deepEqual(result.relatedTests, []);
  });
});

test('an AIM module imported far and wide keeps the fast path, without its dependents', () => {
  const AIM = 'apps/viewer/src/aim/bridge.ts';
  const sources = new Map([[AIM, 'export const x = 1;'], ['apps/viewer/src/aim/bridge.test.ts', "import { x } from './bridge';"]]);
  for (let i = 0; i <= MAX_RELATED_TESTS; i += 1) sources.set(`apps/viewer/src/t${i}.test.ts`, "import { x } from '@/aim/bridge';");
  withRepo({ [AIM]: 'export const x = 0;\n' }, { [AIM]: 'export const x = 1;\n' }, (repo) => {
    assert.deepEqual(classify({ ...repo, readViewerSources: () => sources }), { mode: 'aim-only', reasons: [], outside: [], relatedTests: [] });
  });
  sources.delete(`apps/viewer/src/t${MAX_RELATED_TESTS}.test.ts`);
  withRepo({ [AIM]: 'export const x = 0;\n' }, { [AIM]: 'export const x = 1;\n' }, (repo) => {
    const result = classify({ ...repo, readViewerSources: () => sources });
    assert.equal(result.relatedTests.length, MAX_RELATED_TESTS);
    assert.ok(!result.relatedTests.includes('apps/viewer/src/aim/bridge.test.ts'), 'AIM unit tests run in their own step');
  });
});

test('the fast lane judges only the viewer JS bundle metrics', () => {
  const ceilings = viewerOnly(JSON.parse(BUNDLE), 'entries');
  assert.deepEqual(ceilings.entries.map((e) => e.id), ['viewer-entry-js-bytes', 'viewer-eager-js-bytes']);
  const measured = viewerOnly({ family: 'bundle', metrics: [{ id: 'engine-wasm-brotli' }, { id: 'viewer-entry-js-bytes' }] }, 'metrics');
  assert.deepEqual(measured, { family: 'bundle', metrics: [{ id: 'viewer-entry-js-bytes' }] });
});
