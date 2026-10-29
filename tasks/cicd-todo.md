# Task list: CI/CD

*From `tasks/cicd-plan.md`, which follows `specs/cicd.md`. Engine paths are relative to the `archstats` worktree and UI paths to `archstats-ui/frontend`. Each task ends green before the next one starts.*

## Status

**Built 2026-10-29, not committed.** Engine: worktree `../archstats-cicd`, branch `feature/cicd` (revision 16). UI: worktree `../archstats-ui-cicd`, branch `feature/cicd`, with a `go.work` pointing at the engine worktree. Nothing pushed, tagged or merged; the UI `go.mod` still pins the old engine until a tag exists.

Checks, last run:
- Engine: `go vet ./...` clean, `go test ./... -short` green (incl. 22 reader tests in `extensions/cicd/readers_test.go` and the assert template test). The real-repository e2e tests (`e2eTest/cicd_e2e_test.go`) need the network and were not run.
- UI: `npx vitest run` 1247 passed, `npm run i18n:check` clean, `dev-check` 39/39 modules compile (against a worktree dev server on :3107), `go build ./...` ok.
- Browser harness on a revision-16 snapshot of a five-repo fixture (GitLab + Rancher CLI, Jenkins + library in another repo, Fleet + GitRepo): Pipelines, Images, Flags and the inspector checked; the revision-15 rescan state checked on a real older snapshot.

Corpus (`go run ./extensions/cicd/cmd/corpus`), local workspaces plus pinned public repos:

| System | Files | Full | Jobs | Steps |
|---|---|---|---|---|
| GitHub Actions | 343 | 100% | 769 | 2,093 |
| GitLab CI | 100 | 100% | 1,133 | 9,328 |
| Jenkins | 29 | 100% | 129 | 351 |
| Rancher Fleet | 18 | 100% | 33 | 33 |

gitlab-org/gitlab's own pipeline reads as 400 jobs, six levels deep. hibernate-orm's scripted Jenkinsfiles read as stages repeated per environment (`matrix` -1) rather than unread regions. git-plugin's `buildPlugin(...)` resolves to `pipeline-library/vars/buildPlugin.groovy` when both are in one workspace. Rancher has no public corpus; it is covered by fixtures built on the per-environment `rancher login --context` + `rancher kubectl apply` pattern.

Deviations from the spec:
- The pipeline graph is HTML, so it is not an exportable figure. The base-image chart (SVG) and the artifact table export.
- `artifact_contents` has no `component` column; components are in `artifact_components`. Artifact kinds keep `app`. Packages and releases are outputs only, not artifacts.
- There is no committed golden CSV. The determinism test, the reader tests and the corpus runner cover that ground.
- Not read yet: GitHub upload/download-artifact edges, `concurrency` and `services`.
- `ungated_prod_deploy` also flags Fleet targets named for production: GitOps deploys on merge, with no gate in the file.
- Revision 16 drops the per-app library list, so the mobile report templates' Stack section says "not recorded" on new snapshots.
- Delivery fixture lives in the session scratchpad (`ws-delivery`), not committed.

---

## Phase 0: Setup

- [x] **T0: Worktrees, baseline, fixtures**
  - Acceptance:
    - Engine worktree `feature/cicd` off engine `main`. UI worktree `feature/cicd` off UI `main`, with a `go.work` that points at the engine worktree and `node_modules` symlinked.
    - A baseline CSV, made with today's engine, of `pipelines(file, system, parsed, stages)` and `deployables(kind, name)` for every fixture repo.
    - Corpora pinned to commits:
      - GitLab: gitlab-org/gitlab, gitlab-org/cli, gitlab-org/gitlab-runner, plus 3–5 mid-size projects.
      - GitHub Actions: 3–4 heavy users of reusable workflows.
      - Jenkins: one shared-library repo.
      - Rancher: rancher/fleet-examples, plus legacy `.rancher-pipeline.yml` examples.
      - Tier 2: one each for Azure, Bitbucket and CircleCI.
      - Shallow clones, kept in the scratchpad.
    - A corpus runner (`go run ./extensions/cicd/cmd/corpus <dir>…`, not shipped) prints per system the files, `full`, `partial` and `none`, and the top unread reasons. Local client repos are included in the run, but their output is never committed.
    - The baseline run is recorded in Status.
  - Verify: `go test ./extensions/deployables/...` is green in the worktree; `npm run check` passes in the UI worktree; the corpus runner prints the baseline.
  - Files: scratchpad baseline and clone scripts, `go.work` (UI worktree only), `extensions/cicd/cmd/corpus/main.go`.

