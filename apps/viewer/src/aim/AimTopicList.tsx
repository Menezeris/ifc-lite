/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Zoznam tém s filtrami 3D / PDF / entita / projekt / dokument (AIM #199, bod 3):
 * rozširuje zoznam panela BCF o lištu filtrov (rovnaké hodnoty ako
 * `bcf_topic_list` hosta) a klik na tému okrem detailu otvorí aj jej 3D pohľad
 * alebo stranu dokumentu s výrezom. Panel BCF ho načíta lenivo a len vo vnútri
 * hosta AIM; zoznam samotný (`ListComponent`) dostane ako parameter, aby sa
 * upstream modul nerozdelil do zdieľaného chunku.
 */

import { useMemo, useState, type ComponentType } from 'react';
import type { BCFViewpoint } from '@ifc-lite/bcf';
import type { BCFTopicListProps } from '../components/viewer/bcf/BCFTopicList.js';
import { useViewerStore } from '../store/index.js';
import {
  EMPTY_TOPIC_FILTER,
  documentOptions,
  filterTopics,
  isFilterActive,
  type TopicContext,
  type TopicFilter,
} from './topicListModel.js';
import { openTopicContext } from './topicOpen.js';

const CONTEXTS: { value: TopicContext; label: string }[] = [
  { value: 'all', label: 'Všetky kontexty' },
  { value: '3d', label: '3D' },
  { value: 'pdf', label: 'PDF' },
  { value: 'both', label: '3D aj PDF' },
  { value: 'none', label: 'Bez kontextu' },
];

const field = 'h-7 min-w-0 rounded border border-border bg-background px-1.5 text-xs';

export interface AimTopicListProps {
  ListComponent: ComponentType<BCFTopicListProps>;
  listProps: BCFTopicListProps;
  applyViewpoint: (vp: BCFViewpoint) => void;
}

export function AimTopicList({ ListComponent, listProps, applyViewpoint }: AimTopicListProps) {
  const [filter, setFilter] = useState<TopicFilter>(EMPTY_TOPIC_FILTER);
  const docs = useViewerStore((s) => s.viewerDocuments);
  const { topics, onSelectTopic } = listProps;
  const shown = useMemo(() => filterTopics(topics, filter), [topics, filter]);
  const options = useMemo(() => documentOptions(topics), [topics]);
  const patch = (p: Partial<TopicFilter>) => setFilter((f) => ({ ...f, ...p }));

  const select = (guid: string) => {
    onSelectTopic(guid);
    const topic = topics.find((t) => t.guid === guid);
    if (topic) openTopicContext(topic, applyViewpoint);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-aim-topic-list>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5 text-xs" role="group" aria-label="Filtre tém AIM">
        <select className={field} aria-label="Kontext témy" value={filter.context} onChange={(e) => patch({ context: e.target.value as TopicContext })}>
          {CONTEXTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className={field} aria-label="Dokument" value={filter.document} onChange={(e) => patch({ document: e.target.value })}>
          <option value="">Všetky dokumenty</option>
          {options.map((o) => (
            <option key={o.docId} value={o.docId}>{docs.get(o.docId)?.name || o.docId.slice(0, 8)} ({o.count})</option>
          ))}
        </select>
        <input
          className={`${field} w-28`}
          aria-label="Entita (GlobalId)"
          placeholder="Entita (GlobalId)"
          value={filter.entity}
          onChange={(e) => patch({ entity: e.target.value })}
        />
        <label className="flex items-center gap-1 text-muted-foreground">
          <input type="checkbox" checked={filter.projectOnly} onChange={(e) => patch({ projectOnly: e.target.checked })} />
          Celý projekt
        </label>
        {isFilterActive(filter) && (
          <button type="button" className="rounded border border-border px-1.5 py-0.5 hover:bg-muted" onClick={() => setFilter(EMPTY_TOPIC_FILTER)}>
            Zrušiť filtre
          </button>
        )}
        <span className="ml-auto text-muted-foreground" aria-live="polite">{shown.length} / {topics.length}</span>
      </div>
      <div className="min-h-0 flex-1">
        <ListComponent {...listProps} topics={shown} onSelectTopic={select} />
      </div>
    </div>
  );
}
