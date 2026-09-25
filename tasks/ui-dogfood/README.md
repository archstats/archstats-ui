# UI dogfood: a persona-driven feedback loop for Archstats

**Goal:** to find out how well the Archstats UI works for real people doing
real jobs on different kinds of codebases, and to make that number go up
release by release.

## How it works

Each run puts one **persona** (a real job, see `PERSONAS.md`) in front of one
**codebase** (a real open-source repo, pinned to a commit) with one **task**.

- **The lead** is an Opus agent working as that persona. It orients, forms
  hypotheses and writes the persona's deliverable.
- **The navigators** are Sonnet agents. They click through the real app in a
  sandboxed headless browser: real mouse, keyboard and screenshots, and no
  SQL console or page scripting unless the scenario allows it.
- **The facilitator** (the main session) sets up, relays, checks every
  claimed bug against the code, and scores the run against an answer key
  computed from the same snapshot.

Each finding records how easy it was to reach (easy / some digging / hard /
not possible) and what would have made it easier. Verified problems go into
`ISSUES.md`, and each run adds a row to `results/SCORECARD.md`.

```
 personas × codebases ──► run ──► score vs answer key ──► ISSUES.md ──► fix
          ▲                                                              │
          └──────────── re-run the same scenario, compare the scorecard ◄┘
```

## The seven scenarios

| # | Persona | Codebase | Language and shape | What it stresses |
| --- | --- | --- | --- | --- |
| [01](scenarios/01-consultant-broadleaf.md) | Consultant: due-diligence report | BroadleafCommerce | Java / Spring, 459 comps, 61-comp tangle | scale, Java views, Evidence and export |
| [02](scenarios/02-steward-nopcommerce.md) | Steward: drift since the last release | nopCommerce | C# / .NET, two releases apart | rescan, Changes, Declare → Rules, re-running reports |
| [03](scenarios/03-newjoiner-django-oscar.md) | New joiner: first ticket in checkout | django-oscar | Python / Django, 122 comps | ⌘P, Search, detail tabs, tests facet, Who knows it |
| [04](scenarios/04-modernisation-sylius.md) | Modernisation: first package to extract | Sylius | PHP / Symfony, 1,378 comps | lens builder, groups by query, Rules, Sandbox at scale |
| [05](scenarios/05-manager-librechat.md) | Eng manager: knowledge risk and team split | LibreChat | TS / React monorepo, 234 authors | people views, CODEOWNERS, fix pattern, pseudonyms |
| [06](scenarios/06-developer-archstats-ui.md) | Developer: restructure own app (regression baseline) | archstats-ui @ cffe84f | TS / Vue / Nuxt + Go | `.vue` and auto-import gaps, file-grain groups, Sandbox |
| [07](scenarios/07-fitgap-fineract.md) | Evaluator: fit-gap against a quality standard (adopt or not) | Apache Fineract | Java / Spring, about 35 Gradle modules, core banking | About/scope, build modules vs imports, Rules, health, tests, people, Libraries, Evidence |

## Running one

Say to Claude, in this repo:

> Run UI dogfood scenario 03 (tasks/ui-dogfood). Mode: guided. Shape: standard.

- **Mode:**
  - `unaided`: no product guide. This measures discoverability.
  - `guided`: `PRODUCT-GUIDE.md` is attached. This measures the intended
    workflows.
- **Shape:** full, standard or smoke. See the cost guide in `RUNBOOK.md`.

The session follows `RUNBOOK.md` end to end, writes
`results/<date>-<scenario>/`, updates the scorecard and issues, and offers
tasks for new P0 and P1 issues.

## Files

| Path | What it is |
| --- | --- |
| `RUNBOOK.md` | the facilitator's protocol, step by step |
| `PERSONAS.md` | the seven personas and the stance every agent works in |
| `PRODUCT-GUIDE.md` | how the product is meant to be used (guided mode only) |
| `SCORING.md` | how a run is scored |
| `ISSUES.md` | the verified issue backlog, with IDs, severity and scenarios seen |
| `scenarios/` | one file per scenario: codebase, pinned commit and scan, persona, task, deliverable, "done looks like" |
| `answers/` | **facilitator only**: `keys.py` (add `--fitgap` for scenario 07), per-scenario keys, reference keys |
| `harness/` | `serve-ui.mjs` (the sandboxed server) and `drive.mjs` (the UI driver); see `harness/README.md` |
| `templates/` | `brief.md` (the brief every agent reads) and `prompts.md` (the lead and navigator prompts, and report extraction) |
| `results/` | one folder per run, plus `SCORECARD.md` |

## Ground rules that keep the loop honest

- **The facilitator never tells the lead or the navigators anything about
  the code.** It passes on harness facts and product facts only.
- **Every "bug" is checked against the source before it is counted.**
  Harness faults are recorded, never scored.
- **Keys are recomputed on the exact snapshot the UI reads.**
- **The same scenario is re-run after a fix** to show the change in the
  scorecard. Scenario 06 is the standing regression baseline.
- **Nothing a run does reaches the owner's app state.** The harness pins
  reads to one scan and makes writes no-ops. Check `CurrentScan()` before and
  after.
