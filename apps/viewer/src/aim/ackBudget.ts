/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Jeden rozpočet času na celé `APPLIED` (AIM #273). Host čaká na potvrdenie 3 s, ale kroky
 * (dobehnutie príkazov, Lens, zoznam, ustálenie kamery, zostavenie stavu) čakali každý svoj limit
 * zvlášť, takže spolu mohli prekročiť 3 s a potvrdenie prišlo neskoro alebo vôbec. Teraz delia
 * jeden rozpočet a stav, ktorý sa nestihne zostaviť, ide ako problém, nie ako mlčanie.
 * Čisté, bez store, kvôli testu.
 */

/** Rozpočet na celé potvrdenie; pod 3 s hosta, aby ostala rezerva na postMessage. */
export const ACK_TOTAL_MS = 2700;
/** Z rozpočtu sa vyhradí na zostavenie stavu: čakanie na kroky ho nesmie minúť celý. */
export const STATE_RESERVE_MS = 400;

export interface AckBudget {
  /** Koľko ms z rozpočtu ostáva (nikdy záporné). */
  left(): number;
  /** Koľko z toho smú minúť čakania na kroky (rozpočet bez rezervy na stav). */
  stepLeft(): number;
}

export function createAckBudget(totalMs: number, now: () => number = Date.now): AckBudget {
  const deadline = now() + totalMs;
  const left = () => Math.max(0, deadline - now());
  return { left, stepLeft: () => Math.max(0, left() - STATE_RESERVE_MS) };
}

/**
 * Výsledok `work`, alebo `onTimeout()`, ak nie je do `ms`. `work` ide ďalej na pozadí, jeho
 * neskorá chyba sa nezahodí ako neošetrená (volajúci ju už dostal ako timeout).
 */
export async function withinBudget<T, U>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => U,
  sleep: (ms: number) => Promise<void> = (n) => new Promise<void>((r) => setTimeout(r, n)),
): Promise<T | U> {
  const late = Symbol('late');
  const first = await Promise.race([work, sleep(ms).then(() => late)]);
  if (first === late) {
    work.catch(() => undefined);
    return onTimeout();
  }
  return first as T;
}
