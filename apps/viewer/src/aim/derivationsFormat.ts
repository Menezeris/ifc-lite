/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Display helper of the AIM derivations layer used only by the lazily loaded
 * AimLayersPanelBody, kept apart from derivations.ts (imported by the entry
 * chunk) so the lazy chunk does not pull an entry module out into a shared one.
 */

/** Short Slovak relative time ("pred 5 min"); an unparsable timestamp is shown as sent. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'práve teraz';
  if (minutes < 60) return `pred ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `pred ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `pred ${days} d`;
  return new Date(at).toLocaleDateString('sk-SK');
}
