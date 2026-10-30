# Spec: CI/CD

*Approved 2026-10-29, with the recommendations on all four open questions. Replaces Deployables (Code · Ship · Run). Plan: `tasks/cicd-plan.md`; task list: `tasks/cicd-todo.md`.*

## Decisions taken (2026-10-29)

| Question | Answer |
|---|---|
| What is the view built around? | **Pipelines first.** The pipeline is the spine: triggers → jobs → steps. Dockerfiles and builds hang off the jobs that run them. |
| What happens to the runtime picture? | **The image stays, as the join only.** "The image this pipeline builds, from this Dockerfile, holding this code" stays. The service-to-service map (calls, messages, shared datastores), environments, config values and SBOM-lite leave. |
| Which insights? | **Pipeline anatomy, container images, hygiene flags.** Toolchain drift is not in v1. |
| Which CI systems are read fully? | **First-class (tier 1): GitHub Actions, GitLab CI, Jenkins (declarative and scripted), Rancher** (added 2026-10-29: "first in class support for GHA and GitLab and Rancher and Jenkins"). **Tier 2, read into the same model without the extra depth: Azure Pipelines, Bitbucket Pipelines, CircleCI.** Tier 2 comes after tier 1 and can be cut without touching anything else. |

This reverses one earlier call: the deployables plan (2026-09-27) put "CI security findings" out of scope. Hygiene flags bring a narrow, offline, file:line-backed part of that back in.

## Assumptions

Correct any of these before the plan is written.

1. **One feature across both repos.** Engine: a new extension `extensions/cicd` replaces `extensions/deployables`, bumping `core.AnalysisRevision` (12 → 13). UI: a new `features/cicd`, route `/views/cicd`; `/views/deployables` redirects there.
2. **The snapshot contract breaks on purpose.** The `deployable_*` tables are removed. `DESCRIPTION.md` lists what replaced them. A new ADR (0022) supersedes ADR 0021. Older snapshots open with a "Rescan to read CI/CD" state, never an error.
3. **Static only.** Archstats reads how the workspace is set up to build and ship, never what ran. There is no run history, durations, pass rate, DORA or anything that needs a CI server's API.
4. **Hygiene flags are facts, not grades.** Each flag names the fact ("No USER instruction: the image runs as root") with file:line and one plain sentence on why people care. There is no score, no total grade and no red/green verdict, per the "evidence over verdicts" principle.
5. **History comes free.** Pipeline files and Dockerfiles already have git rows. The inspector shows "changed N times in the last year, last on …, by …" from existing tables. No new git work.
6. **Hand-written readers, no new Go modules.** That includes Groovy: Jenkinsfiles are read with a brace- and string-aware tokenizer, not a Groovy parser. Anything it cannot follow is reported as an unread region with a line range.
7. **Work happens on fresh branches** (`feature/cicd` in both repos). Both checkouts currently carry other sessions' uncommitted work.

## Objective

**Who:** the two users in `PRODUCT.md`.
- The architect stewarding their own estate asks: "How does our code get built and shipped, is it consistent, and where is it fragile?"
- The consultant facing an unfamiliar estate asks: "What builds what, through which pipelines, from which base images, and what in the setup would I flag in a report?"

**Today's failure (the screenshot):** a Jenkinsfile shows as "Pipeline · Jenkins · read in part", seven empty stage dots and 0 deployables. The page cannot say what the pipeline does, why it was only partly read, or which part was missed. Pipelines are a side panel of a deployable-centred view, and the engine stores a pipeline as a flat bag (7 stage buckets plus a tool set) with no jobs, steps, order or dependencies.

**What we build:** a CI/CD view that, for every pipeline in the workspace, shows:
- what starts it
- which jobs it runs, in what order, on what runner
- what each step does
- what it hands off to: reusable workflows, shared libraries, includes, templates, orbs
- what it produces: images, packages, releases, deploys

For every Dockerfile it shows what the image starts from, its stages, what code goes in, and who builds it. Across both, it lists the hygiene flags.

## Scope