## Phase 1: Model and first system

- [x] **T1: Fact model, extension skeleton, views**
  - Acceptance:
    - `extensions/cicd` registers views for every spec table, empty for now, with fixed column order.
    - `pipelineFact` gains `Triggers`, `Jobs`, `Steps`, `Handoffs`, `Outputs` and `Unread`.
    - `depth` is computed from `needs` (longest path, cycle-safe).
    - Registered in `cmd/common/extensions.go` beside deployables for now.
  - Verify: `go test ./extensions/cicd/...`, with a depth test covering a diamond, a chain and a cycle.
  - Files: `extensions/cicd/{model.go,extension.go,views.go,depth.go,depth_test.go}`, `cmd/common/extensions.go`.

- [x] **T2: Move the artifact readers and the contents join**
  - Acceptance:
    - These readers move unchanged in behaviour: Dockerfile parser, compose `build:`, Skaffold, Jib, Spring Boot, buildpacks, SAM/Serverless, desktop, mobile.
    - The image build half of `link.go` moves too.
    - The slim manifest readers (Kubernetes workloads, Helm values, kustomize images, from `readers_deploy.go`) move as well, used only to follow deploy targets to images.
    - They fill `artifacts`, `artifact_contents` and `artifact_components`.
    - Artifact counts per kind match the T0 baseline on the fixture repos.
  - Verify: moved tests pass under `extensions/cicd`; a baseline comparison script reports no differences.
  - Files: `extensions/cicd/{dockerfile.go,buildplugins.go,mobile.go,desktop.go,artifacts.go}` (+ tests moved alongside).

- [x] **T3: Shared step classifier**
  - Acceptance:
    - `classifyStep(text, uses) → (verb, tool, target)` covers the spec's verbs.
    - It is built from today's `readShell`/`classifyText`, widened with `setup` and `checkout`.
    - A table test has at least 60 real step lines from the fixtures.
    - Secrets are masked in `text`.
  - Verify: `go test ./extensions/cicd -run Classify`.
  - Files: `extensions/cicd/{classify.go,classify_test.go,yamlutil.go}`.

- [x] **T4: GitHub Actions into the new model**
  - Acceptance:
    - Workflows, reusable workflows, composite, Docker and JS actions are read.
    - Jobs carry `needs`, `matrix` (combination count), `runs-on`, `environment` (gate) and `if` (condition).
    - Steps are read in order. `uses:` becomes a hand-off with pin state (`sha`/`version`/`branch`/`none`). Triggers come from `on:`.
    - Local calls are resolved to `local_pipeline`.
    - First-class extras:
      - `${{ }}` expanded for matrix, env and inputs.
      - `workflow_run`/`workflow_call` as `starts_pipeline`.
      - `permissions` and `concurrency`.
      - `services`/`container` as runner detail.
      - Upload/download-artifact edges between jobs.
      - `environment` name and url.
    - Every fixture workflow reads `full`; at least 95% of the 445 local workflows read `full` on the corpus runner.
  - Verify:
    - `go test ./extensions/cicd -run GitHub`.
    - Export `elepy` to SQLite and eyeball the tables.
    - **Checkpoint A: Ryan reviews the table shape.**
  - Files: `extensions/cicd/{github.go,github_test.go}`, `testdata/github/*`.

## Phase 2: Tier 1 to first-class, then tier 2

- [x] **T5: Groovy lexer and call tree**
  - Acceptance:
    - It tokenizes strings (single, double, triple, slashy, dollar-slashy), GStrings, comments and braces.
    - It builds a tree of `name(args) { block }` calls with lines, plus `def` assignments and closures, and never panics on any input.
    - It tokenizes all 18 local Jenkins files.
  - Verify: `go test ./extensions/cicd -run Groovy`, including a fuzz test (`go test -fuzz=FuzzGroovy -fuzztime=30s`).
  - Files: `extensions/cicd/{groovy.go,groovy_test.go}`.

