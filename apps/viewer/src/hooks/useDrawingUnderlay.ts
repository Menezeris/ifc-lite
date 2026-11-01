/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sync georeferenced drawing underlays (D-072 in the AIM repo) from the
 * store into the renderer.
 *
 * Store = metadata (drawingUnderlaySlice); GPU = a single PdfPlanePipeline
 * registered as an external overlay on the renderer. This hook owns the
 * pipeline's lifecycle: create on first calibrated drawing, upsert planes as
 * placements change (rasterizing pages via pdf.js on demand), destroy on
 * unmount / renderer swap. Mirrors the pointCloudSlice / usePointCloudSync
 * split.
 *
 * World frame: placements store IFC model metres; the recentering offset of
 * the federation's coordinate frame is read from the first loaded model's
 * `coordinateInfo` (after federation alignment every model shares the
 * anchor's frame — see hooks/ingest/federationAlign.ts).
 */

import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Renderer } from '@ifc-lite/renderer';
import {
  createDrawingPlacement,
  PdfPlanePipeline,
  placementWorldCorners,
  similarityFromAnchor,
  solveSimilarityFromCalibration,
  type DrawingPlacement,
} from '@ifc-lite/drawing-underlay';
import { useViewerStore } from '@/store';
import { totalYupOffset } from '@/lib/geo/coordinate-frame';
import { openPdfDocument, rasterizePdfPage } from '@/lib/pdf/rasterize';
// >>> AIM-FORK: PDF underlays on/off in 3D from the AIM host and the panel switch (D-133 addendum)
import { useAimUnderlays3d, underlaysHiddenIn3d, skipUnderlayRaster } from '@/aim/aimUnderlays3d';
import { underlayIn3d } from '@/aim/underlaysPlan';
import { aimHorizontalCutZ } from '@/aim/underlayCutZ';
import { underlaysVisibleAtCut } from '@/aim/underlayAtCut';
// One rasterization per underlay, kept across cut changes (AIMviewer #376)
import { UnderlayRasterGate } from '@/aim/underlayRasterGate';
import { isSectionPlacement, SECTION_BACK_OPACITY } from '@ifc-lite/drawing-underlay';
// <<< AIM-FORK

export const UNDERLAY_OVERLAY_ID = 'drawing-underlay';

/** Longest raster edge in device pixels. High enough for A0 line drawings
 *  under moderate zoom; mip chain covers minification. Re-raster-on-zoom is
 *  a later refinement (D-072 post-MVP). */
const RASTER_TARGET_PX = 4096;

export interface UseDrawingUnderlayParams {
  rendererRef: MutableRefObject<Renderer | null>;
  isInitialized: boolean;
  // >>> AIM-FORK: page raster source, pdf.js by default; a test passes its own (AIMviewer #376)
  rasterize?: RasterizeUnderlayPage;
  // <<< AIM-FORK
}
// >>> AIM-FORK: the pdf.js raster of one page as its own function, so the sync can be driven in a test (AIMviewer #376)
/** Rasterize one PDF page for the GPU; the caller closes the bitmap. */
export type RasterizeUnderlayPage = (pdfUrl: string, page: number, maxTextureDimension: number) => Promise<ImageBitmap>;

const rasterizeWithPdfjs: RasterizeUnderlayPage = async (pdfUrl, page, maxTextureDimension) => {
  const doc = await openPdfDocument(pdfUrl);
  try {
    return (await rasterizePdfPage(doc, page, RASTER_TARGET_PX, maxTextureDimension)).image;
  } finally {
    void doc.loadingTask.destroy();
  }
};
// <<< AIM-FORK

/** Signature of the parts of a placement that force a texture re-upload. */
function textureKey(drawingId: string, pdfUrl: string, page: number): string {
  return `${drawingId}|${pdfUrl}|${page}`;
}

