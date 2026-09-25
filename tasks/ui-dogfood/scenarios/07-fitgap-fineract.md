# Scenario 07 · Evaluator · fit-gap on Apache Fineract (Java / Spring, core banking)

## The codebase

| | |
| --- | --- |
| Repo | `~/workspace-manager/workspaces/personal/fineract` |
| Branch and commit | `develop` @ `c5160136` (2026-09-21); latest tag `1.15.0` |
| Workspace | `fineract` |
| Workspace id | `847a7d9c-3d75-4cb3-9dad-fd4490f0dc85` (for `StartAt` and `DRIVE_WORKSPACE=fineract`) |
| Scans | **none at the current revision.** At setup, scan `c5160136` with `ScanService.StartAt`. It is a big repo (about 8k files), so allow several minutes. |
| Shape (rev 0, stale) | about 1,160 components (Java packages), 8,200 files, 432 authors |

The build declares about 35 Gradle modules:

- domain modules: `fineract-loan`, `fineract-savings`, `fineract-accounting`,
  `fineract-charge`, `fineract-investor`, `fineract-progressive-loan`, …
- infrastructure: `fineract-core`, `fineract-command*`, `fineract-security`,
  `fineract-validation`, …
- the assembly: `fineract-provider`, `fineract-war`;
- tests: `integration-tests`, `fineract-e2e-tests-*`.

**Before scanning,** check that there is no local `.archstatsignore` or
unusual ignore file in the clone (`find . -name .archstatsignore`). Scan
scope decides the testability verdict. Scenario 01 is an example of a stray
ignore file removing every test.

**Why this codebase:** it is a real adopt-or-not decision that banks make. It
is a large, long-lived Apache project that has been modularising itself (a
monolith split into Gradle modules). Its build declares module dependencies,
so the fit-gap can compare what the build says with what the imports do. It
exercises almost every screen in one coherent job.

## Persona: P7, the evaluator

You are the platform architect of a mid-size bank. The board is deciding
whether to build its new lending product on Apache Fineract. You must judge
the codebase against the bank's **Architecture Quality Standard** below, and
recommend adopt, adopt with remediation, or don't adopt.

## Task, in the persona's words

> "Do a fit-gap of Fineract against our Architecture Quality Standard. For
> every criterion: what we require, what the code actually shows (with the
> screen and number), and fit, partial, gap or can't tell. Can't tell is an
> honest answer when the tool cannot show it. Then give me the three gaps
> that would cost us most to live with, a remediation backlog for them, and
> your recommendation. First, tell me what the scan does and does not cover,
> so nobody can say we judged the wrong code."

## The bank's Architecture Quality Standard (the criteria sheet)

| # | Criterion | Requirement (fit) | Partial | Gap |
| --- | --- | --- | --- | --- |
| R0 | Scope is understood | Languages, generated or third-party code, and ignored or unscanned parts are stated | some unknowns | scope unknown |
| R1 | Explicit modules | ≥ 90% of production code sits in declared build modules | 70–90% | < 70% |
| R2 | No structural tangles | no tangle larger than 5 components, and < 5% of components in tangles | largest ≤ 15, or < 15% | worse |
| R3 | The build tells the truth | module-to-module imports not declared in the build: 0, and no two modules import each other | ≤ 5 undeclared, no mutual | more, or any mutual pair |
| R4 | Stable foundations | the 5 most depended-on components have instability ≤ 0.3 | 3–4 of 5 | ≤ 2 of 5 |
| R5 | Code health | < 10% of production lines in files with health < 5 | 10–20% | > 20% |
| R6 | No god files | no production file over 3,000 lines | 1–3 such files | more |
| R7 | Testability | test lines ÷ production lines ≥ 0.5, and every domain module has tests | ≥ 0.25, or one untested domain module | worse |
| R8 | Actively maintained | ≥ 10 authors active in the last 180 days, and ≥ 50% of components changed in the last year | 5–9 authors, or 30–50% | worse |
| R9 | Knowledge is spread | no domain module with one author holding > 60% of its commits | one module over | several over |
| R10 | Few hidden couplings | < 5 component pairs that co-change (≥ 10 shared commits, ≥ 30%) without any import | 5–15 | > 15 |
| R11 | Dependencies are visible | the external libraries and frameworks used, per module, can be listed | partly | not visible |
| R12 | Change goes into healthy code | < 20% of lines changed in the last 90 days went into files with health < 5 | 20–35% | > 35% |

The thresholds are the bank's. Do not argue with them; apply them. Where the
tool shows a close proxy instead of the exact measure, say so and judge the
proxy.

## Deliverable

1. **The fit-gap matrix**: one row per criterion, with the requirement, the
   evidence (screen and number), the verdict, and a one-line risk.
2. **The top 3 gaps**, each with a remediation item and an effort guess.
3. **The recommendation**, and what would change it.
4. **The scope statement** (R0).
5. All of it as an Evidence report exported to Markdown, with a pinned figure
   or table for each gap.
6. The lead's tool verdict, which is part of every run.

## Done looks like

- **Every criterion has a verdict,** and every verdict cites a screen and a
  number, or says why the tool cannot show it.
- **The verdicts agree with the answer key.** The facilitator derives
  reference verdicts by applying the thresholds to `keys.py --fitgap`. A
  "can't tell" where the tool truly cannot show the measure counts as
  correct.
- **R3 uses the build's declared module dependencies** (the "Build modules"
  lens reading and its declared dependencies) against actual imports, and
  names the undeclared pairs.
- **R0 catches scope issues:** generated or third-party code, ignored
  folders, and test code by role.
- **No single critical gap is averaged away** in the recommendation.

## What this scenario stresses

- About this snapshot.
- The "Build modules" lens reading and declared dependencies.
- Declare dependencies → Rules.
- Cycles.
- Metrics (instability, main sequence, health).
- The Production/Tests facet.
- Authors and Knowledge.
- Activity (effort into low-health files).
- Connections Git "Without an import".
- Libraries.
- Evidence, report and export.

## Answer key

```bash
python3 answers/keys.py "<new snapshot>" --fitgap --focus 'org.apache.fineract.portfolio.loanaccount%'
```

Reference verdicts are in `answers/07.md`.

## Shape

Standard run. Use full if the lead needs a third round for R3 or R11.
