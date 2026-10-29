/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Napojenie `orbitHintPlan.ts` na viewer (AIMviewer#188): vetva "posun namiesto orbitu" v `useMouseControls.ts`
 * (AIM-FORK) pošle udalosť `aim-orbit-attempt` s dĺžkou ťahania v px a tu sa ukáže nápoveda. Kým je orbit
 * zablokovaný, Enter alebo medzerník (mimo vstupov) prepne do 3D cez `exitDrawingView` (zámok a rez preč,
 * perspektíva; kalibrácia beží ďalej). Volá ho `useAimCenterPanes`.
 */

import { useEffect } from 'react';
import { useViewerStore } from '@/store';
import { toast } from '@/components/ui/toast';
import { ORBIT_HINT_TEXT, isSwitchTo3dKey, orbitBlocked, shouldShowOrbitHint } from './orbitHintPlan.js';

/** Názov udalosti, ktorú posiela vetva zámku v `useMouseControls.ts`. */
export const ORBIT_ATTEMPT_EVENT = 'aim-orbit-attempt';

const blockedNow = () => orbitBlocked(useViewerStore.getState());

export function useAimOrbitHint(exitDrawingView: () => void): void {
  useEffect(() => {
    let lastShownAt: number | null = null;
    const onAttempt = (e: Event) => {
      const now = Date.now();
      if (!shouldShowOrbitHint(blockedNow(), Number((e as CustomEvent<number>).detail) || 0, now, lastShownAt)) return;
      lastShownAt = now;
      toast.info(ORBIT_HINT_TEXT);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isSwitchTo3dKey(blockedNow(), e)) return;
      e.preventDefault();
      exitDrawingView();
    };
    window.addEventListener(ORBIT_ATTEMPT_EVENT, onAttempt);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(ORBIT_ATTEMPT_EVENT, onAttempt);
      window.removeEventListener('keydown', onKey);
    };
  }, [exitDrawingView]);
}
