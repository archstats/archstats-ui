# Implementation plan: CI/CD

*Written 2026-10-29 from the approved spec `specs/cicd.md`. Phase 2 of spec-driven development. The task list is `tasks/cicd-todo.md`. Nothing is built yet.*

## Overview

Deployables becomes CI/CD in two repos.

- **Engine (`archstats`):** a new `extensions/cicd` reads pipelines into a real structure (triggers → jobs → steps, with hand-offs and outputs) for GitHub Actions, GitLab, Jenkins and Rancher (first-class), and for Azure, Bitbucket and CircleCI (tier 2). It reads Dockerfiles into stages and facts, joins artifacts to the steps that build them and the components inside, and writes hygiene flags. `extensions/deployables` is removed, and the analysis revision goes to 13.
- **UI (`archstats-ui`):** a new `features/cicd` and `/views/cicd` with three modes, Pipelines · Images · Flags. Every surface that read deployable tables moves to the new ones, and `features/deployables` is removed.

The work is ordered so that one system, GitHub Actions, goes through the whole stack early. The table shape is proven on real data before five more readers are written against it.

## Architecture decisions

1. **One fact model, six readers.** Every reader produces the same `pipelineFact`, holding `triggers`, `jobs`, `steps`, `handoffs`, `outputs` and `unread` regions.
   - Step verbs and tools come from one shared classifier: today's `readShell`/`classifyText`, moved and widened.
   - Readers never fail. What they skip becomes an `unread` row with a line range and a reason.
2. **Jenkins is read with a tokenizer, not a parser.**
   - A small Groovy lexer (strings, GStrings, slashy strings, comments, braces) produces a call tree: `name(args) { block }`.
   - Declarative and scripted both read from that tree.
   - An unknown top-level call becomes a `library_step` hand-off. With no `@Library` line, the library is recorded as `implicit`, meaning it is configured on the Jenkins server.
   - Loops and closures that build stages are `unread: dynamic_stages`.
   - No Groovy module and no evaluation.
3. **`depth` is computed in the engine.** It is the longest `needs` path, worked out once and deterministically, so every consumer (UI, Ask, reports, `archstats assert`) lays out the same way.
   - Systems with implicit order (GitLab stages, Jenkins sequential stages, Bitbucket steps) turn that order into `needs` at read time.
4. **Artifacts carry over, the runtime half does not.**
   - The image-build readers (compose `build:`, Skaffold, Jib, Spring Boot, buildpacks), SAM/Serverless, desktop and mobile readers, and the contents/components join move into `extensions/cicd`.
   - Links, environments, config values, dotenv and deps are deleted.
5. **Flags are a pass over facts, not a reader.** `flags.go` runs after linking, over the fact model, and each rule is a small function that emits `(rule, subject, detail, file, line)`. Rule ids are stable strings, shared with `docs/rules/cicd.yml` and the UI's strings.
6. **The UI model is pure TypeScript.** `cicd.ts` loads the tables once per snapshot and builds the list rows, the graph layout (columns from `depth`, rows packed per column, matrix collapsed, partial placeholders placed by line), the artifact join and the flag groups.
   - Components only render.
   - Graph geometry is tested without a DOM.
7. **Branches and isolation.**
   - Engine: worktree `feature/cicd` off engine `main`.
   - UI: worktree `feature/cicd` off UI `main`, with its own `go.work` pointing at the engine worktree.
   - Both live checkouts carry other sessions' uncommitted work, and other sessions commit to archstats-ui mid-task, so nothing touches them.

## Corpus survey (2026-10-29)

These are all local workspaces (`~/workspace-manager/workspaces/*`), counted by a Python walk.

| System | Local files | What they look like | Consequence |
|---|---|---|---|
| GitHub Actions | 445 workflows in 45 repos, 4 actions | Ordinary to heavy: the client repos with many workflows, fineract 27, Sylius 21, librechat 20, terraform/GCP factories | Local corpus is enough; add 3–4 public heavy users of reusable workflows and `workflow_run` |
| Jenkins | 18 files in 6 repos | 8 declarative files of about 300 lines each with no library (client, qp-visualizer); hibernate-orm 2 scripted files of about 400 lines plus 3 declarative, all with `@Library`; BroadleafCommerce library-only (implicit); gke-ipam scripted `podTemplate`; django-oscar declarative | The screenshot case is the easy one. The bar is the 300–400-line declarative and scripted files. Add a public shared-library repo (`vars/`) to prove library resolution |
| GitLab CI | **0** | none on disk | The corpus is entirely public: gitlab-org/gitlab (deep `.gitlab/ci` includes, rules, needs), gitlab-org/cli, gitlab-org/gitlab-runner, plus 3–5 mid-size projects (inkscape, fdroidserver, a GNOME app). Pinned in T0 |
| Rancher | **0 config files** | Only client notes (dictu): GitLab CI runs `rancher login <server> --token $TOKEN --context <cluster>:<project>`, then `rancher kubectl apply -f k8s/{deployment,service,ingress}.yaml`, with per-environment variables `RANCHER_PROJECT_{DEV,TST,ACC,PRD}`, separate NP and P servers, `--skip-verify`, and images tagged `latest` | Hand-written fixtures modelled on that pattern (generic names; no client facts). Fleet from rancher/fleet-examples; legacy `.rancher-pipeline.yml` from public examples |
| Dockerfiles | 119 in 23 repos | mixed | Enough, plus the reference systems |

