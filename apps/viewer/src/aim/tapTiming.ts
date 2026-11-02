/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Time of a touch input for tap detection.
 *
 * `Date.now()` taken inside the handler measures when the handler RAN, not when the finger
 * touched. When the main thread is blocked between touchstart and touchend (a slow frame on a
 * phone or on a loaded CI runner), the two handlers run late and the tap looks longer than
 * 300 ms, so it is dropped silently. `Event.timeStamp` is the time the browser received the
 * input, so queueing delay does not count against the tap.
 */

/** Longest touch that still counts as a tap (ms). */
export const TAP_MAX_MS = 300;

/** Input time in `performance.now()` units; falls back to the current time for synthetic events without a stamp. */
export function inputStamp(
  event: { timeStamp?: number },
  now: () => number = () => performance.now(),
): number {
  const stamp = event.timeStamp;
  return typeof stamp === 'number' && Number.isFinite(stamp) && stamp > 0 ? stamp : now();
}

/** Length of a touch in ms between two input stamps; infinite when the stamps are unusable, so it never counts as a tap. */
export function tapDurationMs(startStamp: number, endStamp: number): number {
  const duration = endStamp - startStamp;
  return Number.isFinite(duration) && duration >= 0 ? duration : Number.POSITIVE_INFINITY;
}
