/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AIM block in the PropertiesPanel (D-077; AIM D-127 dropped the AIM | IFC tab
 * bar, #169). The panel always shows its native IFC content; the host-fed
 * AimCard (platform data: documents via zone/storey/type, responsibilities,
 * GUID history, "open full detail") sits above it as one collapsed row, so no
 * AIM data leaves the viewer. `useAimNativeHidden` stays for the existing
 * AIM-FORK wiring in PropertiesPanel and is always false now. Standalone
 * (non-embedded) mode renders nothing: zero upstream impact.
 */

import { lazy, Suspense } from 'react';
import { useViewerStore } from '@/store';
import { useAimPanelStore } from './aimPanelStore';
import { useAimInspectorStore } from './aimInspectorStore';
// PropertiesPanel ho berie cez existujúci import tohto modulu (súbor je na strope veľkosti).
export { isReadOnlyFocus } from './aimInspectorStore';
// Lazy: the card only renders inside the AIM host.
const AimCard = lazy(() => import('./AimCard').then((m) => ({ default: m.AimCard })));

/** Native IFC content is never hidden since AIM D-127 (one panel, IFC). */
export function useAimNativeHidden(): boolean {
  return false;
}

export function AimInspectorTabs() {
  const embedded = useAimPanelStore((s) => s.embedded);
  const panel = useAimPanelStore((s) => s.panel);
  const open = useAimInspectorStore((s) => s.cardOpen);
  const setOpen = useAimInspectorStore((s) => s.setCardOpen);
  // On mobile the panel is one scroll column owned by the bottom sheet: the card flows at natural height.
  const isMobile = useViewerStore((s) => s.isMobile);

  // No host / no selection: nothing above the native content.
  if (!embedded || panel.status === 'idle') return null;

  // `data-aim-inspector` marks the panel body for the chat property focus (aimPanelView.ts).
  return (
    <div data-aim-inspector className={open && !isMobile ? 'shrink-0 max-h-[50%] overflow-y-auto' : 'shrink-0'}>
      <Suspense fallback={null}><AimCard open={open} onOpenChange={setOpen} /></Suspense>
    </div>
  );
}
