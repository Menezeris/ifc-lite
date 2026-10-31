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

// static `import ... from '...aimMultiSelect...'`, side-effect `import '...'`,
// dynamic `import('...')` and `export ... from '...'`
const FORBIDDEN = /(?:\bfrom\s+|\bimport\s*\(?\s*)['"][^'"]*aimMultiSelect[^'"]*['"]/;

/**
 * Lazy-chunk hygiene (E2E mobile-journey:174). Two rules:
 *  1. none of FILES may import `aimMultiSelect` in any form (see above);
 *  2. the files that live in the pencil-window chunk (EAGER_SIDE) may import
 *     `docEntitiesScene`, `AimDocumentEntities` and `useBCF` only dynamically
 *     (`import('...')` / React.lazy). A static import pulls `useBCF` and the store helpers
 *     shared with the eager graph into that chunk and changes the bundler's chunk split
 *     and initialisation order, after which the tap in 3D stopped selecting.
 */
const STATIC_ONLY_FORBIDDEN = [
  { name: 'docEntitiesScene', re: /^\s*(?:import|export)\b[^;]*\bfrom\s+['"][^'"]*docEntitiesScene[^'"]*['"]/ },
  { name: 'AimDocumentEntities', re: /^\s*(?:import|export)\b[^;]*\bfrom\s+['"][^'"]*AimDocumentEntities[^'"]*['"]/ },
  { name: 'useBCF', re: /^\s*(?:import|export)\b[^;]*\bfrom\s+['"][^'"]*hooks\/useBCF[^'"]*['"]/ },
];
// Files that must reach the entities scene only lazily. AimDocumentEntities.tsx and
// docEntitiesScene.ts themselves are the lazy chunk and may import it.
const EAGER_SIDE = [
  'apps/viewer/src/aim/docIssues.ts',
  'apps/viewer/src/aim/docIssueDraw.ts',
  'apps/viewer/src/aim/AimDocumentIssue.tsx',
  'apps/viewer/src/components/documents/DocumentPane.tsx',
];

const violations = [];
for (const rel of FILES) {
  // Fail closed: a renamed file must break this check, not silently stop being scanned.
  const lines = readFileSync(join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (FORBIDDEN.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
}
for (const rel of EAGER_SIDE) {
  const lines = readFileSync(join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const { name, re } of STATIC_ONLY_FORBIDDEN) {
      if (re.test(line)) violations.push(`${rel}:${i + 1}: static import of ${name}: ${line.trim()}`);
    }
  });
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
`);
  process.exit(1);
}

console.log(`check-aim-doc-lazy-imports: OK (${FILES.length + EAGER_SIDE.length} file checks, 0 violations)`);
