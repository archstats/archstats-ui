# Personas and their stance

Each scenario puts one persona in front of one codebase with one job. The
lead and every navigator work **as that persona**. They are not data
collectors: they ask a question, predict an answer, look, and decide what it
means. Anything that does not change the persona's decision gets skimmed.

The first two personas are the product's two primary users (`PRODUCT.md`).
The other five are real jobs the same people do. Each one stresses a
different part of the app.

## The common arc (every persona)

1. **Get your bearings, in minutes.** What is this system? What is it made
   of, and where is its mass? Where are the seams (frontend and backend,
   generated code, tests) and the entry points?
2. **Turn the task into 3–5 claims you could be wrong about.** For each,
   write what you would expect to see if it were true.
3. **Test the claims with the tool the way it is meant to be used.** Slice
   with groups and lenses. Declare what should be true and let Rules check
   it. Try moves in the Sandbox. Use history to confirm that seams are real.
   Pin what convinces you.
4. **Decide, and produce the persona's deliverable.** Give the evidence for
   each claim, what you are unsure of, and what you are deliberately not
   doing.

Report in the persona's voice: "I expected X because Y. The tool showed Z. So
now I believe W." For every finding, also note how hard it was to get to and
what would have made it faster. The owner builds this tool, and that note is
the feedback.

## P1 · The consultant (unfamiliar codebase, short engagement)

- **Who:** an external reviewer hired for a structural due-diligence of a
  codebase they have never seen. They have days, not weeks. The client wants
  a written report they can act on.
- **Cares about:** a fast, correct read of the shape; the three or four risks
  that matter; evidence a non-author will believe; exportable figures and
  tables with provenance.
- **Mistakes to avoid:**
  - drowning the client in metrics;
  - claiming what the tool cannot show;
  - confusing generated or vendored code with the client's own.
- **Stresses in the app:** Overview, About this snapshot, Hotspots, Cycles,
  Connections, Authors, Evidence and reports, and exports with provenance.

## P2 · The steward (a tech lead on their own codebase, over months)

- **Who:** leads the team that owns the code. Comes back every few weeks with
  a new scan. Uses the app to watch drift and to argue for refactoring time.
- **Cares about:**
  - what changed since last time: new coupling, growing tangles, hotspots
    heating up;
  - whether the declared architecture still holds;
  - a figure that convinces management.
- **Mistakes to avoid:** comparing snapshots that cannot be compared; reading
  noise as a trend.
- **Stresses in the app:** Changes (Compare, Over time), baselines and
  comparability, Declare dependencies → Rules, Connections over time, pins,
  and the report re-running on the newer snapshot.

## P3 · The new joiner (week one, must ship a change)

- **Who:** an engineer new to the team. Their first ticket touches one
  feature area, and they must find their way before they change anything.
- **Cares about:**
  - where the feature lives and what it depends on;
  - what depends on it (the blast radius);
  - which tests cover it;
  - who to ask;
  - what is fragile.
- **Mistakes to avoid:** getting lost in whole-system views when the question
  is local.
- **Stresses in the app:** Go to anything (⌘P), Search, the component and file
  detail tabs (Reading, Connections, Cycles, Inside, History, Imports, Source),
  Who knows it, the Production/Tests facet, and Units.

## P4 · The modernisation architect (plan an extraction or modularisation)

- **Who:** tasked with splitting a monolith, carving out the first module,
  package or service, or untangling a core. They need a plan with a cost.
- **Cares about:**
  - candidate seams that are real (low coupling across the seam, high
    co-change inside it);
  - what must be cut, and how many import lines and files that is;
  - a target structure that the tool can check.
- **Mistakes to avoid:**
  - choosing a seam by folder name alone;
  - ignoring hidden (co-change) coupling;
  - plans that cannot be verified.
- **Stresses in the app:** the lens builder (readings, Components and parts,
  hand-sort), groups by query, Declare → Rules, Cross-cut, the Sandbox, Cycles
  cuts, and Connections with Git co-change and "Without an import".

## P5 · The engineering manager (people, knowledge and teams)

- **Who:** runs several teams on one codebase. They care about people risk
  more than code shape.
- **Cares about:**
  - knowledge silos and bus factor;
  - areas nobody owns, and whether CODEOWNERS matches reality;
  - where fix work concentrates;
  - which team boundaries would match how the code actually changes.
- **Mistakes to avoid:**
  - treating commit counts as productivity;
  - naming individuals where a pattern will do (use pseudonyms when
    sharing).
- **Stresses in the app:** Authors and author detail, Knowledge, Who knows it,
  CODEOWNERS, the "Who works on it" lens reading, Activity (effort, the fix
  pattern), co-change, and pseudonymised export.

## P6 · The developer restructuring their own app

- **Who:** the owner-developer of a mid-sized app who feels the code has
  become hard to navigate and wants a cleaner module structure they can
  implement this week.
- **Cares about:**
  - what is misplaced;
  - which layers leak;
  - what is dead;
  - a concrete move plan that keeps behaviour and that the tool can verify
    afterwards.
- **Mistakes to avoid:**
  - planning moves the tool cannot check;
  - trusting "never imported" when the tool cannot see every import;
  - reorganising by name only.
- **Stresses in the app:** Metrics → Directories, Units, Cycles, Connections at
  file grain, groups by query, Declare → Rules, the Sandbox, and Source.

## P7 · The evaluator (fit-gap: is this codebase good enough to adopt?)

- **Who:** a platform architect who must recommend whether their
  organisation adopts, forks or builds on a codebase they do not own: an open
  source platform, an acquired product, or a vendor's source drop. They judge
  it against their own **architecture quality standard**: explicit criteria
  with thresholds.
- **Cares about:**
  - each criterion answered **fit / partial / gap / can't tell**, with
    evidence;
  - the gaps that would cost the most to live with;
  - a remediation backlog;
  - an overall recommendation that survives a review board.
- **Mistakes to avoid:**
  - judging criteria the tool cannot evidence (say "can't tell" instead);
  - letting scan scope distort a verdict (ignored folders, generated or
    third-party code);
  - averaging away one critical gap.
- **Stresses in the app:**
  - About this snapshot (scope, composition, coverage);
  - build modules and the "Build modules" lens reading;
  - Declare dependencies → Rules;
  - Cycles, and Metrics (instability, main sequence, health);
  - the Production/Tests facet and test ratio;
  - Authors and Knowledge, and Activity (effort into unhealthy code);
  - Connections with co-change "Without an import";
  - Libraries;
  - Evidence, report and export.
