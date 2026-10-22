/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Čiara trasy od hosta (AIM D-137, #223): plná farebná lomená čiara nad scénou
 * (ako `AimRoomFillLayer`), body premietnuté `projectToScreen` pri každom pohybe
 * kamery. Bez hĺbky: trasu cez viac podlaží vidno aj cez dosky. Kliky prechádzajú
 * do scény.
 */

import { useViewerStore } from '../store/index.js';
import { useProjectorTick } from '@/components/viewport-ui/scene';
import { routePath } from './aimRoute.js';
import { useAimRouteStore } from './aimRouteStore.js';

export function AimRouteLayer() {
  const points = useAimRouteStore((s) => s.points);
  const color = useAimRouteStore((s) => s.color);
  const project = useViewerStore((s) => s.cameraCallbacks.projectToScreen);
  const active = points.length >= 2 && !!project;
  const tick = useProjectorTick(active);
  if (!active || !project) return null;
  void tick; // nový tick = tie isté body na nových súradniciach obrazovky
  const d = routePath(points, project);
  if (!d) return null;
  return (
    <svg className="absolute inset-0 pointer-events-none z-20" style={{ overflow: 'visible' }} data-aim-route={points.length}>
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