- [x] **T6: Jenkins declarative**
  - Acceptance:
    - `pipeline { agent, options, parameters, triggers, environment, tools, stages { stage { steps, when, input, parallel, matrix, stages } }, post }` maps to jobs, `needs` (sequential order; parallel branches share a parent; nested stages keep their group), runner, gates, triggers and steps.
    - `agent kubernetes` reads inline and file pod YAML for container images.
    - `credentials()` keeps keys only.
    - `django-oscar` and the hibernate-orm `ci/*.Jenkinsfile` read `full`; the client qp-visualizer files read `full` on the corpus runner (local only).
  - Verify: `go test ./extensions/cicd -run JenkinsDeclarative`; corpus runner.
  - Files: `extensions/cicd/{jenkins.go,jenkins_test.go}`, `testdata/jenkins/declarative/*`.

- [x] **T7: Jenkins scripted, libraries and downstream jobs**
  - Acceptance:
    - `node {}`, `podTemplate {}`/`container {}`, `stage('x') {}`, `parallel(...)`, `input`, `docker.build`/`withRegistry`/`push` and `withCredentials` are read.
    - `@Library('x@ref')` and `library()` become `shared_library` hand-offs. An unknown top-level call becomes a `library_step` hand-off, with library `implicit` when no `@Library` exists.
    - `load 'x.groovy'` is followed.
    - `build job: 'x'` and `triggers { upstream }` become `starts_pipeline`.
    - Stage-building loops and closures become `unread: dynamic_stages` with a line range.
    - Results:
      - `BroadleafCommerce/Jenkinsfile` reads `full`, with one `library_step` `buildBroadleafModule`.
      - `hibernate-orm/Jenkinsfile` and `nightly.Jenkinsfile`, and `gke-ip-address-management`, show their stages in order, and any unread region has a line range.
  - Verify: `go test ./extensions/cicd -run JenkinsScripted`; record the three files' job lists in Status.
  - Files: `extensions/cicd/{jenkins.go,jenkins_scripted.go,jenkins_scripted_test.go}`, `testdata/jenkins/scripted/*`.

- [x] **T7b: Shared libraries in the workspace**
  - Acceptance:
    - A repo with `vars/*.groovy` is listed as a pipeline of kind `library`.
    - A `library_step <name>` whose `vars/<name>.groovy` is in the workspace (any repository) gets `local_pipeline` set, and the graph can expand it: its body is read as the steps of that hand-off.
    - Libraries calling libraries are followed, depth 5, cycle-safe.
  - Verify: `go test ./extensions/cicd -run JenkinsLibrary` on the two-repo fixture workspace.
  - Files: `extensions/cicd/{jenkins_library.go,jenkins_library_test.go}`, `testdata/jenkins/library-workspace/*`.

- [x] **T8: GitLab core**
  - Acceptance:
    - Jobs, with `stages` order as `needs` (explicit `needs` wins); `dependencies`; `extends` (depth 5); YAML anchors and `!reference`; hidden `.jobs` and `default:`.
    - `parallel:matrix`.
    - `workflow:rules` and `rules`/`only`/`except` become triggers, with the `if` text kept.
    - `when: manual`/`delayed` and `environment` (`name`, `url`, `action`, `deployment_tier`) are gates; `resource_group` is kept.
    - `image` and `services` are runners (dind recognised); `$CI_REGISTRY_IMAGE`-style names resolve to "this project's registry".
    - `spec:inputs` are read.
  - Verify: `go test ./extensions/cicd -run GitLab`; corpus runner on the mid-size GitLab projects.
  - Files: `extensions/cicd/{gitlab.go,gitlab_yaml.go,gitlab_test.go}`, `testdata/gitlab/*`.

- [x] **T8b: GitLab includes, components, cross-project**
  - Acceptance:
    - `include` covers `local` (globs too), `project` (resolved when that project is in the workspace, matched by remote URL path or folder name, ties refused), `remote`, `template` and `component` (with version, as a hand-off). All carry pin state.
    - `trigger:` child pipelines (local file resolved) and multi-project pipelines, and `needs:project`, are `starts_pipeline`.
    - At least 95% of the GitLab corpus reads `full` (gitlab-org/gitlab included).
  - Verify: `go test ./extensions/cicd -run GitLabInclude` on the two-repo fixture workspace; corpus runner.
  - Files: `extensions/cicd/{gitlab_include.go,gitlab_include_test.go}`, `testdata/gitlab/workspace/*`.