Client repositories (qp-visualizer, the dictu notes) are measured locally only, and their facts are never committed.

## Dependency graph

```
T0 setup, baseline, corpora pinned + corpus runner
 └─ T1 model + extension skeleton + views ── T2 move artifact + slim manifest readers
     ├─ T3 step classifier
     │   └─ T4 GitHub Actions (first-class) ─────────────┐
     │       ├─ T5 Groovy lexer → T6 Jenkins declarative → T7 Jenkins scripted + libraries
     │       │                                          → T7b shared libraries in the workspace
     │       ├─ T8 GitLab core → T8b GitLab includes, components, cross-project
     │       ├─ T9 Rancher CLI deploys (needs T8, T2) → T10 Rancher Fleet + legacy pipelines
     │       └─ T11 workspace resolution + starts_pipeline links (all tier 1)
     │           ═══ Checkpoint A2: tier 1 meets the first-class bar on the corpus
     │       ├─ T11a Azure · T11b Bitbucket · T11c CircleCI  (tier 2, cuttable)
     ├─ T12 Dockerfile facts + tables
     │   └─ T13 flags (Dockerfile rules) → T14 flags (pipeline + Rancher rules) → T15 assert templates
     └─ T16 outputs ↔ artifacts join (incl. deploy targets → manifests → images)
 T17 contract (DESCRIPTION, ADR, metric defs, revision 13)  ← all engine tasks
 T18 golden + determinism + secrets + e2e  → T19 delete extensions/deployables
                                               ═══ Checkpoint B (engine done)
 UI: T20 cicd.ts load + list (needs T4 snapshot) → T21 graph layout → T22 page + Pipelines mode
     T23 inspector · T24 Images mode · T25 Flags mode · T26 states
     T27 component detail + lens · T28 nav + redirect · T29 Ask · T30 reports + catalog
     T31 delete features/deployables + sweep → T32 capture round → Checkpoint C
```

The UI can start at T20 as soon as T4 produces a snapshot with the new tables, while T5–T16 continue. In practice everything runs in this session, in order, because code is written in the main session only.

## Phases and checkpoints

### Phase 0: Setup (T0)
- Create both worktrees and the UI `go.work`.
- Record a baseline on the fixture set with today's engine (pipelines, `parsed` state, deployables per kind), so the new engine can be shown to lose nothing it used to find.
- Pin the fixture repositories to commits.

### Phase 1: Model and first system (T1–T4)
Prove the table shape end to end on GitHub Actions, the system read best today.

**Checkpoint A** (Ryan reviews):
- A snapshot of a GitHub-heavy repo has `pipelines`, `pipeline_jobs`, `pipeline_steps`, `pipeline_triggers`, `pipeline_handoffs` and `artifacts`, filled and sensible.
- The table shape is frozen after this. Later changes to it need a note in the spec.

### Phase 2: Tier 1 to first-class, then tier 2 (T5–T11c)
- Order: Jenkins (the screenshot), then GitLab, then Rancher (which rides on GitLab and Jenkins deploy steps), then resolution across the workspace.
- Each reader lands with its fixtures and tests before the next one starts.
- The corpus runner (T0) reports `full`/`partial`/`none` per system after every reader. It is the measure for the first-class bar.

**Checkpoint A2** (Ryan reviews):
- Each tier-1 system has at least 95% of corpus files read `full`, and every `partial` names its lines.
- Cross-repo references inside a workspace are resolved.
- Rancher deploys are followed to images.
- Only after this does tier 2 start, and Ryan may cut it here.

### Phase 3: Images and flags (T12–T16)
Dockerfile facts, the two flag passes, the assert templates, and the join from pipeline outputs to artifacts.

### Phase 4: Contract and clean-up (T17–T19)
- Docs, ADR, metric definitions, revision 13, the golden, determinism and secret tests, and the real-repo e2e.
- Then delete `extensions/deployables`.

**Checkpoint B:** `go test ./...` is green, spec criteria 1–6 are met on the engine side, and Ryan reviews the engine diff. **Ask Ryan before** committing, tagging, or bumping the UI `go.mod`.

### Phase 5: UI (T20–T31)
Model and layout first, then the page and its three modes, then every other surface, then deletion and the sweep.

