/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Pripomienka" in the document tab strip (AIM D-158), next to "Ukázať v 3D"
 * in the same AIM-FORK block of components/documents/DocumentPane.tsx. A click
 * arms drawing: a rectangle dragged over a page (or a click = whole page)
 * opens the upstream BCF "New topic" form and the topic gets a document
 * reference to that page and region. The component also keeps the issue
 * frames on the pages of the open PDF in sync with the BCF project.
 * Rendered only inside the AIM host and only for the host's documents.
 */

import { useEffect, useRef } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useViewerStore } from '@/store';
import { useAimPanelStore } from './aimPanelStore';
import { attachIssueDrawing, openIssueForm, syncIssueLayers, useAimDocIssueStore } from './docIssues';

const HINT: Record<'drawing' | 'form', string> = {
  drawing: 'Ťahaj obdĺžnik na strane (klik = celá strana, Esc zruší)',
  form: 'Dokonči tému v paneli BCF',
};

export function AimDocumentIssue({ docId }: { docId: string }) {
  const embedded = useAimPanelStore((s) => s.embedded);
  const doc = useViewerStore((s) => s.viewerDocuments.get(docId));
  const project = useViewerStore((s) => s.bcfProject);
  const phase = useAimDocIssueStore((s) => (s.docId === docId ? s.phase : 'idle'));
  const note = useAimDocIssueStore((s) => s.note);
  const ref = useRef<HTMLButtonElement>(null);
  const enabled = embedded && !!doc && doc.kind !== 'image' && !docId.startsWith('local:');

  // The tab strip's parent is the pane: the open PDF's pages are inside it.
  const paneRoot = () => ref.current?.parentElement?.parentElement ?? null;

  useEffect(() => {
    const root = paneRoot();
    if (!enabled || !root) return;
    const sync = () => syncIssueLayers(root, docId);
    sync();
    // Pages mount as the PDF loads and on zoom; re-sync when they change.
    const mo = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes].some((n) => n instanceof HTMLElement && (n.dataset.page || n.querySelector('[data-page]'))))) sync();
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [enabled, docId, project]);

  useEffect(() => {
    const root = paneRoot();
    if (!enabled || phase !== 'drawing' || !root) return;
    return attachIssueDrawing(root, docId, (target) => {
      if (!target) return useAimDocIssueStore.getState().set({ phase: 'idle', docId: null, note: null });
      void openIssueForm(target, doc?.name ?? 'Dokument');
    });
  }, [enabled, phase, docId, doc?.name]);

  if (!enabled) return null;
  const busy = phase !== 'idle';
  const toggle = () => useAimDocIssueStore.getState().set(busy ? { phase: 'idle', docId: null, note: null } : { phase: 'drawing', docId, note: null });
  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-pressed={busy}
      title={busy ? `${HINT[phase]}. Klik zruší.` : (note ?? 'Pripomienka k miestu na strane: označ oblasť, téma vznikne v paneli BCF (uloží ju chat)')}
      className={`mx-1 my-0.5 flex min-h-6 shrink-0 items-center gap-1 self-center rounded border px-1.5 py-0.5 text-2xs ${busy ? 'border-red-600 text-red-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      data-aim-document-issue
    >
      <MessageSquarePlus className="size-3" aria-hidden />
      {busy ? HINT[phase] : 'Pripomienka'}
    </button>
  );
}
