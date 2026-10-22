/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useState, type RefObject } from 'react';
import { createBodyWidthSettler } from './docLayout.js';

/** Šírka posúvanej plochy PDF karty, ustálená proti kmitaniu od posuvníka (AIM #239, `docLayout.ts`). */
export function useAimDocBodyWidth(scrollRef: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const settler = createBodyWidthSettler();
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setWidth(settler.next(r.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef]);
  return width;
}
