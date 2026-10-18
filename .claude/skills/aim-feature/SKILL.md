---
name: aim-feature
description: >-
  Checklist for adding or changing an AIM feature in this fork (code under
  apps/viewer/src/aim/, bridge messages for the AIM host, AIM-FORK wiring).
  Use before the first push of such a PR so CI passes on the first run: local
  checks, bundle perf-ratchet measurement and the pre-approved raise, revert
  oracle mutation evidence and the label, live check in an embedded viewer.
---

<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM feature in the fork: get CI green on the first run

The fork runs upstream's full CI (Rust, WASM, viewer shards, E2E, revert oracle,
perf ratchets). One red run costs 30-60 minutes. Everything below runs locally in
a few minutes; do it **before the first push**. Rules and reasons:
`docs/FORK_MAINTENANCE.md` (Conventions, "Pre-approved raises for new AIM features").

## 1. Where the code goes

- New code in `apps/viewer/src/aim/`. Call upstream store / renderer / SDK functions,
  do not copy them. No edits in upstream files; when unavoidable, an `AIM-FORK`
  sentinel and a row in `FORK_MAINTENANCE.md`.
- Anything not needed at boot: dynamic `import()` on first use. The lazy module must
  not import a module the entry imports (pass helpers in from the caller), or the
  bundler splits that module out and the entry grows anyway.
- Pure maths in its own small module with a unit test; store and renderer glue
  separately (verified live, step 5).

## 2. Fast local checks

```bash
cd apps/viewer && npx tsc --noEmit
npx tsx --import ./src/test/vite-module-hooks.mjs --test src/aim/<changed>.test.ts
cd ../.. && node scripts/check-rtc-frame-copies.mjs && node scripts/check-module-size.mjs
node scripts/check-i18n-literals.mjs && node scripts/check-test-glob-coverage.mjs
node scripts/check-unused-locals.mjs   # slow (~15 min): run in the background
```

## 3. Bundle perf ratchet (measure, do not guess)

Build the branch and `main` the same way and compare (CI measures exactly this; on
2026-10-18 the local and CI numbers matched to the byte):

```bash
S=$(mktemp -d)
(cd apps/viewer && npx vite build --outDir $S/branch)
git stash -u && git checkout origin/main -- apps/viewer/src/aim && (cd apps/viewer && npx vite build --outDir $S/main)
git checkout HEAD -- apps/viewer/src/aim && git stash pop    # restore the branch (delete files new on the branch first if checkout complains)
for d in branch main; do node scripts/perf-ratchet/measure-bundle.mjs --dist $S/$d --out $S/$d.json; done
node scripts/perf-ratchet/perf-ratchet.mjs check --measured $S/branch.json
```

Over the ceiling + tolerance: first make more of it lazy (step 1). If what is left is
within the pre-approved limits (entry ≤ 2 kB, eager ≤ 10 kB over `main`), raise the
ceiling in `tests/perf-ratchets/bundle.json` to the measured value in its own commit
(`perf(viewer): strop ... (predschválené, FORK_MAINTENANCE)`, numbers before / after,
provenance = the measured commit) and say so in one line of the PR body. Larger: ask.

## 4. Revert oracle (`Changed tests observe production`)

If the changed test imports exports that do not exist on `main` (new module or new
functions), reverting production makes the test fail to load: INCONCLUSIVE. Then, in
the first push:

1. For each main decision of the tested module, a surgical mutation patch written
   mutant -> fixed (`git diff -R` of the mutated file), checked with
   `node scripts/check-test-revert-oracle.mjs --base origin/main --only <file> --test <test> --mutation <patch> --ci --json`
   (copy the patches outside the tree; the oracle refuses a dirty tree). Every one must
   end `OBSERVED` with restoration verified.
2. Patches + `README.md` + `summary.json` in `docs/architecture/evidence/<feature>/mutations/`
   (template: `docs/architecture/evidence/aim-d085-view-queries/`).
3. Add the `revert-oracle-exempt` label **when opening the PR**: the oracle reads the
   label at the start of a run, so adding it later needs a new run.

## 5. Live check in an embedded viewer

The AIM bridge is active only inside an iframe. Serve a host page that embeds
`http://localhost:3000/` and posts bridge messages; start the viewer with
`VITE_AIM_MODEL_ORIGINS=<model origin> npx vite --port 3000` when it should autoload
models from another origin. Drive it with Playwright
(`executablePath: '/opt/pw-browsers/chromium'`, `--enable-unsafe-webgpu
--use-angle=swiftshader`). Test model with stairs and storeys:
`tests/models/ara3d/AC20-FZK-Haus.ifc`. A message sent with the deep link arrives with
`MODELS_LOADED`, before geometry has streamed: anything that needs element bounds must
wait or retry.

## 6. While CI runs

- Do not edit the PR body or title while CI runs: `test.yml` replays the recorded
  verdict on `edited` events and that replay can turn a check red.
- The PR merges into `main` with a merge commit; production deploys from `main`,
  so merging needs Samuel's consent.
