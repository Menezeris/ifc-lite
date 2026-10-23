/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vypínač "Poloha" (AIM D-161 bod 8, #282): zapne alebo vypne bodku a smer kamery na PDF.
 * Ukáže sa len pri dokumente s kalibrovaným výkresom. Stav drží `aimPlanPosition.ts`,
 * ten istý ako `SET_PLAN_POSITION` z chatu.
 */

import { Crosshair } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useAimPlanPosition } from './aimPlanPosition.js';

export function AimPlanPositionToggle({ docId }: { docId: string }) {
  const { t } = useTranslation();
  const calibrated = useViewerStore((s) => !!s.underlayDrawings.get(docId)?.placement);
  const enabled = useAimPlanPosition((s) => s.enabled);
  const setEnabled = useAimPlanPosition((s) => s.setEnabled);
  if (!calibrated) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => setEnabled(!enabled)}
      title={t('aimFork.planPosition.hint')}
      className="mx-1 my-0.5 flex shrink-0 items-center gap-1 self-center rounded border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground aria-checked:text-foreground"
      data-aim-plan-position-toggle
    >
      <Crosshair className="size-3" aria-hidden />
      {t('aimFork.planPosition.label')}
    </button>
  );
}
