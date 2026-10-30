# Spec: HTTP and outbound connections

*Written 2026-10-29 on Ryan's request ("write spec and implement … for all the major supported frameworks"). Plan: `tasks/http-plan.md`. Engine ADR: `docs/adr/0023-http-and-outbound.md` in archstats.*

## Why

Most codebases Archstats reads are HTTP APIs, and the questions asked of them are HTTP questions:

- Which routes does this system offer, and which part of the code answers each one?
- What does a route reach: which services, which tables, which other systems?
- Does the code match the API contract (OpenAPI) the team publishes? Does it follow the NLGov REST API Design Rules?
- What does this system call, and where is that configured, per environment?

The Nulmeting checklist (RVO/DICTU, v0.4) asks the same things as evidence: 2.02 data flows, 2.03 contracts, 2.08 failure handling, 3.04 access, 4.04 API design rules, 4.05 GDI links, 5.09 chain dependencies. Today Archstats finds routes (engine revision 13, `entry_points`) but shows them nowhere, stops at the handler, ignores contracts, and drops declarative clients on the floor (`Client: true` → `return nil`).

The CI/CD spec (2026-10-29) moved "the service-to-service map (calls, messages, shared datastores), environments, config values" out of CI/CD. This is where it lands, read from the code and its configuration instead of from deploy files.

## Decisions