### In
- **Pipeline anatomy** for tier 1 (GitHub Actions, GitLab, Jenkins, Rancher) and tier 2 (Azure, Bitbucket, CircleCI), read into one model: pipeline → triggers → jobs (with `needs`) → steps. That includes handoffs, gates (manual approval, `input`, `when: manual`, approval jobs, deployment environments), matrix (collapsed with ×N) and outputs.
- **Honest reading.** Every pipeline says `full`, `partial` or `none`. For `partial`, it says which line ranges were not read and why ("stages built in a loop, lines 40–62").
- **Container images:** every Dockerfile's stages (FROM with name, tag and digest), `COPY --from` between stages, sources copied mapped to components, final USER, EXPOSE, ENTRYPOINT/CMD, HEALTHCHECK, and whether a `.dockerignore` exists. Images without a Dockerfile (Jib, Spring Boot `build-image`, buildpacks) appear as images with their module.
- **The join:** image ↔ Dockerfile ↔ pipeline step that builds it ↔ components inside. "Nothing in this workspace builds it" is a stated fact, not an absence.
- **Hygiene flags**, starter set (each needs a positive and a negative fixture):
  - Dockerfile: base image with no tag or `:latest`; base not pinned to a digest; no `USER`, or the final stage runs as root; `ADD` of a URL; a secret-looking `ENV`/`ARG` key (key only, never the value); `COPY . .` with no `.dockerignore`.
  - Pipeline: third-party action/orb/pipe/template not pinned to a SHA or version; a Jenkins shared library with no `@ref`, or on a branch; a remote GitLab include or Azure template with no ref; `pull_request_target` that checks out the PR head; GitHub workflow with no `permissions:`; `curl … | sh`; `docker run --privileged`; TLS verification switched off (`--skip-verify`, `--insecure-skip-tls-verify`, `-k`/`--insecure` on a deploy step); a token or password written literally on a command line instead of a variable; a deploy step to an environment named like production with no gate in front of it; an image pushed only as `:latest`.
- **Cross-surface replacements:**
  - Component detail "Ships in" → **"Built into"**: the images holding this component, and the pipelines that build them.
  - Lens reading "From how it ships" → **"From the images they're in"**.
  - Ask intents and exhibits, report readings and templates, and the exhibit catalog move from deployable to CI/CD exhibits.
  - Nav entry and Go-to-anything route.
  - en + nl strings.
  - `docs/rules/cicd.yml` assert templates, one per flag rule.

### Out
- The runtime map: calls, messages, shared datastores and shared modules between deployables.
- Environments as rows, config values, and the per-deployable dependency (SBOM-lite) table.
- Toolchain drift (Java/Node versions and build plugins compared across modules).
- End-of-life knowledge about base images (it needs a dated table that goes stale).
- Run history, timings, flakiness, cost, and anything needing network or a CI API.
- Executing, evaluating or fetching anything: no Groovy evaluation, no remote includes, no registry lookups.
- Travis, Cloud Build, Drone, Tekton, Argo Workflows: detected and listed as `read: none — not read by Archstats`.
- Dismissing flags per workspace (see Open questions).

## Engine: snapshot tables (the contract)

Every fact row carries `file` and `line`. All tables are sorted before emitting. The same commit scanned twice gives byte-identical tables.

