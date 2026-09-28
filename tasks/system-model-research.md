# Beyond the source: build, CI, deploy and infrastructure in Archstats

> **Scope narrowed 2026-09-27.** The build plan is `tasks/deployables-plan.md`: deployables (not quanta), their links, pipelines, environments and technology. Terraform, CI security and the broad system graph in sections 3–5 below are out of scope.

*Research only. No code was changed. Written 2026-09-27 from three things: (1) a count of what is actually in the repositories on this machine, (2) a survey of Go parsers for each format, (3) a survey of the tools that already work in this space. Numbers in this document were measured, not assumed. Client workspaces are anonymised.*

---

## 1. Summary

- **Every codebase we scan has a second system in it**, next to the code: how it is built, tested, shipped and run. It is written down in files the engine already walks (Dockerfiles, workflows, Helm values, Terraform, compose files) and then ignores. Measured on this machine:
  - GitHub Actions workflows are in 14 of the 19 checkouts in the personal folder, and in all 26 repositories of the enterprise client workspace.
  - That client workspace has no Dockerfile and no Kubernetes manifest in any repository, yet all of it deploys to Kubernetes. The deployment lives in 74 per-environment Helm values files (20 repositories), and in about 70 calls to one shared workflow repository. Each repository's Spring config also names the other services it talks to. **For a multi-repo workspace, these files are the architecture.** The Java imports only describe the inside of each box.
  - 11% of Sylius commits and 17% of Fineract commits touch a build, CI or deploy file.
- **Nobody does this offline.** Catalogs (Backstage, Port, Cortex) and graph tools (Cartography, KubeView, Datadog) build the "repo → build → image → workload → cloud resource" chain from live APIs and credentials. The static tools each read one format: Checkov reads Terraform, zizmor reads Actions, Syft reads package manifests. **No tool builds one graph of all of it from the files alone, joins it to the code graph, and keeps it with git history.** That fits Archstats' positioning (local-first, an open SQLite contract, structure and history in one model) exactly.
- **Recommendation:** add one engine concept, the **system graph**. It has typed nodes (build targets, artifacts, images, pipelines, workloads, cloud resources, external services) and typed edges between them *and to files, directories, modules and components*. Every edge carries its evidence (file:line) and says how it was resolved. Readers plug in the way `module.Reader` does today. Resolution runs as one linking pass, like unit refs. Whatever cannot be resolved is reported, like `unresolved_edges`.
- **In the UI, one new top-level view:** *System*, a layered flow from code to runtime. It sits alongside three integrations into existing surfaces: "Ships in" on component detail, a tenth lens reading ("From the deployment"), and runtime edges in Connections. Pipelines, infrastructure and pinned versions are tabs of that view. They are not three more rail items.

---

## 2. What is actually in the repositories

Count of non-source "system" files per checkout (`find`, excluding `node_modules`, `.git`, `vendor`, `target`, `.terraform`). `k8s` means YAML files with a top-level `kind:` of a workload or Service kind.

| Repo | Build manifests | Docker / compose | CI | Deploy | IaC | Other |
|---|---|---|---|---|---|---|
| BroadleafCommerce | 13 pom | — | 1 Jenkinsfile | — | — | — |
| Sylius | 5 package.json | 4 / 2 | 21 GHA | — | — | Makefile |
| django-oscar | 1 package.json | 1 / — | 2 GHA, 1 Jenkinsfile | — | — | 2 Makefile |
| fineract | 47 gradle | — / 18 | 27 GHA | 4 k8s | — | — |
| LibreChat | 7 package.json | 3 / 2 | 20 GHA | 2 Helm charts, 8 k8s | — | — |
| nopCommerce | 40 csproj | 1 / 1 | 1 GHA | — | — | — |
| sakai | 458 pom, 52 package.json | 1 / — | 4 GHA | — | — | — |
| spring-petclinic | 1 pom, 2 gradle | 1 / 1 | 3 GHA | 2 k8s | — | — |
| hibernate-orm | 5 pom, 13 gradle | 5 / — | 3 GHA, 2 Jenkinsfile | — | — | — |
| cloud-foundation-fabric | 4 package.json, 2 go.mod | 6 / — | 5 GHA | 22 k8s, 1 kustomize | **1,004 .tf** (182 dirs, 807 module calls) | 2 serverless |
| GCP integration repo (client) | 1 go.mod | 2 / — | 13 GHA | — | 13 .tf | — |
| data pipeline (client) | 1 go.mod | 2 / 1 | — | 1 k8s | 26 .tf | **67 .proto** |
| 26-repo Java workspace (client) | 23 pom repos, 3 gradle repos | none | ~4 GHA each, 8 Jenkinsfile | **74 Helm values files** in 20 repos | — | 26 Spring configs |

