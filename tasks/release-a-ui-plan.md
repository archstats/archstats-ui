# Release A in the UI

The engine gained four things that no screen shows: modules, rules, edge
kinds and unresolved edges. Each is finished and tested there; none is
visible here.

Staged one surface at a time, per the token rule in CLAUDE.md.

## What the engine now exposes

| View / column | What it holds | Shipped |
|---|---|---|
| `rules` | rule, from, to, kind, file, line — one row per violation | yes |
| `modules` | name, kind, directory, manifest, files, declared/internal dependencies | yes |
| `unresolved_edges` | from, names, file, line, reason | yes |
| `component_connections_direct.kind` | `import`, `type_only`, `dynamic`, `embed`, `manifest` | yes |
| `files.module` | which declared module owns a file | yes |
| `summary.module_count`, `summary.unit_count__*` | counts | yes |

**Every snapshot taken before this has none of them.** Existing scans in
`~/Library/Application Support/archstats/scans` carry 22 tables and none of
these four. Every surface below must guard with `hasView` and stay silent
rather than empty — the same way the Java section already hides itself.

## Stages

### 1. Rules — the verdict — **done**

The one an architect opens the tool for. A rule is not a metric: a number
goes up or down and somebody has to decide what it means, a rule is kept or
broken and the answer names the file and the line.

- Nav entry under a new **Architecture** group, hidden unless `hasView('rules')`.
- Empty state when the view exists and holds nothing: "No violations" is a
  real result and must read as one, not as missing data.
- Rows grouped by rule, each carrying its definition from `definitions`
  (rules are registered there, so the long description is already available).
- A violation names `file:line`; clicking it opens the file detail.
- Runs on Sylius, where exactly one rule is broken.

Built: `pages/views/rules.vue`, `utils/rules.ts` (18 vitest cases), an
**Architecture** nav group guarded by `hasView('rules')`.

One engine change was needed to make the screen honest. The `rules` view
returned violations only, so a rule that reported nothing was ambiguous:
checked and held, or never applied. "Core must not depend on a plugin" has no
opinion about a Go repository, and showing that repository a green tick claims
something nobody checked. Every rule now reports `status` —
`violation`, `ok` or `not_applicable` — and the screen keeps the three apart:
**broken**, **Kept**, **No opinion here**. A project that declares no modules
still gets no verdict at all.

### 2. Modules — the other boundary

A component is where the code says it lives; a module is what the project
builds and publishes, and for .NET, Symfony, npm workspaces and gradle the
second is the boundary an architect asks about.

- Module as a column and a filter wherever files are listed.
- A Modules surface: name, kind, files, internal dependencies.
- Care needed in wording: "component" and "module" now both exist and sound
  alike. The nav and the empty states have to make the difference obvious.

### 3. Edge kinds — coupling that means coupling

- `kind` on the connections views, with `type_only` visibly distinct.
- A note where coupling is totalled: erased imports are recorded and not
  counted, and the user should be able to see how many.

### 4. Unresolved edges — the admitted gap

- Surfaced next to coupling, not hidden in a table nobody opens: "31% of this
  codebase's edges are dynamic, 17 could not be placed" is the honest
  headline for a codebase like django-oscar.

## Verification

`npm run check` on changed files before reporting anything. Screenshots only
for the route changed, one scheme.

A snapshot with these tables is needed to see any of it: the checkouts in
`e2eTest/temp_testdata` of the engine repo are convenient, and Sylius is the
one that produces a rule violation.
