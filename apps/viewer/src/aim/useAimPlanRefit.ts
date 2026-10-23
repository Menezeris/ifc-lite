/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Napojenie `planRefit.ts` na viewer (AIM #211, od D-161 pre kalibračný pohľad zhora): sleduje veľkosť strednej plochy
 * (región `data-floating-snap-bounds`, ktorý sa mení s úchytkou stĺpca vlastností aj
 * hierarchie) a po ustálení zavolá `fitAll` upstreamu: priblíženie bez zmeny smeru
 * pohľadu. Nič nové nepočíta (D-098). Volá ho `useAimCenterPanes`.
 */

import { useEffect } from 'react';
import { useViewerStore } from '@/store';
import { createPlanRefit } from './planRefit.js';

const BOUNDS_SELECTOR = '[data-floating-snap-bounds]';

export function useAimPlanRefit(isMobile: boolean): void {
  useEffect(() => {
    if (isMobile || typeof ResizeObserver === 'undefined') return;
    const el = document.querySelector(BOUNDS_SELECTOR);
    if (!el) return;
    const refit = createPlanRefit({
      // Od D-161 je kolmý zamknutý pohľad len kalibrácia podkladu (D-072); pôdorys v záložke už nie je.
      context: () => {
        const s = useViewerStore.getState();
        const lockedTopDown = s.underlayViewLocked && s.projectionMode === 'orthographic';
        return { planInCanvas: lockedTopDown, lockedTopDown };
      },
      fit: () => useViewerStore.getState().cameraCallbacks.fitAll?.(),
    });
    const ro = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (box) refit.resized({ width: box.width, height: box.height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      refit.dispose();
    };
  }, [isMobile]);
}
