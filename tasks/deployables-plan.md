# Implementation plan: Deployables

*Plan only; nothing is built yet. Written 2026-09-27. It follows `tasks/system-model-research.md` (the research, and the measurements on 11 public reference systems) and narrows it to what was agreed: **deployables, the links between them, how they are built, which environments they run in, and what technology is in them.** The engine records facts. The architect draws quanta as groups.*

## Status (2026-09-27): built, uncommitted

- **Engine** (`archstats`, branch `feature/deployables`, uncommitted; revision 4 committed as `d1b1932`): `files.system_kind` and co-change for system files; `extensions/deployables` with ten tables; Louvain crash fix; ADR 0021; `DESCRIPTION.md`; revision 5; rule templates in `docs/rules/deployables.yml`. Tests: unit (Dockerfile, build plugins, config, pipelines, linker, determinism, secret leak), six pinned e2e fixtures, `cmd/assert` template run. `go test ./...` green.
- **UI** (`archstats-ui` worktree `feature/deployables-ui` off `main`, in the session scratchpad; uncommitted): Deployables view (Map, List, Pipelines, Technology; inspector tabs Built from, Talks to, Pipeline, Environments, Technology), "Make a lens" (From how it ships, with a merge-on-sync-and-shared-data option), "Ships in" band on component detail, system kind on file detail, rail entry. 771 vitest tests green; checked against eight real snapshots.
- **Deviations** (another session is editing these files on `main`): the lens reading lives in the Deployables view, not the lens builder; runtime links show in the map and the Ships in band, not as a Connections toggle; no report section yet; no "system files" option in the production/test control.
- **Acceptance**: microservices-demo 11 services + 17 calls; petclinic 8 images, gateway → 4, all → config-server; OTel checkout → 6, frontend → 7; bank-of-anthos Jib by module, shared-ConfigMap links labelled; eShop 9 apps from the AppHost; SAM 10 functions; client workspace 24 services, gateway → 16, Java 8 on 23 of 24, Spring Boot 2.3.3 on 22 of 24, qp-common in 15 — once its `.archstatsignore` (`*.*`, `!*.java`) stops hiding non-Java files.

## Overview

Archstats knows the code (components, modules, units) and its history. It does not know what gets **built and shipped as one unit**, or how those units depend on each other. In a multi-repo estate, that is the architecture: the client workspace reads as 26 islands today.

This plan adds the **deployable**:
- **What it is:** a container image, an executable app or a serverless function, recognised from the files that build it.
- **What is recorded about it:** what code is inside, how it is built (pipeline), where it runs (environments), what it talks to, and what technology it carries.

Everything is read offline from the checkout, with file:line evidence on every fact, in the same SQLite snapshot contract.

**Not in scope:**
- Terraform and cloud resources
- CI security findings
- vulnerability-grade SBOM
- DORA-style numbers
- live cluster or cloud access
- any CI system beyond GitHub Actions, Jenkins (declarative) and GitLab (basic)

## Architecture decisions

1. **Deployable, not quantum.** A deployable is a fact the files state. A quantum is a judgement about runtime coupling, and the files can only hint at it. The engine records deployables and the evidence between them. Quanta are **groups**, drawn by the architect, with a "From how it ships" lens reading that proposes them. This is the same rule as the lens readings: name the evidence, not the hoped-for result.
2. **Three kinds of deployable:**
   - **`image`:** a container built in the workspace (Dockerfile, compose `build:`, Skaffold, Jib, Spring Boot `build-image`).
   - **`app`:** an executable artifact built in the workspace whose image is built elsewhere, or not at all. Recognised by a Spring Boot plugin, a .NET Web/Worker SDK, or a Go `package main` that some deploy file refers to.
   - **`function`:** SAM or Serverless Framework.

   When an image contains an app module, they fold into one deployable (the image) that contains the module. The client workspace needs `app`: its images are built by a central workflow outside the workspace.
3. **Template, instance, pattern.** A deployable is built once. A deploy template (chart, kustomize base, reusable workflow) is instantiated per environment:
   - Enumerated instances are stored as rows: values files, overlays, workflow environment lists, literal ApplicationSet lists.
   - Open-ended ones, such as a preview environment per pull request, are stored as one row with `kind = 'pattern'`. They are never listed out.
4. **Every join says how it was made.** `resolution` is one of:
   - `declared`: named outright.
   - `path`: a relative path, resolved.
   - `name`: joined on a normalised name. The UI draws these dashed.

   A tie between two candidates is refused and written to `deployable_unresolved`. The Go-import tail-matching lesson applies here.
