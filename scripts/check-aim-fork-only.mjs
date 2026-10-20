#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM-FORK (whole file, AIM D-103 and D-114, extends D-098): which CI a fork
 * pull request needs.
 *
 *   aim-only     every file is in the AIM layer (apps/viewer/src/aim/, the
 *                aim-fork i18n catalogue, AIM evidence, the AIM skills,
 *                docs/FORK_MAINTENANCE.md).
 *   fork-blocks  the rest of the diff only edits lines INSIDE `AIM-FORK`
 *                blocks of existing viewer files (apps/viewer/**), checked hunk
 *                by hunk against the blocks of the new file, plus at most a
 *                pre-approved raise of the two viewer bundle ceilings.
 *   upstream     anything else in a feature PR (`outside` says where): a
 *                workflow, script, package, new upstream file, a line outside
 *                a block. Still the fast lane: since D-114 such a PR reaches
 *                `main` only inside a release batch.
 *   full         a release batch (`release/aim-*`), an upstream sync
 *                (`sync/upstream-*`) or a PR labelled `ci:full`.
 *
 * test.yml (job `changes`, step `aimonly`) turns its heavy lanes off for every
 * mode but `full`; aim-fast.yml then runs the AIM tests, the viewer typecheck
 * and build, the bundle ratchet and the viewer tests that import a changed
 * file. Both call this script on the same merge commit, so they agree.
 *
 *   node scripts/check-aim-fork-only.mjs --base <rev> --head <rev>
 *        [--head-ref <branch>] [--labels <a,b>] [--json] [--github-output]
 *   node scripts/check-aim-fork-only.mjs --viewer-ratchet <measured.json> --out-dir <dir>
 *        writes <dir>/measured.json and <dir>/ceilings/bundle.json with only the
 *        viewer JS metrics, for `perf-ratchet.mjs check --ceilings-dir`: the fast
 *        lane runs the npm WASM, so the engine-wasm metric is not its to judge.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainEntry } from './lib/is-main-entry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER_SRC = 'apps/viewer/src';

export const AIM_LAYER = /^(apps\/viewer\/src\/aim\/|apps\/viewer\/src\/i18n\/catalogues\/aim-fork\.|docs\/architecture\/evidence\/aim-|\.claude\/skills\/(aim-feature|steward|release-train)\/|docs\/FORK_MAINTENANCE\.md$)/;
/** Only viewer files may take the fork-blocks path: a block in a package, a
 *  script or a workflow reaches code the fast lane does not test. */
export const BLOCK_ELIGIBLE = /^apps\/viewer\//;
export const BUNDLE_RATCHET = 'tests/perf-ratchets/bundle.json';
/** Pre-approved raises (docs/FORK_MAINTENANCE.md, Samuel 2026-10-18). */
export const BUNDLE_RAISE_LIMITS = { 'viewer-entry-js-bytes': 2048, 'viewer-eager-js-bytes': 10240 };
/** Above this many related viewer test files the fast lane runs none of them. */
export const MAX_RELATED_TESTS = 40;
/** A release batch of several PRs (D-114): the one place the full CI runs. */
export const RELEASE_BRANCH = /^release\/aim-/;
/** A label that asks for the full CI on one PR (D-114). */
export const FULL_CI_LABEL = 'ci:full';

/**
 * The `AIM-FORK` blocks of a file as inclusive 1-based line ranges, markers
 * included. `>>> AIM-FORK` ... `<<< AIM-FORK` in any comment syntax, and the
 * one-line form `AIM-FORK (<ref>): next N lines`. Returns null when a block is
 * left open or closed twice: a broken bracket proves nothing.
 */
export function forkBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  const open = [];
  for (let i = 0; i < lines.length; i += 1) {
    const n = i + 1;
    const opens = lines[i].includes('>>> AIM-FORK');
    const closes = lines[i].includes('<<< AIM-FORK');
    // JSX opens and closes on one line: `{/* >>> AIM-FORK */}<X />{/* <<< AIM-FORK */}`.
    if (opens && closes) blocks.push([n, n]);
    else if (opens) open.push(n);
    else if (closes) {
      if (open.length === 0) return null;
      blocks.push([open.pop(), n]);
    } else {
      const m = /AIM-FORK \([^)]*\): next (\d+) lines?\b/.exec(lines[i]);
      if (m) blocks.push([n, n + Number(m[1])]);
    }
  }
  return open.length === 0 ? blocks : null;
}

/** Hunks of a `git diff -U0` for one file: removed old lines [a, a+b), added new lines [c, c+d). */
export function parseHunks(diffText) {
  const hunks = [];
  for (const m of diffText.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    hunks.push({ a: Number(m[1]), b: m[2] === undefined ? 1 : Number(m[2]), c: Number(m[3]), d: m[4] === undefined ? 1 : Number(m[4]) });
  }
  return hunks;
}

