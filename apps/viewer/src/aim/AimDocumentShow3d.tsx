/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Ukázať v 3D" in the toolbar of an open PDF (D-104 step 4 in the AIM repo),
 * mounted by an AIM-FORK block in components/documents/PdfDocumentView.tsx.
 * A click sends DOCUMENT_SHOW_3D with the page being read; the host resolves
 * the elements that page (or, without own elements, the whole document) refers
 * to and shows them as an X-ray lens. Rendered only inside the AIM host and
 * only for documents the host sent.
 */

import { Box } from 'lucide-react';
import { postAimDocumentShow3d, useAimPanelStore } from './aimPanelStore';
import { show3dTarget } from './documentsQuery';

export function AimDocumentShow3d({ docId, page }: { docId: string; page: number }) {
  const embedded = useAimPanelStore((s) => s.embedded);
  const target = show3dTarget(docId, page);
  if (!embedded || !target) return null;
  return (
    <button
      type="button"
      onClick={() => postAimDocumentShow3d(target)}
      title={`Ukázať v 3D prvky, ktorých sa týka strana ${page} (bez vlastných prvkov celý dokument)`}
      className="flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
      data-aim-document-show-3d
    >
      <Box className="size-3" aria-hidden />
      Ukázať v 3D
    </button>
  );
}
