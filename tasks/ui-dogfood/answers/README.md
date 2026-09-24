# Answer keys (FACILITATOR ONLY)

Never show anything in this folder to the lead or to a navigator. It is what
their findings are scored against.

- `keys.py <snapshot.db> [--focus ...] [--baseline ...]` computes the generic
  keys K1–K7 from the snapshot the app is reading:
  - K1 shape
  - K2 largest components
  - K3 tangles
  - K4 hotspots
  - K5 hubs
  - K6 co-change without an import
  - K7 knowledge concentration

  Optional flags add a focus area (F) and drift against a baseline (D).
  **Recompute the keys at every run.** Numbers move with the engine's
  analysis revision.
- `reference/` holds the keys as computed on 2026-09-24 (analysis revision 3)
  for the pinned scans, for comparison across runs.
- `0N.md` holds each scenario's own keys (S1…): facts specific to the
  persona's task, with how to verify them.

The keys measure whether the UI let the persona find what the snapshot holds.
They do not measure whether the snapshot is true. Engine errors show up
twice:

- as keys that are "right" but mislead (for example, archstats-ui's K5 lists
  `frontend/wailsjs/runtime` because of the Go import bug);
- as findings when a persona notices them.

Score both.
