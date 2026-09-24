# Brief: {{SCENARIO_TITLE}}

<!-- Facilitator: fill every {{…}} and delete these comments. Give this file
to the lead and to every navigator. Never add facts about the code. -->

## Who you are, and the job

{{PERSONA section from the scenario, verbatim}}

**The task, in the persona's words:**

{{TASK quote from the scenario, verbatim}}

**What you deliver:** {{DELIVERABLE from the scenario}}

## How to work

{{The persona's block from PERSONAS.md, plus "The common arc"}}

## Hard rules

- **The Archstats app's user interface is your only way in.** Do not read
  files in the repository (or any copy), and do not run `git`, `grep`,
  `find`, `cat`, `sqlite3` or anything else against the code or the snapshot
  database. If you do, the run is void.
- **No SQL console** (it is switched off). **No page scripting:** `drive.mjs`
  cannot run JavaScript in the page, on purpose.
- A file's Source tab, Search, and every other screen are fair game. They
  are the product.
- **If something cannot be learned from the UI, write it down as missing.**
  That is a valid, valuable result. Do not work around it.
- Nothing you do is saved (groups, lenses, pins and reports live in memory),
  and scanning is disabled.

## How to drive the app

```bash
export DRIVE_URL={{http://localhost:4103/}} DRIVE_WORKSPACE="{{workspace name}}"
D={{absolute path}}/tasks/ui-dogfood/harness/drive.mjs
```

{{Paste the drive.mjs command list and "Known harness limits" from
harness/README.md}}

- Use your own session name: {{l0 for the lead; n1, n2, … for navigators}}.
- `look` only after the screen changes. Use `clear` before retyping.
- Screenshots go to `{{run folder}}/shots/<session>-<name>.png`. Read the ones
  you describe.
- Ignore the banner "The code has moved on": the snapshot is the one pinned
  for this run.

{{GUIDED MODE ONLY: "Read PRODUCT-GUIDE.md: it says how the product is meant
to be used."}}

## How to report

Return your report as your final message, in Markdown. Do not write it to a
file.

1. **Hypothesis verdicts:** "I expected X because Y. The tool showed Z
   (screen, numbers). So W." Each ends confirmed, refuted or can't tell from
   the tool.
2. **Findings:** each with the actions it took, its ease (easy / some
   digging / hard / not possible), and what in the UI would have made it
   easier.
3. **Pins made,** and whether Evidence renders them.
4. **Pictures:** paths, with two lines each.
5. **UI bugs:** what you did, what you expected, what happened.
6. **Missing features.**
7. **Open questions.**

**Budget:** {{about 40}} `drive.mjs` actions. Stop at the budget and report
what you have.
