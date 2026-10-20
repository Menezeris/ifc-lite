/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { Lens } from '@ifc-lite/lens';
import { isLensEnvelope, type LensInboundMessage } from './lens-protocol.js';
import {
  AIM_LENS_NAME, MAX_AIM_GLOBAL_IDS, MAX_AIM_RULES, isEvaluated, isolationRules, nextAimLens, parseLensMessage,
  resolveModelRules, summarizeLens, type ApplyLensMessage,
} from './aimLensPlan.js';

const S = 'aim-bridge' as const;
const SLOT = 'auto-color-from-list';
const DUCTS = { combinator: 'AND', rules: [{ kind: 'ifcType', op: 'in', values: ['IfcDuctSegment'] }] };
const SUPPLY = {
  combinator: 'AND',
  rules: [
    { kind: 'ifcType', op: 'in', values: ['IfcDuctFitting'] },
    { kind: 'storey', op: 'in', values: ['1NP'] },
    { kind: 'group', groupClass: 'IfcSystem', op: 'matches', value: '^(Prívod-1NP)$', valueKind: 'regex' },
  ],
};
const MODELS = [
  { name: 'DIPLOMKA_VZT.ifc', fingerprint: 'fp-vzt' },
  { name: 'DIPLOMKA_ASR.ifc', fingerprint: 'fp-asr' },
];

const apply = (extra: Partial<ApplyLensMessage>): ApplyLensMessage =>
  ({ source: S, type: 'APPLY_LENS', mode: 'add', ...extra }) as ApplyLensMessage;
const rule = (name: string, color: string, groups: unknown[] = [DUCTS], action = 'colorize') =>
  ({ name, color, action, groups }) as ApplyLensMessage['rules'] extends (infer R)[] | undefined ? R : never;

describe('lens-protocol (AIM D-096)', () => {
  it('obálka: zdroj aim-bridge a typ APPLY_LENS / LENS_QUERY', () => {
    assert.equal(isLensEnvelope({ source: S, type: 'APPLY_LENS' }), true);
    assert.equal(isLensEnvelope({ source: S, type: 'LENS_QUERY' }), true);
    assert.equal(isLensEnvelope({ source: 'x', type: 'APPLY_LENS' }), false);
    assert.equal(isLensEnvelope({ source: S, type: 'COLORIZE' }), false);
    assert.equal(isLensEnvelope(null), false);
  });
});

describe('parseLensMessage (AIM D-096)', () => {
  it('prijme pravidlá, autoColor, clear, unisolate a otázku', () => {
    for (const m of [
      apply({ rev: 'r1', rules: [rule('Prívod', '#ef4444', [SUPPLY])] }),
      apply({ mode: 'replace', rules: [rule('a', '#000000'), rule('b', '#ffffff', [DUCTS], 'transparent')], isolate: true }),
      apply({ isolate: true, rules: [{ name: 'bez farby', action: 'isolate', groups: [DUCTS] } as never] }),
      apply({ autoColor: { source: 'group' } }),
      apply({ mode: 'clear' }),
      apply({ mode: 'unisolate' }),
      { source: S, type: 'LENS_QUERY', id: 'q1', rev: 'r1' },
    ]) {
      assert.ok(parseLensMessage(m as LensInboundMessage), JSON.stringify(m));
    }
  });

  it('odmietne zlú farbu, akciu, skupinu, prázdne add a priveľa pravidiel či GUIDov', () => {
    const many = Array.from({ length: MAX_AIM_GLOBAL_IDS + 1 }, (_, i) => `g${i}`);
    for (const m of [
      apply({ rules: [rule('a', 'ef4444')] }),
      apply({ rules: [rule('a', '#ef4444', [DUCTS], 'bogus')] }),
      apply({ rules: [rule('a', '#ef4444', [DUCTS], 'isolate')] }),
      apply({ isolate: true, rules: [{ name: 'a', action: 'colorize', groups: [DUCTS] } as never] }),
      apply({ rules: [rule('a', '#ef4444', [{ combinator: 'XOR', rules: [] }])] }),
      apply({ rules: [rule('a', '#ef4444', [{ combinator: 'AND', rules: [{ kind: 'bogus' }] }])] }),
      apply({ rules: [rule('a', '#ef4444', [])] }),
      apply({ rules: [] }),
      apply({ mode: 'bogus' as never, rules: [rule('a', '#ef4444')] }),
      apply({ rules: Array.from({ length: MAX_AIM_RULES + 1 }, () => rule('a', '#ef4444')) }),
      apply({ rules: [rule('a', '#ef4444', [{ combinator: 'AND', rules: [{ kind: 'globalId', op: 'in', values: many }] }])] }),
      apply({ autoColor: { source: 'bogus' } as never }),
      { source: S, type: 'LENS_QUERY', id: '' },
    ]) {
      assert.equal(parseLensMessage(m as LensInboundMessage), null, JSON.stringify(m).slice(0, 120));
    }
  });
});

