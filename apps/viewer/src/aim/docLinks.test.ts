/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptsDocLinksEvent,
  handleDocLinksMessage,
  isDocLinksMessage,
  linkTitle,
  MAX_TARGETS,
  normalizeDocLinks,
  pageKey,
  useAimDocLinksStore,
} from './docLinks.js';

const door = { guid: '0DoorGuid0000000000001', ref: 'DD01.08.0001' };
const link = (over: Record<string, unknown> = {}) => ({
  x: 0.1, y: 0.2, w: 0.003, h: 0.009, label: 'DD01 08', status: 'unique', targets: [door], ...over,
});

describe('isDocLinksMessage (AIM D-130)', () => {
  it('accepts only the bridge source with a documents array', () => {
    assert.equal(isDocLinksMessage({ source: 'aim-bridge', type: 'DOCUMENT_LINKS', documents: [] }), true);
    assert.equal(isDocLinksMessage({ source: 'other', type: 'DOCUMENT_LINKS', documents: [] }), false);
    assert.equal(isDocLinksMessage({ source: 'aim-bridge', type: 'DOCUMENT_OPEN', documents: [] }), false);
    assert.equal(isDocLinksMessage({ source: 'aim-bridge', type: 'DOCUMENT_LINKS', documents: {} }), false);
    assert.equal(isDocLinksMessage(null), false);
  });
});

describe('normalizeDocLinks (AIM D-130)', () => {
  it('keys links by document and page', () => {
    const pages = normalizeDocLinks([{ documentId: 'doc', page: 1, links: [link()] }]);
    assert.deepEqual([...pages.keys()], [pageKey('doc', 1)]);
    assert.deepEqual(pages.get(pageKey('doc', 1)), [
      { x: 0.1, y: 0.2, w: 0.003, h: 0.009, label: 'DD01 08', status: 'unique', targets: [door] },
    ]);
  });

  it('drops pages with a bad id or page and links without position or targets', () => {
    const pages = normalizeDocLinks([
      { documentId: '', page: 1, links: [link()] },
      { documentId: 'doc', page: 0, links: [link()] },
      { documentId: 'doc', page: 1.5, links: [link()] },
      {
        documentId: 'doc',
        page: 2,
        links: [
          link({ x: Number.NaN }),
          link({ w: 0 }),
          link({ x: 1.2 }),
          link({ targets: [] }),
          link({ targets: [{ guid: 'g' }] }),
        ],
      },
    ]);
    assert.equal(pages.size, 0);
  });

  it('clips links to the page and derives the status from the targets', () => {
    const [clipped, single] = normalizeDocLinks([
      {
        documentId: 'doc',
        page: 1,
        links: [
          link({ x: -0.1, w: 0.2, y: 0.95, h: 0.1 }),
          link({ status: 'candidates', targets: [door, { guid: 'bad' }] }),
        ],
      },
    ]).get(pageKey('doc', 1))!;
    assert.equal(clipped.x, 0);
    assert.ok(Math.abs(clipped.w - 0.1) < 1e-9);
    assert.ok(Math.abs(clipped.y + clipped.h - 1) < 1e-9);
    assert.equal(single.status, 'unique');
    assert.deepEqual(single.targets, [door]);
  });

  it('caps the candidates and keeps more than one as candidates', () => {
    const many = Array.from({ length: MAX_TARGETS + 4 }, (_, i) => ({ guid: `g${i}`, ref: `SN05.01.${i}` }));
    const [l] = normalizeDocLinks([{ documentId: 'doc', page: 1, links: [link({ targets: many })] }]).get(
      pageKey('doc', 1),
    )!;
    assert.equal(l.status, 'candidates');
    assert.equal(l.targets.length, MAX_TARGETS);
  });
});

describe('linkTitle (AIM D-130)', () => {
  it('names the element and marks the link as an AIM derivation', () => {
    assert.equal(linkTitle({ ...link(), status: 'unique', targets: [door] }), 'DD01 08 -> DD01.08.0001 (AIM: odvodené z popisku)');
    assert.equal(
      linkTitle({ ...link(), label: 'SN05 01', status: 'candidates', targets: [door, { guid: 'x', ref: 'SN05.01.0002', name: 'Murivo' }] }),
      'SN05 01 -> kandidáti (2): DD01.08.0001, SN05.01.0002 (AIM: odvodené z popisku)',
    );
  });
});

describe('useAimDocLinksStore (AIM D-130)', () => {
  it('replaces all pages on every message and bumps the nonce', () => {
    const store = useAimDocLinksStore.getState();
    const before = store.nonce;
    store.setDocuments([{ documentId: 'doc', page: 1, links: [link()] }]);
    assert.equal(useAimDocLinksStore.getState().pages.size, 1);
    useAimDocLinksStore.getState().setDocuments([]);
    assert.equal(useAimDocLinksStore.getState().pages.size, 0);
    assert.equal(useAimDocLinksStore.getState().nonce, before + 2);
  });
});

describe('handleDocLinksMessage (AIM D-130)', () => {
  it('handles only DOCUMENT_LINKS and stores its pages', () => {
    assert.equal(handleDocLinksMessage({ source: 'aim-bridge', type: 'DOCUMENT_OPEN', documentId: 'doc' }), false);
    assert.equal(
      handleDocLinksMessage({ source: 'aim-bridge', type: 'DOCUMENT_LINKS', documents: [{ documentId: 'd2', page: 3, links: [link()] }] }),
      true,
    );
    assert.deepEqual([...useAimDocLinksStore.getState().pages.keys()], [pageKey('d2', 3)]);
  });
});

describe('acceptsDocLinksEvent (AIM D-130)', () => {
  const parent = {};
  it('accepts only the parent frame from the referrer origin', () => {
    assert.equal(acceptsDocLinksEvent({ source: parent, origin: 'https://aim.example' }, parent, 'https://aim.example/ifc'), true);
    assert.equal(acceptsDocLinksEvent({ source: {}, origin: 'https://aim.example' }, parent, 'https://aim.example/ifc'), false);
    assert.equal(acceptsDocLinksEvent({ source: parent, origin: 'https://evil.example' }, parent, 'https://aim.example/ifc'), false);
    assert.equal(acceptsDocLinksEvent({ source: parent, origin: 'https://any.example' }, parent, ''), true);
  });
});
