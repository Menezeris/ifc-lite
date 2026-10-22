/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Panel Underlays s prepínačom "Show in 3D" ako pätou (AIM D-133 doplnok, #170). Jeden komponent,
 * aby register panelov videl pod hostmi práve jedno telo panela (mobile-sheet-coverage).
 */

import { Suspense, type ComponentType } from 'react';
import { AimUnderlays3dToggle } from './AimUnderlays3dToggle.js';

/** `Panel` = upstream DrawingUnderlayPanel (lenivý z renderPanelBody, aby sa nenačítal druhý raz). */
export function AimUnderlaysPanel({ onClose, Panel }: { onClose: () => void; Panel: ComponentType<{ onClose: () => void }> }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}><Panel onClose={onClose} /></Suspense>
      </div>
      <AimUnderlays3dToggle />
    </div>
  );
}
