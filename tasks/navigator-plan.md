# Navigator: what helps an architect find their way

Ten capabilities that give a model (Ask in the app, or any MCP client) the
whole-system view it cannot build by reading files. Branch `navigator` in both
repos (engine from 42b7384, rev 12; UI from a93faee).

## Where each piece lives

The rule: **a fact read from the source is the engine's** (a table, the same
for the CLI, SQL and every reader); **a reading over facts is the UI's** (an
exhibit, shared by chat, reports and MCP); **an intent is a thin question**
over exhibits.

| # | Capability | Engine (rev 13) | Exhibit | Intent |
|---|---|---|---|---|
| 1 | Map that fits a context window | `units.line`, `signature`, `page_rank`, `used_by`, `used_by_components`; `functions.signature` | `map` | `map` |
| 2 | Entry points and the trace from one | `entry_points` | `entries`, `trace` | `flows` |
| 3 | Who reads and writes which data | `data_entities`, `data_access` | `data` | `data` |
| 4 | The rules the code already keeps | none | `conventions` | `rules` (kind "kept") |
| 5 | What a component really exposes | none (`unit_connections`) | `surface` | `contracts` |
| 6 | Implementations and where they are wired | `unit_supertypes`, `bindings` | `implementations` | `contracts` |
| 7 | When and why an import appeared | none: blame on demand at the snapshot's commit | `origins` | `why` |
| 8 | The written intent, linked to code | `docs`, `doc_links` | `docs` | `why` |
| 9 | What is unusual here | none | `surprises` | `surprises` |
| 10 | Shared notes that persist | none (app.db `notes`) | `notes` | `notes` |

Plus: units become a subject (`resolveName` kind `unit`), so `trace`,
`contracts` and `why` take a class or function.

## Engine: one extension, one pass

`extensions/navigation` reads every source file once (lexically, per
language, comments stripped), keeps only small facts, and links them in
`EditResults` once units, functions and components are resolved — the
deployables extension's shape. No language pack changes except
`file.Function.Signature`, which the complexity walker already has the node
for.

Lexical, not tree-sitter: routes, entities and bindings are spelled the same
way across a language's frameworks, a recogniser is a pattern plus a few
lines, and one table of recognisers covers eleven packs. Every row carries
`file`, `line` and `framework` so a reader can check it.

### Tables

- `entry_points`: `kind` (`http`, `page`, `message`, `event`, `schedule`,
  `cli`, `main`, `job`), `method`, `path` (prefix joined where the class or
  group gives one), `framework`, `handler` (as written), `unit`, `function`,
  `component`, `file`, `line`.
- `data_entities`: `entity` (unit id, empty when none), `name`, `table`,
  `store` (`sql`, `document`), `framework`, `file`, `line`.
- `data_access`: `unit`, `function`, `component`, `target` (table or entity
  as named), `entity` (unit id when resolved), `access` (`read`, `write`,
  `read_write`), `via` (`repository`, `sql`, `jpql`, `orm`, `dbset`),
  `file`, `line`.
- `unit_supertypes`: `unit`, `supertype` (unit id, empty when outside),
  `name` (as written).
- `bindings`: `interface`, `interface_unit`, `implementation`,
  `implementation_unit`, `mechanism` (`bean`, `component_scan`, `xml`,
  `guice`, `dotnet_di`, `autofac`, `laravel`, `symfony`, `angular`), `file`,
  `line`.
- `docs`: `file`, `kind` (`adr`, `readme`, `architecture`, `guide`,
  `changelog`, `contributing`), `title`, `status`, `date`, `words`.
- `doc_links`: `doc`, `component`, `how` (`located_in`, `names_path`,
  `names_component`), `mentions`.

Unit page rank: deterministic power iteration over sorted ids (gonum's is
not, see engine-nondeterminism).

### Edge origins on demand

Blame costs ~160 ms per file (Sakai: ~2 min for every import at scan time,
against a 27 s scan). So it is not a table: the app and the MCP server blame
only the files carrying the edge asked about, at the snapshot's commit
(reproducible), and cache by (commit, file).

## UI

- Snapshot gains optional `history?: { blame(file, lines, commit) }` and
  `root?` (workspace path); the app implements it with a Go binding, the MCP
  server with `git` via child_process.
- Exhibits in `features/navigation/exhibits/`, registered in the catalog,
  en + nl strings.
- Intents: `map`, `flows`, `data`, `contracts`, `why`, `surprises`, `notes`;
  `rules` gains the kept rules.
- Notes: app.db migration, `NotesService` binding, MCP writes through the
  same schema.

## Order

1. Engine rev 13: signatures, rank, supertypes; entry points; data; bindings;
   docs. Tests per recogniser on fixtures; checked on Broadleaf, django-oscar,
   nopCommerce, Sylius, gin, LibreChat, archstats-ui.
2. UI: snapshot accessors, the ten exhibits, intents, MCP, notes.
3. Benchmark: one question per capability added to the Ask benchmark.

## Status (2026-10-02, uncommitted on `navigator` in both repos)

Engine (rev 13), `extensions/navigation` plus `core/unit/rank.go`,
`file.Function.Signature`, units columns, indexes, DESCRIPTION.md:
- Tests: `extensions/navigation/navigation_test.go` (Spring, JAX-RS, Retrofit
  and Feign excluded, Express with axios excluded, Django with oscar's
  get_class, gin groups, cobra, ASP.NET attribute and conventional routes,
  Symfony YAML with import prefixes, Next.js config gate, JPA, SQL in Java
  strings, Django models by inheritance, bindings, docs, unit rank) and
  signature tests in five packs. `go test ./...` green.
- Scanned Broadleaf, django-oscar, nopCommerce, Sylius, LibreChat,
  archstats-ui, fineract, archstats: every new table identical across two
  scans of one commit; nopCommerce scan time unchanged (46 s).
- Map order changed from page rank to reach (other components using a unit):
  rank flows down chains and ranked a 9-user type above an 82-component one.

UI:
- Exhibits in `features/landmarks/exhibits/` (map, entries, trace, data,
  surface, implementations, origins, docs, conventions, surprises, notes),
  en + nl in `locales/*/landmarks.json`. `ExhibitDef.maxFacts` lets the map
  state its whole budget.
- Readings leave tests out (`productionComponents`): fineract's integration
  tests had become the biggest area, the strongest rule and every surprise.
- Intents: `flows`, `data`, `contracts`, `why`, `surprises`, `note`; `rank`
  among `units` is the map; `rules` kind `kept` is conventions. Cap raised
  to 20.
- Blame on demand: `WorkspaceService.Blame` (Go, cached per file and commit)
  and `nodeHistory` (MCP). Notes: app.db migration 5, `NotesService`, a
  Notes tab on the Evidence board, `nodeNotes` for MCP (refuses to write to
  an app.db the app has not migrated).
- MCP serves 19 tools, takes `--repo` with `--db`, and its instructions say
  where to start.
- Tests: contract and intent tests green on 8 real snapshots for everything
  new; `npm test`, i18n checks green; Notes pane checked in the browser.

Not done:
- The Ask benchmark: Ollama was in use by another session.
- Dedicated views for entry points, traces and data: today they show as
  exhibits in Ask, reports and MCP.
- Engine tag and UI go.mod bump: the app scans with whatever engine go.work
  points at.