5. **One engine extension, `extensions/deployables`,** built the way the git extension is:
   - A `FileAnalyzer` claims system files and parses them from the content the walker already loaded. Its state is guarded by a mutex, since files are analysed concurrently.
   - A `ResultsEditor` links everything against `FileToComponent`, `FileToModule` and `Modules`.
   - Views render the tables.
   - `core/module` readers are extended, not duplicated, for what Maven and Gradle declare.
6. **Minimal dependencies.**
   - `gopkg.in/yaml.v3` (already present) for all YAML, using `yaml.Node` so every fact keeps its line.
   - `encoding/xml` and `encoding/json` from the standard library.
   - The only candidate new module is the BuildKit Dockerfile parser (Task 4 decides; a hand-written reader is the fallback).
   - No Helm SDK, no apimachinery, no compose-go, no HCL.
7. **Offline and deterministic.**
   - Never fetch a chart, workflow or registry.
   - Sort before emitting.
   - Scanning the same commit twice must give identical tables. There is a test for it, because engine nondeterminism is already a known problem.
8. **Secrets.** For config keys that look like secrets, record the key and never the value. A URL value is reduced to its scheme, host and port.
9. **Snapshot contract.**
   - New tables are documented in `DESCRIPTION.md`.
   - The concept gets `docs/adr/0021-deployables.md`.
   - Each engine release that changes output bumps `core.AnalysisRevision`.
   - The UI reads with `hasView`/`hasColumn`, and older snapshots make no deployable claims.

## Snapshot tables (the contract)

| Table | One row per | Columns |
|---|---|---|
| `files.system_kind` (new column) | file | `build`, `ci`, `container`, `deploy`, `config`, `lockfile`, or empty. A second axis next to `role` |
| `deployables` | deployable | `id`, `name`, `kind` (`image`, `app`, `function`), `repository`, `file`, `line` (where it is declared), `built_by` (`dockerfile`, `jib`, `spring-boot`, `compose`, `skaffold`, `sam`, `serverless`, `delegated`), `context` (directory), `base_image`, `runtime` (`java 8`, `node 20`…), `files`, `components` |
| `deployable_contents` | (deployable, directory) | `deployable`, `directory`, `module`, `file`, `line` (the `COPY`, context or module that put it there), `resolution` |
| `deployable_components` | (deployable, component) | `deployable`, `component`, `files`. The roll-up the UI reads |
| `deployable_links` | link | `from`, `to`, `kind` (`calls`, `messages`, `shares_datastore`, `shares_module`, `depends_on`), `mode` (`sync`, `async`, empty), `via` (host, topic, database or module name), `file`, `line`, `resolution` |
| `pipelines` | pipeline (workflow, Jenkinsfile, GitLab file) | `id`, `name`, `system`, `file`, `triggers`, `paths`, `stages` (ordered: `build,test,scan,package,publish,deploy,approve`), `tools`, `delegates_to`, `delegates_ref`, `environments` |
| `pipeline_deployables` | (pipeline, deployable) | `pipeline`, `deployable`, `action` (`builds`, `deploys`), `file`, `line`, `resolution` |
| `deployable_environments` | (deployable, environment) | `deployable`, `environment`, `kind` (`enumerated`, `pattern`), `source` (`helm_values`, `kustomize_overlay`, `workflow`, `applicationset`, `compose_profile`), `file`, `line` |
| `deployable_dependencies` | (deployable, dependency) | `deployable`, `ecosystem`, `name`, `version`, `role` (`runtime`, `framework`, `library`, `base_image`, `internal`), `source` (`manifest`, `lockfile`, `dockerfile`, `pipeline`, `cyclonedx`), `file`, `line` |
| `deployable_unresolved` | reference that joined to nothing | `from`, `ref`, `file`, `line`, `reason` (`external`, `interpolated`, `ambiguous`, `outside_workspace`) |

## Acceptance fixtures (the bar every phase is measured against)

Expected results, written by hand before the code, from the measurements already taken:

