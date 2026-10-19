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

A PR that touches only the AIM layer (`apps/viewer/src/aim/`, `docs/architecture/evidence/aim-*`,
the AIM skills, `docs/FORK_MAINTENANCE.md`) runs the fast lane (D-098). Since D-103 so does a PR
whose other changes are edits **inside `AIM-FORK` blocks** of existing `apps/viewer/` files, plus
a pre-approved raise of the two viewer bundle ceilings. `scripts/check-aim-fork-only.mjs` decides;
run it before pushing to see which lane you get:

```bash
node scripts/check-aim-fork-only.mjs --base origin/main --head HEAD
```

The fast lane (`aim-fast.yml`, about 10-15 minutes) runs the AIM tests, source gates, viewer
typecheck, the viewer tests that import a changed file, and the viewer build with its JS bundle
ratchet; `test.yml` skips its heavy lanes, and a nightly full run on `main` catches the rest.
One line changed outside a block, a new upstream file, a package, a script or a workflow brings
back upstream's full CI (Rust, WASM, viewer shards, E2E, revert oracle: 30-60 minutes per run),
so wrap every upstream edit in a block (step 1). The fast lane does not run the revert oracle, so
step 4 stays mandatory; step 3 prepares the ceiling raise before the first push. Everything below
runs locally in a few minutes; do it **before the first push**. Rules and reasons:
`docs/FORK_MAINTENANCE.md` ("Fast CI for AIM pull requests", "Pre-approved raises for new AIM
features").

## 1. Where the code goes

- **First look for what exists (AIM D-098).** Search the store (`CameraCallbacks` and the
  slices), the SDK, `@ifc-lite/mcp`, the embed protocol and upstream UI actions for the
  function you need. Expose it through the bridge; do not write a new one. Maths the host can
  do (relative camera steps, filters over AIM data) stays in AIMviewer.
- New code in `apps/viewer/src/aim/`. Call upstream store / renderer / SDK functions,
  do not copy them. No edits in upstream files; when unavoidable, an `AIM-FORK`
  sentinel and a row in `FORK_MAINTENANCE.md`. To change an upstream line, replace it
  inside a new block (the old line goes, the new one sits between the markers); a
  changed line outside any block sends the PR to the full CI (D-103).
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
- `Claude review` findings labelled **minor** do not block the merge when CI is green
  (D-103): do not push only for them. Reply once, resolve the thread, list them under
  "Follow-up" in the PR body once CI has finished; they are fixed together in a later PR. A finding labelled
  **blocker (security)** is fixed in this PR. Details: `.claude/skills/steward/SKILL.md`.
- The PR merges into `main` with a merge commit; production deploys from `main`,
  so merging needs Samuel's consent.