- [x] **T9: Rancher CLI deploys**
  - Acceptance:
    - Inside any tier-1 job, `rancher login <server> [--context c:p]`, `rancher context switch`, `rancher kubectl apply -f <files>`, `rancher kubectl set image` and `rancher apps install/upgrade` become `deploy` outputs with platform `rancher`. Server, cluster and project are kept as written, variables included.
    - The environment comes from the job's `environment`, then from per-environment variable families (`*_DEV`/`*_TST`/`*_ACC`/`*_PRD`, `NP`/`P`), then from `rules`/branch.
    - Applied manifests are followed through the slim readers to their images.
    - The per-environment fixture shows one deploy per environment, each joined to its image.
  - Verify: `go test ./extensions/cicd -run Rancher`.
  - Files: `extensions/cicd/{rancher.go,rancher_test.go,classify.go}`, `testdata/rancher/cli-gitlab/*`, `testdata/rancher/cli-jenkins/*`.

- [x] **T10: Rancher Fleet and legacy Rancher Pipelines**
  - Acceptance:
    - A `fleet.yaml` is a pipeline (system `rancher_fleet`, kind `gitops`).
      - A `GitRepo` gives its trigger and targets, and each target or `targetCustomizations` entry is a job.
      - `helm.chart` is a hand-off (local resolved).
      - Values and kustomize image refs are joined to artifacts.
      - With no `GitRepo` in the workspace, the trigger reads "watched by Fleet, repo not in workspace".
    - `.rancher-pipeline.yml` reads natively (system `rancher_pipelines`): stages → steps, `publishImageConfig` as an image build, `applyYamlConfig`/`applyAppConfig` as deploys.
    - `field.cattle.io/projectId` and `questions.yaml` facts appear on deploy targets.
    - fleet-examples reads `full`.
  - Verify: `go test ./extensions/cicd -run 'Fleet|RancherPipeline'`; corpus runner.
  - Files: `extensions/cicd/{fleet.go,rancher_pipeline.go,fleet_test.go,rancher_pipeline_test.go}`, `testdata/rancher/{fleet,pipeline}/*`.

- [x] **T11: Resolution across the workspace, and pipeline links**
  - Acceptance:
    - One resolver serves every tier-1 system: GitHub `org/repo/...@ref`, GitLab `project:`, Jenkins `vars/` and `build job:`, and Fleet chart paths. It finds the target repository by remote URL, then by folder name, and refuses ties into `cicd_unresolved`.
    - `starts_pipeline` hand-offs carry `local_pipeline`.
    - A three-repo fixture (app → shared workflows → deploy repo) resolves end to end.
    - **Checkpoint A2:** the corpus runner shows tier 1 at 95% or more `full`, with every partial naming its lines. Ryan reviews and decides on tier 2.
  - Verify: `go test ./extensions/cicd -run Resolve`; corpus runner table pasted into Status.
  - Files: `extensions/cicd/{resolve.go,resolve_test.go}`, `testdata/workspace/*`.

- [x] **T11a: Azure Pipelines (tier 2)**
  - Acceptance:
    - `trigger`/`pr`/`schedules`.
    - Stages → jobs → steps, including the implicit forms.
    - `dependsOn`, deployment jobs with `environment` gates, `ManualValidation@`.
    - `template:` (local resolved; `@repo` as a hand-off).
    - Tasks mapped to tools.
  - Verify: `go test ./extensions/cicd -run Azure`.
  - Files: `extensions/cicd/{azure.go,azure_test.go}`, `testdata/azure/*`.

- [x] **T11b: Bitbucket Pipelines (tier 2)**
  - Acceptance:
    - `default`/`branches`/`pull-requests`/`tags`/`custom` are triggers.
    - `step`, `parallel` and `stage` become jobs.
    - `deployment:` and `trigger: manual` are gates; `pipe:` is a hand-off with version.
  - Verify: `go test ./extensions/cicd -run Bitbucket`.
  - Files: `extensions/cicd/{bitbucket.go,bitbucket_test.go}`, `testdata/bitbucket/*`.