| Codebase | Pinned at | Expected |
|---|---|---|
| GoogleCloudPlatform/microservices-demo | `38e7348eb289eb5b87c0c6e8cb19ced0449dc389` | 11 service images + loadgenerator. ≥ 16 `calls` links (checkout → cart, currency, email, payment, productcatalog, shipping…). redis and busybox unresolved as `external` |
| spring-petclinic/spring-petclinic-microservices | `aefaf7fa9eb0ab911a24c346ca0e4dc5837251c7` | 8 deployables built by the parent pom's image plugin. Gateway `calls` customers, vets, visits and genai; every service `calls` config-server |
| open-telemetry/opentelemetry-demo | `6a89faba15c8097c4bd82bcc15d906ac70baccd9` | ≥ 20 images joined via compose `build:` after `.env` interpolation |
| GoogleCloudPlatform/bank-of-anthos | `db35fea9fd090150e2398106aadb475576f80d94` | Jib images mapped to their Maven modules. `calls` read through the shared ConfigMap (`envFrom`) |
| LibreChat (local) | `be4cf5846c569938f91ac01fc282cbc85aebbf37` | `librechat-api` contains api, config and the four workspace packages (stage closure). 2 charts. mongodb and meilisearch external |
| The 26-repo client workspace (local only, never committed) | as on disk | 20 `app` deployables with 4 enumerated environments each. `qp-common` in 16 as `shares_module`. Build delegated to the central workflow repository. Expected values kept in a gitignored file |

The public five become Go e2e tests through the existing `realView(t, url, commit, …)` helper. The client expectations run through a local script only.

---

## Phase 0: Ground to build on

### Task 0.1: Land the uncommitted revision 4
**Description:** The engine working tree on `persona-roadmap` holds uncommitted revision-4 work (smaller snapshots: sqlite layout, `next_hop`, matrix). Commit it, or confirm with its owner, before any deployables work, so revision 5 starts from a clean boundary.
**Acceptance:** `git status` clean on the engine; `go test ./...` passes; rev 4 tagged or recorded.
**Verification:** `go test ./... -short`.
**Dependencies:** none. **Scope:** XS (no new code). **Needs Ryan:** yes, it may be another session's work.

### Task 0.2: Write the acceptance fixtures
**Description:** Encode the table above as failing e2e tests (public five) and a local script (client workspace), so every later task has a target.
**Acceptance:** five `Test_Real_*_Deployables` tests exist and skip under `-short`; the client script prints expected vs actual.
**Verification:** `go test ./e2eTest -run Deployables` fails with "view deployables not found" (expected red).
**Dependencies:** 0.1. **Files:** `e2eTest/deployables_e2e_test.go`, `archstats-ui/tasks/acceptance/deployables-client.local.sh` (gitignored). **Scope:** S.

---

## Phase 1: System files are visible (revision 5)

### Task 1.1: `system_kind` on every file
**Description:** A classifier in `core/file`, from the filename plus a short content sniff for YAML (`apiVersion`+`kind`, `services:`, `on:`+`jobs:`, `apiVersion: skaffold/`, `AWSTemplateFormatVersion`/`Transform`). It is stored in `Results.FileSystemKinds` and exported as a `files` column. It is not a new role, so role precedence and the health readers stay as they are.
**Acceptance:**
- Dockerfile → `container`
- `.github/workflows/*.yml` → `ci`
- `values-prod.yaml` → `deploy`
- `application.properties` → `config`
- `package-lock.json` → `lockfile`
- a plain `.java` file → empty

**Verification:** table test in `core/file/systemkind_test.go`; on the Sylius snapshot, `select system_kind, count(*) from files group by 1` is non-empty for `ci` and `container`.
**Dependencies:** 0.1. **Files:** `core/file/systemkind.go` (+test), `core/results.go`, `extensions/basic/file_view.go`, `DESCRIPTION.md`. **Scope:** M.

### Task 1.2: Co-change counts system files
**Description:** `fileCouplingViewFactory` gates on `FileToComponent`, so build and CI files never appear in `git_file_shared_commits`. On Fineract there are 0 such rows, although `fineract-provider/build.gradle` is in 563 commits. Gate on "walked and not third-party" instead.
**Acceptance:** Fineract has rows pairing `build.gradle` or `.github/` files with code; existing coupling tests still pass; the sweeping-commit filter still applies.
**Verification:** new case in `file_coupling_view_test.go`; a rescan of Fineract via `archstats export sqlite`.
**Dependencies:** 1.1 (to exclude third-party the same way). **Files:** `extensions/git/file_coupling_view.go` (+test). **Scope:** S.

