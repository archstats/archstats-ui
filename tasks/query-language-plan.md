# Groups by query

A group stops being a list of ids and becomes a description of what belongs
in it. Worked out in conversation 2026-09-20; this is the build order.

## Vocabulary

Three nouns and two adjectives. Everything else is engine-internal and stays
out of the architect's way.

| word | means |
|---|---|
| **group** | a named set of units, with a colour |
| **lens** | a set of groups answering one question. *Replaces "dimension".* |
| **query** | the text that finds a set. Runs live while you type. |
| *live* | the group **is** its query; re-computed every scan |
| *fixed* | the group **is** its members; the query is kept and re-checked |

Not "rule": every rule this audience knows (lint, firewall, CI) is something
that fires and blocks. This describes a set, it does not govern anything.

Not "snapshot" for *fixed*: the app already means a scan by that word.

`way`, `cut` and `grain` survive only inside the discovery studio. They are
engine settings, not architect vocabulary.

## The language

```
line   := ["!"] source ["where" cond {"and" cond}]
source := <glob> | "components" | "files"
cond   := <metric> [op number]          # bare metric means "> 0"
op     := >  >=  <  <=  =  !=
```

- Lines **union**. `!` lines **subtract**, always last, wherever they sit.
  The moment line order matters, reordering becomes a hidden mechanic and
  nobody can read a query and know what it does.
- `where … and …` **intersects**, within one line.
- No parentheses, no precedence, no nesting. You enumerate with OR and
  qualify with AND, which is how people actually talk about this.
- `*` matches within a segment, `**` across segments. The segment separator
  is `/` for files and whatever `pathStyle()` detected for components, so
  `com.fedex.qp.shipdoc.**` and `repos/*/src/**` both read naturally.
- A term with no wildcard is a literal id — so a hand-picked selection and a
  query are **the same text**, and the engine's output is expressible in the
  same language as a typed one.
- The source decides the unit kind: a component glob binds component metrics,
  `files where …` binds file metrics.
- Metric names come from the snapshot's own `_metric_definitions` table, by
  column id or by a short alias (`lines`, `efferent`, `instability`,
  `page_rank`, `hotspot_score`). Autocomplete and documentation come free,
  and any extension that adds a metric extends the language.

Verified against the qp-visualizer snapshot (611 components):

```
com.fedex.qp.shipdoc.**                              →  26
com.fedex.qp.customer.**                             →  72
**.controller                                        →  18
**.service.impl                                      →  20
components where lines > 2000                        → 101
components where efferent > 20                       →  16
```

## Deliberately not building

**Relational predicates** — `uses(P)`, `used_by(P)`, `@GroupName` references,
and the cycle detection they drag behind them. Designed, then cut. They serve
only "findings", most findings do not want to be groups, and the one case
that justified them — migration blast radius — is *better* frozen: you scope
a migration once and work through it for weeks, and a scope that silently
grows on Tuesday because someone added an import is a hazard, not a feature.

Replaced by an **expand by dependencies** operation in the view, with
`Save as group` that freezes the result to literals. Same outcome, no
language.

The grammar is additive, so deferring costs nothing: `where lines > 2000`
written today parses identically the day `uses()` arrives. If people keep
expanding and saving the same thing, that is the evidence to add it — and by
then the shape they need is known instead of guessed.

## Open decisions

1. **Overlap.** Today the store enforces one group per dimension. Two queries
   will both match something. Recommendation: legal and loud — a
   `3 in two groups` counter in the lens header, click to see which queries
   claimed what. Blocking would kill saving on the fly, which is the point.
   *Needs a decision before Stage 2.*
2. **Rename timing.** `dimension` → `lens` touches wide but shallow. Doing it
   after the model is proven avoids renaming twice.
3. **Whether metric `where` ships in the first visible release** or only
   globs. The parser handles the full grammar either way.

## Stages

Each stage is independently shippable and independently verifiable. The
benches added on 2026-09-20 do the verifying.

