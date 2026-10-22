/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Privacy toast in the AIM embed (Samuel 2026-10-21, handover #203): the fork ships
 * without product analytics (no VITE_POSTHOG_KEY), so the upstream disclosure only
 * confuses AIM users. Inside the AIM host iframe the toast is skipped; the standalone
 * viewer keeps it.
 */
export function skipPrivacyToast(win: Pick<Window, 'parent'> & { readonly self?: unknown }): boolean {
  return win.parent !== win;
}
