# Scenario 03 · New joiner · django-oscar (Python / Django)

## The codebase

| | |
| --- | --- |
| Repo | `~/workspace-manager/workspaces/personal/django-oscar` |
| Branch and commit | `master` @ `0dfeaa79` (2026-09-11) |
| Workspace | `django-oscar`. Not "django-oscar (Python)", a fixture workspace with one author. |
| Workspace id | `750697f7-439e-42d9-9e29-34d62ae23f2a` (for `StartAt` and `DRIVE_WORKSPACE=django-oscar`) |
| Pinned scan (rev 3) | `091654b7-7bfd-4598-8b8a-be1ab07a6ce9` |
| Shape (rev 3) | 122 components (directories), 649 production files, about 56k lines, 370 authors, 3 tangles (the largest has 30 components) |

**Why this codebase:** Django apps give a clean feature-per-directory layout
with heavy test suites, abstract models and pluggable apps. It is a
mid-sized, well-known open-source codebase with a long history and many
contributors. It tests a local, feature-scoped workflow rather than a
system-wide one.

## Persona: P3, the new joiner

You joined the team on Monday. Your first ticket: "Add an optional
gift-message step to checkout, shown before payment." You have not changed
anything in Oscar before.

## Task, in the persona's words

> "Before I touch anything: where does checkout live, and what are its parts?
> What does checkout depend on, and what depends on it? If I change the
> checkout flow, what could break? Which tests cover checkout, and are there
> areas with no tests? Who knows this code best, and is that knowledge
> recent? What is fragile or hot around here that I should be careful with?"

## Deliverable

A one-page onboarding note in the app's Evidence report, with:

- the map of checkout (files and roles);
- its dependencies and dependents;
- its tests;
- its experts;
- where the risk is.

Plus the lead's memo on how fast the UI got a newcomer there.

## Done looks like

- `src/oscar/apps/checkout` is found fast (Go to anything or Search), and
  its files and roles are listed.
- Its dependencies (address, customer, order, payment, core, forms and
  others) and its dependents (mostly tests) are stated, with the
  direction right. Beware: the "Depends on / Used by" counts sum both
  directions.
- Its test coverage is located: `tests/{unit,integration,functional}/checkout`.
- The concentration of authorship is stated with recency (one author holds
  about 70% of checkout's commits; say whether that is recent).
- The nearby hotspots (order and basket abstract models) and the tangle that
  checkout sits in, or near, are noted.
- Basket/order co-change coupling is examined as a risk for the ticket.

## What this scenario stresses

- ⌘P and Search.
- Component detail: Reading, Connections, Cycles, Inside, History.
- File detail: Imports, History, Source.
- The Production/Tests facet.
- Who knows it, and Units in Python.

## Answer key

```bash
python3 answers/keys.py "<snapshot of 091654b7>" --focus '%checkout%'
```

Scenario keys are in `answers/03.md`.

## Shape

Standard run, or a smoke run (lead + 1 round × 2) after onboarding-related
UI changes. This is the cheapest scenario.
