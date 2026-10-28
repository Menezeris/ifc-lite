/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vstup lišty "Uložiť do AIM" pre panely IDS (D-162): lenivo a len v embede AIM, aby upstream panely
 * potrebovali jeden import a jeden riadok. Samotná lišta (`AimIdsBar`) sa stiahne až pri prvom zobrazení.
 */

import { lazy, Suspense, type ComponentProps } from 'react';
import { isIdsHostEmbedded } from './idsHost.js';

const AimIdsBar = lazy(() => import('./AimIdsBar.js'));

export function AimIdsBarLazy(props: ComponentProps<typeof AimIdsBar>) {
  if (!isIdsHostEmbedded()) return null;
  return <Suspense fallback={null}><AimIdsBar {...props} /></Suspense>;
}
