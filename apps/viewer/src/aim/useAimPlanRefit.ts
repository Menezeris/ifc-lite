/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Napojenie `planRefit.ts` na viewer (AIM #211): sleduje veľkosť strednej plochy
 * (región `data-floating-snap-bounds`, ktorý sa mení s úchytkou stĺpca vlastností aj
 * hierarchie) a po ustálení zavolá `fitAll` upstreamu: priblíženie bez zmeny smeru
 * pohľadu. Nič nové nepočíta (D-098). Volá ho `useAimCenterPanes`.
 */

import { useEffect } from 'react';
import { useViewerStore } from '@/store';
import { createPlanRefit } from './planRefit.js';
import { useAimViewTabs } from './viewTabsStore.js';

const BOUNDS_SELECTOR = '[data-floating-snap-bounds]';

export function useAimPlanRefit(isMobile: boolean): void {
  useEffect(() => {
    if (isMobile || typeof ResizeObserver === 'undefined') return;
    const el = document.querySelector(BOUNDS_SELECTOR);
    if (!el) return;
    const refit = createPlanRefit({
      context: () => {
        const tabs = useAimViewTabs.getState();
        const scene = tabs.tabs.find((t) => t.id === tabs.sceneId);
        const s = useViewerStore.getState();
        return {
          planInCanvas: scene?.kind === 'plan',
          lockedTopDown: s.underlayViewLocked && s.projectionMode === 'orthographic',
        };
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