Zero on this machine: GitLab CI, Travis, CircleCI, Azure Pipelines, Bazel, CloudFormation/SAM. They are still common elsewhere (GitLab CI especially in enterprises). They belong in the design, just not first.

### Three chains, traced by hand

These are the proof that the joins can be recovered from the files, and they show which join keys matter.

**LibreChat: code → image → workload.**
- `Dockerfile.multi` stage `api-build` copies `api/` and `config/`. Through `COPY --from=` it also takes the built output of the stages that copy `packages/data-provider`, `packages/mcp`, `packages/data-schemas` and `client`.
- `.github/workflows/main-image-workflow.yml` builds that stage (a matrix entry with `target: api-build`, `file: Dockerfile.multi`, `image_name: librechat-api`) and pushes `ghcr.io/${{ github.repository_owner }}/librechat-api`.
- `helm/librechat/values.yaml:107` deploys `danny-avila/librechat`. `Chart.yaml` depends on a local subchart (`file://../librechat-rag-api`) and on two external charts (mongodb, meilisearch).
- **So we can state, with file:line evidence: the `librechat-api` image contains these five workspace packages; the chart deploys the `librechat` image plus the rag-api subchart; the stack runs on MongoDB and Meilisearch.** No existing view can say any of that.

**GCP integration repo: code → image → cloud resource.**
- `trigger-service/` (a Go module with a Dockerfile) and `upload-job/` are built by `gcp_to_onprem_docker.yml`. Its `paths:` filter names both directories. Its matrix pairs `image: gcp-to-onprem-upload-job` with `dir: upload-job`.
- `terraform/upload_job.tf` declares a `google_cloud_run_v2_job` whose `image` ends in `gcp-to-onprem-upload-job:${var.upload_job_version}`.
- The join is on the **last path segment of the image name**. The registry host, project and tag are all interpolated and have to be dropped.

**26-repo Java workspace: service → service across repositories.**
- No repository declares its deployment. Each has `helm-release/{nonprod-dev,nonprod-test,nonprod-staging,prod}.yaml`: values files for a chart that lives outside the workspace.
- Every repository's workflows call the same central reusable workflow repository (`…/cicd-workflows/.github/workflows/deployment-nonproduction.yml`, about 70 calls) and pin it to `@main`.
- `application.properties` names other services by host (`qp-document-storage`, `qp-profileservice`, `qp-audit`) and a shared config server. **These references are the only record of how the 26 services depend on each other.** The code graph sees 26 disconnected islands.

### A gap this exposed in today's engine

`git_file_shared_commits` has **zero rows** involving a build or CI file on Fineract, although `fineract-provider/build.gradle` alone is in 563 commits. The reason is `fileCouplingViewFactory` (`extensions/git/file_coupling_view.go:26`), which only counts files present in `FileToComponent`, and build files belong to no component. This can be fixed on its own. It is also the first thing the system graph needs, because "what changes with the Helm chart" is a file-pair question.

---

## 3. The model: a system graph

### 3.1 What exists today, and where the new concept fits

| Concept | Grain | Declared in | Today |
|---|---|---|---|
| File | file | the tree | first-class, with role and history |
| Component | package / namespace / directory | source headers | first-class |
| Module | unit of build and publication | manifests (pom, csproj, package.json, go.mod…) | `core/module`, `modules` table |
| Unit | type / function / module | source | `units`, `unit_connections` |
| Group | the architect's own slice | the app | first-class in the UI |
| **System node** (new) | anything the system *builds, ships or runs* | build, CI, deploy and IaC files | — |

A module answers "what does the project publish". A system node answers everything after that: what gets built from it, what that is packaged into, where it runs, and what runs it. Modules stay where they are, and a module becomes one kind of system node's anchor. Nothing about components changes.

### 3.2 Node kinds

Keep the kind list short, as `unit` does ("a kind exists when some ecosystem's architecture is made of it"). The detail goes in `subkind` and `attrs`.

