/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Single-finger long press without an orbit, tap, or duplicate native menu (#5859). */
import { shouldDeferHold } from '@/aim/holdTiming'; // >>> AIM-FORK: queued touchmove runs before the hold fires <<< AIM-FORK
const HOLD_MS = 500;
const TAP_SLOP_PX = 10;

export function createTouchLongPress(onHold: (x: number, y: number) => void): {
  begin: (touch: Touch) => void;
  move: (touch: Touch) => boolean;
  end: () => boolean;
  cancel: () => void;
  suppressNativeMenu: (event: MouseEvent) => void;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { id: number; x: number; y: number } | null = null;
  let fired = false;
  let suppressNativeUntil = 0;
  let suppressPoint: { x: number; y: number } | null = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const cancel = () => {
    clearTimer();
    start = null;
    fired = false;
  };

  return {
    begin(touch) {
      cancel();
      fired = false;
      start = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
      // >>> AIM-FORK: do not fire while the browser has queued input (a late timer must not beat a touchmove) <<< AIM-FORK
      let deferrals = 0;
      const fire = () => {
        timer = null;
        if (!start) return;
        if (shouldDeferHold(deferrals++)) { timer = setTimeout(fire, 1); return; }
        fired = true;
        suppressNativeUntil = Date.now() + 1_000;
        suppressPoint = { x: start.x, y: start.y };
        onHold(start.x, start.y);
      };
      timer = setTimeout(fire, HOLD_MS);
      // <<< AIM-FORK
    },
    move(touch) {
      if (!start || touch.identifier !== start.id || fired) return fired;
      if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP_PX) {
        cancel();
        return false;
      }
      // Keep the camera fixed while the finger stays within tap slop.
      return true;
    },
    end() {
      const held = fired;
      cancel();
      return held;
    },
    cancel,
    suppressNativeMenu(event) {
      const point = start ?? (Date.now() < suppressNativeUntil ? suppressPoint : null);
      if (!point || Math.hypot(event.clientX - point.x, event.clientY - point.y) > 24) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    dispose: cancel,
  };
}
