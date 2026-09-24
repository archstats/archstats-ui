# Runbook: one persona run, start to finish

This is written for the Claude session that runs a scenario (the
**facilitator**). Follow it in order.

The owner starts a run with one line:

> Run UI dogfood scenario 03 (tasks/ui-dogfood). Mode: guided.

## Roles

| Role | Model | Knows | Does |
| --- | --- | --- | --- |
| **Facilitator** | the main session | everything, including the answer key | sets up, relays, verifies, scores; never feeds findings to the others |
| **Lead** | Opus, a fresh agent | the persona, the task, the brief, the stance (and the product guide in guided mode) | orients (≤15 own actions), forms hypotheses, writes missions, decides, writes the deliverable |
| **Navigators** | Sonnet, fresh agents | the brief, the stance, the guide (in guided mode), their one mission | drive the UI with `drive.mjs`, report in the persona's voice |

Rules for the facilitator:

- **Never tell the lead or the navigators a finding about the codebase.** You
  may pass on harness facts and product facts (how a feature works). You may
  not pass on facts about the code.
- **Before you relay a "bug", check it.** Read the app's source or the
  snapshot and classify it as harness fault, product bug, engine bug or
  navigator error. Record it in the run's facilitator notes. Harness faults
  are never scored against the product.
- **Code is written by the main session.** Subagents only look and report.
- **Unblocking.** When a navigator hits an issue already in `ISSUES.md` (or
  one you have just verified), relay the product fact or workaround once, so
  the run is not wasted. Example: "new pattern lines start with `**`; clear
  first". Record the hit as a finding against that issue. Do not relay
  workarounds pre-emptively in guided mode: the first encounter is the
  measurement.

## 0. Before anything

- Read the scenario file and `answers/README.md`.
- Check that `wails dev` is running: `curl -s localhost:34115` returns 200.
  Never start, stop or restart it.
- Never run `nuxi build` or `generate` inside the live `frontend/`. Build in
  a worktree (step 1).

## 1. Setup (facilitator only)

1. **A build of the app under test.** Use `git worktree add --detach <scratch>/wt-ui <commit>`
   at the commit being tested (usually `main`). Then:
   ```bash
   cp -Rc frontend/node_modules <wt>/frontend/
   cd <wt>/frontend && npx nuxi generate
   rm -f dist
   ```
   Record the commit in the result.
2. **The snapshot.** Use the scenario's pinned scan if its
   `analysis_revision` equals the engine's current `core.AnalysisRevision`.
   Otherwise scan the pinned commit with the current engine:
   - in the browser pane on `http://localhost:34115`, run
     `await window.go.app.ScanService.StartAt('<workspace id>', '<commit>')`;
   - wait until `app.db` `scans.status='complete'`.

   Scans of big repos take minutes. Record the scan id.
3. **Serve it, sandboxed:**
   ```bash
   node tasks/ui-dogfood/harness/serve-ui.mjs <wt>/frontend/.output/public 4103 --scan <scan id>
   ```
   Add `--sql on` only if the scenario allows the SQL console (none do by
   default). The server pins every read to that scan, and writes are no-ops or
   kept in memory. The owner's app does not move. Check this with
   `QueryService.CurrentScan()` on :34115 before and after the run.
4. **Answer key:**
   ```bash
   python3 tasks/ui-dogfood/answers/keys.py <snapshot.db> [--focus ...] [--baseline ...]
   ```
   Use the flags the scenario lists. Save the output in the run folder as
   `answer-key.md`. Show it to no agent.
5. **The run folder:** `tasks/ui-dogfood/results/<date>-<scenario>/`. Copy
   in the brief you will give (with the paths filled in).

## 2. The brief (what every agent reads)

Fill `templates/brief.md` into the run folder as `brief.md`. It is assembled from:

- **The persona and the task:** the scenario's "Persona" and "Task" sections,
  verbatim.
- **Hard rules:**
  - The UI is the only way in. No repo files, no `git`/`grep`/`sqlite3`, no
    SQL console, no page scripting.
  - If something can't be learned from the UI, record it as missing.