describe('resolveModelRules (AIM D-096)', () => {
  it('meno modelu -> identita modelu vo vieweri; neznámy model nematchne nič', () => {
    const out = resolveModelRules(
      [{ combinator: 'AND', rules: [{ kind: 'model', op: 'in', values: ['vzt', 'XYZ'] }] }] as never,
      MODELS,
    );
    const r = out[0].rules[0] as { values: string[] };
    assert.equal(r.values[0], 'fp-vzt');
    assert.match(r.values[1], /^__aim_no_model__/);
  });
});

describe('nextAimLens (AIM D-096)', () => {
  const first = nextAimLens(null, apply({ rev: 'r1', rules: [rule('Prívod', '#EF4444', [SUPPLY])] }), SLOT, MODELS, 'r1') as Lens;

  it('nová lens v slote s menom AIM chat a jedinečnými id pravidiel', () => {
    assert.equal(first.id, SLOT);
    assert.equal(first.name, AIM_LENS_NAME);
    assert.deepEqual(first.rules.map((r) => [r.id, r.color, r.action]), [['aim-r1-0', '#ef4444', 'colorize']]);
  });

  it('add pridá pravidlá (novšie vpredu, ich farba vyhrá), replace nahradí, clear vypne', () => {
    const added = nextAimLens(first, apply({ rules: [rule('Odvod', '#3b82f6')] }), SLOT, MODELS, 'r2') as Lens;
    assert.deepEqual(added.rules.map((r) => r.id), ['aim-r2-0', 'aim-r1-0']);
    const replaced = nextAimLens(added, apply({ mode: 'replace', rules: [rule('X', '#000000')] }), SLOT, MODELS, 'r3') as Lens;
    assert.deepEqual(replaced.rules.map((r) => r.id), ['aim-r3-0']);
    assert.equal(nextAimLens(added, apply({ mode: 'clear' }), SLOT, MODELS, 'r4'), null);
  });

  it('tá istá verzia znova pravidlá nezdvojí', () => {
    const again = nextAimLens(first, apply({ rev: 'r1', rules: [rule('Prívod', '#ef4444', [SUPPLY])] }), SLOT, MODELS, 'r1') as Lens;
    assert.deepEqual(again.rules.map((r) => r.id), ['aim-r1-0']);
  });

  it('izolácia nemení lens: bez farby nič nepridá, farebné pravidlá áno; všetky idú do izolácie', () => {
    const plain = apply({ isolate: true, rules: [{ name: 'Zóna', action: 'isolate', groups: [DUCTS] } as never] });
    assert.equal(nextAimLens(first, plain, SLOT, MODELS, 'r2'), first);
    assert.equal(nextAimLens(null, plain, SLOT, MODELS, 'r2'), null);
    assert.deepEqual(isolationRules(plain, MODELS, 'r2').map((r) => r.name), ['Zóna']);
    const mixed = apply({ isolate: true, rules: [rule('Prívod', '#ef4444'), { name: 'Zvyšok', action: 'isolate', groups: [DUCTS] } as never] });
    const lens = nextAimLens(first, mixed, SLOT, MODELS, 'r3') as Lens;
    assert.deepEqual(lens.rules.map((r) => r.id), ['aim-r3-0', 'aim-r1-0']);
    assert.deepEqual(isolationRules(mixed, MODELS, 'r3').map((r) => r.id), ['aim-r3-0', 'aim-r3-1']);
    assert.deepEqual(isolationRules(apply({ rules: [rule('A', '#000000')] }), MODELS, 'r4'), []);
    assert.equal(nextAimLens(first, apply({ mode: 'unisolate' }), SLOT, MODELS, 'r5'), first);
  });

  it('X-ray (D-105): pravidlá idú do X-ray ako pri izolácii, lens bez farby nemení', () => {
    const plain = apply({ xray: true, rules: [{ name: 'SDK', action: 'isolate', groups: [DUCTS] } as never] });
    assert.ok(parseLensMessage(plain));
    assert.equal(nextAimLens(first, plain, SLOT, MODELS, 'x1'), first);
    assert.deepEqual(isolationRules(plain, MODELS, 'x1').map((r) => r.name), ['SDK']);
    const mixed = apply({ xray: true, rules: [rule('Prívod', '#ef4444'), { name: 'Zvyšok', action: 'isolate', groups: [DUCTS] } as never] });
    assert.deepEqual(isolationRules(mixed, MODELS, 'x2').map((r) => r.id), ['aim-x2-0', 'aim-x2-1']);
  });

  it('X-ray (D-105): odmietne xray spolu s isolate, nebooleovský príznak a pravidlo isolate bez príznaku', () => {
    const iso = { name: 'Z', action: 'isolate', groups: [DUCTS] } as never;
    assert.equal(parseLensMessage(apply({ xray: true, isolate: true, rules: [iso] })), null);
    assert.equal(parseLensMessage(apply({ xray: 'ano' as never, rules: [iso] })), null);
    assert.equal(parseLensMessage(apply({ rules: [iso] })), null);
  });

  it('cudziu lens v slote (Color by z tabuľky) chat neprepíše pri add ani nezmaže pri unisolate', () => {
    const foreign: Lens = { id: SLOT, name: 'Color by Material', rules: [], autoColor: { source: 'material' } };
    const next = nextAimLens(foreign, apply({ rules: [rule('A', '#000000')] }), SLOT, MODELS, 'r1') as Lens;
    assert.equal(next.name, AIM_LENS_NAME);
    assert.equal(next.autoColor, undefined);
    assert.equal(nextAimLens(foreign, apply({ mode: 'unisolate' }), SLOT, MODELS, 'r2'), null);
    assert.equal(nextAimLens(foreign, apply({ mode: 'clear' }), SLOT, MODELS, 'r3'), null);
  });

  it('autoColor nahradí pravidlá; strop pravidiel zahodí najstaršie', () => {
    const auto = nextAimLens(first, apply({ autoColor: { source: 'group' } }), SLOT, MODELS, 'r2') as Lens;
    assert.deepEqual([auto.rules.length, auto.autoColor?.source], [0, 'group']);
    let lens: Lens | null = null;
    for (let i = 0; i < MAX_AIM_RULES + 3; i++) lens = nextAimLens(lens, apply({ rules: [rule(`R${i}`, '#000000')] }), SLOT, MODELS, `t${i}`);
    assert.equal(lens!.rules.length, MAX_AIM_RULES);
    assert.equal(lens!.rules[0].name, `R${MAX_AIM_RULES + 2}`);
    assert.equal(lens!.rules[MAX_AIM_RULES - 1].name, 'R3');
  });
});