### Phase 6: Verify (T32)
- One capture round: four pinned snapshots (GitHub-heavy, Jenkins scripted plus library-only, GitLab with Rancher deploys, and the three-repo workspace), both schemes, Pipelines/Images/Flags plus component detail.
- Fix everything it shows in one batch, then at most one confirming round.

**Checkpoint C:** all ten spec success criteria are checked off with evidence in the status section of `cicd-todo.md`.

## Fixture set

Unit fixtures are hand-written, one per construct, in `extensions/cicd/testdata/<system>/`. Corpora are whole repositories pinned to a commit and run by the corpus runner; only their counts are recorded.

| Purpose | Source |
|---|---|
| Screenshot case: library-only Jenkinsfile | `BroadleafCommerce/Jenkinsfile` (local) |
| Jenkins scripted, long, with libraries | `hibernate-orm/Jenkinsfile`, `nightly.Jenkinsfile` (about 400 lines each, local) |
| Jenkins declarative, long | `hibernate-orm/ci/*.Jenkinsfile` (local); the 8 client qp-visualizer Jenkinsfiles (local only, never committed) |
| Jenkins scripted, `podTemplate` | `gke-ip-address-management/Jenkinsfile` (local) |
| Jenkins shared library in the workspace | a public `vars/` library repo pinned in T0, placed in a two-repo fixture workspace with an app that calls it |
| GitHub Actions | the 445 local workflows; `elepy`, `archstats`, `archstats-ui`; reference systems in `tasks/system-model-research.md` §8; 3–4 public repos heavy on reusable workflows and `workflow_run` |
| GitLab CI | public corpus pinned in T0 (gitlab-org/gitlab, gitlab-org/cli, gitlab-org/gitlab-runner, 3–5 mid-size projects); a two-repo fixture workspace for `include: project:` and `trigger: project:` |
| Rancher CLI | hand-written GitLab and Jenkins fixtures on the per-environment `rancher login --context` + `rancher kubectl apply` pattern, with manifests next to them |
| Rancher Fleet, legacy Rancher Pipelines | rancher/fleet-examples (pinned); public `.rancher-pipeline.yml` examples |
| Azure, Bitbucket, CircleCI (tier 2) | hand-written fixtures plus one public repo per system |
| Dockerfiles, artifacts | the reference systems (microservices-demo, petclinic-microservices, otel-demo, bank-of-anthos, eShop, SAM cart) already in `e2eTest/deployables_e2e_test.go` |
| Scale | the client workspace, read locally only; its facts are never committed |

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No local GitLab or Rancher config to test against | "First-class" claimed on fixtures only | Public GitLab corpus pinned in T0. Rancher fixtures follow a real pipeline pattern, with names made generic. Ryan is asked at A2 whether a real GitLab + Rancher repo can be measured locally |
| Rancher means several things (CLI deploys, Fleet, legacy Pipelines, cluster annotations) | Wrong one built first | CLI deploys first, because that is the pattern in real use; Fleet and legacy pipelines in T10 |
| Scripted Groovy is open-ended | Jenkins reads stay "partial" | Tokenizer plus call tree, not a grammar. Measure on the three local scripted files in T7. Anything unfollowable is a named region, which still meets criterion 1. |
| Six readers drift apart in meaning ("job", "gate") | Inconsistent graph | One fact model and one classifier (T1, T3). A per-system mapping table in the ADR. Shared test helpers that assert the same row shapes. |
| GitLab `include`/`extends` and Azure templates chain deeply | Wrong or missing jobs | Resolve local files only, with a depth limit of 5 and cycle guard. Remote ones are hand-offs. Unresolved ones go to `cicd_unresolved`. |
| Engine nondeterminism (known problem) | Golden test flaps | Sort at every emit. The determinism test runs two scans in one test. Map iteration is banned in emit paths (helper `sortedKeys`). |
| Breaking the snapshot contract | Old consumers break | Revision 13, `hasView` guards, the rescan state, and removed tables listed in `DESCRIPTION.md`. |
| Ask golden fixtures and report templates read deployable tables | Ask/report regressions | T29/T30 regenerate the goldens on a revision-13 snapshot and diff the intents. Python sweep in T31 (grep is unreliable in archstats-ui). |
| Concurrent sessions committing in archstats-ui | Lost or tangled work | Worktree on its own branch; nothing in the live checkout. |
| UI needs a tagged engine to build for release | Release blocked | Dev uses `go.work`. Tag and `go.mod` bump only at Checkpoint B, on Ryan's yes. |
| Capture harness writes into the real app.db | Stray data | Proxy stub with overrides (the 2026-10-01 sandbox lesson), checked before any write. |

## Out of scope for this plan

Toolchain drift, end-of-life base images, dismissing flags, run history, and the systems marked `read: none` (Travis, Cloud Build, Drone, Tekton, Argo Workflows).
