#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lint: the lazy AIM issue-card files must not import `aimMultiSelect` (E2E
 * mobile-journey:174, AIMviewer#199 bod 2).
 *
 * `aimMultiSelect.js` is also used by the eager `visibility-commands.ts`. When
 * #190 imported it from the lazy issue card, the bundler turned it into a
 * separate chunk with a top-level await that the entry imports, which changed
 * the initialisation order and a tap in 3D stopped selecting the element. The
 * card selects through store actions instead.
 *
 * An absence claim over a list of files, so a lint and not a unit test (the
 * same reasoning as check-unbounded-frame-wait.mjs, #2434).
 *
 * Run via `node scripts/check-aim-doc-lazy-imports.mjs` (CI Node guards job).
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'apps/viewer/src/aim/docEntitiesScene.ts',
  'apps/viewer/src/aim/docIssues.ts',
  'apps/viewer/src/aim/AimDocumentEntities.tsx',
  'apps/viewer/src/aim/AimDocumentIssue.tsx',
  'apps/viewer/src/aim/docIssueDraw.ts',
];

/**
 * Lazy-chunk hygiene (E2E mobile-journey:174). Two rules:
 *  1. none of FILES may mention `aimMultiSelect` in any import form (static, side-effect,
 *     dynamic, re-export), see above;
 *  2. the files that live in the pencil-window chunk (EAGER_SIDE) may import
 *     `docEntitiesScene`, `AimDocumentEntities` and `useBCF` only dynamically
 *     (`import('...')` / React.lazy). A static import pulls `useBCF` and the store helpers
 *     shared with the eager graph into that chunk and changes the bundler's chunk split
 *     and initialisation order, after which the tap in 3D stopped selecting.
 *  3. the ribbon files that are in the entry chunk (ICDD_EAGER: DocumentsRibbonTab.tsx, RibbonToolbar.tsx)
 *     may not import `AimIcddRibbonGroup` or `AimIcddDialog` with a value import: the ribbon group
 *     is loaded with React.lazy and the dialog lives in the lazy AimBridge chunk (D-181). A
 *     type-only import (`import type`) is erased by the compiler and stays allowed.
 *
 * The scan runs over the WHOLE text of a file (comments removed), not line by line, because a
 * formatter wraps long imports (`import {\n  a,\n  b,\n} from '...'`) and a per-line pattern
 * then matches nothing while the gate still prints "0 violations". Every run first proves the
 * detectors fire on known-bad samples and stay quiet on known-good ones (self-check below).
 */

/** Source without comments, so a comment that talks about an import is not an import. */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, (m) => ' '.repeat(m.length));

/**
 * Module specifiers that are STATICALLY loaded: `import x from 's'` / `import {..} from 's'` /
 * `export {..} from 's'` / `export * from 's'` (any number of lines, `import type` included) and
 * the side-effect form `import 's'`. `import('s')` and `lazy(() => import('s'))` are not listed.
 * `typeOnly` marks `import type ...` / `export type ... from`, which the compiler erases.
 */