| Table | One row per | Columns |
|---|---|---|
| `pipelines` | pipeline file (or GitHub reusable workflow / action) | `id`, `name`, `system`, `kind` (`workflow`, `reusable_workflow`, `action`, `pipeline`, `template`), `repository`, `file`, `line`, `read` (`full`, `partial`, `none`), `jobs`, `steps` |
| `pipeline_unread` | region not read | `pipeline`, `from_line`, `to_line`, `reason` (`dynamic_stages`, `unknown_call`, `script_block`, `unsupported_syntax`, `not_supported_system`) |
| `pipeline_triggers` | trigger | `pipeline`, `event` (`push`, `pull_request`, `tag`, `schedule`, `manual`, `called`, `upstream`, `other`), `filter` (branches, paths, cron as written), `file`, `line` |
| `pipeline_jobs` | job (Jenkins stage, GitLab job, Azure job, Bitbucket step, CircleCI job) | `pipeline`, `id`, `name`, `group` (GitLab stage / Azure stage / Jenkins parent stage), `depth` (longest `needs` path, for layout), `needs` (ids, comma-joined), `runner` (runs-on / agent / image / pool / executor), `matrix` (combinations, 0 if none), `environment`, `gate` (`manual`, `approval`, `environment`, empty), `condition` (as written, truncated), `file`, `line` |
| `pipeline_steps` | step | `pipeline`, `job`, `index`, `name`, `verb` (`checkout`, `setup`, `build`, `test`, `scan`, `package`, `publish`, `deploy`, `approve`, `other`), `tool` (`mvn`, `gradle`, `npm`, `docker`, `helm`, `kubectl`…), `target` (image, chart, module, as resolved), `text` (first line, ≤160 chars, secrets masked), `file`, `line` |
| `pipeline_handoffs` | use of another pipeline or remote unit | `pipeline`, `job`, `kind` (`reusable_workflow`, `action`, `shared_library`, `library_step`, `load`, `include`, `component`, `template`, `orb`, `pipe`, `child_pipeline`, `starts_pipeline`, `helm_chart`), `target`, `ref`, `pinned` (`sha`, `version`, `branch`, `none`, `implicit`), `local_pipeline` (id when resolved in the workspace, any repository), `file`, `line` |
| `pipeline_outputs` | thing a step produces | `pipeline`, `job`, `step`, `kind` (`image`, `package`, `release`, `deploy`), `platform` (deploys), `environment` (deploys), `target`, `artifact` (id when joined), `file`, `line`, `resolution` (`declared`, `path`, `name`) |
| `artifacts` | thing built in the workspace | `id`, `name`, `kind` (`image`, `function`, `desktop_app`, `mobile_app`, `package`), `platform` (mobile/desktop), `repository`, `dockerfile` (images only; empty for Jib/buildpacks), `context`, `module`, `built_by` (`dockerfile`, `compose`, `skaffold`, `jib`, `spring-boot`, `buildpacks`, `sam`, `serverless`, `wails`, `tauri`, `electron`, `gradle`, `xcode`, `flutter`…), `base` (final stage FROM), `runtime`, `components`, `file`, `line` |
| `dockerfiles` | Dockerfile | `file`, `repository`, `stages`, `final_base`, `final_user`, `ports`, `entrypoint`, `healthcheck` (0/1), `dockerignore` (0/1) |
| `dockerfile_stages` | FROM | `file`, `index`, `name`, `from`, `from_kind` (`image`, `stage`, `scratch`), `image`, `tag`, `digest`, `user`, `line` |
| `artifact_contents` | (artifact, path) put in | `artifact`, `path`, `component`, `module`, `file`, `line`, `resolution` |
| `artifact_components` | (artifact, component) | `artifact`, `component`, `files` |
| `cicd_flags` | occurrence | `rule`, `subject_kind` (`pipeline`, `job`, `step`, `dockerfile`, `artifact`), `subject`, `detail`, `file`, `line` |
| `cicd_unresolved` | join refused | `from`, `ref`, `reason`, `file`, `line` |

The `files.system_kind` column stays. `_metric_definitions` gets descriptions for every new column.

### What "first-class" means

A tier-1 system meets all four of these:

1. **Corpus bar:** on its corpus (see the plan), at least 95% of pipeline files read `full`, and every `partial` names its lines.
2. **Resolved across the workspace:** a reference to something that lives in the workspace is followed, even in another repository. Examples: a reusable workflow in a sibling repo, a GitLab `include: project:`, a Jenkins shared library whose `vars/` folder is checked out next to the app, or a manifest a Rancher step applies. In multi-repo workspaces this is where the delivery picture lives.
3. **Pipeline-to-pipeline links:** one pipeline starting another (`workflow_run`, `workflow_call`, GitLab `trigger:` and `needs:project`, Jenkins `build job:` and `upstream`) is a hand-off of kind `starts_pipeline`, with `local_pipeline` set when the target is in the workspace.
4. **Where it deploys:** deploy steps name their platform and target, and the artifact they put there when the manifest, chart or values file is in the workspace.

