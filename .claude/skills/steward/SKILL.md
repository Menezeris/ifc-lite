---
name: steward
description: >-
  How to drive a pull request in this fork to merge: what blocks it (CI, a
  security finding) and what does not (review bot findings labelled minor,
  which are collected into a follow-up PR). Read before acting on CI or review
  events on a fork PR.
---

<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Driving a fork PR to merge (AIM D-103)

The fork deploys `main` to production on merge, so CI is the gate. Review findings
are not, except security ones. Rules and reasons: `docs/FORK_MAINTENANCE.md`,
"Fast CI for AIM pull requests".

## What blocks the merge

- Red CI on the current head: `Build + WASM + Rust + Node` (test.yml) and, on the
  fast path, the `AIM fast checks` jobs. Fix and push.
- A finding labelled **blocker (security)**. Fix it in this PR.
- A merge conflict. Merge `main` into the branch.

## What does not block it

- A `Claude review` finding labelled **minor**. When CI is green, do not push a
  fix for it in this PR: every push costs a full CI round. Reply once on its
  thread (one line: "collected for the follow-up PR" or why it is wrong), resolve
  it, and list it in the PR body under "Follow-up" (after CI finishes: a body
  edit replays the CI verdict). Collect the findings of
  several PRs into one follow-up PR later.
- A minor finding the next push fixes anyway may ride that push. Do not push only
  for it.
- `PR review signal` warnings about reviewer quota or stale reviews.

## Merge

The PR is ready when CI is green, no **blocker (security)** finding is open and
there is no conflict. Production deploys from `main`, so merging needs Samuel's
consent (given in the task or in the PR). Merge with a merge commit, never
squash or rebase.
