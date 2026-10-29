/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Poznámka pri riadku podkladu (#280) so zamknutým pôdorysom čítaným zo store. Samostatný modul,
 * aby `DrawingUnderlayPanel.tsx` (na rozpočte veľkosti modulu) potreboval len import a jeden
 * riadok, a aby `AimUnderlays3dToggle.tsx` ostal bez store (test beží bez WASM).
 */

import { useViewerStore } from '@/store';
import { AimUnderlayRowNote } from './AimUnderlays3dToggle.js';

export function AimUnderlayRowNoteLive({ visible }: { visible: boolean }) {
  const viewLocked = useViewerStore((s) => s.underlayViewLocked);
  return <AimUnderlayRowNote visible={visible} viewLocked={viewLocked} />;
}
