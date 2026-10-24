/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Otvoriť v novej dlaždici" na karte pohľadu v páse Presentation (AIM D-161, krok Fork B). Karta
 * (upstream) ho len vloží; vykonanie je v lenivom `viewTabsApply.ts`, takže vstupný balík nenarastie.
 */

import { PanelRight } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';

export function AimOpenViewInTile({ viewId, className }: { viewId: string; className?: string }) {
  const { t } = useTranslation();
  const isMobile = useViewerStore((s) => s.isMobile);
  if (isMobile) return null;
  return (
    <IconButton
      type="button"
      variant="secondary"
      size="icon-xs"
      className={className}
      label={t('aimFork.views.openInNewTile')}
      onClick={(e) => {
        e.stopPropagation();
        void import('./viewTabsApply.js').then((m) => m.openViewInNewTile(viewId, (issue) => console.warn('[aim-tabs]', issue)));
      }}
    >
      <PanelRight className="h-3 w-3" />
    </IconButton>
  );
}