const within = (blocks, from, to) => blocks.some(([s, e]) => s <= from && to <= e);

/**
 * Is one hunk entirely inside fork code? Added lines must sit in a block of
 * the new file (that also covers upstream lines replaced inside a new block,
 * the documented way to change an upstream line). A pure deletion must leave
 * its gap inside a new block, or remove lines that all sat in an old block.
 */
export function hunkInsideBlocks(hunk, newBlocks, oldBlocks) {
  const { a, b, c, d } = hunk;
  if (d > 0) return within(newBlocks, c, c + d - 1);
  if (within(newBlocks, c, c + 1)) return true;
  return b > 0 && within(oldBlocks, a, a + b - 1);
}

/** A bundle.json change that only raises the viewer ceilings within the pre-approved limits. */
export function bundleRaiseOnly(oldText, newText) {
  let before;
  let after;
  try {
    before = JSON.parse(oldText);
    after = JSON.parse(newText);
  } catch {
    return 'not valid JSON';
  }
  const strip = (doc) => JSON.stringify({ ...doc, entries: (doc.entries ?? []).map((e) => (e.id in BUNDLE_RAISE_LIMITS ? { ...e, ceiling: 0, provenance: null } : e)) });
  if (strip(before) !== strip(after)) return 'changes more than the viewer ceilings and their provenance';
  for (const [id, limit] of Object.entries(BUNDLE_RAISE_LIMITS)) {
    const entry = before.entries.find((e) => e.id === id);
    const was = entry?.ceiling;
    const now = after.entries.find((e) => e.id === id)?.ceiling;
    if (!Number.isInteger(was) || !Number.isInteger(now)) return `${id} has no integer ceiling`;
    // The limit is over the MEASURED main, which may sit above the old ceiling
    // by its tolerance and still pass, so the ceiling may move by both.
    const slack = entry.tolerance?.kind === 'relative' ? Math.ceil(was * entry.tolerance.value) : 0;
    if (now - was > limit + slack) return `${id} rises by ${now - was} B, over the pre-approved ${limit} B + ${slack} B tolerance`;
  }
  return null;
}

/** A bundle measurement or ceilings document cut down to the viewer JS metrics. */
export function viewerOnly(doc, key) {
  return { ...doc, [key]: (doc[key] ?? []).filter((m) => m.id in BUNDLE_RAISE_LIMITS) };
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+|\bexport\s+\*\s+from\s*)['"]([^'"]+)['"]/gm;
const SOURCE = /\.(ts|tsx)$/;

/** Every .ts / .tsx path under `dir`, repo-relative with forward slashes. */
function listSources(root, dir) {
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const path = join(abs, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (SOURCE.test(entry.name)) out.push(relative(root, path).split('\\').join('/'));
    }
  };
  if (existsSync(join(root, dir))) walk(join(root, dir));
  return out;
}

/** Resolve an import specifier of `from` to a viewer source path, or null. */
export function resolveImport(spec, from, known) {
  let base;
  if (spec.startsWith('@/')) base = `${VIEWER_SRC}/${spec.slice(2)}`;
  else if (spec.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(from), spec));
  else return null;
  base = base.replace(/\.js$/, '');
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Viewer test files that import a changed file, directly or through other
 * viewer modules. `sources` maps each path to its text.
 */
export function relatedTests(changed, sources) {
  const known = new Set(sources.keys());
  const importers = new Map();
  for (const [path, text] of sources) {
    for (const m of text.matchAll(IMPORT)) {
      const target = resolveImport(m[1], path, known);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(path);
    }
  }
  const seen = new Set();
  const queue = changed.filter((p) => known.has(p));
  while (queue.length > 0) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    for (const next of importers.get(path) ?? []) queue.push(next);
  }
  return [...seen].filter((p) => /\.test\.tsx?$/.test(p)).sort();
}

/**
 * The decision, from what git says. `git` is (args) => stdout, so the tests
 * can hand in a fake repository.
 *
 * Since D-114 (release train) only a release batch, an upstream sync or the
 * `ci:full` label runs the full CI on a pull request. Every other PR gets the
 * fast lane: `aim-only` and `fork-blocks` as in D-103, `upstream` when it also
 * changes upstream code outside AIM-FORK blocks (`outside` lists where). Such a
 * PR reaches `main` only inside a `release/aim-*` batch, which runs everything.
 */