### 1 · The language, headless

`src/utils/query.ts` — parse and evaluate. No UI, no store change, no
behaviour change in the app.

- segment-aware glob matching over an arbitrary delimiter, reusing
  `pathStyle()` / `detectSeparator()` from `studio.ts`
- no dependency: the semantics are ours (`**` across a detected separator,
  `!` applied last), so a library would be fought rather than used
- unit tests pinning: union across lines, subtraction regardless of order,
  segment boundaries, literal terms, `where` on both unit kinds
- **`bench/query.bench.ts`, which answers the open question**: for each group
  the engine proposes on Broadleaf and qp-visualizer, what is the shortest
  term set that covers it, and what fraction is covered in ≤3 terms? That
  number decides whether "save this proposal as a query" is one keystroke or
  a manual cleanup, and it is measurable before any UI exists.

Done when: tests pass and the bench prints the coverage distribution.

### 2 · The group model

- `SavedGroup` gains `query?: string`, `mode: 'live' | 'fixed'`, and
  `foundBy?: { query, scanId, at }` for provenance
- `STORAGE_VERSION` 3 → 4. Existing groups migrate to `fixed` with no query,
  which is the honest reading: we do not know how they were made. Keep the v3
  payload under a backup key for one release, since localStorage migration is
  one-way.
- resolution: a live group evaluates its query against the current snapshot;
  a fixed group returns its members. Memoised per (snapshot, query) — every
  view that colours by lens will resolve every group, so this must not be
  O(views × groups × units).
- store tests, including the migration

Done when: the app behaves exactly as before, on migrated data.

### 3 · Rename dimension → lens

Its own commit, vocabulary only, so it is reviewable and revertable.

### 4 · The query editor

The panel: a text area, and beneath it the live match list — matched units
with their file counts, and excluded units still visible, labelled with the
line that removed them. A query must always be able to explain itself.

Every keystroke re-matches. `GLOB` over 611 rows is free, so the preview is
the feedback and you never apply a query you have not already seen the result
of.

### 5 · Save to lens

One shared component behind all ten surfaces that create groups today.

- a pure glob saves silently as **live**. Saving members there is strictly
  worse: rename a package and a fixed list drops 26 components in silence,
  while a live query reports `1 query matches nothing`.
- a query containing `where` opens the choice, because the intent genuinely
  cannot be inferred. State the consequence in *this group's* numbers
  ("matches 9 components today"), and say plainly that fixed keeps the query
  as a watchlist — without that line people choose live out of loss aversion.
- asked once per group, changeable later from the group panel. Not a nag.

### 6 · The lens header

Where the model pays for itself:

```
Lens  Domains ▾   580/611 matched · 3 in two groups · 1 query matches nothing
```

and for fixed groups with provenance:

```
God Components    9 members · query now matches 12  →  review 3
```

Drift is reported, never absorbed. New matches are offered, never added
silently. Same family as the engine's proposal gate handing work back rather
than parcelling everything out.

### 7 · The query bar, everywhere

Type a query on any view; it highlights in place. Name it, save it to a lens.
A lens gets *born* here, not just added to — you find one team's components,
save them, and the Teams lens exists now.

You do not build a lens, you accumulate one.

### 8 · The studio, reframed

The engine's proposals become queries with provenance
(`found by: Domains preset, first pass`) — the same object as a typed query
and a hand-picked selection. The studio stops being the front door and
becomes the room you visit to review what you have accumulated, or to run the
engine when you have nothing to query *for*.

## Risks

- **Resolution cost.** Live groups turn lens colouring into N query
  evaluations per view. Measure with the frame bench before and after Stage 2.
- **Overlap changes a guarantee.** Views that assume one group per unit will
  need to handle two. Audit them during Stage 2, not after.
- **Cheap saving accumulates junk.** The coverage and conflict counters are
  the backstop, and an unnamed group should nag. Still better than expensive
  saving: the whole point is to catch a thought when you have it.
