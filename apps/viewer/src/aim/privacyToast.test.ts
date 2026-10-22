/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { skipPrivacyToast } from './privacyToast.js';

it('skips the privacy toast inside the AIM host iframe', () => {
  const parent = {} as Window;
  assert.equal(skipPrivacyToast({ parent }), true);
});

it('keeps the privacy toast in the standalone viewer', () => {
  const win = {} as { parent: Window };
  win.parent = win as unknown as Window;
  assert.equal(skipPrivacyToast(win), false);
});
