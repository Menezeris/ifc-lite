/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Nenápadná ponuka pri pokuse o orbit v zamknutom pôdoryse (AIM #188, D-132):
 * "Pôdorys je zamknutý pohľad zhora. Prepnúť do 3D? (Enter)". Tlačidlo, Enter
 * a medzerník aktivujú záložku 3D (existujúce `activate`, D-098), Esc ju zavrie.
 * Počúva okno bez záchytu ukazovateľa, ťah canvasu ostáva upstreamu. Vykreslí ho
 * `AimViewTabsBar` pod lištou.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { resolveNavigationPointerGesture } from '@/lib/navigation/presets.js';
import { useViewerStore } from '@/store';
import { useAimViewTabs } from './viewTabsStore.js';
import { activate } from './viewTabsApply.js';
import { inLockedPlan, OFFER_TIMEOUT_MS, offerKey, orbitAttempted, startPress, type Press } from './planOrbitHint.js';

const warn = (issue: string) => console.warn('[aim-tabs]', issue);

/** Plán je zamknutý pôdorys v záložke (stav z viewera, bez vlastnej kópie). */
function lockedPlan(): boolean {
  const s = useViewerStore.getState();
  const scene = useAimViewTabs.getState();
  return inLockedPlan({
    sceneKind: scene.tabs.find((t) => t.id === scene.sceneId)?.kind,
    viewLocked: s.underlayViewLocked,
    splitView: s.underlaySplitView,
  });
}

export function AimPlanOrbitHint() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const press = useRef<Press | null>(null);
  const setShown = (v: boolean) => { openRef.current = v; setOpen(v); };

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      press.current = null;
      if (!(e.target instanceof HTMLCanvasElement) || !lockedPlan()) return;
      const s = useViewerStore.getState();
      const gesture = resolveNavigationPointerGesture(s.navigationPreset, {
        tool: s.activeTool, button: e.button, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
        altKey: e.altKey, measureMode: s.measureMode, flyEnabled: s.interactionMode === 'all',
      });
      press.current = startPress(e.clientX, e.clientY, gesture);
    };
    const onMove = (e: PointerEvent) => {
      if (!orbitAttempted(press.current, e.clientX, e.clientY)) return;
      press.current = null;
      if (lockedPlan()) setShown(true);
    };
    const onUp = () => { press.current = null; };
    const onKey = (e: KeyboardEvent) => {
      if (!openRef.current) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const action = offerKey(e.key, el?.tagName ?? 'BODY', el?.isContentEditable === true);
      if (!action) return;
      setShown(false);
      if (action === 'accept') { e.preventDefault(); activate('3d', warn); }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // Ponuka zmizne sama, aj keď sa záložka alebo zámok zmenia inak (lišta, chat).
  const locked = useViewerStore((s) => s.underlayViewLocked);
  const onPlanTab = useAimViewTabs((s) => s.tabs.find((x) => x.id === s.sceneId)?.kind === 'plan');
  const stillPlan = locked && onPlanTab;
  useEffect(() => {
    if (!open) return;
    if (!stillPlan) return setShown(false);
    const id = window.setTimeout(() => setShown(false), OFFER_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [open, stillPlan]);

  if (!open) return null;
  return (
    <div
      role="status"
      data-testid="aim-plan-orbit-hint"
      className="absolute left-1/2 top-full z-30 mt-2 flex -translate-x-1/2 items-center gap-2 rounded-md border bg-background/95 px-2 py-1 text-2xs shadow-md"
    >
      <span>{t('aimFork.planOrbit.message')}</span>
      <button
        type="button"
        onClick={() => { setShown(false); activate('3d', warn); }}
        className="min-h-6 min-w-6 rounded border px-2 font-medium hover:bg-muted"
      >
        {t('aimFork.planOrbit.action')}
      </button>
    </div>
  );
}
