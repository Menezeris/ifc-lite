---
name: release-train
description: >-
  How to ship several fork PRs to main at once as one release batch (AIM
  D-114): build the `release/aim-<date>` branch from the PRs Samuel names,
  resolve conflicts between them, run the full CI once, give Samuel the test
  link, merge on his word, check the deploy. Use when Samuel says which PRs
  to release ("zlúč 73, 74, 76", "pusti balík").
---

<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Release batch: several PRs, one full CI (AIM D-114)

Feature PRs run only the fast lane and are **never merged on their own**. They reach
`main` inside a batch: one PR from `release/aim-<date>` that carries 3-4 of them (or
what Samuel names), runs the full CI once and is merged only when Samuel says so.
Rules and reasons: `docs/FORK_MAINTENANCE.md`, "Release train".

## 1. Pick the PRs

- Take exactly the PRs Samuel named. Each must have a green fast lane on its head and
  no open **blocker (security)** finding. A red one: say which and why, leave it out
  unless Samuel says to wait.
- Read each PR's diff and the files they share (`gh`-free: the GitHub MCP tools or
  `git diff --stat origin/main...origin/<branch>`). Two PRs touching the same lines are
  the conflict to plan for, not to discover.

## 2. Build the batch branch

```bash
git fetch origin main <branch-1> <branch-2> ...
git switch -c release/aim-$(date -u +%Y-%m-%d) origin/main   # add -2, -3 for a second batch that day
for b in <branch-1> <branch-2> ...; do git merge --no-ff "origin/$b" -m "release: merge $b"; done
```

- **Merge commits only**: no rebase, squash or cherry-pick. Each PR's head commit must
  stay in the batch unchanged, so GitHub marks the PR merged when the batch lands.
- **Conflicts are yours to resolve well**, keeping both features. Understand both sides
  first (both PR descriptions, the decisions they cite). Typical spots: one AIM-FORK
  block both PRs extended, `bridge-protocol.ts` message unions, `aim-fork.en.ts`,
  `tests/perf-ratchets/bundle.json` (take the larger ceiling, re-measured on the batch),
  `docs/FORK_MAINTENANCE.md` tables. Regenerate generated files and lockfiles with the
  repo's tooling, never by hand.
- When the same logic changed on both sides and keeping both loses behavior, stop and
  ask Samuel; do not pick one silently.

## 3. Check it locally before the push

The fast checks of every merged PR together (aim-feature skill, step 2) and the bundle
of the whole batch (step 3): two features can each fit the pre-approved raise and
exceed it together. Over the limit: say so in the batch PR and ask.

## 4. Open the batch PR

- Title: `release(aim): <date> - #73, #74, #76`. Body: one line per PR (number, title,
  decision), the conflicts you resolved and how, the bundle numbers.
- Labels: `revert-oracle-exempt` when the merged PRs carry mutation evidence for new
  modules (the oracle judges the whole batch; aim-feature skill, step 4).
- **Test link** for Samuel: the AIM host with the batch's viewer preview,
  `https://ai-mviewer.vercel.app/ifc?viewer=pr-<batch PR number>`, and per feature what
  to try (the "Ako vyskúšať" lines of the merged PRs).

## 5. Full CI, then Samuel

- The batch runs the full `test.yml` (branch `release/aim-*`). Red: find which PR's
  change breaks it, fix it on the batch branch (or on the feature branch and merge it in
  again), push. Never skip, disable or quarantine a test.
- Green: tell Samuel it is ready to try, with the test link. **Merge only on his word**,
  with a merge commit. The feature PRs then show as merged; check each one did and close
  any that did not with a comment pointing at the batch.

## 6. After the merge

- `aim-release.yml` tags the merge commit `aim-release-<date>-<sha>`.
- Vercel deploys production; `aim-smoke.yml` smokes it. Red smoke: open the run, and if
  production is broken roll back first (Vercel, project `ifc-lite-viewer`, Deployments,
  the previous production deployment, Instant Rollback), then fix in a new feature PR.
- Delete the merged branches if the GitHub UI does not.