/** Placement geometry/presentation signature — cheap change detection. */
function placementKey(p: DrawingPlacement): string {
  // >>> AIM-FORK: the plane and region of a section underlay move it too (AIM #284)
  return `${p.storeyZ}|${p.affine.join(',')}|${p.pageSize.join(',')}|${p.opacity}|${p.visible}|${JSON.stringify(p.plane ?? null)}|${JSON.stringify(p.region ?? null)}`;
  // <<< AIM-FORK
}

/** One plane to render: a saved placement or the live calibration ghost. */
interface RenderEntry {
  /** Plane id — the drawing id, or `preview:` + drawing id for the ghost. */
  id: string;
  pdfUrl: string;
  name: string;
  placement: DrawingPlacement;
}

/** Ghost preview opacity while calibrating (before Save). */
const PREVIEW_OPACITY = 0.45;

// >>> AIM-FORK: injectable page raster (AIMviewer #376)
export function useDrawingUnderlay({ rendererRef, isInitialized, rasterize = rasterizeWithPdfjs }: UseDrawingUnderlayParams): void {
// <<< AIM-FORK
  const drawings = useViewerStore((s) => s.underlayDrawings);
  const models = useViewerStore((s) => s.models);
  const calibration = useViewerStore((s) => s.underlayCalibration);
  const underlayCut = useViewerStore((s) => s.underlayCut);
  // >>> AIM-FORK: hide saved underlays in the 3D canvas only (viewer state, not `_georef.visible`)
  const aimHidden = useAimUnderlays3d((s) => s.hidden);
  const aimViewLocked = useViewerStore((s) => s.underlayViewLocked);
  const aimHide3d = underlaysHiddenIn3d({ hidden: aimHidden, viewLocked: aimViewLocked });
  // Per-underlay 3D overrides from the chat or a saved view (AIM #323, #325); the locked plan view (2D) ignores them
  const aimOverrides = useAimUnderlays3d((s) => s.overrides);
  // A horizontal cut draws only the underlay of the storey below it (D-161); `aimCutZ` is its IFC height
  const aimCutZ = useViewerStore((s) => aimHorizontalCutZ(s));
  const aimCutFlipped = useViewerStore((s) => s.sectionPlane.flipped);
  // <<< AIM-FORK

  const pipelineRef = useRef<PdfPlanePipeline | null>(null);
  /** drawingId → texture signature of the raster currently on the GPU. */
  const uploadedTexturesRef = useRef(new Map<string, string>());
  /** drawingId → placement signature last applied. */
  const appliedPlacementsRef = useRef(new Map<string, string>());
  // >>> AIM-FORK: a cut change neither drops nor restarts a rasterization still wanted (AIMviewer #376)
  /** drawingId -> texture signature being rasterized right now. */
  const rasterGateRef = useRef(new UnderlayRasterGate());
  /** drawingId -> entry of the latest sync and the frame offset: an async raster lands with these, not with its stale closure. */
  const latestRef = useRef({ entries: new Map<string, RenderEntry>(), offset: totalYupOffset(undefined) });
  // <<< AIM-FORK

  useEffect(() => {
    if (!isInitialized) return;
    const renderer = rendererRef.current;
    if (!renderer) return;

    // >>> AIM-FORK: no sync token; `rasterGateRef` decides which raster still lands (AIMviewer #376)
    // <<< AIM-FORK
    // >>> AIM-FORK: placement copy with the 3D overrides and `visible: false` while the underlays are off in 3D
    const aimEntries: RenderEntry[] = [...drawings.values()]
      .filter((d) => d.placement !== null)
      .map((d) => ({ id: d.id, pdfUrl: d.pdfUrl, name: d.name, placement: underlayIn3d(d.placement!, aimViewLocked ? undefined : aimOverrides[d.id], aimHide3d) }));
    // Not while calibrating or under the drawing-view cut, which have their own storey (D-072); a section only without a horizontal cut (AIM #284)
    const entries: RenderEntry[] = calibration !== null || underlayCut !== null ? aimEntries : underlaysVisibleAtCut(aimEntries, aimCutZ, aimCutFlipped);
    // <<< AIM-FORK

    // Live ghost preview (Dalux-style "combined view"): once the mode's
    // point pairs are picked, the drawing shows up immediately as a
    // translucent plane so the fit can be judged BEFORE saving — in
    // one-point mode it also re-fits live as scale/rotation are typed.
    // Degenerate picks (coincident points) simply produce no ghost.
    const needPairs = calibration?.mode === 'one-point' ? 1 : 2;
    if (
      calibration &&
      calibration.pageSize &&
      calibration.pagePoints.length === needPairs &&
      calibration.modelPoints.length === needPairs
    ) {
      const drawing = drawings.get(calibration.drawingId);
      if (drawing) {
        try {
          const anchor = { page: calibration.pagePoints[0], model: calibration.modelPoints[0] };
          const affine =
            calibration.mode === 'one-point'
              ? // 1:N paper→model with 1 pt = 25.4/72 mm ⇒ metres per page pt.
                similarityFromAnchor(
                  anchor,
                  (calibration.oneScaleDen * 25.4) / 72000,
                  (calibration.oneRotationDeg * Math.PI) / 180,
                )
              : solveSimilarityFromCalibration([
                  anchor,
                  { page: calibration.pagePoints[1], model: calibration.modelPoints[1] },
                ]);
          entries.push({
            id: `preview:${drawing.id}`,
            pdfUrl: drawing.pdfUrl,
            name: drawing.name,
            placement: createDrawingPlacement({
              storeyGuid: calibration.storeyGuid,
              storeyZ: calibration.storeyZ,
              page: calibration.page,
              pageSize: calibration.pageSize,
              affine,
              calibration: [],
              opacity: PREVIEW_OPACITY,
            }),
          });
        } catch {
          // Coincident points — solver refuses; no ghost until picks differ.
        }
      }
    }

    // Nothing to render → tear the pipeline down entirely.
    if (entries.length === 0) {
      if (pipelineRef.current) {
        renderer.unregisterExternalOverlay(UNDERLAY_OVERLAY_ID);
        pipelineRef.current.destroy();
        pipelineRef.current = null;
        uploadedTexturesRef.current.clear();
        appliedPlacementsRef.current.clear();
        // >>> AIM-FORK: rasterizations for the destroyed pipeline are void (AIMviewer #376)
        rasterGateRef.current.clear();
        // <<< AIM-FORK
      }
      return;
    }

    const descriptor = renderer.getOverlayPassDescriptor();
    if (!descriptor) return; // renderer not ready yet; effect re-runs on init

    if (!pipelineRef.current) {
      pipelineRef.current = new PdfPlanePipeline(descriptor);
      renderer.registerExternalOverlay(UNDERLAY_OVERLAY_ID, pipelineRef.current);
    }
    const pipeline = pipelineRef.current;

    // Recentering offset of the shared (anchor) frame. Federation re-bakes
    // every model into the anchor's coordinateInfo, so the first model with
    // geometry is representative.
    const firstModel = [...models.values()].find((m) => m.geometryResult?.coordinateInfo);
    const offset = totalYupOffset(firstModel?.geometryResult?.coordinateInfo);
    // >>> AIM-FORK: what an in-flight raster applies when it lands (AIMviewer #376)
    latestRef.current = { entries: new Map(entries.map((e) => [e.id, e])), offset };
    // <<< AIM-FORK

    // Drop planes whose drawing disappeared, lost its placement, or whose
    // calibration ghost ended.
    const liveIds = new Set(entries.map((e) => e.id));
    for (const id of pipeline.planeIds()) {
      if (!liveIds.has(id)) {
        pipeline.removePlane(id);
        uploadedTexturesRef.current.delete(id);
        appliedPlacementsRef.current.delete(id);
      }
    }

    for (const drawing of entries) {
      const placement = drawing.placement;
      const texKey = textureKey(drawing.id, drawing.pdfUrl, placement.page);
      const posKey = placementKey(placement);
      const hasTexture = uploadedTexturesRef.current.get(drawing.id) === texKey;
      const upToDate = appliedPlacementsRef.current.get(drawing.id) === posKey;
      if (hasTexture && upToDate) continue;
      // >>> AIM-FORK: a hidden underlay is not fetched or rasterized until shown
      if (skipUnderlayRaster(placement, hasTexture)) continue;
      // <<< AIM-FORK

      const corners = placementWorldCorners(placement, offset);

      if (hasTexture) {
        // Geometry/presentation-only change — no rasterization needed.
        pipeline.upsertPlane(drawing.id, {
          corners,
          opacity: placement.opacity,
          visible: placement.visible,
          // >>> AIM-FORK: fainter back side of a section underlay (AIM #284)
          backOpacity: isSectionPlacement(placement) ? SECTION_BACK_OPACITY : 1,
          // <<< AIM-FORK
        });
        appliedPlacementsRef.current.set(drawing.id, posKey);
        renderer.requestRender();
        continue;
      }

      // >>> AIM-FORK: one raster per drawing and page; it lands with the latest placement unless superseded (AIMviewer #376)
      const gate = rasterGateRef.current;
      if (!gate.begin(drawing.id, texKey)) continue;
      void (async () => {
        let image: ImageBitmap | null = null;
        try {
          image = await rasterize(drawing.pdfUrl, placement.page, descriptor.device.limits.maxTextureDimension2D);
          const latest = latestRef.current.entries.get(drawing.id);
          if (!gate.settle(drawing.id, texKey) || pipelineRef.current !== pipeline || !latest
            || textureKey(latest.id, latest.pdfUrl, latest.placement.page) !== texKey) return;
          pipeline.upsertPlane(drawing.id, {
            corners: placementWorldCorners(latest.placement, latestRef.current.offset),
            image,
            opacity: latest.placement.opacity,
            visible: latest.placement.visible,
            backOpacity: isSectionPlacement(latest.placement) ? SECTION_BACK_OPACITY : 1,
          });
          uploadedTexturesRef.current.set(drawing.id, texKey);
          appliedPlacementsRef.current.set(drawing.id, placementKey(latest.placement));
          renderer.requestRender();
        } catch (err) {
          gate.fail(drawing.id, texKey);
          console.error(`drawing-underlay: failed to rasterize "${drawing.name}"`, err);
        } finally {
          image?.close(); // GPU copy done (or dropped); release the CPU-side bitmap
        }
      })();
      // <<< AIM-FORK
    }
  // >>> AIM-FORK: re-sync when the 3D switch or a per-underlay override changes
  }, [drawings, models, calibration, isInitialized, rendererRef, aimHide3d, aimOverrides, aimViewLocked, aimCutZ, aimCutFlipped, underlayCut, rasterize]);
  // <<< AIM-FORK

  // Depth-always (no z-fight) while a storey cut is active — a top-down floor
  // plan has nothing above the cut to occlude it; depth-tested + bigger lift
  // when viewing the full model in free 3D. Separate effect so it reacts to
  // cut toggles without re-running the (heavier) sync above.
  useEffect(() => {
    pipelineRef.current?.setOcclude(underlayCut === null);
    rendererRef.current?.requestRender();
  }, [underlayCut, rendererRef]);

  // Teardown on unmount / renderer swap.
  useEffect(() => {
    const renderer = rendererRef.current;
    return () => {
      // >>> AIM-FORK: in-flight rasterizations are void after unmount (AIMviewer #376)
      rasterGateRef.current.clear();
      // <<< AIM-FORK
      if (pipelineRef.current) {
        renderer?.unregisterExternalOverlay(UNDERLAY_OVERLAY_ID);
        pipelineRef.current.destroy();
        pipelineRef.current = null;
        uploadedTexturesRef.current.clear();
        appliedPlacementsRef.current.clear();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);
}
