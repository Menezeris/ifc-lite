/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vstup lišty "Uložiť do AIM" pre panel clash (D-164): lenivo a len v embede AIM, aby upstream panel
 * potreboval jeden import a jeden riadok. Samotná lišta (`AimClashBar`) sa stiahne až pri prvom zobrazení.
 */

import { lazy, Suspense, type ComponentProps } from 'react';
import { isIdsHostEmbedded } from './idsHost.js';

const AimClashBar = lazy(() => import('./AimClashBar.js'));

export function AimClashBarLazy(props: ComponentProps<typeof AimClashBar>) {
  if (!isIdsHostEmbedded()) return null;
  return <Suspense fallback={null}><AimClashBar {...props} /></Suspense>;
}