### How each system is read

**Tier 1**

| System | Jobs and order | Hand-offs | Gates | Also read |
|---|---|---|---|---|
| GitHub Actions | `jobs`, `needs`, `strategy.matrix` with `${{ }}` expanded for matrix, env and inputs | `uses:` workflow/action with pin state; local and same-workspace `org/repo/...@ref` resolved; `workflow_run`/`workflow_call` as `starts_pipeline` | `environment:` (name, url) | `permissions` per workflow and job, `concurrency`, `services`, `container`, upload/download-artifact edges between jobs |
| GitLab CI | jobs, `stages` order as `needs` (explicit `needs` wins), `needs:project`, `dependencies`, `parallel:matrix` | `include` (`local`, `project` resolved when in the workspace, `remote`, `template`, `component` with version), `trigger:` child and multi-project | `when: manual`/`delayed`, `environment` (`name`, `url`, `action`, `deployment_tier`), `resource_group` | `extends`, YAML anchors and `!reference`, hidden `.jobs`, `default:`, `workflow:rules` and `rules` (`if`, `changes`, `exists`) as trigger text, `spec:inputs`, `image`/`services` (dind), `$CI_REGISTRY_IMAGE`-style names resolved to "this project's registry" |
| Jenkins declarative | `stages { stage }`, nested `stages`, `parallel`, `matrix`, `post` | `@Library`, `library()`, implicit library calls → `library_step`; `load 'x.groovy'` followed; `build job:` → `starts_pipeline` | `input`, `when` (branch, tag, environment, expression) | `agent` (label, docker, dockerfile, kubernetes with inline or file pod YAML), `options`, `parameters`, `triggers` (cron, pollSCM, upstream), `environment` with `credentials()` (key only), `tools` |
| Jenkins scripted | `node`, `podTemplate`/`container`, `stage('x')`, `parallel(...)` | as declarative | `input` | `docker.build`, `docker.withRegistry`, `image.push`, `withCredentials` (key only) |
| Jenkins shared libraries | a `vars/<name>.groovy` in the workspace is read as the body of `library_step <name>`; `src/` classes are not | nested library calls | as above | the library repo itself is listed as a pipeline of kind `library` |
| Rancher CLI deploys | (inside any tier-1 CI) | — | the job's gate | `rancher login <server> --context <cluster>:<project>` and `rancher kubectl apply -f`, `rancher apps install/upgrade`, `rancher context switch`. Server, cluster and project are kept as written, variables included (`$RANCHER_PROJECT_PRD`). Applied manifests are followed to the images they run, then to artifacts. Per-environment variable families (`*_DEV`, `*_TST`, `*_ACC`, `*_PRD`) and `rules` give the job's environment. |
| Rancher Fleet | each `fleet.yaml` bundle is a pipeline (system `rancher_fleet`, kind `gitops`); a `GitRepo` resource's `paths` and `targets` give its trigger (git push on repo and branch) and one job per target or `targetCustomizations` entry | `helm.chart` (local resolved, remote as a hand-off with version) | — | `defaultNamespace`, `helm.values`/`valuesFiles` image refs to artifacts, `kustomize.dir` |
| Rancher Pipelines (legacy, `.rancher-pipeline.yml`) | `stages` → `steps` | — | `when` | `runScriptConfig` as steps, `publishImageConfig` as an image build (`dockerfilePath`, `buildContext`, `tag`), `applyYamlConfig`/`applyAppConfig` as deploys |

Rancher-aware facts on Kubernetes files: `field.cattle.io/projectId` annotations and `catalog.cattle.io`/`questions.yaml` charts mark the manifest's Rancher project or chart. They show on the deploy target. Fleet itself is detected even without a `GitRepo` in the workspace (trigger "watched by Fleet, repo not in workspace").