describe('isEvaluated + summarizeLens (AIM D-096)', () => {
  const lens = nextAimLens(null, apply({ rules: [rule('Prívod', '#ef4444'), rule('Odvod', '#3b82f6')] }), SLOT, MODELS, 'r1') as Lens;

  it('hotové až keď majú počet všetky pravidlá tejto verzie', () => {
    assert.equal(isEvaluated(lens, new Map([['aim-r1-0', 3]]), []), false);
    assert.equal(isEvaluated(lens, new Map([['aim-r1-0', 3], ['aim-r1-1', 0]]), []), true);
    const auto: Lens = { id: SLOT, name: AIM_LENS_NAME, rules: [], autoColor: { source: 'group' } };
    assert.equal(isEvaluated(auto, new Map(), []), false);
    assert.equal(isEvaluated(auto, new Map(), [{ id: 'a', name: 'Prívod-1NP', color: '#000000', count: 8 }]), true);
  });

  it('súhrn: počty na pravidlo, izolácia zvlášť, legenda', () => {
    const iso = { rev: 'r2', rules: [{ name: 'Zóna', count: 40 }], isolated: 40 };
    const s = summarizeLens(lens, new Map([['aim-r1-0', 3], ['aim-r1-1', 5]]), [], 'r1', iso);
    assert.deepEqual(s.rules.map((r) => [r.name, r.count]), [['Prívod', 3], ['Odvod', 5]]);
    assert.deepEqual([s.matched, s.rev, s.active, s.isolation?.isolated], [8, 'r1', true, 40]);
    const none = summarizeLens(null, new Map(), [], undefined, iso);
    assert.deepEqual([none.active, none.isolation?.isolated], [false, 40]);
    assert.equal('isolation' in summarizeLens(null, new Map(), []), false);
    // Zlyhaná izolácia: stará izolácia sa nehlási, súhrn nesie verziu, ktorá zlyhala.
    const failed = summarizeLens(null, new Map(), [], undefined, iso, 'r2');
    assert.equal('isolation' in failed, false);
    assert.equal(failed.isolationFailed, 'r2');
  });
});
