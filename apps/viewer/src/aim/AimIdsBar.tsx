/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lišta "Uložiť do AIM" nad IDS v paneli IDS Studio a v Data validation -> IDS validation (D-162). Ukazuje, či
 * IDS pochádza z AIM (kód, verzia, upravené), uloží ho ako novú verziu a v paneli validácie spustí beh, ktorý
 * si vyžiadal chat (`ids_document open run=true`, voliteľne len jedna špecifikácia). Načítava sa lenivo.
 */

import { useEffect } from 'react';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { findSpecification } from './aimIdsSpec.js';
import { useAimIds } from './aimIdsStore.js';
import { saveToAim, trackStudio } from './aimIds.js';
import type { IdsTarget } from './ids-protocol.js';

interface Props {
  target: IdsTarget;
  /** Panel validácie: beh nad načítaným IDS (id špecifikácie zúži beh na jednu). */
  runValidation?: (modelId?: string, specificationId?: string) => Promise<unknown>;
}

export default function AimIdsBar({ target, runValidation }: Props) {
  const { t } = useTranslation();
  const slot = useAimIds((s) => (target === 'studio' ? s.studio : s.validation));
  const status = useAimIds((s) => (s.status?.target === target ? s.status : null));
  const studioXml = useAimIds((s) => s.studioXml);
  const run = useAimIds((s) => (target === 'validation' ? s.run : null));
  const idsDocument = useViewerStore((s) => s.idsDocument);
  const studioDoc = useViewerStore((s) => s.idsStudioState?.doc);
  const hasModel = useViewerStore((s) => [...s.models.values()].some((m) => m.ifcDataStore != null));
  const entryId = useViewerStore((s) => s.validationDefinitions.active.ids);
  const entryXml = useViewerStore((s) => {
    const entry = s.validationDefinitions.entries.find((e) => e.id === s.validationDefinitions.active.ids);
    return entry?.kind === 'ids' ? entry.xml : undefined;
  });

  useEffect(() => {
    if (target === 'studio') void trackStudio();
  }, [target]);

  // Beh z chatu čaká na dokument a na model s dátami; spustí sa raz.
  useEffect(() => {
    if (!run || !runValidation || !idsDocument || !hasModel) return;
    useAimIds.setState({ run: null });
    const spec = run.spec ? findSpecification(idsDocument, run.spec) : undefined;
    if (run.spec && !spec) {
      useAimIds.setState({ status: { target, kind: 'error', error: t('aimFork.ids.specNotFound', { spec: run.spec }) } });
      return;
    }
    void runValidation(undefined, spec?.id);
  }, [run, runValidation, idsDocument, hasModel, target, t]);

  const linked = target === 'studio' ? !!slot?.code && slot.docId === studioDoc?.docId : !!slot?.code && slot.entryId === entryId;
  const dirty = linked && (target === 'studio' ? studioXml !== slot?.baseline : entryXml !== slot?.baseline);
  const hasContent = target === 'studio' ? !!studioDoc : !!idsDocument;
  const saving = status?.kind === 'saving';

  const statusText = (() => {
    switch (status?.kind) {
      case 'saving': return t('aimFork.ids.saving');
      case 'saved': return t('aimFork.ids.saved', { code: status.code ?? '', version: status.version ?? 0 });
      case 'conflict': return t('aimFork.ids.conflict', { latest: status.latest ?? 0 });
      case 'error': return t('aimFork.ids.error', { reason: status.error ?? '' });
      default: return linked ? t(dirty ? 'aimFork.ids.linkedEdited' : 'aimFork.ids.linked', { code: slot?.code ?? '', version: slot?.version ?? 0 }) : t('aimFork.ids.unlinked');
    }
  })();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1" data-testid={`aim-ids-bar-${target}`}>
      <button
        type="button"
        disabled={!hasContent || saving}
        onClick={() => void saveToAim(target)}
        className="min-h-6 shrink-0 rounded border px-2 text-2xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {t('aimFork.ids.save')}
      </button>
      <output className="min-w-0 break-words text-2xs text-muted-foreground">{statusText}</output>
    </div>
  );
}
