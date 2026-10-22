/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zvýraznené tlačidlo "Stiahnuť CSV" pri Exporte tabuľky zoznamu (AIM D-149, krok 2).
 * Chat export spustiť nemôže: stiahnutie bez kliku prehliadač v iframe nepustí (D-111).
 * Klik zavolá upstream export tabuľky (`handleExport`) s formátom z chatu.
 */

import { Download, X } from 'lucide-react';
import { EXPORT_LABELS, type ExportFormat } from '@/lib/lists/export';
import { useTranslation } from '@/i18n';

export function AimListExportCue({ format, onExport, onDismiss }: {
  format: ExportFormat; onExport(format: ExportFormat): void; onDismiss(): void;
}) {
  const { t } = useTranslation();
  return (
    <div data-testid="aim-list-export-cue" className="flex items-center gap-1 px-2 py-1.5 border-b">
      <button
        type="button"
        title={t('aimFork.listExport.hint')}
        onClick={() => onExport(format)}
        className="min-h-6 inline-flex items-center gap-1 rounded border border-primary bg-primary/10 px-2 text-2xs font-medium text-primary ring-2 ring-primary/40 animate-pulse hover:bg-primary/20"
      >
        <Download className="h-3.5 w-3.5" />
        {t('aimFork.listExport.action', { format: EXPORT_LABELS[format] })}
      </button>
      <button
        type="button"
        aria-label={t('aimFork.listExport.dismiss')}
        onClick={onDismiss}
        className="min-h-6 min-w-6 inline-flex items-center justify-center rounded hover:bg-muted"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