| Kind | Examples (subkind) | Typical source |
|---|---|---|
| `build_target` | maven module, gradle project, npm workspace, bazel target, make target, nx project | pom, settings.gradle, package.json, BUILD |
| `artifact` | jar/war, npm package, lambda zip, helm chart (packaged) | pom packaging, package.json `name`, Chart.yaml |
| `image` | container image; one node per *repository name*, with the build stages as attrs | Dockerfile, workflow docker steps, jib, compose `build:` |
| `pipeline` | workflow, job, stage (with `parent` for job→workflow) | .github/workflows, .gitlab-ci.yml, Jenkinsfile, .travis.yml… |
| `workload` | k8s Deployment/StatefulSet/CronJob, compose service, Cloud Run service/job, Lambda, ECS task, Procfile process | k8s YAML, Helm, compose, Terraform, SAM, serverless.yml |
| `resource` | cloud resource by provider type (`google_pubsub_topic`, `AWS::SQS::Queue`), k8s Service/Ingress/ConfigMap | Terraform, CloudFormation, k8s |
| `iac_module` | terraform module, terragrunt unit, CFN nested stack | `.tf` dirs, terragrunt.hcl |
| `environment` | dev / test / staging / prod | values-*.yaml, kustomize overlays, tfvars, workflow `environment:` |
| `external` | third-party action, base image, external chart, registry module, external host or topic | anything referenced but not defined here |
| `interface` | HTTP API, gRPC service, topic/queue, GraphQL schema | OpenAPI, .proto, AsyncAPI, config |

### 3.3 Edge kinds

| Edge | From → to | Example evidence |
|---|---|---|
| `contains` | image / artifact → directory, module or file | `COPY api ./api`; `COPY --from=` closure; maven module in a jar |
| `builds` | pipeline → image / artifact | `docker build -t …/librechat-api`; `mvn package`; jib |
| `triggers_on` | pipeline → directory (glob) | `on.push.paths: ['api/**']` |
| `calls` | pipeline → pipeline | `needs:`; `uses: ./.github/workflows/x.yml`; `uses: org/repo/…@main` |
| `uses` | pipeline → external action / orb / shared library | `uses: docker/login-action@v3`; `@Library('jsl')` |
| `from` | image → image | `FROM node:20-alpine AS base-min` |
| `deploys` | pipeline / environment → workload | `helm upgrade`, `kubectl apply`, Argo `spec.source.path` |
| `runs` | workload → image | `containers[].image`, compose `image:`, Cloud Run `image` |
| `configures` | environment / values / overlay → workload | `helm-release/prod.yaml`; kustomize overlay |
| `provisions` | iac_module → resource; `iac_module` → `iac_module` | `resource` blocks; `module { source = "../../modules/project" }` |
| `references` | resource → resource | HCL traversal `google_pubsub_topic.x.id`; `!Ref`, `!GetAtt` |
| `talks_to` | workload / module → interface / external | config URL host, topic name, `depends_on`, env var |
| `exposes` | workload → interface | k8s Service/Ingress, OpenAPI, .proto `service` |
| `handler` | workload → file / function | SAM `CodeUri` + `Handler`; serverless `handler: src/x.main` |

### 3.4 Evidence and resolution

The house rule is evidence over verdicts. Every edge row carries:
- `file`, `line`: where it was read, so the UI can always show the line.
- `resolution`, which says *how* the edge was joined:
  - `declared`: the file names its target directly (a path, a `needs:`, a `COPY` source, a module `source`).
  - `path`: a relative path resolved against the file's directory.
  - `name`: joined on a normalised name (image tail, artifactId, chart name, service host). This is the weakest kind, and the UI has to show it as such.
  - `pattern`: a glob or selector (`paths:` filter, k8s label selector).
- `via`: the raw text that was matched (`gcp-to-onprem-upload-job`). Name joins can then be audited.

Name joins are where this goes wrong. The Go import tail-matching episode (see memory `archstats-language-support`) matched testify's `assert` to our own `cmd/assert`. Rules for name joins:
1. Normalise before matching: drop the registry host, the tag or digest, and any `${…}` / `${{ … }}` segment. Lower-case the rest.
2. Match on the longest shared suffix of path segments, with at least one full segment.
3. **Refuse ambiguous matches**, when two candidates tie. Write the reference to `system_unresolved` with `reason = 'ambiguous'` rather than guessing.
4. Never join across `external` boundaries: `mongo` in compose is an external image, not our `mongo/` directory.

### 3.5 Proposed snapshot tables

Follows the existing conventions: one row per thing, metric columns as `family__metric`, documented in `DESCRIPTION.md`, gated by `core.AnalysisRevision`.

