<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-114 release train: dôkazy z chirurgických mutácií

PR pridáva nový skript `scripts/aim-smoke.mjs` (smoke po nasadení) a mení rozhodovanie
v `scripts/check-aim-fork-only.mjs`. Test `scripts/aim-smoke.test.mjs` importuje nový modul,
takže po vrátení produkčného kódu na base sa nenačíta a revert oracle hlási
`REVERT-BROKE-BUILD`. Hlavné rozhodnutia oboch modulov sú preto overené chirurgickými
mutáciami.

Každý patch je zapísaný mutant -> oprava; oracle ho aplikuje opačne. Každý beh skončil
`OBSERVED` (exit 0) s overeným obnovením stromu, voči base `origin/main`. Záznamy sú v
`summary.json`.

| Patch | Modul | Mutácia | Test, ktorý sčervenal |
|---|---|---|---|
| `smoke-accepts-failed-query.patch` | `aim-smoke.mjs` | `QUERY_RESULT ok: false` prejde ako úspech | `aim-smoke.test.mjs` |
| `smoke-ready-not-required.patch` | `aim-smoke.mjs` | smoke prejde bez `READY` z mosta | `aim-smoke.test.mjs` |
| `smoke-trusts-any-origin.patch` | `aim-smoke.mjs` | hostiteľská stránka prijme správu z hocijakého pôvodu | `aim-smoke.test.mjs` |
| `release-branch-not-full.patch` | `check-aim-fork-only.mjs` | balík `release/aim-*` nedostane plné CI | `check-aim-fork-only.test.mjs` |
| `full-ci-label-ignored.patch` | `check-aim-fork-only.mjs` | štítok `ci:full` sa ignoruje | `check-aim-fork-only.test.mjs` |
| `outside-change-is-fork-blocks.patch` | `check-aim-fork-only.mjs` | zmena mimo blokov sa tvári ako `fork-blocks` | `check-aim-fork-only.test.mjs` |
| `cap-runs-all-tests.patch` | `check-aim-fork-only.mjs` | nad limitom 40 sa spustia všetky súvisiace testy | `check-aim-fork-only.test.mjs` |

Prvý beh `smoke-trusts-any-origin` skončil `UNOBSERVED`; test potom dostal kontrolu
filtra pôvodu a mutácia je `OBSERVED`. Workflowy (`aim-smoke.yml`, `aim-release.yml`,
kroky v `test.yml` a `aim-fast.yml`) unit test nemajú; `aim-smoke.mjs` bol overený naživo:
proti `https://ifc-lite-viewer.vercel.app/` prešiel, proti `https://example.com/` zlyhal
s "the viewer never sent READY".

## Replay

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only scripts/aim-smoke.mjs --test scripts/aim-smoke.test.mjs \
  --mutation /tmp/d114-mut/smoke-accepts-failed-query.patch --ci --json
```

Patche `check-aim-fork-only.mjs` používajú `--only scripts/check-aim-fork-only.mjs --test
scripts/check-aim-fork-only.test.mjs`.
