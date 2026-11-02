/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * When may the long-press timer fire?
 *
 * The hold is a `setTimeout(500)`, i.e. wall-clock time of the main thread. When the thread is
 * blocked (a slow frame on a phone, a loaded CI runner) the timer can run BEFORE a `touchmove`
 * that the browser already received and queued, so a finger that moved away within a few
 * milliseconds is treated as held: the entity menu opens and the orbit is suppressed
 * (mobile-journey, local repro under CPU stress). The tap is already measured on `Event.timeStamp`
 * (tapTiming.ts); this is the same guard for the hold: while input is queued, let it run first.
 */

/** Re-checks before the hold fires anyway, so a probe stuck on "pending" cannot block it for ever. */
export const HOLD_MAX_DEFERRALS = 50;

type InputPendingProbe = () => boolean;

/** `navigator.scheduling.isInputPending` (Chromium); `null` where the browser has no such API. */
export function browserInputPendingProbe(
  nav: unknown = typeof navigator === 'undefined' ? undefined : navigator,
): InputPendingProbe | null {
  const scheduling = (nav as { scheduling?: { isInputPending?: (options?: { includeContinuous?: boolean }) => boolean } } | undefined)
    ?.scheduling;
  const probe = scheduling?.isInputPending;
  // `includeContinuous`: touchmove is a continuous event and is ignored by the default call.
  return typeof probe === 'function' ? () => probe.call(scheduling, { includeContinuous: true }) : null;
}

/** True when the hold must wait one more turn because browser-queued input has not run yet. */
export function shouldDeferHold(deferrals: number, probe: InputPendingProbe | null = browserInputPendingProbe()): boolean {
  return probe !== null && deferrals < HOLD_MAX_DEFERRALS && probe();
}
