/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Ukázať v 3D" at the end of the document tab strip (D-104 step 4 in the AIM
 * repo), mounted by an AIM-FORK block in components/documents/DocumentPane.tsx
 * (PdfDocumentView.tsx sits at its module-size budget). A click sends
 * DOCUMENT_SHOW_3D with the page being read (the tab's view state in the
 * store); the host resolves
 * the elements that page (or, without own elements, the whole document) refers
 * to and shows them as an X-ray lens. Rendered only inside the AIM host and
 * only for documents the host sent.
 */

import { Box } from 'lucide-react';
import { useViewerStore } from '@/store';
import { postAimDocumentShow3d, useAimPanelStore } from './aimPanelStore';
import { show3dTarget } from './documentsQuery';

export function AimDocumentShow3d({ docId }: { docId: string }) {
  const embedded = useAimPanelStore((s) => s.embedded);
  const page = useViewerStore((s) => s.docTabs.find((t) => t.docId === docId)?.view.page ?? 1);
  const target = show3dTarget(docId, page);
  if (!embedded || !target) return null;
  return (
    <button
      type="button"
      onClick={() => postAimDocumentShow3d(target)}
      title={`Ukázať v 3D prvky, ktorých sa týka strana ${page} (bez vlastných prvkov celý dokument)`}
      className="mx-1 my-0.5 flex shrink-0 items-center gap-1 self-center rounded border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
      data-aim-document-show-3d
    >
      <Box className="size-3" aria-hidden />
      Ukázať v 3D
    </button>
  );
}
