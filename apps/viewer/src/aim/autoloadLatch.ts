/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Koniec `?models=` autoloadu pre lenivý most (AimBridgeMount.tsx): udalosť zachytí
 * vstupná časť od prvého renderu, most sa môže pripojiť až po nej a MODELS_LOADED
 * ohlási hneď po pripojení.
 */

export interface AutoloadLatch {
  /** V embede beží autoload z URL. */
  active: boolean;
  /** Callback na koniec autoloadu; hneď, ak už nastal. Vráti odhlásenie. */
  onComplete: (fn: () => void) => () => void;
}

export function createAutoloadLatch(active: boolean): AutoloadLatch & { complete: () => void } {
  let done = false;
  const waiting = new Set<() => void>();
  return {
    active,
    onComplete: (fn) => {
      if (done) { fn(); return () => {}; }
      waiting.add(fn);
      return () => { waiting.delete(fn); };
    },
    complete: () => {
      done = true;
      for (const fn of waiting) fn();
      waiting.clear();
    },
  };
}