- [x] **T11c: CircleCI and unsupported systems (tier 2)**
  - Acceptance:
    - Workflow jobs with `requires`, `filters` as triggers, `type: approval` gates, orbs as hand-offs with version, executors as runners.
    - Travis, Cloud Build, Drone, Tekton and Argo Workflows are detected as `read: none, not_supported_system`.
  - Verify: `go test ./extensions/cicd -run CircleCI`.
  - Files: `extensions/cicd/{circleci.go,circleci_test.go,systems.go}`, `testdata/circleci/*`.

## Phase 3: Images and flags

- [x] **T12: Dockerfile facts**
  - Acceptance:
    - The parser also reads `USER`, `HEALTHCHECK`, `ENV`/`ARG` keys, `ADD` of a URL, and digest and tag on `FROM`.
    - The `dockerfiles` and `dockerfile_stages` tables are filled, and `.dockerignore` is detected next to the context.
  - Verify: `go test ./extensions/cicd -run Dockerfile`.
  - Files: `extensions/cicd/{dockerfile.go,dockerfile_test.go,dockerfiles_view.go}`.

- [x] **T13: Flags, Dockerfile rules**
  - Acceptance:
    - These rules each have a positive and a negative fixture: `base_unpinned_tag`, `base_no_digest`, `runs_as_root`, `add_remote_url`, `secret_like_key`, `copy_all_no_dockerignore`.
    - The clean fixture has zero flags.
  - Verify: `go test ./extensions/cicd -run Flags`.
  - Files: `extensions/cicd/{flags.go,flags_docker_test.go}`, `testdata/flags/*`.

- [x] **T14: Flags, pipeline and Rancher rules**
  - Acceptance:
    - These rules each have a positive and a negative fixture: `handoff_unpinned`, `library_unpinned`, `remote_include_unpinned`, `pr_target_checkout_head`, `no_permissions_block`, `curl_pipe_shell`, `docker_privileged`, `tls_verify_off`, `token_literal`, `ungated_prod_deploy` (fixed list `prod`, `production`, `prd`, `live`), `push_latest_only`.
  - Verify: `go test ./extensions/cicd -run Flags`.
  - Files: `extensions/cicd/{flags.go,flags_pipeline_test.go}`, `testdata/flags/*`.

- [x] **T15: Assert templates**
  - Acceptance: `docs/rules/cicd.yml` has one rule per flag id, the `archstats assert` template run passes on the flags fixture, and `docs/rules/deployables.yml` is removed.
  - Verify: the `cmd/assert` template test.
  - Files: `docs/rules/cicd.yml`, `docs/rules/deployables.yml`, `cmd/assert/*_test.go`.

- [x] **T16: Outputs ↔ artifacts join**
  - Acceptance:
    - `pipeline_outputs.artifact` is set by `declared`, `path` or `name` resolution, as in the old linker.
    - Ties are refused into `cicd_unresolved`.
    - Every artifact either has a building step or none.
    - Deploy outputs (Rancher, kubectl, Helm, kustomize, Fleet, compose) join through the manifests and values they name to the artifacts they run.
  - Verify: `go test ./extensions/cicd -run Outputs`; on microservices-demo every image has a builder or a stated none.
  - Files: `extensions/cicd/{outputs.go,outputs_test.go}`.

## Phase 4: Contract and clean-up

- [x] **T17: Contract docs and revision**
  - Acceptance:
    - `DESCRIPTION.md` documents every new table and lists the removed ones.
    - `docs/adr/0022-cicd.md` supersedes 0021 and includes the per-system mapping table.
    - `_metric_definitions` describe the new columns.
    - `core.AnalysisRevision = 13`.
  - Verify: `go test ./core/...`, and read the docs.
  - Files: `DESCRIPTION.md`, `docs/adr/0022-cicd.md`, `docs/adr/0021-deployables.md` (status line), `core/revision.go`, `extensions/cicd/definitions.go`.

