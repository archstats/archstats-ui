# Scenario 01 · Consultant · BroadleafCommerce (Java / Spring, large)

## The codebase

| | |
| --- | --- |
| Repo | `~/workspace-manager/workspaces/personal/BroadleafCommerce` |
| Branch and commit | `develop-7.0.x` @ `86458736` (2026-05-04) |
| Workspace | `BroadleafCommerce` |
| Workspace id | `330e8cd8-d0d1-4de3-9a6a-f6ef4ecbcd1d` (for `StartAt` and `DRIVE_WORKSPACE=BroadleafCommerce`) |
| Pinned scan (rev 3) | `1beac0c4-ce1c-4439-88fd-5026db629508` |
| Shape (rev 3) | 459 components (Java packages), 3,037 production files, about 357k lines, 115 authors, 18 tangles |

The largest tangle has 61 components. Some of the code is vendored or
generated (admin JS).

**Why this codebase:** it is big, old, multi-module Java with Spring and JPA,
and it has real tangles. It tests whether the app scales to hundreds of
components, and whether the Java-specific views (Spring, JPA, classes) earn
their place.

## Persona: P1, the consultant

An e-commerce company is deciding whether to keep building on this platform
or replace it. You have been hired to give them a structural read. You have
never seen the code.

## Task, in the persona's words

> "Give me a structural health report of this codebase that my CTO can read
> in ten minutes. What are the main parts and how do they depend on each
> other? What are the three to five structural risks that would make changing
> it expensive (tangles, hotspots, knowledge that sits with one or two people,
> hidden coupling)? For each, show me the evidence. End with your
> recommendation: invest, contain or replace, and where to start."

## Deliverable

A report built in the app's Evidence view and exported to Markdown, with at
least three pinned figures or tables, each carrying provenance. It is
attached to the run as `deliverable.md`, plus the lead's decision memo.

## Done looks like

- The main parts are named correctly: core, admin/openadmin, common,
  profile and framework modules. Where the code mass sits is stated.
- The biggest tangle is identified with its size, and a first cut is
  proposed from the Cycles guide.
- The top hotspots are named, and generated or vendored files are
  distinguished from hand-written code.
- The most depended-on components are called out as load-bearing.
- Knowledge concentration is stated with care, as a pattern and not as blame.
- At least one hidden (co-change without import) coupling is examined.
- Every claim has a screen or number behind it, and the report exports with
  provenance.

## What this scenario stresses

- Overview and About this snapshot.
- Hotspots at scale.
- Cycles with 61-component tangles.
- Connections at hundreds of nodes.
- The Java views: classes, Spring, JPA, OOP.
- Authors and Knowledge.
- Evidence, report and Markdown export.

## Answer key

```bash
python3 answers/keys.py "<snapshot of 1beac0c4>"
```

Scenario keys are in `answers/01.md`.

## Shape

Standard run: lead + 2 rounds × 3 navigators. Run it unaided first, then
guided.