function staticSpecifiers(text) {
  const src = stripComments(text);
  const found = [];
  const re = /(?:\b(?:import|export)\b(?:[^'";()]|\([^)]*\))*?\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\1/g;
  for (const m of src.matchAll(re)) found.push({ spec: m[2], index: m.index, typeOnly: /^(?:import|export)\s+type\b/.test(m[0]) });
  return found;
}

/** Any string literal naming aimMultiSelect (static or dynamic import, re-export, require). */
function aimMultiSelectMentions(text) {
  const src = stripComments(text);
  return [...src.matchAll(/(['"])[^'"\n]*aimMultiSelect[^'"\n]*\1/g)].map((m) => ({ spec: m[0], index: m.index }));
}

const STATIC_ONLY_FORBIDDEN = [
  { name: 'docEntitiesScene', test: (spec) => /docEntitiesScene/.test(spec) },
  { name: 'AimDocumentEntities', test: (spec) => /AimDocumentEntities/.test(spec) },
  { name: 'useBCF', test: (spec) => /hooks\/useBCF/.test(spec) },
];
const ICDD_VALUE_FORBIDDEN = [
  { name: 'AimIcddRibbonGroup', test: (spec) => /AimIcddRibbonGroup/.test(spec) },
  { name: 'AimIcddDialog', test: (spec) => /AimIcddDialog/.test(spec) },
];
/** Static imports of the given rules; with `allowType`, type-only imports (erased) do not count. */
const staticViolations = (text, rules = STATIC_ONLY_FORBIDDEN, allowType = false) =>
  staticSpecifiers(text)
    .filter(({ typeOnly }) => !(allowType && typeOnly))
    .flatMap(({ spec, index }) => rules.filter((f) => f.test(spec)).map((f) => ({ name: f.name, index })));
const icddViolations = (text) => staticViolations(text, ICDD_VALUE_FORBIDDEN, true);

// Files that must reach the entities scene only lazily. AimDocumentEntities.tsx and
// docEntitiesScene.ts themselves are the lazy chunk and may import it.
const EAGER_SIDE = [
  'apps/viewer/src/aim/docIssues.ts',
  'apps/viewer/src/aim/docIssueDraw.ts',
  'apps/viewer/src/aim/AimDocumentIssue.tsx',
  'apps/viewer/src/components/documents/DocumentPane.tsx',
];

// Ribbon files in the entry chunk: the ICDD group and dialog only lazily (type-only imports are fine).
const ICDD_EAGER = [
  'apps/viewer/src/aim/DocumentsRibbonTab.tsx',
  'apps/viewer/src/components/viewer/ribbon/RibbonToolbar.tsx',
];

// Self-check: the detectors must flag these and must not flag the good ones. A regex that
// silently stops matching (the failure this gate exists to prevent) breaks the check itself.
const BAD = [
  ["import { a } from './docEntitiesScene.js';", 'docEntitiesScene'],
  ["import {\n  proposeEntities,\n  selectedGuids,\n} from './docEntitiesScene.js';", 'docEntitiesScene'],
  ["import type {\n  A,\n} from '../aim/docEntitiesScene';", 'docEntitiesScene'],
  ["export {\n  a,\n} from './AimDocumentEntities';", 'AimDocumentEntities'],
  ["export * from './docEntitiesScene.js';", 'docEntitiesScene'],
  ["import './docEntitiesScene.js';", 'docEntitiesScene'],
  ["import Default, {\n  a,\n} from '@/hooks/useBCF';", 'useBCF'],
  ["import { x } from '@/hooks/useBCF';", 'useBCF'],
];
const GOOD = [
  "const scene = await import('./docEntitiesScene.js');",
  "const E = lazy(() => import('./AimDocumentEntities').then((m) => ({ default: m.AimDocumentEntities })));",
  "// import { a } from './docEntitiesScene.js';\nconst x = 1;",
  "/* import {\n a,\n} from '@/hooks/useBCF'; */\nconst x = 1;",
  "import { y } from './docIssues.js';",
];
for (const [text, name] of BAD) {
  if (!staticViolations(text).some((v) => v.name === name)) {
    console.error(`check-aim-doc-lazy-imports: self-check failed, ${name} not detected in:\n${text}`);
    process.exit(2);
  }
}
for (const text of GOOD) {
  if (staticViolations(text).length) {
    console.error(`check-aim-doc-lazy-imports: self-check failed, false positive on:\n${text}`);
    process.exit(2);
  }
}
for (const text of ["import { a } from './aimMultiSelect.js';", "import {\n  a,\n} from './aimMultiSelect';", "const m = await import('./aimMultiSelect.js');", "export * from '../aim/aimMultiSelect.js';"]) {
  if (!aimMultiSelectMentions(text).length) {
    console.error(`check-aim-doc-lazy-imports: self-check failed, aimMultiSelect not detected in:\n${text}`);
    process.exit(2);
  }
}
if (aimMultiSelectMentions('// from ./aimMultiSelect.js, not used\nconst x = 1;').length) {
  console.error('check-aim-doc-lazy-imports: self-check failed, aimMultiSelect flagged in a comment');
  process.exit(2);
}

const ICDD_BAD = [
  ["import { AimIcddRibbonGroup } from './AimIcddRibbonGroup';", 'AimIcddRibbonGroup'],
  ["import {\n  AimIcddRibbonGroup,\n  type IcddRibbonUi,\n} from './AimIcddRibbonGroup';", 'AimIcddRibbonGroup'],
  ["import { AimIcddDialog } from '@/aim/AimIcddDialog.js';", 'AimIcddDialog'],
  ["export { AimIcddDialog } from './AimIcddDialog';", 'AimIcddDialog'],
  ["import './AimIcddRibbonGroup';", 'AimIcddRibbonGroup'],
];
const ICDD_GOOD = [
  "import type { IcddRibbonUi } from './AimIcddRibbonGroup';",
  "import type {\n  IcddRibbonUi,\n} from './AimIcddRibbonGroup';",
  "const G = lazy(() => import('./AimIcddRibbonGroup').then((m) => ({ default: m.AimIcddRibbonGroup })));",
  "// import { AimIcddDialog } from './AimIcddDialog';\nconst x = 1;",
  "import { requestIcddExport } from './aimIcddStore';",
];
for (const [text, name] of ICDD_BAD) {
  if (!icddViolations(text).some((v) => v.name === name)) {
    console.error(`check-aim-doc-lazy-imports: self-check failed, ${name} (ICDD) not detected in:\n${text}`);
    process.exit(2);
  }
}
for (const text of ICDD_GOOD) {
  if (icddViolations(text).length) {
    console.error(`check-aim-doc-lazy-imports: self-check failed, ICDD false positive on:\n${text}`);
    process.exit(2);
  }
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const violations = [];
for (const rel of FILES) {
  // Fail closed: a renamed file must break this check, not silently stop being scanned.
  const text = readFileSync(join(ROOT, rel), 'utf8');
  for (const { spec, index } of aimMultiSelectMentions(text)) violations.push(`${rel}:${lineOf(text, index)}: ${spec}`);
}
for (const rel of EAGER_SIDE) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  for (const { name, index } of staticViolations(text)) violations.push(`${rel}:${lineOf(text, index)}: static import of ${name}`);
}
for (const rel of ICDD_EAGER) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  for (const { name, index } of icddViolations(text)) violations.push(`${rel}:${lineOf(text, index)}: static value import of ${name} (lazy ICDD group / dialog)`);
}

if (violations.length > 0) {
  console.error('\nLazy AIM issue-card imports break the chunk split (E2E mobile-journey:174):\n');
  for (const v of violations) console.error(`  ${v}`);
  console.error(`
aimMultiSelect is shared with the eager visibility-commands.ts, so importing it
here makes a chunk with a top-level await that the entry waits for and breaks
tap selection; use the store actions (see docEntitiesScene.ts) instead.
docEntitiesScene / AimDocumentEntities / useBCF must be imported dynamically
from docIssues.ts, docIssueDraw.ts, AimDocumentIssue.tsx and DocumentPane.tsx
(import('...') or React.lazy), never with a static import.
AimIcddRibbonGroup and AimIcddDialog likewise must not be value-imported from
DocumentsRibbonTab.tsx or RibbonToolbar.tsx (import type is fine).
`);
  process.exit(1);
}

console.log(`check-aim-doc-lazy-imports: OK (${FILES.length + EAGER_SIDE.length + ICDD_EAGER.length} file checks, 0 violations)`);