export function classify({ base, head, headRef = '', labels = [], git, readViewerSources }) {
  const reasons = [];
  if (/^sync\/upstream-/.test(headRef)) reasons.push(`${headRef}: an upstream sync always runs the full CI`);
  if (RELEASE_BRANCH.test(headRef)) reasons.push(`${headRef}: a release batch always runs the full CI`);
  if (labels.includes(FULL_CI_LABEL)) reasons.push(`label ${FULL_CI_LABEL}`);
  const status = git(['diff', '--name-status', '--no-renames', base, head]).split('\n').filter(Boolean)
    .map((line) => { const [code, path] = line.split('\t'); return { code, path }; });
  if (status.length === 0) reasons.push('the diff is empty');
  const outside = [];
  let blocks = false;
  for (const { code, path } of status) {
    if (AIM_LAYER.test(path)) continue;
    if (code !== 'M') { outside.push(`${path}: ${code === 'A' ? 'new' : code === 'D' ? 'deleted' : code} upstream file`); continue; }
    const oldText = git(['show', `${base}:${path}`]);
    const newText = git(['show', `${head}:${path}`]);
    if (path === BUNDLE_RATCHET) {
      const why = bundleRaiseOnly(oldText, newText);
      if (why) outside.push(`${path}: ${why}`);
      continue;
    }
    if (!BLOCK_ELIGIBLE.test(path)) { outside.push(`${path}: outside apps/viewer/`); continue; }
    const newBlocks = forkBlocks(newText);
    const oldBlocks = forkBlocks(oldText);
    if (!newBlocks || !oldBlocks) { outside.push(`${path}: unbalanced AIM-FORK markers`); continue; }
    const hunks = parseHunks(git(['diff', '-U0', base, head, '--', path])).filter((h) => !hunkInsideBlocks(h, newBlocks, oldBlocks));
    if (hunks.length > 0) outside.push(`${path}: ${hunks.length} change(s) outside AIM-FORK blocks, first at new line ${hunks[0].c}`);
    else blocks = true;
  }
  if (reasons.length > 0) return { mode: 'full', reasons, outside, relatedTests: [] };
  const sources = readViewerSources();
  const changed = status.filter(({ code }) => code !== 'D').map(({ path }) => path);
  // The AIM unit tests run in their own step of aim-fast.yml.
  const related = (paths) => relatedTests(paths, sources).filter((p) => !/^apps\/viewer\/src\/aim\/[^/]+\.test\.tsx?$/.test(p));
  // Edits in upstream files come first: an AIM module imported far and wide
  // (bridge-protocol.ts) would crowd them out. Past the cap the lane runs no
  // related tests; the release batch and the nightly run cover them.
  const upstream = related(changed.filter((p) => !AIM_LAYER.test(p)));
  const all = related(changed);
  const tests = all.length <= MAX_RELATED_TESTS ? all : upstream.length <= MAX_RELATED_TESTS ? upstream : [];
  const mode = outside.length > 0 ? 'upstream' : blocks ? 'fork-blocks' : 'aim-only';
  return { mode, reasons, outside, relatedTests: tests };
}

export function main(argv = process.argv.slice(2)) {
  const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  if (argv.includes('--viewer-ratchet')) {
    const out = resolve(arg('--out-dir'));
    mkdirSync(join(out, 'ceilings'), { recursive: true });
    const measured = viewerOnly(JSON.parse(readFileSync(resolve(arg('--viewer-ratchet')), 'utf8')), 'metrics');
    const ceilings = viewerOnly(JSON.parse(readFileSync(join(ROOT, BUNDLE_RATCHET), 'utf8')), 'entries');
    if (measured.metrics.length !== 2 || ceilings.entries.length !== 2) throw new Error('viewer bundle metrics missing from the measurement or the ceilings');
    writeFileSync(join(out, 'measured.json'), `${JSON.stringify(measured, null, 2)}\n`);
    writeFileSync(join(out, 'ceilings', 'bundle.json'), `${JSON.stringify(ceilings, null, 2)}\n`);
    return 0;
  }
  const base = arg('--base', 'HEAD~1');
  const head = arg('--head', 'HEAD');
  const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const readViewerSources = () => new Map(listSources(ROOT, VIEWER_SRC).map((p) => [p, readFileSync(join(ROOT, p), 'utf8')]));
  const labels = arg('--labels', '').split(',').map((l) => l.trim()).filter(Boolean);
  const result = classify({ base, head, headRef: arg('--head-ref', ''), labels, git, readViewerSources });
  if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`AIM fork CI mode: ${result.mode}`);
    for (const reason of result.reasons) console.log(`  full CI because ${reason}`);
    for (const where of result.outside) console.log(`  outside the AIM layer: ${where}`);
    if (result.mode !== 'full') console.log(`  related viewer tests: ${result.relatedTests.length}`);
  }
  if (argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    const tests = result.relatedTests.map((p) => p.replace(/^apps\/viewer\//, '')).join(' ');
    appendFileSync(process.env.GITHUB_OUTPUT, `mode=${result.mode}\nonly=${result.mode === 'full' ? 'false' : 'true'}\nrelated_tests=${tests}\n`);
  }
  return 0;
}

if (isMainEntry(import.meta.url)) process.exitCode = main();