| Table | One row per | Columns |
|---|---|---|
| `system_nodes` | node | `id` (stable: `kind:subkind:name@scope`), `kind`, `subkind`, `name`, `file`, `line`, `directory`, `module`, `repository`, `environment`, `parent`, `attrs` (JSON: ports, triggers, replicas, provider…) |
| `system_edges` | edge | `from`, `to`, `kind`, `file`, `line`, `resolution`, `via` |
| `system_unresolved` | reference that joined to nothing | `from`, `ref`, `file`, `line`, `reason` (`external`, `interpolated`, `ambiguous`, `not_found`) |
| `system_versions` | pinned external reference | `node`, `ecosystem` (`action`, `image`, `chart`, `tf_provider`, `tf_module`, `orb`, `jenkins_lib`, `reusable_workflow`), `name`, `version`, `pin` (`digest`, `sha`, `exact`, `range`, `tag`, `branch`, `floating`), `file`, `line` |
| `system_scope` | (pipeline, component) | `pipeline`, `component`, `files_matched`. The `paths:` filters materialised against the snapshot's own files, so "what runs when X changes" is a join rather than glob matching in SQL |
| `files.system_kind` | column on `files` | `build`, `ci`, `container`, `deploy`, `iac`, `config`, `api_spec`, or empty. A second axis next to `role`, not a new role, so role precedence and every existing health reader stay as they are |

Components and modules also get rolled-up metric columns, e.g. `system__pipelines__count`, `system__images__count`, `system__workloads__count` and `system__environments__count`. Each has a `_metric_definitions` entry, as every metric does.

### 3.6 What history adds for free

The system files are already in `git_commits`. Once `files.system_kind` and the nodes exist:
- **Config coupling:** components that change together with a chart, workflow or Terraform module. This needs the `FileToComponent` gate in file co-change lifted for system files (§2).
- **Infra churn and ownership:** who changes the pipelines and the Terraform, and knowledge concentration on those files. It reuses the existing author views.
- **Pin age:** how long since a `system_versions` row last changed (`git log -L`-style blame per line is costly, so start with file-level last change).
- **Delivery shape, from git alone:** commits touching deploy files per month, and share of code commits that also touch a pipeline. Keep these descriptive. Deployment frequency, change-failure rate and MTTR need CI and incident data we do not have, and naming them "DORA" would be a claim we cannot back.

### 3.7 Rules and assertions

`archstats assert` already runs SQL against a fresh scan, so every rule below is a template the architect copies, not a built-in verdict:
- every workload's image is built by some pipeline in the workspace
- no third-party action is pinned to a tag or branch rather than a SHA (`system_versions.pin in ('tag','branch')`)
- no `prod` environment runs an image tagged `latest`
- every component with production files is covered by at least one pipeline's `paths:` scope, or by a pipeline with no filter
- no Terraform root module sources a module from outside `modules/`
- no service in the workspace `talks_to` another service's database resource directly

---

## 4. Engine: readers, linking and parser choices

### 4.1 Shape

It mirrors what already works:
1. **Classify** every walked file into `system_kind` using a filename table plus content sniffing. The sniffing is needed for YAML: k8s needs `apiVersion` + `kind`; CFN needs `AWSTemplateFormatVersion` or `Resources.*.Type: AWS::`; SAM needs `Transform: AWS::Serverless-…`; OpenAPI needs `openapi:` or `swagger:`; Skaffold needs `apiVersion: skaffold/`. **Renovate's list of ~90 "managers" is the most complete catalogue of these file types**; use it as the checklist.
2. **Read**: a `system.Reader` per format (`Kind`, `Claims(path, head []byte)`, `Read(file) → nodes + refs`), registered in a list the way `module.Readers` is. Readers work on the content the walker already loaded, and never do their own walk (the lesson recorded in `module.ReadFrom`).
3. **Link**: one pass after all files are read. Refs resolve to nodes, to files and directories (via the path index), and to modules and components (via `FileToComponent` and the module map). Anything unresolved goes to `system_unresolved`.
4. **Views**: `system_nodes`, `system_edges`, `system_versions`, `system_scope`, `system_unresolved`, plus the `system__*` columns on components and modules.

Two engine rules follow from the snapshot being the contract:
- **Offline and deterministic.** Never fetch a remote chart, orb, registry module or reusable workflow. The engine-nondeterminism memory already records how much map-order noise costs, so sort before emitting.
- **Never store a secret value.** Config readers record key names, and hosts only when the value is a URL. A key that looks like a secret (`password`, `secret`, `token`, `clientSecret`) is written as a node attr `secret_like: true` and its value is dropped. The client repository above has two dozen such keys in `application.properties`.

### 4.2 Parser per format

The dependency weight matters. This ships inside a desktop binary, and `go.mod` is small today. Default to `gopkg.in/yaml.v3`, which is already a dependency. Its `yaml.Node` keeps line and column and the tag, so `!Ref`/`!GetAtt` survive and every edge gets a line number. Only take a library where it buys real semantics.