### Task 1.3: UI — system files in Files and the directory tree
**Description:** A `system_kind` chip on file rows and a "System files" option in the production/test control. It reads defensively.
**Acceptance:** a Sylius rev-5 snapshot shows chips on workflow and Dockerfile rows; a rev-4 snapshot shows no chips and no control option; nothing errors.
**Verification:** `npm run check`; a vitest for the column guard; one capture of the Files view.
**Dependencies:** 1.1. **Files:** Files view, `features/files/*`, the role control in `NavBar.vue`. **Scope:** S.

### Checkpoint A
- `go test ./...` and `npm run check` pass. Revision bumped to 5 with its changelog line.
- Scanning twice gives identical `files` and `git_file_shared_commits`.

---

## Phase 2: Deployables from containers (the first vertical slice)

### Task 2.1: Extension skeleton, model and linker core
**Description:**
- **`extensions/deployables`:** the model (Deployable, Content, Link, Ref), the mutex-guarded collector the `FileAnalyzer` writes into, and the `ResultsEditor` that resolves refs (paths → directories → modules → components).
- **Name joins:** normalise (drop registry host, tag, digest, `${…}`/`${{ … }}`), longest shared suffix, ties refused.
- **Views:** `deployables`, `deployable_contents`, `deployable_components`, `deployable_unresolved`.
- **Registration:** in `cmd/common/extensions.go`, with a discovery trigger on any `system_kind`.

**Acceptance:** with no readers yet, the four views render empty and a scan does not change otherwise. Name-join unit tests cover `ghcr.io/x/librechat-api:latest` ↔ `librechat-api`, the refusal on a tie, and `mongo` never joining a `mongo/` directory.
**Verification:** `go test ./extensions/deployables/...`.
**Dependencies:** 1.1. **Files:** `extensions/deployables/{extension,model,link,views}.go`, `link_test.go`, `cmd/common/extensions.go`. **Scope:** M.

### Task 2.2: Dockerfile reader
**Description:**
- **Parser decision:** try the BuildKit parser (`moby/buildkit/frontend/dockerfile/parser`) and measure the `go.sum` growth and binary size. If either grows noticeably, write a line reader instead (continuation lines, `FROM … AS`, `COPY`/`ADD` sources and `--from`, `ARG` defaults, `EXPOSE`, `ENTRYPOINT`).
- **Contents:** stage closure gives what an image contains. `COPY --from=stage` pulls in that stage's sources; `COPY --from=<image>` is external.
- **Base image:** the final stage's base, with ARG defaults substituted.

**Acceptance:** LibreChat `Dockerfile.multi` target `api-build` contains `api`, `config`, `packages/data-provider`, `packages/mcp`, `packages/data-schemas` and `client`; base `node:20-alpine`.
**Verification:** reader tests on testdata copies; the LibreChat fixture.
**Dependencies:** 2.1. **Files:** `readers/dockerfile.go` (+test, testdata). **Scope:** M.

### Task 2.3: Compose and Skaffold readers
**Description:**
- **Compose:** `build.context`, `dockerfile`, `target`, `image`, `depends_on`, `environment`, profiles. `.env` interpolation (`${X}`, `${X:-d}`) comes first. A service with both `build:` and `image:` is a `declared` join.
- **Skaffold:** `build.artifacts[].image/context/docker.dockerfile`, plus `jib.project`, which maps the image to that Maven or Gradle module.

**Acceptance:** microservices-demo → 12 images; OTel demo → ≥ 20 images joined, where without `.env` it was 0 of 34.
**Verification:** reader tests; the two e2e fixtures turn green for their image counts.
**Dependencies:** 2.2. **Files:** `readers/compose.go`, `readers/skaffold.go`, `readers/dotenv.go` (+tests). **Scope:** M.

### Task 2.4: UI — Deployables view, first cut
**Description:**
- **Rail item:** "Deployables", shown when `hasView('deployables')`.
- **List:** name, kind, built by, base image, runtime, components and files.
- **Selection:** a click selects; the inspector shows **Built from** (directories, modules and components, each with the `COPY` or context line). Leaving is the labelled Open button.
- **Groups:** the selection tray works, and "Create group from this deployable" is one click.
- **Empty snapshot:** one line, "No file in this workspace builds a container, app or function", instead of an empty table.

**Acceptance:** microservices-demo lists 12; every "Built from" row opens the file at the line; ⌘G on a deployable makes a group of its components.
**Verification:** `npm run check`; a vitest over a real snapshot (the `createRequire("node:sqlite")` pattern); one Sonnet-driven capture.
**Dependencies:** 2.3. **Files:** `features/deployables/{deployables.ts,deployables.test.ts}`, `pages/views/deployables/index.vue`, `features/shell/components/NavBar.vue`. **Scope:** M.

