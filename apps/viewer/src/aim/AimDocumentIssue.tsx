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
 * While drawing, a tool row picks the region or a markup shape (AIM #199:
 * cloud, arrow, text, pin); shapes collect on one page and "Hotovo" opens the
 * form with them.
 * Rendered only inside the AIM host and only for the host's documents.
 */

import { useEffect, useRef } from 'react';
import { ArrowUpRight, Check, Cloud, MapPin, MessageSquarePlus, Square, Type, type LucideIcon } from 'lucide-react';
import { useViewerStore } from '@/store';
import { useAimPanelStore } from './aimPanelStore';
import { openIssueForm, syncIssueLayers, useAimDocIssueStore, type DocIssueTool } from './docIssues';
import { attachIssueDrawing, finishIssueDraft } from './docIssueDraw';

const HINT: Record<'form' | DocIssueTool, string> = {
  region: 'Ťahaj obdĺžnik na strane (klik = celá strana, Esc zruší)',
  cloud: 'Ťahaj obláčik okolo miesta (Esc zruší)',
  arrow: 'Ťahaj šípku od chvosta k hrotu (Esc zruší)',
  text: 'Klikni, kam patrí text, napíš ho a Enter',
  pin: 'Klikni na miesto špendlíka',
  form: 'Dokonči tému v paneli BCF',
};

const TOOLS: Array<{ tool: DocIssueTool; label: string; Icon: LucideIcon }> = [
  { tool: 'region', label: 'Oblasť', Icon: Square },
  { tool: 'cloud', label: 'Obláčik', Icon: Cloud },
  { tool: 'arrow', label: 'Šípka', Icon: ArrowUpRight },
  { tool: 'text', label: 'Text', Icon: Type },
  { tool: 'pin', label: 'Pin', Icon: MapPin },
];

const SMALL = 'my-0.5 flex min-h-6 shrink-0 items-center gap-1 self-center rounded border px-1 py-0.5 text-2xs';

export function AimDocumentIssue({ docId }: { docId: string }) {
  const embedded = useAimPanelStore((s) => s.embedded);
  const doc = useViewerStore((s) => s.viewerDocuments.get(docId));
  const project = useViewerStore((s) => s.bcfProject);
  const phase = useAimDocIssueStore((s) => (s.docId === docId ? s.phase : 'idle'));
  const note = useAimDocIssueStore((s) => s.note);
  const tool = useAimDocIssueStore((s) => s.tool);
  const draftCount = useAimDocIssueStore((s) => s.draftCount);
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
      if (!target) return useAimDocIssueStore.getState().set({ phase: 'idle', docId: null, note: null, draftCount: 0 });
      void openIssueForm(target, doc?.name ?? 'Dokument');
    });
  }, [enabled, phase, docId, doc?.name]);

  if (!enabled) return null;
  const busy = phase !== 'idle';
  const toggle = () => useAimDocIssueStore.getState().set(busy ? { phase: 'idle', docId: null, note: null, draftCount: 0 } : { phase: 'drawing', docId, note: null });
  const hint = HINT[phase === 'form' ? 'form' : tool];
  return (
    <>
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-pressed={busy}
      title={busy ? `${hint}. Klik zruší.` : (note ?? 'Pripomienka k miestu na strane: označ oblasť, téma vznikne v paneli BCF (uloží ju chat)')}
      className={`mx-1 my-0.5 flex min-h-6 shrink-0 items-center gap-1 self-center rounded border px-1.5 py-0.5 text-2xs ${busy ? 'border-red-600 text-red-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      data-aim-document-issue
    >
      <MessageSquarePlus className="size-3" aria-hidden />
      {busy ? hint : 'Pripomienka'}
    </button>
    {phase === 'drawing' && (
      <div role="toolbar" aria-label="Nástroj pripomienky" className="flex shrink-0 items-center gap-0.5" data-aim-document-issue-tools>
        {TOOLS.map(({ tool: t, label, Icon }) => (
          <button
            key={t}
            type="button"
            aria-pressed={tool === t}
            title={HINT[t]}
            onClick={() => useAimDocIssueStore.getState().set({ tool: t })}
            className={`${SMALL} ${tool === t ? 'border-red-600 bg-red-50 text-red-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            data-aim-issue-tool={t}
          >
            <Icon className="size-3" aria-hidden />
            {label}
          </button>
        ))}
        {draftCount > 0 && (
          <button
            type="button"
            onClick={finishIssueDraft}
            title="Značky do novej témy v paneli BCF (Enter)"
            className={`${SMALL} border-red-600 bg-red-600 text-white`}
            data-aim-issue-finish
          >
            <Check className="size-3" aria-hidden />
            Hotovo ({draftCount})
          </button>
        )}
      </div>
    )}
    </>
  );
}
