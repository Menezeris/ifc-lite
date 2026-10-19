/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Brána príkazov hosta (AIM D-101, #97): príkaz, ktorý príde skôr, než sú
 * modely načítané a geometria dotečie, sa zaradí a vykoná po nich v pôvodnom
 * poradí - predtým sa zahodil a rez nad podlažím sa počítal voči obálke, ktorá
 * ešte rástla. Ďalej evidencia rozbehnutých asynchrónnych krokov (rez cez
 * prvok, kamera, Lens) a problémov, aby `APPLIED` prišlo až po nich a povedalo,
 * čo sa nevykonalo. Bez závislostí na store, testované v `command-gate.test.ts`.
 */

export interface CommandGate {
  /** Vykoná hneď, alebo zaradí, kým brána nie je pripravená (alebo pred ním čakajú staršie). */
  run(fn: () => void): void;
  /** Vykoná zaradené, kým je pripravená. */
  flush(): void;
  readonly queued: number;
}

export function createCommandGate(isReady: () => boolean): CommandGate {
  const queue: Array<() => void> = [];
  return {
    run(fn) {
      if (queue.length === 0 && isReady()) fn();
      else queue.push(fn);
    },
    flush() {
      while (queue.length > 0 && isReady()) queue.shift()!();
    },
    get queued() {
      return queue.length;
    },
  };
}

const inflight = new Set<Promise<unknown>>();
let issues: string[] = [];

/** Asynchrónny krok príkazu; `settled` naň počká. Chyba sa zapíše ako problém. */
export function track(p: Promise<unknown>): void {
  const guarded = p.then(
    () => undefined,
    (err: unknown) => noteIssue(err instanceof Error ? err.message : String(err)),
  );
  inflight.add(guarded);
  void guarded.finally(() => inflight.delete(guarded));
}

/** Čaká, kým dobehnú všetky sledované kroky (aj tie, ktoré medzitým pribudnú). false = vypršal čas. */
export async function settled(timeoutMs: number, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (inflight.size > 0) {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    await Promise.race([Promise.allSettled([...inflight]), sleep(left)]);
  }
  return true;
}

export function noteIssue(text: string): void {
  if (issues.length < 20) issues.push(text);
}

/** Problémy od posledného potvrdenia (a vyprázdni ich). */
export function takeIssues(): string[] {
  const out = issues;
  issues = [];
  return out;
}
