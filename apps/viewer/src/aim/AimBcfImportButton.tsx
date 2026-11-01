/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tlačidlo "Importovať do AIM" v BCF paneli: vyberie .bcfzip, hostu pošle najprv `dry_run` a ukáže súhrn,
 * zápis do DB AIM sa spustí až tlačidlom "Zapísať". Načítava sa lenivo (`AimBcfImportLazy`) a len v embede AIM.
 */

import { useCallback, useRef, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n';
import { sendBcfImport, type BcfImportOutcome } from './aimBcfImport.js';
import type { BcfImportSummary } from './bcf-import-protocol.js';

type Pending = { file: File; summary: BcfImportSummary };

export default function AimBcfImportButton() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const fail = useCallback((out: Exclude<BcfImportOutcome, { kind: 'done' }>) => {
    toast.error(out.kind === 'invalid' ? t(`aimFork.bcfImport.invalid.${out.reason}`) : t('aimFork.bcfImport.error', { reason: out.error }));
  }, [t]);

  const run = useCallback(async (file: File, dryRun: boolean) => {
    setBusy(true);
    try {
      const out = await sendBcfImport(file, dryRun);
      if (out.kind !== 'done') { setPending(null); return fail(out); }
      const s = out.summary;
      if (dryRun) { setPending({ file, summary: s }); return; }
      setPending(null);
      toast.success(t('aimFork.bcfImport.done', { created: s.created, updated: s.updated, unchanged: s.unchanged, conflicts: s.conflicts, failed: s.failed }));
      if (s.warnings.length) toast.error(t('aimFork.bcfImport.warnings', { count: s.warnings.length, first: s.warnings[0] ?? '' }));
    } finally {
      setBusy(false);
    }
  }, [fail, t]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void run(file, true);
  }, [run]);

  const s = pending?.summary;
  return (
    <>
      <input ref={inputRef} type="file" accept=".bcf,.bcfzip" onChange={onFile} className="hidden" aria-label={t('aimFork.bcfImport.title')} />
      <IconButton label={t('aimFork.bcfImport.title')} className="h-7 w-7" disabled={busy} onClick={() => inputRef.current?.click()}>
        <CloudUpload className="h-4 w-4" />
      </IconButton>
      {pending && s && (
        <div role="status" className="fixed right-4 top-16 z-50 flex max-w-xs flex-col gap-2 rounded-md border bg-popover p-3 text-xs shadow-md">
          <div className="font-medium">{pending.file.name}</div>
          <div>{t('aimFork.bcfImport.preview', { total: s.topics_in_file, created: s.created, updated: s.updated, unchanged: s.unchanged, conflicts: s.conflicts, skipped: s.skipped, failed: s.failed })}</div>
          {s.warnings.length > 0 && <div className="text-muted-foreground">{s.warnings.join(' ')}</div>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || s.created + s.updated === 0} onClick={() => { void run(pending.file, false); }}>{t('aimFork.bcfImport.write')}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>{t('aimFork.bcfImport.cancel')}</Button>
          </div>
        </div>
      )}
    </>
  );
}
