/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ROUTE_SHOW` (AIM D-137): čiara trasy od hosta nahradí predošlú, prázdne body
 * ju zmažú. Body prevedie do render rámca ako kóty (`bcfWorldOffset`, D-124).
 * Lenivý modul.
 */

import { useViewerStore } from '@/store';
import { bcfWorldOffset } from '@/hooks/bcf/viewpoint-world-frame';
import type { ViewInboundMessage } from './view-protocol.js';
import { routeToRender } from './aimRoute.js';
import { ROUTE_DEFAULT_COLOR, useAimRouteStore } from './aimRouteStore.js';

export function showRoute(msg: Extract<ViewInboundMessage, { type: 'ROUTE_SHOW' }>): void {
  const state = useViewerStore.getState();
  const points = routeToRender(msg.points, bcfWorldOffset(state.models, state.geometryResult));
  useAimRouteStore.getState().setRoute(points, msg.color ?? ROUTE_DEFAULT_COLOR);
}
