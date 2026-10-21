/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM layer rows in the PropertiesPanel (D-077; AIM D-127 and D-129, #169).
 * The panel is IFC only: no AIM | IFC tab bar and no AIM card. What exists only
 * in AIM shows as rows inside one tinted frame with an AIM badge, the pattern of
 * the derived relations in Relationship records (D-089): the element's last
 * change by a recipe (model revision and BCF topic) and its GUID history.
 * Documents inherited through zone, storey or group are in the Documents panel
 * ("Len pre výber", AimDocumentsControls). `useAimNativeHidden` stays for the
 * existing AIM-FORK wiring in PropertiesPanel and is always false. Standalone
 * (non-embedded) mode renders nothing: zero upstream impact.
 */

import { useAimPanelStore } from './aimPanelStore';
// PropertiesPanel ho berie cez existujúci import tohto modulu (súbor je na strope veľkosti).
export { isReadOnlyFocus } from './aimInspectorStore';

/** Native IFC content is never hidden since AIM D-127 (one panel, IFC). */
export function useAimNativeHidden(): boolean {
  return false;
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-xs" title={title}>
      <span className="w-28 shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-2xs">{value}</span>
    </div>
  );
}

export function AimInspectorTabs() {
  const embedded = useAimPanelStore((s) => s.embedded);
  const panel = useAimPanelStore((s) => s.panel);
  if (!embedded || panel.status === 'idle') return null;
  const data = panel.status === 'ready' ? panel.data : null;
  const change = data?.lastChange;
  const history = data?.history ?? [];
  // `data-aim-inspector` marks the panel body for the chat property focus (aimPanelView.ts).
  if (!change && history.length === 0) return <div data-aim-inspector hidden />;
  return (
    <div data-aim-inspector className="mx-3 my-2 shrink-0 border border-primary/30 bg-primary/5 px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-zinc-500">
        <span className="shrink-0 border border-primary/50 bg-primary/10 px-1 py-0.5 font-mono text-2xs font-bold leading-none text-primary">AIM</span>
        <span>Revízia a identita</span>
      </div>
      {change && (
        <Row
          label="Posledná zmena"
          value={`${change.revision} ${change.model}, ${change.date}`}
          title={`Recept podľa BCF témy: ${change.title}`}
        />
      )}
      {history.map((h) => (
        <Row
          key={`${h.guid}:${h.validFrom}`}
          label={h.active ? 'GUID od' : 'Predtým GUID'}
          value={h.active ? `${h.validFrom} ${h.guid}` : `${h.validFrom} - ${h.validUntil ?? ''} ${h.guid}`}
          title={h.guid}
        />
      ))}
    </div>
  );
}
