/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Vstup tlačidla "Importovať do AIM" pre BCF panel: lenivo a len v embede AIM (jeden import a jeden riadok v upstream súbore). */

import { lazy, Suspense } from 'react';
import { isIdsHostEmbedded } from './idsHost.js';

const AimBcfImportButton = lazy(() => import('./AimBcfImportButton.js'));

export function AimBcfImportLazy() {
  if (!isIdsHostEmbedded()) return null;
  return <Suspense fallback={null}><AimBcfImportButton /></Suspense>;
}