**Tier 2**

| System | Jobs and order | Hand-offs | Gates |
|---|---|---|---|
| Azure Pipelines | stages → jobs → steps (implicit forms too), `dependsOn`, deployment jobs | `template:` (local resolved, `@repo` remote), tasks as tools | `environment`, `ManualValidation@` |
| Bitbucket | `pipelines.{default,branches,pull-requests,tags,custom}`, `step`, `parallel`, `stage` | `pipe:` | `trigger: manual`, `deployment:` |
| CircleCI | `workflows.*.jobs`, `requires`, `filters` | `orbs`, orb commands | `type: approval` |

A Jenkinsfile that is one line, `buildJavaService()`, is common in enterprise estates where the real pipeline lives in a shared library.
- When the library's `vars/buildJavaService.groovy` is in the workspace, it is read as the pipeline's body.
- When it is not, the pipeline reads as **full**: one job, one `library_step` hand-off named `buildJavaService`, from library X at ref Y (or `implicit`). The UI says "This pipeline hands all its work to a shared library; its steps are not in this workspace." That is a fact, not a failure.

### Deploy targets

The `pipeline_outputs` row for `kind = deploy` also carries:
- `platform`: `rancher`, `kubernetes`, `helm`, `kustomize`, `fleet`, `compose`, `cloud` or `other`.
- `environment`.
- `target`, as written: for example `rancher:$RANCHER_SERVER/$RANCHER_PROJECT_PRD`, or a manifest or chart path.

The slim manifest readers carry over from `extensions/deployables` (Kubernetes workloads, Helm values, kustomize image overrides), only to follow a deploy target to the images it runs. They no longer produce environments, links or config rows.

## UI: the CI/CD view

**Mode:** Operate. The established world holds (`DESIGN.md`: JetBrains New UI + Linear, Inter 13px, mono for evidence, one orange). This is a redesign of the surface inside that world, not a new world.

**Thesis:** read a pipeline the way it runs, from left to right. The main picture is the pipeline's job graph. Today's seven-dot stage strip becomes a tiny summary on a list row, not the picture.

### Layout (wide window, 1280px and up)

- **Header stats:** Pipelines N (read in part: n) · Images N · Dockerfiles N · Flags N. Each is a link into its mode.
- **Mode switch:** `Pipelines · Images · Flags`, kept in workspace state (`cicd.view`).

