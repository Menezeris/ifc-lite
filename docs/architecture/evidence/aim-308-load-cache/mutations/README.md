<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM #308 parsed-model cache for the AIM autoload: surgical mutation evidence

The change gives a federated add an opt-in persisted cache (`ModelLoadOptions.federatedCache`, `hooks/federatedCacheHit.ts`, AIM-FORK blocks in `useIfcLoader.ts`, `useIfcCache.ts`, `services/ifc-cache.ts`), and the AIM `?models=` autoload (`aim/autoloadModels.ts`) uses it with a 1 MiB floor, a stable `lastModified` (`aim/modelFile.ts`), concurrent downloads, per-model `LOAD_PROGRESS` / `FIRST_GEOMETRY` for the host, and pruning of old revisions (`aim/cachePrune.ts`). The changed tests import exports that do not exist on the base, so reverting production makes them fail to load and the CI revert oracle (`Changed tests observe production`) reports INCONCLUSIVE. Each main decision was instead checked with a surgical mutation.

Each patch is written mutant->fixed (the orientation of `git diff base...head`); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The full records are in `summary.json`.

| Patch | Module | Mutation | Test that went red |
|---|---|---|---|
| `federated-read-gate-closed.patch` | `useIfcLoader.ts` | an opted-in federated add does not read the cache | `useIfcLoader.federatedCache.real-ifc.test.tsx` |
| `federated-write-dropped.patch` | `useIfcLoader.ts` | an opted-in federated add does not write the cache | same |
| `federated-hash-unchecked.patch` | `useIfcLoader.ts` | a federated hit is served without the full-hash check | same |
| `federated-min-size-ignored.patch` | `useIfcLoader.ts` | the `minSize` floor is ignored (10 MiB default) | same |
| `federated-hit-into-active-slot.patch` | `useIfcCache.ts` | a federated hit decodes into the active slot | same |
| `rtc-origin-not-in-key.patch` | `federatedCacheHit.ts` | the shared RTC origin is not part of the key | `federatedCacheHit.test.ts` |
| `hash-mismatch-served.patch` | `federatedCacheHit.ts` | a different full hash still serves | same |
| `instanced-maps-dropped.patch` | `federatedCacheHit.ts` | the instancing-only maps do not reach the published model | same |
| `instanced-maps-not-stored.patch` | `services/ifc-cache.ts` | the instancing-only maps are not stored beside the entry | same |
| `mtime-now.patch` | `aim/modelFile.ts` | no header and no revision: `lastModified` is the current time | `aim/modelFile.test.ts` |
| `mtime-not-on-file.patch` | `aim/modelFile.ts` | the unpacked `File` does not carry `lastModified` | same |
| `downloads-sequential.patch` | `aim/autoloadModels.ts` | each download starts only after the previous model is parsed | `aim/autoloadModels.test.ts` |
| `cache-floor-default.patch` | `aim/autoloadModels.ts` | the AIM floor is the 10 MiB default (VZT is not cached) | same |
| `first-geometry-unregistered.patch` | `aim/autoloadModels.ts` | `FIRST_GEOMETRY` is sent for a model that did not register | same |
| `throttle-off.patch` | `aim/autoloadModels.ts` | every percent change is posted | same |
| `prune-keeps-no-other-revision.patch` | `aim/cachePrune.ts` | the newest other revision is pruned too | `aim/cachePrune.test.ts` |
| `prune-ignores-file-name.patch` | `aim/cachePrune.ts` | entries of other models are pruned | same |

The wiring in `useModelUrlAutoload.ts` (store progress subscription, error card, `AUTOLOAD_COMPLETE_EVENT` in `finally`) has no unit test; it was verified live: the production build of the branch embedded by a host page on another origin, `?models=` with gzip archives of `BURKWIL_DX_B.ifc` and `AC20-FZK-Haus.ifc` carrying `Last-Modified`, Playwright on Chromium (SwiftShader WebGPU). The host received `LOAD_PROGRESS` for both models from the start (before `READY`), `FIRST_GEOMETRY` for the first model, then `MODELS_LOADED`; a reload was served from the cache (about 33 s -> 4 s to `MODELS_LOADED`) with the same element count (3.2K).

## Replay

Use a clean checkout of the branch with dependencies installed and `pnpm fixtures` run (the loader test reads `tests/models/ara3d/AC20-FZK-Haus.ifc`) and the WASM runtime in `packages/wasm/pkg`. Copy the patches outside the tree, because the oracle refuses a dirty tree. Then run, for example:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/hooks/useIfcLoader.ts \
  --test apps/viewer/src/hooks/useIfcLoader.federatedCache.real-ifc.test.tsx \
  --mutation /tmp/aim308-mut/federated-hash-unchecked.patch --ci --json
```

`--only` is the module in the table, `--test` the test that went red.