| Tier | Format | Parser | Notes |
|---|---|---|---|
| 1 | GitHub Actions | `rhysd/actionlint` (MIT) *or* yaml.v3 | actionlint gives a typed workflow with positions and parses `${{ }}` expressions. yaml.v3 alone covers `on`, `jobs`, `needs`, `uses`, `paths`, `environment`, `matrix`. The matrix has to be expanded to recover image names (both client chains needed it). |
| 1 | Dockerfile | `moby/buildkit/frontend/dockerfile/parser` (Apache-2.0) | Small package, no daemon. Gives FROM/AS stages, `COPY --from`, `COPY` sources, EXPOSE, ENTRYPOINT, ARG. Stage closure gives "image contains directory". |
| 1 | docker-compose | yaml.v3 | `compose-spec/compose-go` is the reference loader but pulls in a lot. Services, `image`, `build.context`/`dockerfile`/`target`, `depends_on`, `ports`, `environment` are all plain YAML. |
| 1 | Kubernetes YAML (+ Argo CD, Flux) | yaml.v3, multi-document | Avoid `k8s.io/apimachinery` (large). A table of field paths per kind covers `containers[].image`, `envFrom`, `volumes`, Service `selector`, Ingress backends, Argo `spec.source.path`/`repoURL`, Flux `HelmRelease.chart`. |
| 1 | Helm | yaml.v3 on `Chart.yaml` + `values*.yaml` + a grep of templates | **Do not render in v1.** The Helm SDK is heavy, and rendering without real values takes wrong branches. `Chart.yaml` dependencies, `image.repository`/`tag` in values, and per-environment values files (the client pattern) cover the join keys. |
| 1 | Terraform / OpenTofu | `hashicorp/hcl/v2` + `hclsyntax` (MPL-2.0) | Walk blocks and expression traversals without evaluating. That gives resources, data sources, module calls and their `source`, providers with `required_providers` versions, variables and outputs, and resource→resource references. `terraform-config-inspect` is simpler but drops the references. A root module is a directory with a `backend` or `provider` block. |
| 1 | Maven, Gradle, npm, .csproj, composer, go.mod | existing `core/module` readers | Extend them, don't replace them: packaging, `jib`/`spring-boot` plugin image names, `settings.gradle` includes, `libs.versions.toml` (TOML, needs `pelletier/go-toml/v2`). |
| 1 | Spring / app config | `.properties` line reader + yaml.v3 | `application*.{properties,yml}`, `bootstrap.*`, `.env.example`. Extract URL hosts, Kafka/AMQP topic and queue names, and datasource hosts, and link them to workspace services by name. This is the cross-repo edge (§2). |
| 2 | GitLab CI, CircleCI, Travis, Azure Pipelines, Bitbucket | yaml.v3 + hand-written structs | There is no maintained Go parser for any of them. `include:`/`extends:`/orbs are external and stay unresolved. |
| 2 | Jenkinsfile | regex over the declarative subset first | Groovy grammars for go-tree-sitter exist only as unofficial forks. Stage names, `@Library`, `sh` lines, `docker.build`/`helm`/`kubectl` calls. Scripted pipelines are recorded as `pipeline` with `attrs.parsed = partial`. |
| 2 | Kustomize | yaml.v3 | `resources`, `bases`, `patches`, `images`, `namePrefix`. Only overlay→base edges and image overrides. Do not import the kustomize API. |
| 2 | CloudFormation / SAM / Serverless | yaml.v3 (short-form tags kept in `Node.Tag`) | `goformation` is typed but very large. SAM `CodeUri`/`Handler` and serverless `handler:` point straight into the source tree, and are the best `handler` edges there are. |
| 2 | protobuf / OpenAPI / AsyncAPI / GraphQL | `emicklei/proto` (MIT), yaml.v3 for OpenAPI/AsyncAPI, `vektah/gqlparser/v2` (MIT) | `interface` nodes and `import`/`$ref` edges. The client data pipeline has 67 .proto files. |
| 3 | Bazel, Nx, Turborepo, Skaffold, Terragrunt, Makefile, Procfile, fly.toml, vercel.json | `bazelbuild/buildtools/build` (Apache-2.0); stdlib JSON/TOML; hcl/v2 for Terragrunt; rule headers only for Make | Build when a real codebase needs it. |
| — | AWS CDK, Pulumi, Tiltfile | not parseable statically | They are programs. Read committed `cdk.out/*.template.json` as CFN if it is there; otherwise record the project file as a node and say so. |

Verify licence and maintenance again when a library is actually adopted. The survey was a single pass.

### 4.3 Ordering against the existing roadmap

