/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tlačidlo "Importovať do AIM" v BCF paneli: vyberie .bcfzip, pošle ho hostu a ukáže počty alebo chybu.
 * Načítava sa lenivo (`AimBcfImportLazy`) a len v embede AIM.
 */

import { useCallback, useRef, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n';
import { sendBcfImport } from './aimBcfImport.js';

export default function AimBcfImportButton() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const out = await sendBcfImport(file);
      if (out.kind === 'invalid') toast.error(t(`aimFork.bcfImport.invalid.${out.reason}`));
      else if (out.kind === 'rejected') toast.error(t('aimFork.bcfImport.error', { reason: out.error }));
      else {
        toast.success(t('aimFork.bcfImport.done', { created: out.created, unchanged: out.unchanged, updated: out.updated }));
        if (out.errors.length) toast.error(t('aimFork.bcfImport.errors', { count: out.errors.length, first: out.errors[0] }));
      }
    } finally {
      setBusy(false);
    }
  }, [t]);

  return (
    <>
      <input ref={inputRef} type="file" accept=".bcf,.bcfzip" onChange={(e) => { void onFile(e); }} className="hidden" aria-label={t('aimFork.bcfImport.title')} />
      <IconButton label={t('aimFork.bcfImport.title')} className="h-7 w-7" disabled={busy} onClick={() => inputRef.current?.click()}>
        <CloudUpload className="h-4 w-4" />
      </IconButton>
    </>
  );
}
