# Scenario 06 · Developer restructuring their own app · archstats-ui (TypeScript / Vue / Nuxt + Go)

## The codebase

| | |
| --- | --- |
| Repo | `~/workspace-manager/workspaces/personal/archstats-ui` |
| Commit | `cffe84f`, the state **before** the 2026-09-24 restructure. Always scan this commit, never `main`: `main` is already restructured. |
| Baseline | `957cc4c7` (2026-09-20), for Over time |
| Workspace | `archstats-ui` |
| Workspace id | `099dcb36-96a1-4ff1-a7aa-9003993ef0de` (for `StartAt` and `DRIVE_WORKSPACE=archstats-ui`) |
| Pinned scans (rev 3) | head `d09de9f2-c9ff-4222-b84f-51feaa907bb3`; baseline `0961b37e-929a-4238-8148-4374b369f830` |
| Shape (rev 3) | 21 components, 433 production files (217 `.vue`, 151 `.ts`, 33 `.go`), about 69k lines, 2 authors |

**Why this codebase:** this is the **regression baseline** of the loop. It is
the exact job of the first dogfood (2026-09-24), with a known-good answer (the
manual restructure on `main`, and 17 findings in
`tasks/dogfood-comparison.md`). Re-run it whenever the engine or the UI
changes, to see the score move. It is also the one Vue/Nuxt codebase, which is
where the engine's known blind spots are.

## Persona: P6, the developer restructuring their own app

## Task, in the persona's words

> "I think the codebase now is poorly structured. Lots of utils, very hard to
> navigate code. Refactor it into clean modules and components according to
> application architecture good practices. I need a plan I can implement: a
> target structure, where every file under utils, stores, composables and
> components goes, what is dead, and which dependencies must be cut. And I
> need it checked in the tool before I start."

## Deliverable

The lead's final plan, in the same format as the 2026-09-24 run:

1. Decision memo.
2. Move map in the `restructure.py` format.
3. Up to five other changes.
4. Evidence-and-effort table.
5. Tool verdict.

The facilitator implements it on a branch, then measures it:

- mutual module pairs;
- violations of its own rule;
- tests;
- the 36-route sweep.

## Done looks like

Scored against the 17-finding table in `answers/06.md`. The first run found
11 of the 17 fully, and 2 more in part. A better score is the goal of the
loop.

## What this scenario stresses

- The `.vue` gap and the auto-import gap. These are expected to improve once
  the engine parses `.vue` files.
- File-grain groups.
- Declare → Rules.
- The Sandbox.
- Units, Cycles and Search.

## Answer key

```bash
python3 answers/keys.py "<snapshot of d09de9f2>" --baseline "<snapshot of 0961b37e>"
```

Plus `answers/06.md`.

## History

**2026-09-24 (run 3 of the first dogfood):**

- 11 of 17 findings found, 2 in part.
- The plan left 32 mutual pairs and 51 own-rule violations.
- About 2.8M tokens.
- Branch `refactor/archstats-clicks`.
- The first row of `results/SCORECARD.md`.