### Task 2.5: "Ships in" on component detail
**Description:** A Reading band listing the deployables this component is in, with a file count each, and one line when there are none. The link goes to Deployables with that deployable selected.
**Acceptance:** microservices-demo `cartservice` code shows "Ships in cartservice". A component in no deployable reads "No build file puts this component in a container, app or function."
**Verification:** `npm run check`; one capture.
**Dependencies:** 2.4. **Files:** `pages/views/components/[name]/index.vue`, `features/deployables/deployables.ts`. **Scope:** S.

### Checkpoint B: go / no-go
- microservices-demo, OTel demo and LibreChat fixtures green for images and contents.
- Deterministic across two scans.
- **Ryan looks at the Deployables view on LibreChat and one reference system, and decides whether this is worth continuing.** If it is not, stop here. Phases 1–2 stand on their own.

---

## Phase 3: Java and .NET builds, and the delegated case

### Task 3.1: Maven and Gradle image plugins
**Description:**
- **`core/module` Maven reader** also reads `packaging`, `parent`, `properties` and build plugins, including plugins configured in a parent pom and inherited by its modules. Properties resolve through the parent chain.
- **Image plugins recognised:** `jib-maven-plugin` (`to.image`), `spring-boot-maven-plugin` (`image.name`, or the default `docker.io/library/${artifactId}`), `dockerfile-maven-plugin`, and an exec-plugin `docker build -t`.
- **Gradle:** the Jib and Spring Boot `bootBuildImage` blocks, by pattern only.

**Acceptance:** spring-petclinic-microservices → 8 of 9 compose images joined to their Maven modules (zipkin external). bank-of-anthos Jib images map to their modules.
**Verification:** module reader tests (parent inheritance, property resolution); the two fixtures.
**Dependencies:** 2.3. **Files:** `core/module/readers_build.go` (+test), `extensions/deployables/readers/buildplugins.go`. **Scope:** M.

### Task 3.2: `app` deployables and the delegated build
**Description:**
- **What counts as an `app`:** an executable module (Spring Boot plugin with jar or war packaging; .NET `Microsoft.NET.Sdk.Web`/`Worker`; Go `main` with a Dockerfile or deploy file) that some deploy descriptor or pipeline in the same repository refers to.
- **Folding:** an app inside an image folds into the image.
- **Delegated build:** when the build is a reusable workflow outside the workspace, `built_by = 'delegated'` and `deployable_unresolved` records the reference as `outside_workspace`.

**Acceptance:** the client script reports 20 `app` deployables, built delegated. petclinic apps fold into their images.
**Verification:** the local client script; unit tests for folding.
**Dependencies:** 3.1, and 5.1 for workflow delegation (the "some pipeline refers to it" rule can start with deploy descriptors only). **Files:** `extensions/deployables/apps.go` (+test). **Scope:** M.

