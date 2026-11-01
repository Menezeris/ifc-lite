/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vstup zoznamu tém s filtrami (AIM #199, bod 3) pre panel BCF: upstream panel potrebuje jeden import
 * a jeden prvok. Mimo hostu AIM (a kým sa lenivý chunk sťahuje) sa renderuje nezmenený upstream zoznam,
 * filtre (`AimTopicList`) sa stiahnu až pri prvom zobrazení v hoste.
 */

import { lazy, Suspense, type ComponentType } from 'react';
import type { BCFViewpoint } from '@ifc-lite/bcf';
import type { BCFTopicListProps } from '../components/viewer/bcf/BCFTopicList.js';
import { useAimPanelStore } from './aimPanelStore.js';

const AimTopicList = lazy(() => import('./AimTopicList.js').then((m) => ({ default: m.AimTopicList })));

export function AimTopicListLazy({
  ListComponent,
  applyViewpoint,
  ...listProps
}: BCFTopicListProps & { ListComponent: ComponentType<BCFTopicListProps>; applyViewpoint: (vp: BCFViewpoint) => void }) {
  const embedded = useAimPanelStore((s) => s.embedded);
  if (!embedded) return <ListComponent {...listProps} />;
  return (
    <Suspense fallback={<ListComponent {...listProps} />}>
      <AimTopicList ListComponent={ListComponent} listProps={listProps} applyViewpoint={applyViewpoint} />
    </Suspense>
  );
}
