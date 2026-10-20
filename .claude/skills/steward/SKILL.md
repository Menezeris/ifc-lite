---
name: steward
description: >-
  How to drive a fork pull request: what blocks it (CI, a security finding),
  what does not (review bot findings labelled minor, collected into a follow-up
  PR), the "Ako vyskúšať" test link Samuel uses, and why a feature PR is never
  merged on its own (it ships inside a release batch). Read before acting on CI
  or review events on a fork PR.
---

<!-- This Source Code Form is subject to the terms of the Mozilla Public
     License, v. 2.0. If a copy of the MPL was not distributed with this
     file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Driving a fork PR (AIM D-103, D-114)

A feature PR runs only the fast lane and ships inside a release batch (skill
`release-train`): CI on the batch is the gate to production. Review findings are not,
except security ones. Rules and reasons: `docs/FORK_MAINTENANCE.md`, "Fast CI for AIM
pull requests" and "Release train".

## What the PR must have

- Green `AIM fast checks` on the current head (and `Build + WASM + Rust + Node`, which
  is quick on the fast lane). Red: fix and push.
- No open finding labelled **blocker (security)**. Fix it in this PR.
- No merge conflict with `main`: merge `main` into the branch.
- An **"Ako vyskúšať"** section in the body, in Slovak: the test link
  `https://ai-mviewer.vercel.app/ifc?viewer=pr-<this PR number>` (the AIM host with this
  PR's viewer preview) and 2-5 concrete steps: what to click, which MCP prompt to send,
  what Samuel should see. Try them yourself first, live, where the session can.

## What does not block it

- A `Claude review` finding labelled **minor**. When CI is green, do not push a fix for
  it in this PR. Reply once on its thread (one line: "collected for the follow-up PR" or
  why it is wrong), resolve it, and list it in the PR body under "Follow-up" (after CI
  finishes: a body edit replays the CI verdict). Collect the findings of several PRs
  into one follow-up PR later.
- A minor finding the next push fixes anyway may ride that push. Do not push only for it.
- `PR review signal` warnings about reviewer quota or stale reviews.

## Merge

**Do not merge a feature PR on its own**, even green. Say it is ready to try (with the
test link) and leave it open. It goes to `main` in a release batch when Samuel names it
(skill `release-train`). Only an explicit word from Samuel for this one PR ("zlúč #73
samostatne") merges it alone: then add the `ci:full` label and push (a re-run keeps the
labels of the original event), so the full CI runs, and merge with a merge commit once it
is green. Never squash or rebase.
