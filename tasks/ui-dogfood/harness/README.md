# Harness

Two scripts let agents use the real Archstats app safely, the way a person
does.

## serve-ui.mjs: the sandboxed app

```bash
node serve-ui.mjs <generated site dir> <port> --scan <scan id> [--sql on]
```

- Serves a `nuxi generate` build. Build it in a worktree, never in the live
  `frontend/`.
- Proxies `/wails/*` (bindings and websocket) to the running `wails dev` on
  :34115.
- Injects a stub that runs before the app boots:
  - every snapshot read goes to `--scan`;
  - `QueryService.Open` is a no-op;
  - the SQL console (`Console`, `QueryLimited`) throws, unless `--sql on`;
  - scanning, workspace edits, state writes, evidence and PDF export are
    no-ops, or kept in memory.

  The owner's open snapshot and `app.db` do not change. Check
  `QueryService.CurrentScan()` on :34115 before and after.

## drive.mjs: a hand on the mouse

One persistent headless Chrome per session. It has no way to run JavaScript
in the page: the UI is the only way in. Settings come from the environment:

- `DRIVE_URL`: the served app, default `http://localhost:4103/`;
- `DRIVE_WORKSPACE`: the workspace name to select on start;
- `DRIVE_SESSIONS`: where session files go, default
  `$TMPDIR/archstats-drive-sessions`.

```bash
D=tasks/ui-dogfood/harness/drive.mjs
node $D <session> start              # opens the app in DRIVE_WORKSPACE
node $D <session> look               # visible text + numbered controls with tooltips (+ suggestions of a focused field)
node $D <session> click 12           # click control 12 from the last look (or: click "Cycles")
node $D <session> hover 7            # hover (or hover <x> <y>)
node $D <session> clear              # empty the focused field; always before retyping
node $D <session> type "utils"       # type into the focused field (appends)
node $D <session> key Enter          # Enter, Escape, Tab, ArrowDown... (+ Meta/Shift/Control)
node $D <session> scroll 600         # scroll (or scroll 600 <x> <y> inside a panel)
node $D <session> text 8000          # all text in the main area, including below the fold
node $D <session> shot /path/x.png   # screenshot; read the PNG for pictures
node $D <session> clickxy 640 380    # click a point seen in a screenshot
node $D <session> back
node $D <session> goto '#/views/metrics'   # like a bookmark; prefer clicking
node $D <session> stop
```

Every action is logged to `<session>.log`. Count actions for scoring from
those logs.

## Known harness limits

These are not product bugs.

- Native `title` tooltips do not render in screenshots. `look` prints them
  instead.
- `key a Meta` does select-all through an editing command. `clear` is more
  reliable.
- A `<datalist>` dropdown does not render headless. `look` lists its
  suggestions while the field is focused.
- Typing a newline into a single-line input does not add a line. Use
  `key Enter`.
