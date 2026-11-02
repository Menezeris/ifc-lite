/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Obsah panela vedľa 3D (AIM-FORK blok `ViewerLayout.tsx`): karta dokumentu D-075, alebo od D-182 karta
 * knižnice požiadaviek, keď je jej záložka aktívna alebo vedľa. Obe sú lenivé, mimo štartu viewera.
 */

import { lazy, Suspense, useMemo } from 'react';
import { centerLayout } from './viewTabsLayout.js';
import { useAimViewTabs } from './viewTabsStore.js';

const DocumentPane = lazy(() => import('@/components/documents/DocumentPane').then((m) => ({ default: m.DocumentPane })));
const AimRequirementsLibrary = lazy(() => import('./AimRequirementsLibrary.js').then((m) => ({ default: m.AimRequirementsLibrary })));

export function AimCenterPane() {
  const tabs = useAimViewTabs((s) => s.tabs);
  const activeId = useAimViewTabs((s) => s.activeId);
  const besideId = useAimViewTabs((s) => s.besideId);
  const library = useMemo(() => centerLayout({ tabs, activeId, besideId }).library, [tabs, activeId, besideId]);
  return (
    <Suspense fallback={null}>
      {library ? <AimRequirementsLibrary /> : <DocumentPane hideTabs />}
    </Suspense>
  );
}