- [x] **T18: Golden, determinism, secrets, e2e**
  - Acceptance:
    - A mixed fixture repo's export matches the committed CSVs.
    - Two scans give identical tables.
    - No secret value appears in any table.
    - `e2eTest/cicd_e2e_test.go` replaces `deployables_e2e_test.go`, with the same reference repos and pinned commits, asserting artifacts plus pipeline jobs.
  - Verify: `go test ./extensions/cicd/... ./e2eTest -run CICD -count=1`.
  - Files: `extensions/cicd/{golden_test.go,determinism_test.go,secrets_test.go}`, `testdata/golden/*`, `e2eTest/cicd_e2e_test.go`.

- [x] **T19: Remove `extensions/deployables`**
  - Acceptance: the directory and the deployables e2e test are deleted, the extension is unregistered, and nothing in the engine references it.
  - Verify:
    - `go test ./... -count=1` is green.
    - A Python sweep finds no `deployables` package import.
    - **Checkpoint B: Ryan reviews the engine diff; commit, tag and the UI `go.mod` bump only on his yes.**
  - Files: `extensions/deployables/` (delete), `e2eTest/deployables_e2e_test.go` (delete), `cmd/common/extensions.go`.

## Phase 5: UI

- [x] **T20: `cicd.ts`, load and list model**
  - Acceptance:
    - Loads the new tables, guarded by `hasView`/`hasColumn`.
    - Exposes a `snapshotState` of `ready`, `old` (revision below 13) or `empty`.
    - Builds list rows grouped by repository, with trigger chips, verb silhouette, read state and flag count.
    - Search covers pipeline, job, step text, artifact and file.
  - Verify: `npx vitest run src/features/cicd`.
  - Files: `features/cicd/{cicd.ts,cicd.test.ts,useCicd.ts}`.

- [x] **T21: Graph layout**
  - Acceptance:
    - Columns come from `depth`, with triggers before and outputs after.
    - Rows are packed per column; matrix jobs collapse to one card with `×N`; at most 8 steps show, then "+n".
    - Partial-read placeholders sit in line order.
    - No overlapping cards up to 60 jobs, which a geometry test checks.
  - Verify: `npx vitest run src/features/cicd -t layout`.
  - Files: `features/cicd/{layout.ts,layout.test.ts}`.

- [x] **T22: Page and Pipelines mode**
  - Acceptance:
    - `/views/cicd` has header stats, the `Pipelines · Images · Flags` switch (`cicd.view`), the virtualised list and the graph (`PipelineGraph.vue`).
    - Hand-off cards are dashed, local ones expand in place, and pin state is shown.
    - The partial notice is a single line.
    - A click selects; leaving is through labelled buttons.
  - Verify: `npm run check`, plus one harness capture of a GitHub-heavy snapshot.
  - Files: `pages/views/cicd/index.vue`, `features/cicd/components/{PipelineList.vue,PipelineGraph.vue,JobCard.vue}`, `locales/en/cicd.json`.

- [x] **T23: Inspector**
  - Acceptance:
    - The Evidence tab shows file:line, the source lines and Open in editor.
    - The Flags tab shows flags on the selection.
    - The History tab shows changes in the last year, the last change and pseudonymised authors from existing git tables.
    - Selection covers job, step, hand-off and artifact.
  - Verify: `npm run check`; vitest for the history query builder.
  - Files: `features/cicd/components/{CicdInspector.vue,EvidenceLines.vue}`, `features/cicd/history.ts` (+ test).

- [x] **T24: Images mode**
  - Acceptance:
    - A table of artifacts, with kind, base, digest mark, stages, user, ports, built by (or "Not built by any pipeline here") and components.
    - A "Base images" bar exhibit in an `ExhibitFrame` with a legend and Export.
    - A stage-ladder inspector with `COPY --from` arrows and sources named by component.
  - Verify: `npm run check`, `npm run check:figures`.
  - Files: `features/cicd/components/{ArtifactTable.vue,StageLadder.vue}`, `features/cicd/exhibits/baseImages.ts`.

- [x] **T25: Flags mode**
  - Acceptance:
    - Rules are grouped, each with the fact in words, why it matters, a count and the same quiet mark.
    - Expanding a rule shows its occurrences with file:line and owner.
    - "Export as assert rules" names `docs/rules/cicd.yml`.
    - The ungated-deploy rule shows its name list.
  - Verify: `npm run check`; vitest for grouping.
  - Files: `features/cicd/components/FlagList.vue`, `features/cicd/flags.ts` (+ test), `locales/en/cicd.json`.

