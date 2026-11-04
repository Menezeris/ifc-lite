<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM: PDF underlay raster in a Web Worker (turning an underlay on must not freeze the page)

After #225 the underlays start off, but turning one on in 3D still rasterized the page with pdf.js on the main thread. Now the page is drawn in a Web Worker (`underlayRaster.worker.ts`, pdf.js legacy build on an OffscreenCanvas, `transferToImageBitmap`); the main thread only uploads the texture. The client (`underlayRasterClient.ts`, lazy import from `useDrawingUnderlay`) sends one page at a time; when the worker cannot draw a page (an error, a pdf.js filter that needs the DOM), the same page is drawn by the previous main-thread path, and a crashed worker or a browser without OffscreenCanvas switches the worker off for the session. Calibration, opacity, the saved state (D-072, D-168) and the raster gate (#376) are unchanged.

## Where the time went (before)

CPU profile of the viewer frame while one underlay is turned on (production build, Playwright, swiftshader Vulkan, `AC20-FZK-Haus.ifc`, 14 calibrated underlays, each a 47 MB raster PDF of 20 x 14 = 280 JPEG tiles of 1024 px):

| Step | Main thread |
|---|---|
| PDF fetch and parse, JPEG decode | 0 (pdf.js worker) |
| `drawImage` of the 280 decoded tiles into the 4096 px canvas (pdf.js downscale) | 2.5 to 2.8 s |
| `copyExternalImageToTexture` + mip chain (`upsertPlane`) | 27 to 54 ms |

pdf.js slices the operator list into tasks, so the 2.8 s show up as many tasks of 50 to 140 ms in a row rather than one; the page stutters for the whole time. With a PDF of 512 px tiles the same step is 0.5 s.

## Measurement (before / after)

Same setup, one underlay turned on with `SET_UNDERLAYS_3D show:true` and one item, 30 s window:

| | #225 (`0322a175`) | this branch |
|---|---|---|
| pdf.js `drawImage` on the main thread | 2,544 / 2,759 ms | 0 ms (3 runs) |
| long tasks (> 50 ms) | 3 to 13, max 108 to 142 ms | 0 to 1, max 56 ms |
| longest gap of a 20 ms timer | 148 / 164 ms | 58 to 76 ms |
| PDF requests | 1 (Range) | 1 (Range) |

Raster fidelity (worker vs main thread, same page at 4096 px): the raster PDF is pixel identical; a vector PDF with text differs only in glyph edge antialiasing (2 % of pixels, glyphs drawn as paths because a worker has no `document.fonts`).

## Mutations

Each patch is written mutant to fixed (`git diff -R` of the mutated file); the oracle reverse-applies it. Every run ended `OBSERVED` (exit 0) with restoration verified, against base `origin/main`. The records are in `summary.json`.

| Patch | Mutation | Test that went red |
|---|---|---|
| `worker-error-no-fallback.patch` | a worker error is rethrown instead of drawing the page on the main thread | `underlayRasterClient.test.ts` |
| `unsupported-keeps-worker.patch` | a worker that reports `unsupported` keeps getting pages | `underlayRasterClient.test.ts` |
| `crash-keeps-worker.patch` | after a crash a new worker is started for every page | `underlayRasterClient.test.ts` |
| `parallel-jobs.patch` | pages go to the worker all at once, not one by one | `underlayRasterClient.test.ts` |
| `foreign-message-crashes.patch` | a pdf.js message on the worker port (no `id`) is treated as an answer | `underlayRasterClient.test.ts` |
| `stray-bitmap-leaks.patch` | a bitmap nobody waits for is not closed | `underlayRasterClient.test.ts` |
| `scale-ignores-texture-limit.patch` | the raster size ignores the device texture limit | `underlayRasterClient.test.ts` |

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only apps/viewer/src/aim/underlayRasterClient.ts \
  --test apps/viewer/src/aim/underlayRasterClient.test.ts \
  --mutation /tmp/mut/parallel-jobs.patch --ci --json
```

Copy the patches outside the tree first.