- **E0, independent:** lift the `FileToComponent` gate in file co-change for files with a `system_kind`, and add `files.system_kind`. This is small, gives value on its own, and bumps the revision.
- **E1:** framework (classify, reader registry, linker, the four tables) plus Dockerfile, compose, GitHub Actions and k8s/Helm values. That set covers all three chains in §2 except the Terraform end.
- **E2:** Terraform, app config (`talks_to`) and `system_versions` for actions, images, charts and providers.
- **E3:** GitLab/Jenkins/CircleCI/Travis, Kustomize, SAM/serverless, proto/OpenAPI.

Each step bumps `core.AnalysisRevision`. The UI reads the new tables defensively (`hasView`), and older snapshots make no system claims.

---

## 5. UI: where it lands

The constraints come from what has already been decided: groups are the way to slice; a click selects and never navigates; no composite scores and no "risk" words; every number is captioned; hairballs are refused. The survey says the same from outside. Layered views with progressive collapse (C4 deployment views, Nx's composite graph) and matrices (Lattix) work. The raw `terraform graph` and cloud-console diagrams fail as soon as there are more than ~30 nodes.

### 5.1 A new top-level view: *System*

One rail item, four tabs. Each tab is named for its question.

**Flow: "Where does this code end up?"**
- A left-to-right layered flow, in the same family as `CouplingFlow.vue`. The columns are **Code** (components rolled up by depth, or by lens groups) → **Built as** (modules and artifacts) → **Packaged as** (images and charts) → **Runs as** (workloads) → **On** (resources and externals).
- Only columns that have data are drawn. A library repository shows two columns; that is fine and honest.
- An environment switch across the top (`dev · test · staging · prod`, from values files, overlays, tfvars and workflow `environment:`) re-weights the right-hand columns.
- A click selects and the inspector rail shows the chain with file:line for every hop, plus each edge's `resolution`. Name joins are drawn dashed and labelled "joined by name: `librechat-api`". Leaving is the same two labelled buttons as Connections (Open / Walk here).
- Unresolved references sit in a muted "Outside this workspace" band on the right (mongo, meilisearch, the central workflow repository, the external chart). Here that is what the system depends on, not noise.

**Pipelines: "What runs when this changes?"**
- A list of pipelines with trigger, scope, what they build and what they deploy.
- A **component × pipeline matrix** built from `system_scope`, the Lattix pattern. It answers "which components have no pipeline scoped to them" and "which directory triggers the most pipelines" without drawing a graph.
- A pipeline's detail shows the job DAG (`needs:`), which is small enough to draw.
- For multi-repo workspaces: the shared reusable workflows, and how many repositories call each one at which ref (the client workspace: one repository, ~70 calls, all at `@main`).

**Infrastructure: "What is provisioned, and what is shared?"**
- A Terraform module graph at the module grain, never the resource grain, with resource counts as bars. Cloud-foundation-fabric has 807 module calls and 919 resources, and would be a hairball any other way.
- Blast radius of a shared module, reusing the component blast-radius vocabulary: `modules/iam-service-account` is called 121 times and `modules/project` 104 times.
- An inventory of resource types by provider, and which workloads reference them.

**Versions: "What do we pin, and does it drift?"**
- This extends today's Libraries view to actions, base images, charts, Terraform providers and modules, orbs and Jenkins libraries.
- Columns: name, versions in use, how each is pinned (in words: "a commit SHA", "a tag", "a branch", "no version"), where, and last changed.
- Drift reads as a fact: "`docker/login-action` at `v2` in 4 places and `v3` in 4 places" (LibreChat); "`actions/checkout` at `v3`, `v4` and `main`". No red, per the neutral-ink rule.

### 5.2 Into existing surfaces

- **Component detail → Reading:** a new band, **Ships in**. It lists the images, workloads and environments this component ends up in, the pipelines scoped to it, and how often its commits also touch a system file. One line when there is nothing: "No build, deploy or pipeline file refers to this component."
- **Lens builder:** a tenth reading, **From the deployment**, which groups components by the image or workload they ship in. It goes under a new evidence heading, "From how it ships". This is the reading that finds the real service boundaries in a monorepo like LibreChat, where name and reference readings cannot. It is measured before it is taken, like the other nine.
- **Connections:** runtime edges (`talks_to` from config and compose `depends_on`) as a separate edge kind, off by default, with their own legend entry. In the 26-repo workspace this is the first view where the repositories connect at all.
- **Files and the directory tree:** a `system_kind` chip and filter. The production/test control gains "system files".
- **Changes / Compare:** system-graph deltas between two snapshots (image added, pipeline removed, action re-pinned, workload moved environment), written in the neutral `12 → 9` form.
- **Search / ⌘P, evidence board, Markdown report:** system nodes are searchable and pinnable. The report gets a "How it ships" section, following the report-voice rules.
- **Groups:** selection works in the Flow and in the matrix like everywhere else. Selecting the components that feed one image and pressing ⌘G is the quickest way to make a service group.

### 5.3 What not to build

- No cloud-console-style resource diagram at the resource grain.
- No live API, cluster or cloud account integration. It would break local-first, and the files already hold the design intent. The drift between declared and live (driftctl's missing/unmanaged/modified) is a different product.
- No security scanner. zizmor, Checkov and Trivy already do that well. We show pinning and permissions as facts, with the evidence line, and leave the verdict to the architect's own `assert` rules.
- No DORA dashboard from git alone (§3.6).

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| False name joins (the testify/`assert` failure again) | `resolution` on every edge, ambiguous matches refused, dashed and labelled in the UI, `system_unresolved` shown and not hidden |
| Templated values (`${{ }}`, `${var}`, Helm `{{ }}`) hide the join key | Drop the interpolated segments and join on what is left. Matrix expansion for Actions. Record `interpolated` in `system_unresolved` when nothing is left |
| Binary and dependency growth | yaml.v3 by default. Libraries only for Dockerfile and HCL in E1–E2. Measure binary size before and after each tier |
| Secrets in config files | Values are never stored for secret-like keys. URLs are reduced to their host |
| Scan time | Small. These files are few and already in memory. The only non-trivial cost is glob matching for `system_scope`, bounded by pipelines × files |
| Multi-repo identity (same image name in two repositories) | `repository` on every node. Joins prefer the same repository, and cross-repository joins are labelled |

---

## 7. Decisions for Ryan

1. **Scope of E1:** the four formats above (Dockerfile, compose, GitHub Actions, k8s/Helm values), or start with E0 alone (the co-change fix plus `system_kind`) to get something shipped this week?
2. **App config as a source of edges** (`talks_to` from Spring properties and env files). It is the highest-value edge for multi-repo workspaces and the easiest to get wrong. Build it in E2, or put it behind a switch?
3. **actionlint vs plain yaml.v3** for GitHub Actions: typed expressions against one more dependency.
4. **Where the System view sits in the rail**, and whether Versions replaces the Libraries view or sits next to it.
5. **Name of the lens reading:** "From the deployment", or "What it ships in", in line with the other readings' evidence-first names.

---

## 8. Is it worth it? Eleven public reference systems, measured

*Added 2026-09-27. Shallow clones of eleven public repositories chosen to look like enterprise setups. A throwaway Python prototype of the linker (`chain.py` in the session scratchpad) measured three things in each. (1) Of the images that deploy files reference, how many join to a build in the same repository? (2) What share of production code files end up inside some image or function? (3) How many service→service edges can be read from config? The prototype is rough. Where its first result was low, the cause was checked by hand, and the table says which misses were the prototype's and which are real limits.*

| Repository | Shape | Image refs joined to an in-repo build | Code that ships | Service→service edges | What decided it |
|---|---|---|---|---|---|
| GoogleCloudPlatform/microservices-demo | 11 services; k8s, kustomize, Helm, Skaffold, Terraform | **67 of 77** (the rest: redis, busybox) | 98% | **17**, the real call graph (checkout → cart, currency, email, payment, catalog…) | Skaffold names every image and its context |
| GoogleCloudPlatform/bank-of-anthos | Java + Python; Skaffold + Jib, kustomize, Terraform | 34 of 51 (the rest: gce-proxy, postgres) | all services, once Jib's `project:` names the Maven module | addresses (`ledgerwriter:8080`…) in a shared ConfigMap pulled in with `envFrom`; the prototype did not follow it | Jib builds with no Dockerfile |
| open-telemetry/opentelemetry-demo | 20+ services in many languages; compose | **0 of 34 before `.env` interpolation, 25 of 34 after** | 97% | 15 | Image names live in `.env`, and in the *tag*, not the repository name |
| spring-petclinic/spring-petclinic-microservices | Maven + compose + Spring Cloud | **0 of 9 before Maven property and parent inheritance, 8 of 9 after** | 100% | **11** from Spring config (`lb://customers-service`, config-server) | Image built by a plugin in the parent pom |
| dotnet/eShop | .NET Aspire | no manifests at all | — | **14** between 20 resources, read from C# in the AppHost | The topology is code (`AddProject`, `WithReference`) |
| aws-samples/aws-serverless-shopping-cart | SAM | 10 functions → `CodeUri` directories | 50% (the frontend deploys through Amplify, undeclared) | — | `CodeUri` points straight into the tree |
| argoproj/argocd-example-apps | GitOps deploy repo | 0 of 31, by design | — | 1 | Code lives in other repositories; joins only in a workspace holding both |
| mattermost/mattermost | product monorepo, 4.7k code files, 53 workflows | 0 | 0% | 0 | The Dockerfile downloads a released tarball; deployment is elsewhere |
| PostHog/posthog | 33k code files, 139 workflows, 90 compose services | 19 of 109 | 97% (dev stack) | 98, mostly the local dev stack | Production charts live in another repository |
| apache/kafka | library / product | 0 of 40 (all interpolated test harness images) | — | 0 | Nothing deploys from here |
| gitlab-org/cli | CLI; GitLab CI, goreleaser | — | — | — | Released as a binary; CI pulls in remote templates |

### What the measurements say

1. **The repositories split into two kinds.** A *system* repository or workspace describes the thing that runs (microservice apps, service platforms, the client's 26 services, the GCP integration repo). Its chains join at 85–99%, and the result is something the import graph cannot show at all: which code runs where, and which service calls which. A *product* repository (Mattermost, Kafka, glab, PostHog's main repo) only builds something that is deployed elsewhere. There, the system graph shrinks to CI scope, action pinning and a local dev stack. That is what Renovate and zizmor already cover, so it sets Archstats apart from nothing.
2. **The service→service edge is the prize.** In four of the five system repositories, config yields the actual runtime call graph (microservices-demo 17, petclinic 11, eShop 14, OTel 15). For a multi-repo workspace, it is the only thing that connects the repositories.
3. **Each join needed one small, format-specific step, and without it the join fails outright rather than partly.** Examples: `.env` interpolation for compose, property resolution and parent inheritance for Maven, Jib's module for Skaffold, `envFrom` for ConfigMaps, the matrix for Actions. None is hard. But this is a long tail, and every format read shallowly is worth close to nothing. **Few formats done properly beat many done shallowly.**
4. **Some things files cannot tell us.** What version is live. Anything held in a platform repository outside the workspace: the client's central chart and reusable workflows, PostHog's charts, a GitOps repository. Topology written as code in CDK or Pulumi (Aspire is the exception, since we already parse C#). Routing added by a mesh or DNS. Traffic. The model has to show these as "outside this workspace", not as absent.

### Verdict

Worth it, **but not as "support every build and deploy format"**. Worth it as **one question answered properly: what runs, what code is in it, and what does it talk to.** That is the service map. It is the part no offline tool gives, it is exactly the enterprise case, and it is the part the measurements show can be recovered.

So, in order:
- **E0 regardless:** file co-change for system files, and `files.system_kind`. It is cheap and useful even for product repositories.
- **E1, narrowed:**
  - workloads and images from compose (with `.env`), k8s/kustomize, Helm values and Skaffold;
  - builds from Dockerfiles (stage closure), Maven/Jib/Spring Boot plugins and GitHub Actions docker steps (with the matrix);
  - service→service edges from compose, k8s env and ConfigMaps, and Spring config.
- **Then stop and test it.** Run it on the client workspace, microservices-demo and LibreChat. If the resulting service map is not something worth putting in a client report, stop there.
- **Leave out until a real codebase asks for it:** Terraform beyond image and handler joins, CI security findings, EOL runtimes, DORA-style numbers, and the long tail of CI systems.
- **When the workspace has no deployable (the product case), the UI says so in one line** and shows the CI and version facts. It does not show an empty flow.

---

## Appendix: sources

- Local census script: `census.sh` in the session scratchpad (counts by filename; the k8s count sniffs `kind:`).
- Prior art surveyed: Backstage descriptor format and relations; Port, Cortex, OpsLevel; inframap, Rover, Pluralith, KubeView, kube-lineage; Checkov graph policies, KICS, Trivy, zizmor, poutine, actionlint, OpenSSF Scorecard; Syft catalogers, Renovate managers (docs.renovatebot.com/modules/manager), OSV-Scanner, endoflife.date; Nx project graph and affected, Turborepo, Bazel query, Develocity; CodeScene architectural analyses, Lattix DSM, jQAssistant, Structurizr deployment views, Cartography, Steampipe, driftctl.
- Parsers: yaml.v3; hashicorp/hcl/v2; moby/buildkit dockerfile parser; rhysd/actionlint; compose-spec/compose-go; awslabs/goformation; bazelbuild/buildtools; emicklei/proto; bufbuild/protocompile; vektah/gqlparser; pb33f/libopenapi; pelletier/go-toml/v2; tree-sitter-grammars (hcl, yaml; Groovy only as unofficial forks).