- **The driver:** the `drive.mjs` section of `harness/README.md`, with:
  - `DRIVE_URL=http://localhost:4103/`
  - `DRIVE_WORKSPACE=<the workspace name>`
  - a session-name convention (`l0` for the lead, `n1`, `n2`, … for
    navigators).
- **Stance:** the persona's stance from `PERSONAS.md`.
- **Mode:**
  - **guided:** attach `PRODUCT-GUIDE.md`.
  - **unaided:** do not. Unaided runs measure discoverability. Run each
    scenario unaided at least once.

## 3. Rounds

- **Prompts** are in `templates/prompts.md`.
- **Lead, first call:** read the brief, orient with at most 15 actions of its
  own, then reply with:
  - orientation (≤150 words);
  - 3–5 falsifiable hypotheses, each saying what it would expect to see;
  - round-1 missions (3–4, parallel, about 40 actions each).
- **Navigators:** one Sonnet agent per mission, in parallel, each in its own
  session. Their prompt is the brief plus their mission. They return the
  report in their final message; subagents cannot write report files.
  Extract it from the task output JSONL into `round-N/report-<session>.md`.
- **Between rounds:**
  - Verify any claimed bugs (see the rules above).
  - Add to `facilitator-notes.md`.
  - Relay the reports to the lead, plus the harness facts only.
  - At most 3 rounds, plus one optional follow-up round of at most 2
    missions.
- **Final:** the lead writes the persona's deliverable (the scenario says
  what it is), a verdict per hypothesis with evidence, an evidence-and-effort
  table per finding, and the tool verdict (what helped, what got in the way,
  top 5 improvements).

**Report format for navigators** (put it in the brief):

1. **Hypothesis verdicts:** "I expected X because Y. The tool showed Z
   (screen, numbers). So W." Each ends confirmed, refuted or can't tell from
   the tool.
2. **Findings:** each with actions taken, ease (easy / some digging / hard /
   not possible), and what in the UI would have made it easier.
3. **Pins made,** and whether Evidence renders them.
4. **Pictures:** paths plus two lines each.
5. **UI bugs:** what they did, what they expected, what happened.
6. **Missing features.**
7. **Open questions.**

**Budget guard:** navigators overran 2–4× in the first run. Tell them:

- `look` only after a state change;
- `clear` before retyping;
- stop at the budget and report what they have.

## 4. Scoring (facilitator)

Fill `score.md` in the run folder from `SCORING.md`:

- **Answer key coverage.** For each key K1–K7 (plus the scenario's own keys):
  - found / partly / missed / wrong;
  - which screen it came from;
  - the actions it took.
- **The deliverable,** against the scenario's "Done looks like" checklist.
- **Ease distribution:** counts of easy, some digging, hard, not possible.
- **Cost:**
  - total drive actions (the session logs in `$TMPDIR/archstats-drive-sessions/*.log`);
  - tokens (from the agents' usage);
  - wall time.
- **Friction:** verified product bugs, engine bugs, missing features, and
  budget overruns.
- **Discoverability** (unaided runs): which intended features were found
  without the guide.

## 5. Close the loop

1. **Issues.** Add or update rows in `ISSUES.md`:
   - one row per verified product or engine issue;
   - dedupe against existing IDs;
   - add the scenario to its "seen in" list.
2. **Scorecard.** Append one row to `results/SCORECARD.md`.
3. **Tasks.** Offer to spawn a task for each new P0 or P1 issue. The owner
   picks; do not fix product code inside a dogfood run.
4. **Artefacts.** Commit the run folder (briefs, missions, reports, notes,
   key, score). Screenshots stay in scratch unless they are cited.
5. **Clean up:** stop the servers, `node drive.mjs <session> stop` for every
   session, and remove the worktree.

## Cost guide

| Run | Shape | Rough cost |
| --- | --- | --- |
| Full | Lead + 3 rounds × 4 navigators + a follow-up | about 2.5–3M tokens, about 2 h agent time |
| Standard | Lead + 2 rounds × 3 navigators | about 1M tokens |
| Smoke | Lead + 1 round × 2 navigators | about 400k tokens; use it after a fix to check one issue |

Pick the smallest run that answers the question. Smoke runs are how the loop
stays cheap.
