# Plan: HTTP and outbound connections

Spec: `specs/http.md`. Branches: `feature/http` in archstats (`../archstats-http`, from main d8ef710) and archstats-ui (`../archstats-ui-http`, from main 2f90592, go.work → `../archstats-http`).

Revision note: CI/CD (`feature/cicd`) claims revision 16. This branch takes 17 so both can land in either order.

## Engine (`extensions/navigation`)

1. `templates.go`: path templates (`{id}`, `:id`, `<int:id>`, `{id:int}`, `[id]`, `[...slug]`, `(?P<id>…)`) → `/orders/{}`; matching with base paths.
2. `config.go`: URL- and host-shaped configuration from `application*.yml|properties`, `bootstrap*.yml`, `appsettings*.json`, `.env*`, Laravel `config/*.php`, Django `settings*.py`, Helm values, compose `environment`, k8s ConfigMaps; environment from the name; values sanitised.
3. `openapi.go`: OpenAPI 3 / Swagger 2 operations; generator configs (openapi-generator Maven/Gradle/`openapitools.json`, NSwag, `OpenApiReference`, cxf/jaxws WSDL).
4. `apirules.go`: the NLGov ADR subset on specs and routes.
5. `symbols.go`: per file, per type: field, property and constructor-parameter types; imports and their aliases; call sites (receiver, member, line); route auth marks.
6. `outbound.go`: declarative clients, imperative HTTP, messaging, datastores, mail, LDAP, storage, file transfer, gRPC stubs; URL argument resolution (literal, constant, `@Value`, `@ConfigurationProperties`, `IConfiguration`, env, Laravel `config()`/`env()`, Django `settings.X`); resilience marks.
7. `trace.go`: member-level BFS from each HTTP route; implementations through bindings and supertypes; reach counts; outbound, systems and self-call linking.
8. Views, revision 17, ADR 0023, `DESCRIPTION.md`.

## UI

9. `features/http`: queries, tree, lanes, contract and outbound models with tests.
10. `pages/views/http.vue`: Routes, Flow, Contract, Outbound; nav entry; Go-to-anything route; en + nl.
11. Browser harness on a real snapshot.

## Status (2026-10-29)

Built, uncommitted, on `feature/http` in both worktrees. Engine `go test ./...` and UI `vitest` (1,265 tests) and `npm run i18n:check` pass.

Engine fixtures (`extensions/navigation/http_test.go`): Spring (Feign, RestTemplate + `@Value`, Spring Security chains, OpenAPI, prod config), ASP.NET (typed HttpClient + Polly, Refit, minimal API `RequireAuthorization`), Express + NestJS + frontend `fetch` self-call, FastAPI + Django REST + Celery, Go `net/http` with Helm env, Laravel middleware group + `Http::baseUrl`.

Corpora (HTTP routes; share of call sites the trace resolved; routes reaching a table):

| Corpus | Routes | Auth read | Resolved | Routes → table | Outbound calls |
|---|---|---|---|---|---|
| spring-petclinic | 17 | 0 (no security) | 100% | 9 | 0 (datasource system from config) |
| fineract | 817 | 817 (Spring Security chains) | 97% | 722 | 33 |
| nopCommerce | 1,231 | 1,207 | 86% | 1,098 | 36 |
| BroadleafCommerce | 95 | 0 (XML security, not read) | 91% | 6 | 4 |
| LibreChat | 200 | 73 | 48% | 59 | 74 |
| Sylius | 124 | 0 | 80% of 16 traced | 0 | 44 |
| django-oscar | 19 | 0 | 50% of 9 traced | 2 | 2 |

Shortfalls, named:
- Dynamic Python and PHP frameworks trace thinly: oscar loads views with `get_class`, Sylius routes are YAML with `%parameters%` and resource controllers. Spec target ("half of call sites for typed languages") is met for Java and C#; JS is 48%.
- Symfony `access_control` and Spring Security XML are not read, so Sylius and Broadleaf show no access rules.
- Scan cost: fineract 26.3s against 23.4s on main (+12% wall, same memory); most of it is reading call sites and declared types.

Open: commit on Ryan's yes; engine tag and `go.mod` bump; revision 17 assumes CI/CD lands as 16.
