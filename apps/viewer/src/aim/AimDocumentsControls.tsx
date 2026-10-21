/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM part of the Documents panel (D-104 step 3 in the AIM repo), mounted by
 * AIM-FORK blocks in components/documents/DocumentsPanel.tsx:
 *
 *   · AimDocumentsControls: "group by" folder or any `meta` key the host sent,
 *     and the "len pre výber" switch (the panel's filter searches name and
 *     metadata through documentsQuery.ts);
 *   · AimSelectionDocuments: effective documents of the selected element from
 *     AIM_PANEL_DATA, with the path and page; a click opens the PDF in the
 *     viewer at that page. Documents inherited through zone, storey or group
 *     carry an AIM badge (AIM D-129): they are an AIM layer, not IFC. Reality
 *     Capture media of the selected space follow, grouped by media kind, also
 *     with the AIM badge (AIM D-131); a click opens the host's gallery.
 *
 * Grouping and search are pure functions in documentsQuery.ts; the view state
 * lives in a small local store so the panel keeps it across re-mounts.
 */

import { useMemo, type ReactNode } from 'react';
import { create } from 'zustand';
import { Camera, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewerStore, type ViewerDocument } from '@/store';
import { postAimNavigate, useAimPanelStore } from './aimPanelStore';
import { GROUP_BY_FOLDER, metaKeys, selectionDocuments, selectionMedia, type CaptureMediaWire } from './documentsQuery';

interface AimDocumentsView {
  /** `GROUP_BY_FOLDER` or a `meta` key. */
  groupBy: string;
  /** Show the selected element's documents instead of the library. */
  onlySelection: boolean;
  setGroupBy: (groupBy: string) => void;
  setOnlySelection: (on: boolean) => void;
}

export const useAimDocumentsView = create<AimDocumentsView>((set) => ({
  groupBy: GROUP_BY_FOLDER,
  onlySelection: false,
  setGroupBy: (groupBy) => set({ groupBy }),
  setOnlySelection: (onlySelection) => set({ onlySelection }),
}));

export function AimDocumentsControls({ docs }: { docs: ReadonlyMap<string, ViewerDocument> }) {
  const { groupBy, onlySelection, setGroupBy, setOnlySelection } = useAimDocumentsView();
  const embedded = useAimPanelStore((s) => s.embedded);
  const keys = useMemo(() => metaKeys(docs.values()), [docs]);
  // A key the host stopped sending falls back to folders instead of one empty group.
  const activeGroupBy = groupBy === GROUP_BY_FOLDER || keys.includes(groupBy) ? groupBy : GROUP_BY_FOLDER;
  return (
    <div className="border-b px-3 py-1.5" data-aim-documents-controls>
      <div className="flex items-center gap-1.5 text-2xs">
        <label className="flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
          <span className="shrink-0">Zoskupiť</span>
          <select
            value={activeGroupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            disabled={onlySelection}
            aria-label="Zoskupiť dokumenty podľa"
            className="h-6 min-w-0 flex-1 rounded border bg-background px-1 text-2xs text-foreground"
          >
            <option value={GROUP_BY_FOLDER}>Priečinok</option>
            {keys.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-pressed={onlySelection}
          disabled={!embedded}
          onClick={() => setOnlySelection(!onlySelection)}
          title={embedded ? 'Dokumenty vybraného prvku aj zdedené cez zónu, podlažie, typ a skupinu' : 'Dokumenty výberu posiela AIMviewer'}
          className={cn(
            'h-6 shrink-0 rounded border px-2',
            onlySelection ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
            !embedded && 'opacity-50',
          )}
        >
          Len pre výber
        </button>
      </div>
    </div>
  );
}

export function AimSelectionDocuments({ docs, filter }: { docs: ReadonlyMap<string, ViewerDocument>; filter: string }) {
  const panel = useAimPanelStore((s) => s.panel);
  const openDocument = useViewerStore((s) => s.openDocument);
  const items = useMemo(
    () => (panel.status === 'ready' ? selectionDocuments(panel.data.documents, docs, filter) : []),
    [panel, docs, filter],
  );
  const media = useMemo(
    () => (panel.status === 'ready' ? selectionMedia(panel.data.captureMedia, filter) : []),
    [panel, filter],
  );
  if (panel.status === 'idle') return <Hint>Vyber prvok v 3D alebo v strome.</Hint>;
  if (panel.status === 'loading') return <Hint>Načítavam dokumenty výberu...</Hint>;
  if (panel.status === 'empty') return <Hint>Prvok nie je v AIM, dokumenty k nemu nie sú.</Hint>;
  const total = (panel.data.documents?.length ?? 0) + (panel.data.captureMedia?.length ?? 0);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1" data-aim-selection-documents>
      <div className="truncate px-1.5 pb-0.5 pt-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground" title={panel.data.title}>
        {panel.data.title} · {total}
      </div>
      {items.length === 0 && media.length === 0 ? (
        <Hint>{total === 0 ? 'K prvku nevedie žiadny dokument.' : 'Žiadny dokument výberu nezodpovedá hľadaniu.'}</Hint>
      ) : (
        items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => (item.doc ? openDocument(item.doc.id, { page: item.page }) : postAimNavigate(item.href))}
            title={item.doc ? `Otvoriť ${item.name}${item.page ? ` na strane ${item.page}` : ''}` : `${item.name}: súbor nie je v knižnici, otvorí sa v AIMvieweri`}
            className="flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 py-1 text-left hover:bg-muted/60"
          >
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-2xs">
                {item.name}
                {item.page && <span className="ml-1.5 text-2xs text-muted-foreground">s. {item.page}</span>}
              </span>
              {item.via && (
                <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
                  {item.aim && <AimBadge title="Zdedené cez vzťah: vrstva AIM, nie je v IFC" />}
                  <span className="truncate">{item.via}</span>
                </span>
              )}
            </span>
          </button>
        ))
      )}
      {media.map(([label, list]) => (
        <div key={label} data-aim-capture-media={label}>
          <div className="truncate px-1.5 pb-0.5 pt-2 text-2xs font-medium text-muted-foreground">
            {label} · {list.length}
          </div>
          {list.map((item) => (
            <CaptureMediaRow key={item.id} item={item} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** One Reality Capture medium (AIM D-131): thumbnail, date, AIM badge; opens the host's gallery. */
function CaptureMediaRow({ item }: { item: CaptureMediaWire }) {
  return (
    <button
      type="button"
      onClick={() => postAimNavigate(item.href)}
      title={`${item.name}: otvoriť galériu Reality Capture v AIMvieweri`}
      className="flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 py-1 text-left hover:bg-muted/60"
    >
      {item.thumbUrl ? (
        <img src={item.thumbUrl} alt="" loading="lazy" className="mt-0.5 size-6 shrink-0 rounded-sm object-cover" />
      ) : (
        <Camera className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2xs">
          {item.name}
          {item.capturedAt && <span className="ml-1.5 text-2xs text-muted-foreground">{item.capturedAt}</span>}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
          <AimBadge title="Reality Capture: vrstva AIM v databáze, nie je v IFC" />
          {item.via && <span className="truncate">{item.via}</span>}
        </span>
      </span>
    </button>
  );
}

function AimBadge({ title }: { title: string }) {
  return (
    <span className="shrink-0 border border-primary/50 bg-primary/10 px-1 font-mono font-bold leading-none text-primary" title={title}>AIM</span>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="p-6 text-center text-2xs text-muted-foreground">{children}</div>;
}