### Task 3.3: Serverless functions
**Description:** SAM and CloudFormation `AWS::Serverless::Function`/`AWS::Lambda::Function` with `CodeUri`, `Handler` and `Globals`; `serverless.yml` `functions.*.handler`. The CFN short-form tags survive through `yaml.Node.Tag`.
**Acceptance:** aws-serverless-shopping-cart → 10 functions, each containing its `CodeUri` directory.
**Verification:** reader tests; a fixture assertion (added to 0.2's set).
**Dependencies:** 2.1. **Files:** `readers/sam.go`, `readers/serverless.go` (+tests). **Scope:** S.

### Checkpoint C
- petclinic, bank-of-anthos and serverless fixtures green; the client script matches.
- Revision bumped (6) if Phase 2 has already shipped in a tag; otherwise it rides in 5.

---

## Phase 4: What deployables talk to

### Task 4.1: Config readers
**Description:**
- **Sources read:** Spring `application*.{properties,yml}` and `bootstrap.*`; `.env` and `.env.example`; compose `environment`; k8s container `env` and `envFrom` → ConfigMap `data`; Helm values `env:` maps.
- **What is extracted:** URL hosts (`http`, `https`, `grpc`, `lb://`), `host:port` values, Kafka, AMQP and PubSub topics and queues (by key: `topic`, `queue`, `bootstrap-servers`, `destination`), and JDBC and Mongo datastores (host plus database name).
- **Secrets:** keys that look like secrets are recorded key-only (Decision 8).

**Acceptance:**
- A fixture `application.properties` with a password key stores the key, never the value.
- bank-of-anthos reads `ledgerwriter:8080` through `envFrom`.
- microservices-demo yields ≥ 16 hosts.

**Verification:** reader tests, including a secret-leak test that greps the exported snapshot for the fixture's password.
**Dependencies:** 2.1. **Files:** `readers/config.go`, `readers/springconfig.go` (+tests). **Scope:** M.

### Task 4.2: Links
**Description:**
- **What resolves to a deployable:** a host resolves when it names a deployable, a compose service, a k8s Service whose workload runs the deployable's image, or a Spring `spring.application.name`.
- **Link kinds:**
  - `calls` (sync) from URLs and `host:port`.
  - `messages` (async) when two deployables name the same topic or queue. A single mention is kept as an unresolved external.
  - `shares_datastore` when two deployables name the same host and database. A shared host alone is not enough, so it does not count.
  - `shares_module` when two deployables contain or depend on the same internal module (`qp-common`).
  - `depends_on` from compose.

**Acceptance:**
- microservices-demo ≥ 16 `calls`.
- petclinic: gateway → 4 services, all → config-server.
- Client: `qp-common` `shares_module` across 16.
- A shared topic between 4 client services reads `messages`, not `calls`.

**Verification:** link unit tests; fixtures; the client script.
**Dependencies:** 4.1, 3.2. **Files:** `extensions/deployables/links.go` (+test), `views.go`. **Scope:** M.

### Task 4.3: UI — Talks to, and runtime edges in Connections
**Description:**
- **Talks to tab** on a deployable: grouped by kind, sync and async apart, each link with its file:line and resolution. Name joins are dashed.
- **Deployable map:** a layered or force layout only when there are more than 3 deployables and more than 0 links. Otherwise it's a list.
- **Connections:** a "Runtime links" toggle, off by default, that adds `calls` and `messages` between the components that ship in those deployables, with its own legend entry.

**Acceptance:** the client workspace shows the 26 repositories connected for the first time. Every edge caption says what it was read from.
**Verification:** `npm run check`; vitest for the edge projection; one capture on microservices-demo.
**Dependencies:** 4.2, 2.4. **Files:** `pages/views/deployables/*`, `features/deployables/links.ts` (+test), `features/connections/*`. **Scope:** M.

### Checkpoint D
- All link fixtures green. The secret-leak test passes on every fixture.
- Ryan reviews the client workspace map. This is the feature's main claim.

---

## Phase 5: Pipelines

### Task 5.1: GitHub Actions reader
**Description:**
- **What is read:** triggers, `paths`/`paths-ignore`, jobs and `needs`, steps, `uses` (action or reusable workflow, and its ref), `environment:`, `workflow_dispatch` choice inputs, and a naive matrix expansion for image and directory keys.
- **Stage classification:** a small table of known actions and commands (`actions/setup-*`, `mvn|gradle|npm run build` → build; `test` → test; `codeql|sonar|trivy|snyk` → scan; `docker build|build-push-action|jib` → package; `docker push|login` → publish; `helm|kubectl|argocd|az webapp|gcloud run` → deploy; `environment` with protection → approve).
- **Delegation:** `delegates_to`/`delegates_ref` for remote reusable workflows.

**Acceptance:**
- Client `cicd.yml` → stages `build`, deploy delegated to the central workflow repository at `main`, environments `dev, test, staging, prod`.
- LibreChat `main-image-workflow.yml` → package + publish of `librechat-api` and `librechat`.

**Verification:** reader tests; fixtures.
**Dependencies:** 2.1. **Files:** `readers/actions.go`, `stages.go` (+tests). **Scope:** M.

### Task 5.2: Jenkinsfile (declarative) and GitLab CI (basic)
**Description:**
- **Jenkins:** regex over the declarative subset: `stage('…')`, `@Library`, `sh` lines through the same stage classifier, `docker.build`, `helm`. A scripted pipeline is marked `partial`.
- **GitLab:** `stages`, jobs, `needs`, `extends`, `include` (recorded as `outside_workspace` when remote), `environment`, `rules.changes`.

**Acceptance:** the 8 client Jenkinsfiles parse to named stages and their shared library. glab's `.gitlab-ci.yml` lists its remote includes as outside the workspace.
**Verification:** reader tests on anonymised copies.
**Dependencies:** 5.1. **Files:** `readers/jenkins.go`, `readers/gitlab.go` (+tests). **Scope:** M.

### Task 5.3: Pipeline ↔ deployable, and the UI
**Description:**
- **Linking:** `builds` when a pipeline's docker step names the deployable's image or context, or runs the build tool in its module. `deploys` when it deploys a chart or values that run it. With a delegated pipeline, a workflow in the deployable's own repository counts.
- **UI:** a **Pipeline** tab on the deployable (one stage strip per pipeline, triggers, scope, delegation shown as "handed to X@main, outside this workspace"). A Pipelines list in the Deployables view as a secondary tab.

**Acceptance:** every client deployable has a pipeline. LibreChat images link to `main-image-workflow.yml`.
**Verification:** link tests; `npm run check`; one capture.
**Dependencies:** 5.1, 3.2. **Files:** `extensions/deployables/pipelines.go`, `pages/views/deployables/*`. **Scope:** M.

---

## Phase 6: Environments

### Task 6.1: Environment reader
**Description:**
- **Enumerated sources:** `values-<env>.yaml`/`<env>.yaml` beside a chart or in a `helm-release/`-style folder; kustomize `overlays/<env>`; workflow `environment:` and dispatch choice inputs; literal `ApplicationSet` lists; compose profiles.
- **Patterns:** a preview per pull request (a workflow keyed on a PR number that deploys, or an ApplicationSet with a pull-request generator) is recorded as `kind = 'pattern'`.
- **Linking:** environments attach to the deployables their descriptor runs.

**Acceptance:** client → 4 enumerated environments on 20 deployables. Sylius's Bunnyshell preview is one `pattern` row.
**Verification:** reader tests; the client script.
**Dependencies:** 4.2 (the workload ↔ deployable resolution). **Files:** `readers/environments.go` (+test). **Scope:** M.

### Task 6.2: UI — Environments tab and the diff
**Description:**
- **Layout:** environments as columns.
- **Diff:** the keys that differ between them, taken from the values files of the same deployable (replicas, resources, image tag, feature flags, hosts), neutral ink with `→`, secrets key-only.
- **Patterns:** shown as "one per pull request, from <template>".

**Acceptance:** a client service shows what prod sets differently from dev in one table.
**Verification:** vitest for the YAML-key diff (on stored values: needs 6.1 to export values per key; see open question 4); one capture.
**Dependencies:** 6.1. **Files:** `pages/views/deployables/*`, `features/deployables/envdiff.ts` (+test). **Scope:** M.

---

## Phase 7: Technology in each deployable (SBOM, the architect's version)

### Task 7.1: Dependencies per deployable
**Description:**
- **Declared dependencies** of the modules a deployable contains: Maven (with the parent's Spring Boot version as `framework`), `package.json` plus the lockfile's exact versions, `go.mod`, `.csproj` `PackageReference`, `composer.lock`, `requirements.txt`/`poetry.lock`.
- **Runtime:** from `setup-java`/`setup-node` in its pipeline, the base image tag, `maven.compiler.release`, `go` directive, `engines.node`, `TargetFramework`.
- **Internal modules** are marked `internal`.
- **Import:** CycloneDX JSON (`*.cdx.json`, `bom.json`, `sbom*.json`) found in the tree, attributed to a deployable by path or name.
- **What it is not:** no transitive resolution for Maven or Gradle (it would need the network). The UI says so.

**Acceptance:**
- Client: 27 of 28 builds on Java 8; Spring Boot 2.3.3 on 21 deployables; `qp-common` internal in 16.
- microservices-demo base images per service.

**Verification:** reader tests; the client script.
**Dependencies:** 3.2, 5.1. **Files:** `readers/deps.go`, `readers/cyclonedx.go` (+tests), `core/module/readers_*.go` for versions. **Scope:** M.

### Task 7.2: UI — Technology tab and the spread grid
**Description:**
- **Technology tab** per deployable: runtime, framework, base image, internal modules, then libraries, each with its source.
- **Spread grid** in the Deployables view: deployable × key dependency (runtime, framework, base image and the top internal modules), versions in cells, neutral ink.
- **Libraries view:** gains a "by deployable" roll-up.

**Acceptance:** the client grid shows the Java 8 / Spring Boot 2.3.3 spread and `qp-common` in one screen.
**Verification:** `npm run check`; vitest; one capture.
**Dependencies:** 7.1. **Files:** `pages/views/deployables/*`, `features/deployables/technology.ts` (+test), `pages/views/libraries.vue`. **Scope:** M.

---

## Phase 8: Quanta as groups, rules, report, docs

### Task 8.1: Lens reading "From how it ships"
**Description:** A tenth reading under a new evidence heading. Components are grouped by the deployable they ship in; components in several deployables form a "Shared" group, and components in none an "Not shipped" group. An option then merges deployables joined by `calls` or `shares_datastore` into one proposed group (the quantum proposal), stating which links did it. It is measured before it is taken, like the other nine.
**Acceptance:** on microservices-demo, 11 groups; with merging on, groups joined only by `messages` stay apart. Each merged group names the links that joined it.
**Verification:** vitest over a real snapshot.
**Dependencies:** 4.2. **Files:** `features/lens-builder/suggest.ts`, `features/lens-builder/studio.ts` (+tests). **Scope:** M.

### Task 8.2: Rule templates, report section and docs
**Description:**
- **Rule templates** for `archstats assert`: every deployable has a pipeline; no deployable `calls` another's datastore; no pipeline delegates to a branch ref; no runtime below a floor the architect sets.
- **Markdown report:** a "How it ships" section, following the report-voice rules.
- **Docs:** `DESCRIPTION.md` tables, ADR 0021, and `docs/ecosystems.md` notes.

**Acceptance:** every template runs on the fixtures and returns rows only where expected; the report renders on LibreChat.
**Verification:** a sqlite smoke test of every template's SQL (the report-QA pattern).
**Dependencies:** 4.2, 5.3. **Files:** `features/rules/*`, `features/reports/*`, `DESCRIPTION.md`, `docs/adr/0021-deployables.md`. **Scope:** M.

### Checkpoint E: complete
- All fixtures green. Deterministic. Secret-leak test passes.
- Engine tagged and pushed before the UI release that reads it. The UI `go.mod` points at the tag, not the `go.work`.
- Old snapshots open without errors and make no deployable claims.

---

## Order and parallelism

```
0.1 → 0.2
  └→ 1.1 → 1.2
        ├→ 1.3                         (UI)
        └→ 2.1 → 2.2 → 2.3 → 2.4 → 2.5 ── Checkpoint B (go / no-go)
                   │     └→ 3.1 → 3.2
                   ├→ 3.3
                   ├→ 4.1 → 4.2 → 4.3
                   └→ 5.1 → 5.2
                              5.3 (needs 3.2)
                   4.2 → 6.1 → 6.2
                   3.2 + 5.1 → 7.1 → 7.2
                   4.2 → 8.1 ; 4.2 + 5.3 → 8.2
```

After Checkpoint B, Phases 4, 5 and 7 are independent of each other at the engine level. Code stays in the main session, per the standing rule; Sonnet agents only for captures and UI driving.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| False name joins | High: a wrong link is worse than none | `resolution` on every row, ties refused, dashed in the UI, unresolved listed and not hidden, fixture assertions on both hits and refusals |
| Every format needs its own specific handling (`.env`, parent poms, `envFrom`, the matrix) | Medium: silent zeros | The acceptance fixtures were chosen because each exercises one of these. A zero on a fixture fails the build |
| Secrets leak into snapshots | High | Key-only storage, URL reduction, a secret-leak test on every fixture |
| Deployables in product repositories (Mattermost, Kafka) | Low | The one-line empty state, and CI and technology still shown |
| Snapshot growth | Low | Directory grain for contents, not file grain. Measure on PostHog (33k files) |
| Scope creep back to "every format" | Medium | Out-of-scope list above. A new format needs a real codebase asking for it |
| Engine and UI version skew | Medium | Tag and push the engine before each UI release (the persona-roadmap lesson) |

## Open questions for Ryan

1. **Task 0.1:** is the uncommitted revision-4 work in the engine yours to commit, or another session's?
2. **Dockerfile parser:** BuildKit's parser (correct, one more module) or a hand-written reader (no dependency)? Task 2.2 measures both. Default: BuildKit unless it adds more than ~2 MB to the binary.
3. **The client's central workflow repository:** can you add it to the workspace? With it, "delegated" pipelines become readable end to end; without it they stay "outside this workspace".
4. **The environment diff (6.2)** needs per-key values in the snapshot. Store a flattened `deployable_environment_values` table (key-only for secrets), or read the values files from `file_contents` when the scan stored content?
5. **Naming in the UI:** "Deployables" as the rail item and "From how it ships" as the reading. Keep them, or use other words?