**Pipelines mode**
- **List (left, ~300px):** grouped by repository. Each row shows:
  - system glyph and pipeline name
  - trigger chips (`push main`, `PR`, `tag`, `cron`, `manual`, `called`)
  - a verb silhouette (the steps' verbs in order, as tiny marks)
  - a read-state mark when partial
  - a flag count

  Search covers pipeline, job, step text, image and file.
- **Graph (centre):** columns from left to right.
  - **Triggers** on the left.
  - **Jobs** placed by `depth`. Each job card shows its name, runner (mono), `×N` matrix, environment tag, gate icon, and its steps as compact rows: a verb glyph plus the tool and target in mono, at most about 8 before "+n steps".
  - **Edges** are `needs`. A Jenkins `parallel` draws side by side.
  - **Handoffs** are dashed cards where they are used. Local ones can expand in place; remote ones show the ref and its pin state.
  - **Outputs** on the right: images (click opens the Dockerfile anatomy), packages, releases and deploy targets.
- **Partial reading:** a one-line notice above the graph ("Lines 40–62 not read: stages are built in a loop"), plus a hatched placeholder card where that region sits in the order.
- **Inspector (right, 420px):** for the selection (job, step, handoff or image), three tabs:
  - **Evidence:** file:line, the source lines, open in editor.
  - **Flags:** flags on this subject.
  - **History:** changes in the last year, last change and authors (pseudonymised).

  A click selects; leaving goes through labelled buttons (the Connections rule).

**Images mode**
- **Table:** image, Dockerfile, final base (`name:tag`, a digest mark if pinned), stages, final user, ports, built by (pipeline links, or "Not built by any pipeline here"), components inside.
- **Exhibit "Base images":** horizontal bars of base image families by version (for example `eclipse-temurin 17 ×9 · openjdk 8 ×14`), in an `ExhibitFrame` with a legend and Export.
- **Inspector:** the Dockerfile as a **stage ladder**. One row per stage (FROM → copies → USER/ENTRYPOINT), `COPY --from` drawn as arrows between rows, and copied sources named by component.

**Flags mode**
- **Grouped by rule.** Each rule row has the fact in words, one sentence on why it matters, and a count.
- **Expanding** a rule lists occurrences with file:line and the pipeline or image they belong to.
- **One quiet amber mark** for every rule; no severity ranking, no totals graded.
- **Export:** "Export as assert rules" points at `docs/rules/cicd.yml`.

### States and ranges

| State | Behaviour |
|---|---|
| No CI files or Dockerfiles | Empty state naming the files Archstats looks for, per system |
| Snapshot older than revision 13 | "Scanned before CI/CD was read. Rescan to see pipelines and images." with a Rescan button |
| System detected but not read | Pipeline listed, `read: none`, says which system and that it is not read |
| Library-only Jenkinsfile | One job, one handoff, the sentence above |
| Large estate | 0–200 pipelines (virtualised list), 1–60 jobs per pipeline, 1–80 steps per job, 0–100 Dockerfiles, flags grouped (thousands of occurrences fine) |
| Matrix-heavy GitHub workflow | Matrix collapsed into one card ×N; combinations listed in the inspector |

## Commands

```
# Engine (archstats)
go test ./extensions/cicd/... -count=1
go test ./... -count=1
go run . export sqlite <fixture-repo> /tmp/x.db     # inspect tables

# UI (archstats-ui/frontend)
npm run check          # before any capture
npx vitest run src/features/cicd
npm test
npm run i18n:check
npm run check:figures
```

## Project structure

```
archstats/extensions/cicd/          → readers (one file per system), dockerfile.go (moved), link.go (images ↔ steps ↔ components), flags.go, views.go
archstats/extensions/cicd/testdata/ → one folder per system, plus flags/positive and flags/negative
archstats/docs/adr/0022-cicd.md     → supersedes 0021
archstats/docs/rules/cicd.yml       → assert templates per flag rule
archstats/DESCRIPTION.md            → new tables; removed tables listed
archstats-ui/frontend/src/features/cicd/        → cicd.ts (model + graph layout, pure), components/, exhibits/
archstats-ui/frontend/src/pages/views/cicd/     → index.vue
archstats-ui/frontend/src/locales/{en,nl}/cicd.json
```

`extensions/deployables` and `features/deployables` are deleted once their replacements pass. Their readers for compose, Skaffold, Jib and Spring Boot carry over into `extensions/cicd`. The link, environment, config and dependency code is deleted (git keeps it).

## Code style

Engine readers return facts with lines and never fail on bad input; they report what they skipped. This is the existing pattern, which stays:

```go
func readJenkinsfile(file string, content []byte) *pipelineFact {
	p := newPipeline(file, "jenkins")
	// …walk tokens; every job and step records lineAt(offset)…
	// an unfollowable region becomes p.unread(from, to, "dynamic_stages")
	p.dedupe()
	return p
}
```

UI: model and layout in pure, tested TypeScript (`cicd.ts`); components only render. Copy is plain and junior-readable: "Runs as root: no USER instruction", not "Container privilege risk". Every number on the page has a caption.

## Testing strategy

- **Engine unit tests per reader:** small hand-written fixtures per construct (needs, matrix, parallel, scripted `node{}`, library-only Jenkinsfile, GitLab extends/include, Azure implicit job, Bitbucket parallel, CircleCI approval). Expected rows are asserted.
- **Flag tests:** a positive and a negative fixture per rule. The clean fixture has zero flags.
- **Golden test:** a mixed fixture repo exported to SQLite, tables compared to committed CSVs.
- **Determinism test:** two scans of the same fixture give identical tables.
- **Secret test:** a secret-looking value never appears in any table.
- **Reference systems:** the reference repos from `tasks/system-model-research.md`, plus public Jenkins-scripted, Azure, Bitbucket and CircleCI examples. Counts are recorded in the plan; client workspace facts are never committed.
- **UI:** vitest for layout (depth columns, no overlapping cards up to 60 jobs, matrix collapse, partial placeholder), flag grouping and the image ↔ pipeline join. Then one capture round on the browser harness, pinned to three snapshots (GitHub-heavy, Jenkins-scripted, mixed estate), in both schemes.

## Boundaries

- **Always:**
  - file:line on every fact
  - sort before emit
  - store secret keys, never values
  - guard UI reads with `hasView`/`hasColumn`
  - en + nl strings
  - `npm run check` before captures
  - code written in the main session; subagents only for captures
- **Ask first:**
  - any new Go module or npm package
  - deleting a snapshot table not listed here
  - pushing, tagging or releasing
  - merging into either `main`
- **Never:**
  - fetch, execute or evaluate anything a pipeline names
  - record secret values
  - commit client workspace facts
  - show scores, grades or pass/fail totals
  - add AI attribution

## Success criteria

1. **The screenshot case:** BroadleafCommerce's root `Jenkinsfile` (two lines: `properties(commonModuleJobProps())`, `buildBroadleafModule(params, false, 'maven-jdk17')`) reads `full`. It shows one `library_step` handoff, `buildBroadleafModule`, from a library loaded implicitly by the Jenkins server (no `@Library` line), and the sentence that its steps are not in this workspace. Scripted Jenkinsfiles (hibernate-orm, gke-ip-address-management) show their `stage(...)` calls as jobs in order, or name the exact lines not read and why.
2. **The systems:**
   - Each system's fixtures produce the expected jobs, `needs`, steps, hand-offs, gates and triggers (golden test green).
   - Each tier-1 system meets the four-point first-class bar on its corpus, with the per-system `full`/`partial` counts recorded in the todo's Status.
   - A GitLab fixture modelled on a `rancher login --context` + `rancher kubectl apply` per-environment pipeline shows one deploy per environment (platform `rancher`), followed to the images in the applied manifests.
3. **Library-only Jenkinsfile:** it reads `full`, with one handoff that names the library and ref.
4. **Images:** every image row either names the pipeline step that builds it or states that none does. Every Dockerfile shows its stage ladder, with copied sources named by component where a component owns the path.
5. **Flags:** every rule has passing positive and negative fixtures. No flag is shown without file:line.
6. **Determinism and secrets:** the determinism and secret tests pass.
7. **Old snapshots:** a pre-13 snapshot opens CI/CD on the rescan state, with no console errors.
8. **No leftovers:** a Python sweep finds no reference to `deployable` tables in the UI. `/views/deployables` redirects. Component detail, the lens, Ask, reports and the exhibit catalog all read the new tables.
9. **Scale:** with 200 pipelines, the list renders in under 300 ms after the query returns. A 60-job graph lays out with no overlapping cards.
10. **Tests:** `go test ./...`, `npm test`, `npm run i18n:check` and `npm run check:figures` are green.

## Resolved questions (2026-10-29)

1. **Non-image artifacts:** one `artifacts` table with `kind` (`image`, `function`, `desktop_app`, `mobile_app`, `package`). Pipelines publish all of them; the joins are the same. The Images mode lists every artifact; base images and the stage ladder apply to images only. Readings that asked for `deployables WHERE kind = 'mobile_app'` read `artifacts` instead.
2. **Runtime-link code:** deleted (`link.go`'s runtime half, `links.go`, `environments.go`, `config.go`, `dotenv.go`, `deps.go`). Git history keeps it.
3. **Dismissing flags per workspace:** not in v1. The assert export covers teams that want to own the rules.
4. **Production-like environment names:** a fixed list (`prod`, `production`, `prd`, `live`), shown on the rule.
