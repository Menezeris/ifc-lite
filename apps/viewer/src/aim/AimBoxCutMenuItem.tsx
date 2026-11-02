/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Box cut" v kontextovom menu prvku (AIM, ako v Daluxe): rezný box okolo
 * kliknutého prvku, pre miestnosť so skladbami podlahy, stropu a stien.
 */

import { Box } from 'lucide-react';
import { ContextMenuItem } from '@/components/ui/context-menu';
import { useTranslation } from '@/i18n';
import { toast } from '@/components/ui/toast';
import { addBoxCut } from './sectionBoxScene';

export function AimBoxCutMenuItem({ entityId }: { entityId: number }) {
  const { t } = useTranslation();
  // Radix closes the menu on select; only the failure needs a word.
  const run = () => {
    if (!addBoxCut([entityId])) toast.error(t('aimFork.boxCut.failed'));
  };
  return (
    <ContextMenuItem asChild>
      <button type="button" data-command-id="aim:box-cut" aria-label={t('aimFork.boxCut.label')}
        title={t('aimFork.boxCut.title')} onClick={run}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none focus:bg-muted">
        <Box className="h-4 w-4 text-muted-foreground" />
        <span className="min-w-0 flex-1">{t('aimFork.boxCut.label')}</span>
      </button>
    </ContextMenuItem>
  );
}
