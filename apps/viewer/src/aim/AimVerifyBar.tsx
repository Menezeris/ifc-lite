/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lišta overenia výmer nad kartou Quantities (AIM D-185 UI), jeden riadok AIM-FORK v `PropertiesPanel.tsx`.
 * Pri zobrazení prvku, ktorý pokrýva niektorá kontrola (zatiaľ IfcSpace), požiada hosta o výsledok (lenivý
 * `aimVerify.ts`, žiadosť posiela lenivý `AimVerifyBarBody.tsx`): uložený beh pre aktuálnu revíziu, inak
 * overenie teraz. Mimo AIM hosta nič nerobí.
 */

import { lazy, Suspense } from 'react';
import { isVerifiable } from './aimVerifyStore';
import { isIdsHostEmbedded } from './idsHost';

const AimVerifyBarBody = lazy(() => import('./AimVerifyBarBody').then((m) => ({ default: m.AimVerifyBarBody })));

export function AimVerifyBar({ entityType, globalId }: { entityType?: string; globalId?: string }) {
  if (!globalId || !isVerifiable(entityType) || !isIdsHostEmbedded()) return null;
  return (
    <Suspense fallback={null}>
      <AimVerifyBarBody globalId={globalId} />
    </Suspense>
  );
}
