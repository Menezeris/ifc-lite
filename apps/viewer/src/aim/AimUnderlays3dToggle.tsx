/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Prepínač "Show in 3D" pod panelom Underlays (AIM D-133 doplnok, #170): vypne alebo
 * zapne kreslenie PDF podkladov v 3D. Stav drží `aimUnderlays3d.ts`, ten istý ako
 * `SET_UNDERLAYS_3D` z chatu; kalibrácia ostáva uložená a pôdorys v 2D ostáva.
 */

import { useTranslation } from '@/i18n';
import { useAimUnderlays3d } from './aimUnderlays3d.js';

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
      </button>
      <span className="min-w-0 text-2xs text-muted-foreground">{t('aimFork.underlays3d.hint')}</span>
    </div>
  );
}
