# Scenario 02 · Steward · nopCommerce (C# / .NET, two points in time)

## The codebase

| | |
| --- | --- |
| Repo | `~/workspace-manager/workspaces/personal/nopCommerce` |
| Head | `develop` @ `381bc0a4` (2026-09-19) |
| Baseline | tag `release-4.80.0` @ `0334c75cca` (2024-12-12), 1,123 commits earlier |
| Workspace | `nopCommerce` |
| Workspace id | `5b79ae51-993f-474f-8be8-bf3c41a0cc07` (for `StartAt` and `DRIVE_WORKSPACE=nopCommerce`) |
| Scans | **none at the current revision.** At setup, scan **both** commits with `ScanService.StartAt` (head first), then set the baseline in the app (Changes → baseline). |
| Shape (rev 0, stale) | about 700 components, 5,600 files, 288 authors |

**Why this codebase:** it is C#, the one tree-sitter language no other
scenario covers. It is a layered .NET solution (Core, Data, Services, Web,
Plugins) with a real history between two releases, which tests the whole
comparison path.

## Persona: P2, the steward

You lead the team that owns nopCommerce. The last time you looked properly
was at the 4.80 release. You have a planning meeting next week and want
refactoring time.

## Task, in the persona's words

> "What changed structurally between 4.80 and now? Did we add coupling
> between layers that should not know each other (Web reaching into Data,
> plugins reaching into Core internals)? Did any tangle grow? Which hotspots
> got hotter? Declare the layering we intend (Presentation → Services → Data
> → Core, and plugins only through Services) and tell me where the code
> breaks it today. Give me one figure I can put in front of management, and
> set things up so I can re-run the same check at the next release."

## Deliverable

1. A declared lens (the Layers lens) with its Rules result.
2. A Changes comparison (baseline 4.80 against head).
3. A saved report that re-runs on a newer snapshot, holding the figure for
   management.
4. The lead's memo: the drift found, and the three refactors worth asking
   for.

## Done looks like

- Both snapshots are compared, and comparability is stated: whether both
  scans are the same revision and have the same ignore rules.
- The component and dependency drift is quantified (added and removed
  components, dependency count, largest tangle before and after).
- The layer declaration is expressed with groups by query over namespaces
  (`Nop.Core.**`, `Nop.Data.**`, `Nop.Services.**`, `Nop.Web.**`,
  `Nop.Plugin.**`). Rules lists the crossings with file:line.
- Hotspots that heated up between the two snapshots are named.
- The report re-runs against the head snapshot and shows what moved.

## What this scenario stresses

- Rescan of a commit, and baselines.
- Changes: Compare and Over time; comparability gates.
- C# parsing and namespace components.
- Groups by query over namespace globs.
- Declare dependencies → Rules.
- Report cells that re-run on a newer snapshot.

## Answer key

```bash
python3 answers/keys.py "<head snapshot>" --baseline "<4.80 snapshot>" --focus 'Nop.Web%'
```

Scenario keys are in `answers/02.md`. Compute them after both scans exist.

## Shape

Standard run. Setup takes longest here: two scans of a large C# repo.
