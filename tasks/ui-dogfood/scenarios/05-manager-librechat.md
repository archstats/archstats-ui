# Scenario 05 · Engineering manager · LibreChat (TypeScript / React / Node monorepo)

## The codebase

| | |
| --- | --- |
| Repo | `~/workspace-manager/workspaces/personal/librechat` |
| Branch and commit | `main` @ `be4cf584` (2025-06-04) |
| Workspace | `LibreChat (TypeScript)` |
| Workspace id | `11111111-aaaa-4bbb-8ccc-000000000006` (for `StartAt` and `DRIVE_WORKSPACE=LibreChat (TypeScript)`) |
| Scans | **none at the current revision.** At setup, scan `be4cf584` with `ScanService.StartAt`. |
| Shape (rev 0, stale) | about 225 components, 1,800 files, 234 authors |

Layout: a React client (`client/`), a Node API (`api/`), and shared
`packages/`.

**Why this codebase:** it is an open-source TypeScript/React monorepo with
hundreds of contributors, a small core team, and frontend and backend in one
repo. It tests the people views at scale, TS/TSX support, and whether the
app handles a monorepo's package boundaries.

## Persona: P5, the engineering manager

You manage the two teams (web client, and API plus packages) that maintain
LibreChat inside your company's fork. Two senior people might leave next
quarter.

## Task, in the persona's words

> "Where does knowledge sit with one or two people, and would we be stuck if
> they left? Which areas have nobody who has touched them recently? Does our
> CODEOWNERS (if there is one) match who actually works where? Where does fix
> work concentrate, and is it in code that is also unhealthy? If we split the
> work into two teams, client and server, does the way the code changes
> together support that boundary, or do most changes cross it? Share it with
> me in a form I can show my director. Use pseudonyms, no names."

## Deliverable

A report with pseudonymised authors, covering:

- the knowledge-risk areas;
- ownership against CODEOWNERS;
- where fix effort goes;
- a verdict on the client/server team boundary, with co-change evidence.

Plus the lead's memo.

## Done looks like

- Knowledge concentration is found per area, with recency. "Knows best" and
  Knowledge are used, not just raw commit counts.
- Stale areas are identified by the last change and by the authors of the
  last 90 or 180 days.
- CODEOWNERS is checked against reality, or its absence is noted.
- The fix pattern is examined (the app's fix-commit pattern, with near
  misses checked). Effort into low-health files is quantified.
- The client/server boundary is tested:
  - as a lens (client / api / packages);
  - with co-change between the groups;
  - with commits that cross the boundary.
- Exports are pseudonymised, and that is verified in the exported file.

## What this scenario stresses

- Authors and author detail.
- Knowledge and Who knows it.
- CODEOWNERS.
- The "Who works on it" lens reading.
- Activity (effort, the fix pattern).
- Connections Git source at group level.
- Pseudonymised export.
- TS/TSX parsing.

## Answer key

```bash
python3 answers/keys.py "<new snapshot>" --focus 'client/src%'
```

Scenario keys are in `answers/05.md`. Compute them after the scan.

## Shape

Standard run.