| Question | Answer |
|---|---|
| Where does the engine work live? | In `extensions/navigation`. It already has the lexer, the marks reader, the route readers and the unit linker. Outbound is "where the code goes out", the mirror of entry points. |
| How deep is the trace? | **Member level, in every language with a route reader**: Java, Kotlin, Scala, C#, TypeScript/JavaScript, Python, PHP, Go. Call sites in a handler's body are resolved through the receiver's declared type (field, constructor parameter, property, typed parameter), an import, a static type name, or a bare function name. Interfaces follow `bindings` and `unit_supertypes` to their implementations. |
| What does a trace not do? | It is lexical. Local variables without a declared type, dynamic dispatch through maps, reflection and callbacks are not followed. Every route says how many of its call sites were resolved, so a thin trace is visible as thin. |
| What is a contract? | An OpenAPI 3.x or Swagger 2 document in the workspace (YAML or JSON), plus the spec a code generator is pointed at (openapi-generator, NSwag, `OpenApiReference`). Contracts at runtime only (springdoc without a file) are not read; a route is then marked "documented by annotations" when it carries `@Operation`, `@ApiOperation`, `[SwaggerOperation]`, `[ProducesResponseType]` or NestJS `@ApiOperation`, and "documented by the framework" for FastAPI. |
| Which design rules? | A static subset of the NLGov REST API Design Rules (ADR) that can be checked from a spec or a route without running the API: no trailing slash, major version in the URI, kebab-case path segments, standard methods only, an OpenAPI 3 document, semantic `info.version`, `API-Version` response header, `servers` over https, problem+json error responses. They are findings with file:line, never a conformance verdict. |
| How is an outbound target named? | The best evidence wins: a resolved host (from a literal, a constant or the configuration), a service name (compose/k8s DNS), a declared client name (Feign `name`, `configKey`), the configuration key, else "unresolved" with the call site. Each row carries its confidence: `declared`, `resolved`, `partial`, `unresolved`. |
| Environments? | Read from configuration file names and folders (`application-prod.yml`, `appsettings.Production.json`, `.env.acc`, `values-prod.yaml`, `overlays/prod/`). A target shows one host per environment where the files say. |
| Self calls | An outbound HTTP call whose path matches a route in the same snapshot (a frontend's `fetch('/api/orders')`, or two scanned services) links to that route. A message sent to a topic a scanned consumer listens on links to that consumer. |
| Is anything secret kept? | No. Configuration values are kept only when they are URLs, hosts or connection strings, with any userinfo (`user:password@`) and any `password=`/`pwd=` part removed. Other values are never written. |

## What the engine writes (revision 17)

New and changed tables. Every row carries `file` and `line`.

- `entry_points` gains `id` (stable within a snapshot), `template` (the path with every parameter written `{}`: `/orders/{}`), `auth` (what the handler and its class say about access: `@PreAuthorize(...)`, `[Authorize(Roles=...)]`, `[AllowAnonymous]`, `@login_required`, `permission_classes`, `->middleware('auth')`, `@UseGuards(...)`, `@RolesAllowed`, `@Secured`, `@PermitAll`) and `documented` (`spec`, `annotations`, `framework` or empty).
- `api_operations`: one row per operation in a contract: `spec` (file), `title`, `version`, `method`, `path`, `template`, `operation_id`, `tag`, `summary`, `deprecated`, `security`, `entry` (the matched `entry_points.id`, 0 when none), `side` (`provided` for a spec the code serves, `consumed` for a spec a generator builds a client from).
- `api_findings`: `rule`, `severity` (`must`/`should`), `subject` (`route`/`operation`/`spec`), `entry`, `spec`, `method`, `path`, `detail`, `file`, `line`.
- `calls`: the member-level trace, one row per call edge reached from any entry point: `from_unit`, `from_function`, `to_unit`, `to_function`, `via` (`field`, `static`, `self`, `import`, `function`, `implementation`), `file`, `line` (the call site). Per route, `route_reach` counts what the trace reached (`call_sites`, `resolved`, `unknown`, `units`, `functions`, `tables`, `outbound`, `depth`) and `route_targets` lists the tables and outbound calls it reached. The UI walks `calls` from a route's handler for the Flow picture. (Changed during build from a per-route edge table: one edge set is smaller and a recursive walk is cheap.)
- `outbound_calls`: `id`, `kind` (`http`, `soap`, `grpc`, `graphql`, `message`, `sql`, `nosql`, `cache`, `search`, `mail`, `ldap`, `storage`, `file_transfer`), `client` (`feign`, `resttemplate`, `webclient`, `httpclient`, `refit`, `axios`, `fetch`, `requests`, `httpx`, `net/http`, `guzzle`, `laravel-http`, `kafka`, …), `method`, `path` (or topic, queue, bucket), `template`, `target` (as written), `system`, `host`, `confidence`, `resolved_via` (`literal`, `constant`, `config`, `env`, `declared`, `generated`), `config_key`, `entry` (matched route, 0 when none), `consumer` (matched message consumer `entry_points.id`), `resilience` (`timeout`, `retry`, `circuit_breaker`, comma joined), `unit`, `function`, `component`, `file`, `line`.
- `outbound_systems`: `system`, `kind`, `environment` (empty = every environment), `host`, `source` (`config`, `call`, `generator`, `compose`), `config_key`, `file`, `line`.
- `config_entries`: only URL- and host-shaped values: `key`, `value` (sanitised), `environment`, `format`, `file`, `line`.

## What the UI shows: `/views/http`

One screen, the **API stack** (rebuilt 2026-10-30; it replaced a Routes table, a Flow tab, a Contract tab and an Outbound tab). It answers how the routes flow into the code, as floors read top to bottom:

1. **API**: the components that answer the routes (`Web.Areas.Admin`, a plugin), sized by routes. Zoomed in to one, its resources.
2. **Called first, Two calls in, Deeper**: the code components the routes reach, each on the floor of how many calls from the handler it is most often reached (`features/http/stack.ts`, a walk of `calls` per route).
3. **Data**: the tables touched, by data domain (entity namespace).
4. **Outside**: the systems called; an address the engine could not follow is "HTTP, address not followed".

A band is the routes passing from one box to the next. At rest bands are a faint texture; hovering a box lights its routes' own share of every band, a pick keeps it lit. Code most routes reach (a base controller, a work context, caching: more than half of the routes) is plumbing: named in a margin, walked into but not through, so a route reaches what its own code reaches. Floors keep what fits and fold the rest into "+N more".

The inspector answers every pick: a box (where its routes come from and go to, its classes or tables, its routes), a band, a route (handler, access, contract, its path through the code class by class, reach), a system (hosts per environment, call sites). The toolbar's Contracts and Systems open the contracts with the design rule findings, and every system including configured ones. "Select its components" hands the code a pick passes to the group tray. The route table stays in the toolbar's Export.

Older snapshots (revision < 17) show the API floor only, with "Scan again to read contracts, traces and outbound calls".

## Not in scope

- Running anything: no live OpenAPI endpoint, no HTTP probes, no Spectral binary.
- WSDL operation parsing (a SOAP client is recorded with its WSDL file, not its operations).
- Inbound gRPC services and GraphQL schemas as routes.
- Gateways rewriting paths (Kong, APIM, ingress rewrites) beyond an ingress `path` prefix.
- AsyncAPI.

## Acceptance

- Every reader has a positive and a negative fixture in `navigation_test.go`.
- On local corpora (spring-petclinic, fineract, BroadleafCommerce, nopCommerce, django-oscar, Sylius, LibreChat) the trace resolves at least half of each route's call sites on average for the typed languages, and the numbers are written in `tasks/http-plan.md` with any shortfall named.
- The view renders on a real snapshot in the browser harness, in English and Dutch, with no console errors.
