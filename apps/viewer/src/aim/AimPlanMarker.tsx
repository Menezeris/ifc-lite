/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bodka polohy a klin smeru pohľadu kamery na stránke kalibrovaného PDF (AIM D-161 bod 8, #282).
 * Montuje sa z bloku AIM-FORK v `PdfDocumentView.tsx` (`PdfPage`), takže funguje v záložke aj
 * v dlaždici. Kamera sa sleduje len pri zapnutom vypínači a len na strane, ktorú výkres kalibruje.
 */

import { useEffect, useMemo } from 'react';
import { useViewerStore } from '@/store';
import { totalYupOffset } from '@/lib/geo/coordinate-frame';
import { useCameraTickSubscription } from './useCameraTickSubscription';
import { useAimPlanPosition, reportPlanMarker } from './aimPlanPosition.js';
import { planMarker } from './planPosition.js';

export function AimPlanMarker({ docId, page }: { docId: string; page: number }) {
  const enabled = useAimPlanPosition((s) => s.enabled);
  const placement = useViewerStore((s) => s.underlayDrawings.get(docId)?.placement ?? null);
  const models = useViewerStore((s) => s.models);
  const getViewpoint = useViewerStore((s) => s.cameraCallbacks.getViewpoint);
  const active = enabled && !!placement && placement.page === page;
  const tick = useCameraTickSubscription(getViewpoint, active);
  const offset = useMemo(() => {
    const first = [...models.values()].find((m) => m.geometryResult?.coordinateInfo);
    return totalYupOffset(first?.geometryResult?.coordinateInfo);
  }, [models]);
  const marker = useMemo(() => {
    if (!active || !placement) return null;
    const vp = useViewerStore.getState().cameraCallbacks.getViewpoint?.();
    return vp ? planMarker(placement, offset, vp) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, placement, offset, tick]);
  useEffect(() => {
    reportPlanMarker(docId, page, marker);
    return () => reportPlanMarker(docId, page, null);
  }, [docId, page, marker]);
  if (!marker) return null;
  return (
    <span
      className="pointer-events-none absolute z-10"
      style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
      data-aim-plan-marker
      data-heading={Math.round(marker.angleDeg)}
    >
      <svg
        width="88"
        height="88"
        viewBox="-44 -44 88 88"
        className="absolute"
        style={{ left: '-44px', top: '-44px', transform: `rotate(${marker.angleDeg}deg)` }}
        aria-hidden
      >
        <path
          d="M 0 0 L -19 -38 A 42.5 42.5 0 0 1 19 -38 Z"
          fill="rgb(16 185 129 / 0.30)"
          stroke="rgb(16 185 129 / 0.55)"
          strokeWidth="1"
        />
      </svg>
      <span className="absolute -left-[7px] -top-[7px] block size-3.5 rounded-full border-2 border-background bg-emerald-500 shadow" />
    </span>
  );
}
