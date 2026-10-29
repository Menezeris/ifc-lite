/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Prepínač "Show in 3D" pod panelom Underlays (AIM D-133 doplnok, #170): vypne alebo
 * zapne kreslenie PDF podkladov v 3D. Stav drží `aimUnderlays3d.ts`, ten istý ako
 * `SET_UNDERLAYS_3D` z chatu; kalibrácia ostáva uložená a pôdorys v 2D ostáva.
 * Keď sú podklady v 3D vypnuté (aj z chatu), panel to ukáže: stav prepínača (On / Off),
 * pás nad zoznamom a poznámka pri riadku, ktorého oko je zapnuté (#280). `viewLocked` (zamknutý
 * pôdorysný pohľad, 2D) dodá volajúci zo store: modul ho neimportuje, aby sa test zaobišiel bez WASM.
 */

import { useTranslation } from '@/i18n';
import { useAimUnderlays3d, underlaysHiddenIn3d } from './aimUnderlays3d.js';

/** Podklady sa teraz v 3D plátne naozaj nekreslia (vypnuté a nie zamknutý pôdorys). */
function useUnderlaysOffIn3d(viewLocked: boolean): boolean {
  const hidden = useAimUnderlays3d((s) => s.hidden);
  return underlaysHiddenIn3d({ hidden, viewLocked });
}

/** Pás nad zoznamom podkladov: podklady v 3D sú vypnuté, aj keď sú v riadkoch zapnuté. */
export function AimUnderlays3dOffBanner({ viewLocked }: { viewLocked: boolean }) {
  const { t } = useTranslation();
  const off = useUnderlaysOffIn3d(viewLocked);
  if (!off) return null;
  return (
    <div role="status" data-testid="aim-underlays-3d-off" className="shrink-0 border-b bg-amber-500/10 px-3 py-1.5 text-2xs text-amber-700 dark:text-amber-300">
      {t('aimFork.underlays3d.offNotice')}
    </div>
  );
}

/** Poznámka pri riadku podkladu, ktorý je zapnutý okom, ale v 3D sa nekreslí kvôli prepínaču. */
export function AimUnderlayRowNote({ visible, viewLocked }: { visible: boolean; viewLocked: boolean }) {
  const { t } = useTranslation();
  const off = useUnderlaysOffIn3d(viewLocked);
  if (!off || !visible) return null;
  return (
    <div data-testid="aim-underlay-row-off" className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
      {t('aimFork.underlays3d.rowNote')}
    </div>
  );
}

export function AimUnderlays3dToggle() {
  const { t } = useTranslation();
  const hidden = useAimUnderlays3d((s) => s.hidden);
  const setShown = useAimUnderlays3d((s) => s.setShown);
  return (
    <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2" data-testid="aim-underlays-3d">
      <button
        type="button"
        role="switch"
        aria-checked={!hidden}
        onClick={() => setShown(hidden)}
        className="flex min-h-6 shrink-0 items-center gap-1.5 rounded border px-2 text-2xs font-medium hover:bg-muted"
      >
        <span
          aria-hidden
          className={`size-2 rounded-full ${hidden ? 'border border-muted-foreground' : 'bg-primary'}`}
        />
        {t('aimFork.underlays3d.label')}
        <span data-testid="aim-underlays-3d-state" className="text-muted-foreground">
          {hidden ? t('aimFork.underlays3d.stateOff') : t('aimFork.underlays3d.stateOn')}
        </span>
      </button>
      <span className="min-w-0 text-2xs text-muted-foreground">{t('aimFork.underlays3d.hint')}</span>
    </div>
  );
}
