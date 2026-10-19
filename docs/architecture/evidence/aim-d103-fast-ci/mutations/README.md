<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# AIM D-103 rýchle CI: dôkazy z chirurgických mutácií

PR pridáva nový skript `scripts/check-aim-fork-only.mjs` a nový export `findingSeverityLabel` v
`scripts/review/lib/review-findings.mjs`. Testy (`scripts/check-aim-fork-only.test.mjs`,
`scripts/review/post-review.test.mjs`) ich importujú, takže po vrátení produkčného kódu na base
sa nenačítajú a revert oracle v CI (`Changed tests observe production`) hlási
`REVERT-BROKE-BUILD`. Každé hlavné rozhodnutie oboch modulov je preto overené chirurgickou
mutáciou.

Každý patch je zapísaný mutant -> oprava (orientácia `git diff base...head`); oracle ho aplikuje
opačne. Každý beh skončil `OBSERVED` (exit 0) s overeným obnovením stromu, voči base
`origin/main`. Plné záznamy sú v `summary.json`.

| Patch | Modul | Mutácia | Test, ktorý sčervenal |
|---|---|---|---|
| `additions-outside-blocks.patch` | `check-aim-fork-only.mjs` | pridané riadky sa nekontrolujú voči blokom novej verzie súboru | `check-aim-fork-only.test.mjs` |
| `sync-branch-ignored.patch` | `check-aim-fork-only.mjs` | vetva `sync/upstream-*` nevynúti plné CI | `check-aim-fork-only.test.mjs` |
| `any-file-block-eligible.patch` | `check-aim-fork-only.mjs` | blok vo workflowe alebo skripte stačí na rýchlu cestu | `check-aim-fork-only.test.mjs` |
| `new-upstream-file-allowed.patch` | `check-aim-fork-only.mjs` | nový pôvodný súbor mimo AIM vrstvy prejde | `check-aim-fork-only.test.mjs` |
| `one-line-jsx-block-unread.patch` | `check-aim-fork-only.mjs` | blok otvorený aj zatvorený na jednom riadku (JSX) sa nerozpozná | `check-aim-fork-only.test.mjs` |
| `bundle-raise-unbounded.patch` | `check-aim-fork-only.mjs` | zvýšenie stropu viewer bundlu nemá limit | `check-aim-fork-only.test.mjs` |
| `related-tests-direct-only.patch` | `check-aim-fork-only.mjs` | súvisiace testy len z priamych importov, nie tranzitívne | `check-aim-fork-only.test.mjs` |
| `cap-judges-aim-dependents.patch` | `check-aim-fork-only.mjs` | limit 40 testov počíta aj závislé od AIM modulov, takže AIM-only PR padne do plného CI | `check-aim-fork-only.test.mjs` |
| `security-finding-labelled-minor.patch` | `review-findings.mjs` | bezpečnostný nález (`injection-attempt`) dostane štítok minor | `post-review.test.mjs` |

Workflowy (`aim-fast.yml`, kroky `aimonly` a `all` v `test.yml`, `aim-nightly-report.yml`) nemajú
unit test; skript nad históriou forku: #67 `fork-blocks` (32 súvisiacich testov), #66, #64, #63,
#58, #56 `aim-only`, synchronizácie, workflowy a #59 `full`.

## Replay

Čistý checkout vetvy s nainštalovanými závislosťami. Patche skopíruj mimo strom (oracle
odmietne špinavý strom), potom napríklad:

```bash
node scripts/check-test-revert-oracle.mjs --base origin/main \
  --only scripts/check-aim-fork-only.mjs \
  --test scripts/check-aim-fork-only.test.mjs \
  --mutation /tmp/d103-mut/additions-outside-blocks.patch --ci --json
```

`security-finding-labelled-minor.patch` používa `--only scripts/review/lib/review-findings.mjs
--test scripts/review/post-review.test.mjs`.