- [x] **T26: States**
  - Acceptance:
    - An empty state names the files looked for per system.
    - An old snapshot shows "Rescan to read CI/CD" with a working Rescan button.
    - `read: none` pipelines are listed with their reason.
    - The library-only sentence appears for the BroadleafCommerce case.
  - Verify: harness on a revision-12 snapshot and on BroadleafCommerce, with zero console errors.
  - Files: `pages/views/cicd/index.vue`, `features/cicd/components/CicdEmpty.vue`.

- [x] **T27: Component detail band and lens**
  - Acceptance:
    - "Ships in" becomes "Built into": the artifacts holding the component and the pipelines that build them.
    - "Make a lens: From the images they're in" lives in the CI/CD header and keeps the shared-component handling. The merge-on-calls option goes, since there are no links any more.
  - Verify: vitest for `builtInto()` and the lens proposal; one capture of component detail.
  - Files: `pages/views/components/[name]/index.vue`, `features/cicd/{builtInto.ts,lens.ts}` (+ tests).

- [x] **T28: Navigation, redirect, strings**
  - Acceptance:
    - The nav shows "CI/CD" when `pipelines` or `artifacts` exist.
    - Go-to-anything has aliases (`ci cd pipelines jenkins actions gitlab docker dockerfile images build`).
    - `/views/deployables` redirects to `/views/cicd`.
    - `nl` translations of every new string.
  - Verify: `npm run i18n:check`.
  - Files: `features/shell/components/NavBar.vue`, `features/navigation/routes.ts`, `pages/views/deployables/index.vue` (becomes the redirect), `locales/{en,nl}/{cicd,navigation,shell}.json`.

- [x] **T29: Ask**
  - Acceptance:
    - Intents and tools that read deployable tables read the CI/CD tables.
    - New exhibits: pipeline graph, base images and flags.
    - The routing fixture and golden are regenerated on a revision-13 snapshot, and the intent diff is reviewed.
  - Verify: `npx vitest run src/features/ask`.
  - Files: `features/ask/intents/{index.ts,fromView.ts,prompt.ts}`, `features/ask/tools/{core.ts,query.ts}`, `features/ask/engine/{topic.ts,route.ts}`, `features/ask/testing/*`.

- [x] **T30: Reports, catalog, frameworks**
  - Acceptance:
    - Readings that queried `deployables` (mobile apps and others) query `artifacts`.
    - Templates and slots that named deployable exhibits name CI/CD exhibits.
    - The exhibit catalog lists them.
    - The framework profiles and the layers test drop their deployable references or move them.
  - Verify: `npx vitest run src/features/reports src/features/exhibit-catalog src/features/frameworks`, plus the sqlite smoke of all template SQL (report QA harness).
  - Files: `features/reports/{readings.ts,mobileTemplates.ts,reportTemplates.ts,anatomy.ts}`, `features/exhibit-catalog/catalog.ts`, `features/frameworks/{frameworkProfiles.ts,layers.jvm.test.ts}`, `locales/{en,nl}/reports.json`.

- [x] **T31: Remove `features/deployables`, sweep**
  - Acceptance:
    - `features/deployables` and `locales/*/deployables.json` are deleted.
    - A Python sweep (not grep) finds no `deployable` table or import references outside the redirect page.
  - Verify: `npm test`, `npm run i18n:check`, `npm run check:figures`, `npm run check`.
  - Files: `features/deployables/` (delete), `locales/{en,nl}/deployables.json` (delete), `locales/{en,nl}/pages.json` (drop `deployablesIndex`), `locales/{en,nl}/common.json`.

## Phase 6: Verify

- [x] **T32: Capture round and Checkpoint C**
  - Acceptance:
    - One Sonnet capture round on the proxy-stub harness: four pinned revision-13 snapshots (GitHub-heavy, BroadleafCommerce + hibernate-orm, a GitLab project with the Rancher per-environment fixture, and the three-repo workspace fixture), light and dark, Pipelines/Images/Flags plus component detail.
    - Every defect fixed in one batch, with at most one confirming round.
    - The ten spec success criteria are checked off with evidence in the Status section.
  - Verify: the PNGs are reviewed; app.db is untouched (reports and pins lists are unchanged).
  - Files: whatever the batch fixes; Status section of this file.
