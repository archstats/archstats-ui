// Templates for one framework or build tool. The general templates describe
// any codebase; these describe what that framework makes of it: a Spring
// application's controllers, services, repositories and entities, a Django
// project's apps, a Go module's packages and their public API. The roles come
// from the Classes view's framework profiles (anatomy.ts), the details from
// the markers the scan put on each class and function: annotations, base
// types, file names, struct tags and directives.

import { prodFile, reactComponent, type EcosystemId, type SnapshotFacts } from "./readings"
import {
    ABOUT, coupling, glance, health, hotspots, lanes, layers, libraries, lit, modules, needs, rules, SHOWS, slotOf, SQL, structure, tests, VIEWS,
    type ReportTemplate, type Writer,
} from "./templateKit"

// ── What the framework sections need ──────────────────────────────────────

const has = {
    units: (f: SnapshotFacts): true | string => (f.tables.has("units") ? true : "the snapshot predates classes and functions (rescan to add them)"),
    /** Units and the markers on them: annotations, base types, file names, tags. */
    markers: (f: SnapshotFacts): true | string => (f.tables.has("units") && f.tables.has("unit_markers") ? true : "the snapshot does not record annotations and base types (rescan to add them)"),
    links: (f: SnapshotFacts): true | string => (f.tables.has("units") && f.tables.has("unit_connections") && f.tables.has("unit_markers") ? true : "the snapshot does not record which classes use which (rescan to add it)"),
    /** Any of these markers, as "source:key". */
    marker: (f: SnapshotFacts, why: string, ...keys: string[]): true | string => (keys.some(k => f.markers.has(k)) ? true : why),
    moduleKind: (f: SnapshotFacts, kind: string, why: string): true | string => ((f.moduleKinds[kind] ?? 0) > 0 ? true : why),
}

// ── SQL over classes and their markers ────────────────────────────────────

const list = (xs: string[]) => xs.map(lit).join(", ")
/** Production files, or every file when files have no roles. */
const PROD = (f: SnapshotFacts) => `(SELECT name FROM files WHERE ${prodFile(f)})`
/** Units carrying any of these markers. */
const marked = (source: string, keys: string[]) => `(SELECT unit FROM unit_markers WHERE source = ${lit(source)} AND key IN (${list(keys)}))`
/** Distinct units another unit uses. */
const usesCount = (id: string) => `(SELECT count(DISTINCT uc."to") FROM unit_connections uc WHERE uc."from" = ${id} AND uc."to" <> ${id})`
const usedByCount = (id: string) => `(SELECT count(DISTINCT uc."from") FROM unit_connections uc WHERE uc."to" = ${id} AND uc."from" <> ${id})`
/** Module-to-module use: references from one module's production files into another module's files. */
const moduleUse = (f: SnapshotFacts) => `SELECT fa.module AS a, fb.module AS b, count(*) AS refs, count(DISTINCT uc.from_file) AS files FROM unit_connections uc JOIN files fa ON fa.name = uc.from_file JOIN files fb ON fb.name = uc.to_file WHERE ${prodFile(f, "fa")} AND coalesce(fa.module, '') <> '' AND coalesce(fb.module, '') <> '' AND fa.module <> fb.module GROUP BY 1, 2`
/** Whether `dep` is in a module's comma-separated depends_on. */
const declares = (dependsOn: string, dep: string) => `(',' || replace(coalesce(${dependsOn}, ''), ', ', ',') || ',') LIKE ('%,' || ${dep} || ',%')`

// Spring and JPA.
const WEB = marked("annotation", ["Controller", "RestController", "Path"])
const PATH = marked("annotation", ["Path"])
const REPO = `(SELECT unit FROM unit_markers WHERE (source = 'annotation' AND key = 'Repository') OR (source = 'supertype' AND key IN ('JpaRepository', 'CrudRepository', 'PagingAndSortingRepository', 'MongoRepository', 'ReactiveCrudRepository', 'JpaSpecificationExecutor', 'ListCrudRepository')))`
const ENTITY = marked("annotation", ["Entity", "Embeddable", "MappedSuperclass"])
const SERVICE = marked("annotation", ["Service", "Component"])
/** Request mappings per HTTP verb, for the verbs the snapshot counts. */
const verbs = (f: SnapshotFacts) => {
    const col = (v: string) => (f.fileColumns.has(`java__spring__request_mappings__${v}`) ? `coalesce(fi.java__spring__request_mappings__${v}, 0)` : "")
    // JAX-RS methods are not counted per verb: blank, not zero.
    const out = ([["GET", ["get"]], ["POST", ["post"]], ["PUT/PATCH", ["put", "patch"]], ["DELETE", ["delete"]]] as const)
        .map(([label, vs]) => [label, vs.map(col).filter(Boolean)] as const)
        .filter(([, cols]) => cols.length)
        .map(([label, cols]) => `CASE WHEN u.id IN ${PATH} THEN NULL ELSE ${cols.join(" + ")} END AS "${label}"`)
    return out.length ? `, ${out.join(", ")}` : ""
}
const webKind = (id: string) => `CASE WHEN ${id} IN ${marked("annotation", ["Path"])} THEN 'JAX-RS resource' WHEN ${id} IN ${marked("annotation", ["RestController"])} THEN 'REST controller' ELSE 'MVC controller' END`

const SPRING_SQL = {
    webByPackage: (f: SnapshotFacts) => `SELECT u.component AS package, count(*) AS "entry points"${f.fileColumns.has("java__spring__request_mappings__total") ? `, sum(CASE WHEN u.id IN ${PATH} THEN NULL ELSE coalesce(fi.java__spring__request_mappings__total, 0) END) AS "Spring request mappings"` : ""}, sum(coalesce(fi.complexity__lines, 0)) AS lines FROM units u JOIN files fi ON fi.name = u.file WHERE u.id IN ${WEB} AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
    web: (f: SnapshotFacts) => `SELECT u.name AS "entry point", u.component AS package, ${webKind("u.id")} AS kind${verbs(f)}, ${usesCount("u.id")} AS "classes it uses", fi.complexity__lines AS lines FROM units u JOIN files fi ON fi.name = u.file WHERE u.id IN ${WEB} AND u.file IN ${PROD(f)} ORDER BY "classes it uses" DESC, u.name`,
    shortcuts: `SELECT w.name AS "entry point", w.component AS package, group_concat(DISTINCT CASE WHEN t.id IN ${REPO} THEN t.name END) AS "repositories it uses directly", group_concat(DISTINCT CASE WHEN t.id IN ${ENTITY} THEN t.name END) AS "entities it uses directly" FROM units w JOIN unit_connections uc ON uc."from" = w.id JOIN units t ON t.id = uc."to" WHERE w.id IN ${WEB} AND (t.id IN ${REPO} OR t.id IN ${ENTITY}) GROUP BY w.id ORDER BY count(DISTINCT t.id) DESC, w.name`,
    backwards: `SELECT a.name AS "class", CASE WHEN a.id IN ${ENTITY} THEN 'Entity' ELSE 'Repository' END AS "its role", b.name AS "reaches up into", CASE WHEN b.id IN ${WEB} THEN 'a controller' ELSE 'a service or component' END AS "whose role is" FROM unit_connections uc JOIN units a ON a.id = uc."from" JOIN units b ON b.id = uc."to" WHERE (a.id IN ${ENTITY} OR a.id IN ${REPO}) AND (b.id IN ${SERVICE} OR b.id IN ${WEB}) AND a.id <> b.id GROUP BY a.id, b.id ORDER BY 2, 1, 3`,
    transactional: (f: SnapshotFacts) => `SELECT CASE WHEN id IN ${WEB} THEN 'Controllers' WHEN id IN ${REPO} THEN 'Repositories' WHEN id IN ${marked("annotation", ["Service"])} THEN 'Services' ELSE 'Other classes' END AS role, count(*) AS "classes marked @Transactional" FROM units WHERE id IN ${marked("annotation", ["Transactional"])} AND file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC`,
    switches: (f: SnapshotFacts) => `SELECT u.name AS bean, u.component AS package, group_concat(DISTINCT m.key) AS "switched on by" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE m.source = 'annotation' AND (m.key LIKE 'Conditional%' OR m.key = 'Profile') AND u.file IN ${PROD(f)} GROUP BY u.id ORDER BY 3, 2, 1`,
    // unit_connections carries both ends' components, so no join on units (which has no index) is needed.
    // One pass over unit_connections each: per-row subqueries timed out on large codebases (fineract).
    entitiesByPackage: (f: SnapshotFacts) => `WITH ent AS (SELECT id, component FROM units WHERE id IN ${ENTITY} AND file IN ${PROD(f)}), used AS (SELECT to_component AS c, count(DISTINCT "from") AS n FROM unit_connections WHERE "to" IN (SELECT id FROM ent) AND from_component <> to_component GROUP BY 1) SELECT e.component AS package, count(*) AS entities, coalesce(max(used.n), 0) AS "classes elsewhere that use them" FROM ent e LEFT JOIN used ON used.c = e.component GROUP BY 1 ORDER BY 2 DESC, 1`,
    entities: (f: SnapshotFacts) => `WITH ent AS (SELECT id, name, component FROM units WHERE id IN ${ENTITY} AND file IN ${PROD(f)}), edges AS (SELECT DISTINCT "from", "to" FROM unit_connections WHERE "from" <> "to" AND ("to" IN (SELECT id FROM ent) OR "from" IN (SELECT id FROM ent))), used AS (SELECT "to" AS id, count(*) AS n FROM edges GROUP BY 1), links AS (SELECT "from" AS id, count(*) AS n FROM edges WHERE "to" IN ${ENTITY} GROUP BY 1), repos AS (SELECT e."to" AS id, group_concat(DISTINCT r.name) AS names FROM edges e JOIN units r ON r.id = e."from" WHERE r.id IN ${REPO} GROUP BY 1) SELECT ent.name AS entity, ent.component AS package, coalesce(used.n, 0) AS "used by classes", coalesce(links.n, 0) AS "links to entities", repos.names AS repositories, CASE WHEN ent.id IN ${marked("annotation", ["MappedSuperclass", "Inheritance"])} THEN 'yes' ELSE '' END AS "base of a hierarchy" FROM ent LEFT JOIN used ON used.id = ent.id LEFT JOIN links ON links.id = ent.id LEFT JOIN repos ON repos.id = ent.id ORDER BY 3 DESC, 1`,
    entityLinks: `SELECT a.name AS entity, a.component AS package, count(DISTINCT b.id) AS links, group_concat(DISTINCT b.name) AS "entities it refers to" FROM units a JOIN unit_connections uc ON uc."from" = a.id JOIN units b ON b.id = uc."to" WHERE a.id IN ${ENTITY} AND b.id IN ${ENTITY} AND a.id <> b.id GROUP BY a.id ORDER BY 3 DESC, 1`,
    orphans: (f: SnapshotFacts) => `SELECT e.name AS entity, e.component AS package, ${usedByCount("e.id")} AS "used by classes" FROM units e WHERE e.id IN ${marked("annotation", ["Entity"])} AND e.id NOT IN ${marked("annotation", ["MappedSuperclass", "Embeddable"])} AND e.file IN ${PROD(f)} AND NOT EXISTS (SELECT 1 FROM unit_connections uc WHERE uc."to" = e.id AND uc."from" IN ${REPO}) ORDER BY 3 DESC, 1`,
    touchedByWeb: `SELECT e.name AS entity, count(DISTINCT w.id) AS "entry points using it", group_concat(DISTINCT w.name) AS "entry points" FROM unit_connections uc JOIN units w ON w.id = uc."from" JOIN units e ON e.id = uc."to" WHERE w.id IN ${WEB} AND e.id IN ${ENTITY} GROUP BY e.id ORDER BY 2 DESC, 1`,
    hierarchy: `SELECT e.name AS entity, e.component AS package, m.key AS "extends" FROM units e JOIN unit_markers m ON m.unit = e.id AND m.source = 'supertype' WHERE e.id IN ${ENTITY} AND m.key IN (SELECT name FROM units WHERE id IN ${ENTITY}) ORDER BY 3, 1`,
}

// Maven, Gradle and other multi-module builds.
const BUILD_SQL = {
    use: (f: SnapshotFacts, declaredFor: string | null, onlyKind?: string) => `SELECT u.a AS module, u.b AS "uses code from", u.refs AS "references", u.files AS "files"${declaredFor ? `, CASE WHEN ${declares("m.depends_on", "u.b")} THEN 'declared' ELSE 'not declared' END AS "in its build file"` : ""} FROM (${moduleUse(f)}) u${declaredFor ? ` JOIN modules m ON m.name = u.a AND m.kind = ${lit(declaredFor)}` : ""}${onlyKind ? ` WHERE u.a IN (SELECT name FROM modules WHERE kind = ${lit(onlyKind)}) AND u.b IN (SELECT name FROM modules WHERE kind = ${lit(onlyKind)})` : ""} ORDER BY ${declaredFor ? `5 DESC, ` : ""}3 DESC, 1, 2`,
    undeclared: (f: SnapshotFacts, kind: string) => `SELECT u.a AS module, u.b AS "uses code from", u.refs AS "references", u.files AS "files" FROM (${moduleUse(f)}) u JOIN modules m ON m.name = u.a AND m.kind = ${lit(kind)} WHERE NOT ${declares("m.depends_on", "u.b")} ORDER BY 3 DESC, 1, 2`,
    unused: (f: SnapshotFacts, kind: string) => `WITH RECURSIVE split(m, dep, rest) AS (SELECT name, '', replace(coalesce(depends_on, ''), ', ', ',') || ',' FROM modules WHERE kind = ${lit(kind)} UNION ALL SELECT m, substr(rest, 1, instr(rest, ',') - 1), substr(rest, instr(rest, ',') + 1) FROM split WHERE rest <> ''), used AS (${moduleUse(f)}) SELECT m AS module, dep AS "declares a dependency on" FROM split WHERE dep <> '' AND NOT EXISTS (SELECT 1 FROM used WHERE used.a = split.m AND used.b = split.dep) ORDER BY 1, 2`,
    /** Each module's size, health and recent change. */
    profile: (f: SnapshotFacts, kind: string) => `SELECT m.name AS module, count(fi.name) AS files, sum(coalesce(fi.complexity__lines, 0)) AS lines${f.fileColumns.has("codesmells__code_health") ? `, round(sum(fi.codesmells__code_health * fi.complexity__lines) / nullif(sum(CASE WHEN fi.codesmells__code_health IS NOT NULL THEN fi.complexity__lines END), 0), 1) AS "code health, by lines"` : ""}${f.fileColumns.has("git__commits__last_180_days") ? `, sum(coalesce(fi.git__commits__last_180_days, 0)) AS "file changes, last 180 days"` : ""} FROM modules m JOIN files fi ON fi.module = m.name WHERE m.kind = ${lit(kind)} AND ${prodFile(f, "fi")} GROUP BY 1 ORDER BY 3 DESC, 1`,
    /** Modules changed in the same commits: the build's parts that move together. */
    coChange: (kind: string) => `WITH m AS (SELECT DISTINCT c.commit_hash AS h, fi.module AS m FROM git_commits c JOIN files fi ON fi.name = c.file WHERE fi.module IN (SELECT name FROM modules WHERE kind = ${lit(kind)})) SELECT a.m AS module, b.m AS "changes with", count(*) AS "commits that changed both" FROM m a JOIN m b ON a.h = b.h AND a.m < b.m GROUP BY 1, 2 HAVING count(*) >= 3 ORDER BY 3 DESC, 1, 2`,
    usedBy: (kind: string) => `SELECT m.name AS module, m.directory, m.files, (SELECT count(*) FROM modules o WHERE o.kind = m.kind AND ${declares("o.depends_on", "m.name")}) AS "declared by modules", m.internal_dependencies AS "declares (internal)" FROM modules m WHERE m.kind = ${lit(kind)} ORDER BY 4 DESC, m.files DESC`,
}

// Django.
const DJANGO_SQL = {
    apps: (f: SnapshotFacts) => `SELECT m.name AS app, m.directory, count(DISTINCT CASE WHEN k.key IN ('models', 'abstract_models') AND u.kind = 'type' THEN u.id END) AS "model classes", count(DISTINCT CASE WHEN k.key IN ('views', 'viewsets') THEN u.id END) AS views, count(DISTINCT CASE WHEN k.key IN ('forms', 'serializers') AND u.kind = 'type' THEN u.id END) AS "forms and serializers", count(DISTINCT CASE WHEN k.key = 'admin' AND u.kind = 'type' THEN u.id END) AS "admin classes", (SELECT count(*) FROM files x WHERE x.module = m.name AND x.name LIKE '%/migrations/%' AND x.name NOT LIKE '%__init__.py') AS migrations FROM modules m LEFT JOIN units u ON u.module = m.name AND coalesce(u.owner, '') = '' AND u.file IN ${PROD(f)} LEFT JOIN unit_markers k ON k.unit = u.id AND k.source = 'filename' WHERE m.kind = 'django' AND m.name NOT LIKE 'tests.%' AND m.name NOT LIKE '%.tests.%' GROUP BY m.name ORDER BY 3 DESC, 4 DESC, 1`,
    crossApp: (f: SnapshotFacts) => `SELECT fa.module AS app, fb.module AS "uses code from app", count(*) AS "references", count(DISTINCT CASE WHEN uc."to" IN ${marked("filename", ["models", "abstract_models"])} THEN uc."to" END) AS "of its models" FROM unit_connections uc JOIN files fa ON fa.name = uc.from_file JOIN files fb ON fb.name = uc.to_file WHERE fa.module <> fb.module AND fa.module IN (SELECT name FROM modules WHERE kind = 'django') AND fb.module IN (SELECT name FROM modules WHERE kind = 'django') AND fa.module NOT LIKE 'tests.%' AND fb.module NOT LIKE 'tests.%' AND ${prodFile(f, "fa")} GROUP BY 1, 2 ORDER BY 3 DESC, 1, 2`,
    lonely: `SELECT m.name AS app, m.directory, m.files FROM modules m WHERE m.kind = 'django' AND m.name NOT LIKE 'tests.%' AND m.name NOT LIKE '%.tests.%' AND NOT EXISTS (SELECT 1 FROM unit_connections uc JOIN files fa ON fa.name = uc.from_file JOIN files fb ON fb.name = uc.to_file WHERE fb.module = m.name AND fa.module <> m.name) ORDER BY m.files DESC, 1`,
    bigFiles: (f: SnapshotFacts, kind: "views" | "models") => `SELECT name AS file, module AS app, complexity__lines AS lines${f.fileColumns.has("codesmells__code_health") ? ", round(codesmells__code_health, 1) AS \"code health\"" : ""}${f.fileColumns.has("git__commits__last_180_days") ? `, git__commits__last_180_days AS "commits, last 180 days"` : ""} FROM files WHERE ${kind === "views" ? "(name LIKE '%/views.py' OR name LIKE '%/views/%.py')" : "(name LIKE '%/models.py' OR name LIKE '%/abstract_models.py' OR name LIKE '%/models/%.py')"} AND ${prodFile(f)} ORDER BY lines DESC, name`,
    migrations: `SELECT module AS app, count(*) AS migrations FROM files WHERE name LIKE '%/migrations/%.py' AND name NOT LIKE '%__init__.py' GROUP BY 1 ORDER BY 2 DESC, 1`,
}

// Python outside Django.
const PYTHON_SQL = {
    packages: (f: SnapshotFacts) => `SELECT u.component AS package, count(DISTINCT CASE WHEN u.kind = 'type' THEN u.id END) AS classes, count(DISTINCT CASE WHEN u.kind = 'function' AND coalesce(u.owner, '') = '' THEN u.id END) AS functions, (SELECT count(DISTINCT d."from") FROM component_connections_direct d WHERE d."to" = u.component AND d."from" <> u.component) AS "imported by packages" FROM units u WHERE u.file LIKE '%.py' AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 + 3 DESC, 1`,
    routes: (f: SnapshotFacts) => `SELECT u.component AS package, count(DISTINCT u.id) AS "request handlers", group_concat(DISTINCT m.key) AS "decorated with" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE m.source = 'annotation' AND m.key IN ('get', 'post', 'put', 'patch', 'delete', 'route', 'api_route', 'websocket') AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
    schemas: (f: SnapshotFacts) => `SELECT u.component AS package, count(DISTINCT u.id) AS "data classes", group_concat(DISTINCT m.key) AS "built on" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE ((m.source = 'supertype' AND m.key IN ('BaseModel', 'BaseSettings', 'TypedDict', 'NamedTuple', 'Enum')) OR (m.source = 'annotation' AND m.key = 'dataclass')) AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
}

// JavaScript, TypeScript and React.
const HOOK = `u.name GLOB 'use[A-Z]*'`
const JS_SQL = {
    folders: (f: SnapshotFacts) => `SELECT u.component AS folder, count(DISTINCT CASE WHEN ${reactComponent(f)} THEN u.id END) AS "React components", count(DISTINCT CASE WHEN ${HOOK} THEN u.id END) AS hooks, count(DISTINCT CASE WHEN NOT ${reactComponent(f)} AND NOT ${HOOK} AND u.kind <> 'module' THEN u.id END) AS "other functions and types" FROM units u WHERE coalesce(u.owner, '') = '' AND u.file IN ${PROD(f)} AND (u.file LIKE '%.ts' OR u.file LIKE '%.tsx' OR u.file LIKE '%.js' OR u.file LIKE '%.jsx') GROUP BY 1 HAVING count(DISTINCT CASE WHEN ${reactComponent(f)} THEN u.id END) + count(DISTINCT CASE WHEN ${HOOK} THEN u.id END) > 0 ORDER BY 2 DESC, 3 DESC, 1`,
    sharedHooks: `SELECT u.name AS hook, u.component AS "declared in", count(DISTINCT uc.from_component) AS "folders using it", count(DISTINCT uc."from") AS "functions using it" FROM units u JOIN unit_connections uc ON uc."to" = u.id WHERE ${HOOK} AND uc.from_component <> u.component GROUP BY u.id ORDER BY 3 DESC, 4 DESC, 1`,
    dataLibraries: `SELECT component AS folder, count(DISTINCT file) AS files, group_concat(DISTINCT content) AS "data libraries" FROM snippets WHERE snippet_type = 'modularity__component__imports' AND (content IN ('axios', 'swr', 'graphql-request', 'ky', 'ofetch', 'socket.io-client') OR content LIKE '@tanstack/%query%' OR content LIKE '@apollo/%' OR content LIKE '@trpc/%' OR content LIKE '@reduxjs/%') GROUP BY 1 ORDER BY 2 DESC, 1`,
    packages: `SELECT name AS package, directory, files, internal_dependencies AS "depends on (internal)", depends_on AS "internal dependencies" FROM modules WHERE kind = 'node' ORDER BY files DESC`,
}

// Vue. Each .vue file is one unit, marked by the engine, named for its file.
const VUE = marked("filename", ["vue_component"])
/** Where Vue Router's file-based routing and Nuxt keep pages and layouts, and the root component. LIKE ignores case, so App.vue is app.vue. */
const VUE_PAGE = `(u.file LIKE '%/pages/%' OR u.file LIKE '%/layouts/%' OR u.file LIKE '%/views/%' OR u.file LIKE '%/app.vue' OR u.file LIKE '%/error.vue' OR u.file IN ('app.vue', 'App.vue', 'error.vue'))`
/** A file's name without its folder or last extension: `frontend/src/a/groups.store.ts` is `groups.store`. */
const stem = (col: string) => {
    const base = `substr(${col}, length(rtrim(${col}, replace(${col}, '/', ''))) + 1)`
    return `substr(${base}, 1, length(${base}) - length(replace(${base}, rtrim(${base}, replace(${base}, '.', '')), '')) - 1)`
}
/** A Vue review reads the front end: TypeScript, JavaScript and .vue files, not a Go or Java back end beside it. */
const FRONT_END = "typescript"
const VUE_SQL = {
    folders: (f: SnapshotFacts) => `SELECT u.component AS folder, count(DISTINCT CASE WHEN u.id IN ${VUE} AND ${VUE_PAGE} THEN u.id END) AS "pages and layouts", count(DISTINCT CASE WHEN u.id IN ${VUE} AND NOT ${VUE_PAGE} THEN u.id END) AS components, count(DISTINCT CASE WHEN ${HOOK} AND u.kind <> 'module' THEN u.id END) AS composables, count(DISTINCT CASE WHEN u.id NOT IN ${VUE} AND NOT ${HOOK} AND u.kind <> 'module' THEN u.id END) AS "other functions and types" FROM units u WHERE coalesce(u.owner, '') = '' AND u.file IN ${PROD(f)} GROUP BY 1 HAVING "pages and layouts" + components + composables > 0 ORDER BY "pages and layouts" + components DESC, composables DESC, 1`,
    largest: (f: SnapshotFacts) => `SELECT u.name AS component, u.component AS folder, CASE WHEN ${VUE_PAGE} THEN 'page or layout' ELSE 'component' END AS kind, ${usedByCount("u.id")} AS "used by", ${usesCount("u.id")} AS uses, fi.complexity__lines AS lines${f.fileColumns.has("codesmells__code_health") ? `, round(fi.codesmells__code_health, 1) AS "code health"` : ""} FROM units u JOIN files fi ON fi.name = u.file WHERE u.id IN ${VUE} AND u.file IN ${PROD(f)} ORDER BY lines DESC, 1`,
    shared: `SELECT u.name AS component, u.component AS "declared in", count(DISTINCT uc.from_component) AS "folders using it", count(DISTINCT uc."from") AS "components and functions using it" FROM units u JOIN unit_connections uc ON uc."to" = u.id WHERE u.id IN ${VUE} AND uc.from_component <> u.component GROUP BY u.id ORDER BY 3 DESC, 4 DESC, 1`,
    sharedComposables: `SELECT u.name AS composable, u.component AS "declared in", count(DISTINCT uc.from_component) AS "folders using it", count(DISTINCT uc."from") AS "components and functions using it" FROM units u JOIN unit_connections uc ON uc."to" = u.id WHERE ${HOOK} AND u.kind <> 'module' AND uc.from_component <> u.component GROUP BY u.id ORDER BY 3 DESC, 4 DESC, 1`,
    unused: (f: SnapshotFacts) => `SELECT u.name AS component, u.component AS folder, fi.complexity__lines AS lines FROM units u JOIN files fi ON fi.name = u.file WHERE u.id IN ${VUE} AND NOT ${VUE_PAGE} AND u.file IN ${PROD(f)} AND NOT EXISTS (SELECT 1 FROM unit_connections uc WHERE uc."to" = u.id AND uc."from" <> u.id) ORDER BY lines DESC, 1`,
    // A Pinia store is a constant (`export const useCartStore = defineStore(...)`), not a function, so it is found by its file: production script that imports pinia or vuex. Who uses it is read from import lines naming the file.
    stores: (f: SnapshotFacts) => `WITH st AS (SELECT DISTINCT file FROM snippets WHERE snippet_type = 'modularity__import__raw' AND (content IN ('pinia', 'vuex') OR content LIKE '@pinia/%') AND file NOT LIKE '%.vue' AND file IN ${PROD(f)}), named AS (SELECT file, ${stem("file")} AS stem FROM st) SELECT n.file AS "store file", fi.component AS folder, fi.complexity__lines AS lines, (SELECT count(DISTINCT s.file) FROM snippets s WHERE s.snippet_type = 'modularity__import__raw' AND s.file <> n.file AND s.file IN ${PROD(f)} AND (s.content LIKE '%/' || n.stem OR s.content LIKE '%/' || n.stem || '.ts' OR s.content LIKE '%/' || n.stem || '.js')) AS "files importing it" FROM named n JOIN files fi ON fi.name = n.file ORDER BY 4 DESC, 1`,
}

// Go.
const GO_FILE = `u.file LIKE '%.go'`
const GO_SQL = {
    packages: (f: SnapshotFacts) => `SELECT u.component AS package, count(DISTINCT CASE WHEN u.kind = 'type' THEN u.id END) AS types, count(DISTINCT CASE WHEN u.kind = 'function' AND coalesce(u.owner, '') = '' THEN u.id END) AS functions, count(DISTINCT CASE WHEN u.kind = 'function' AND coalesce(u.owner, '') <> '' THEN u.id END) AS methods, count(DISTINCT CASE WHEN m.source = 'supertype' AND m.key = 'interface' THEN u.id END) AS interfaces, count(DISTINCT CASE WHEN coalesce(u.owner, '') = '' AND u.kind <> 'module' AND u.name GLOB '[A-Z]*' THEN u.id END) AS exported FROM units u LEFT JOIN unit_markers m ON m.unit = u.id WHERE ${GO_FILE} AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 + 3 DESC, 1`,
    tagged: (f: SnapshotFacts) => `SELECT u.name AS "struct", u.component AS package, group_concat(DISTINCT m.key) AS "tagged for" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE m.source = 'struct_tag' AND ${GO_FILE} AND u.file IN ${PROD(f)} GROUP BY u.id ORDER BY count(DISTINCT m.key) DESC, 2, 1`,
    tagsByPackage: (f: SnapshotFacts) => `SELECT u.component AS package, count(DISTINCT u.id) AS "tagged structs", group_concat(DISTINCT m.key) AS "formats" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE m.source = 'struct_tag' AND ${GO_FILE} AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
    directives: (f: SnapshotFacts) => `SELECT u.component AS package, count(DISTINCT CASE WHEN m.key = 'build' THEN u.file END) AS "files with build constraints", count(DISTINCT CASE WHEN m.key = 'embed' THEN u.id END) AS "embedded files", count(DISTINCT CASE WHEN m.key = 'generate' THEN u.file END) AS "go:generate" FROM units u JOIN unit_markers m ON m.unit = u.id WHERE m.source = 'directive' AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 + 3 + 4 DESC, 1`,
    // Go packages only: a Go module beside a Vue front end lists its Go.
    fanIn: `SELECT "to" AS package, count(DISTINCT "from") AS "packages importing it", count(*) AS imports FROM component_connections_direct WHERE "from" <> "to" AND "to" IN (SELECT component FROM files WHERE name LIKE '%.go') AND "from" IN (SELECT component FROM files WHERE name LIKE '%.go') GROUP BY 1 ORDER BY 2 DESC, 1`,
}

// .NET: projects, and the roles its names give away.
const cs = (suffixes: string[]) => `(${suffixes.map(s => `name LIKE ${lit(`%${s}.cs`)}`).join(" OR ")})`
const DOTNET_SQL = {
    projects: `SELECT m.name AS project, m.directory, m.files, (SELECT count(*) FROM modules o WHERE o.kind = 'dotnet' AND ${declares("o.depends_on", "m.name")}) AS "referenced by projects", m.depends_on AS "references" FROM modules m WHERE m.kind = 'dotnet' ORDER BY 4 DESC, m.files DESC, 1`,
    roles: (f: SnapshotFacts) => `SELECT module AS project, count(*) AS "C# files", sum(${cs(["Controller"])}) AS controllers, sum(${cs(["Service"])}) AS services, sum(${cs(["Factory"])}) AS factories, sum(${cs(["Repository", "DbContext", "DataProvider", "Dao"])}) AS "data access", sum(${cs(["Model", "Dto", "DTO", "ViewModel", "Entity", "Request", "Response"])}) AS "models and DTOs", sum(${cs(["Validator"])}) AS validators, sum(${cs(["Middleware", "Filter", "Attribute"])}) AS "middleware and filters" FROM files WHERE name LIKE '%.cs' AND ${prodFile(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
    controllers: (f: SnapshotFacts) => `SELECT name AS "controller file", module AS project, complexity__lines AS lines${f.fileColumns.has("codesmells__code_health") ? `, round(codesmells__code_health, 1) AS "code health"` : ""}${f.fileColumns.has("git__commits__last_180_days") ? `, git__commits__last_180_days AS "commits, last 180 days"` : ""} FROM files WHERE ${cs(["Controller"])} AND ${prodFile(f)} ORDER BY lines DESC, name`,
}

// PHP: Symfony, Laravel and Composer packages.
const phpRole = (label: string, cond: string) => `count(DISTINCT CASE WHEN ${cond} THEN u.id END) AS "${label}"`
const sup = (keys: string[]) => `u.id IN ${marked("supertype", keys)}`
const ann = (keys: string[]) => `u.id IN ${marked("annotation", keys)}`
const PHP_SQL = {
    packages: (f: SnapshotFacts) => `SELECT u.module AS package, count(DISTINCT u.id) AS classes, ${[
        phpRole("controllers", `(u.name LIKE '%Controller' OR u.name LIKE '%Action' OR ${ann(["AsController", "Route"])} OR ${sup(["AbstractController", "Controller"])})`),
        phpRole("entities and models", `(${ann(["Entity", "Embeddable", "ORM"])} OR ${sup(["ResourceInterface", "Model", "Authenticatable"])} OR (u.file LIKE '%/Model/%' AND u.id NOT IN ${marked("supertype", ["interface"])}) OR u.name LIKE '%Entity')`),
        phpRole("repositories", `(u.name LIKE '%Repository' OR ${sup(["EntityRepository", "RepositoryInterface", "ServiceEntityRepository"])})`),
        phpRole("form types", sup(["AbstractType", "AbstractResourceType", "AbstractTypeExtension", "FormRequest"])),
        phpRole("message and command handlers", `(${ann(["AsMessageHandler", "AsCommand"])} OR u.name LIKE '%Handler' OR ${sup(["Command", "Job"])})`),
        phpRole("event subscribers and listeners", `(${ann(["AsEventListener"])} OR ${sup(["EventSubscriberInterface"])} OR u.name LIKE '%Listener' OR u.name LIKE '%Subscriber')`),
        phpRole("validators", sup(["ConstraintValidator", "Constraint"])),
    ].join(", ")} FROM units u WHERE u.kind = 'type' AND coalesce(u.owner, '') = '' AND u.file LIKE '%.php' AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
    crossPackage: (f: SnapshotFacts) => `SELECT u.a AS package, u.b AS "uses code from", u.refs AS "references", u.files AS "files" FROM (${moduleUse(f)}) u ORDER BY 3 DESC, 1, 2`,
    bundles: (f: SnapshotFacts) => `SELECT CASE WHEN instr(u.component, '\\Bundle\\') > 0 THEN substr(substr(u.component, instr(u.component, '\\Bundle\\') + 8), 1, instr(substr(u.component, instr(u.component, '\\Bundle\\') + 8) || '\\', '\\') - 1) ELSE substr(u.component, 1, instr(u.component || '\\', 'Bundle\\') + 5) END AS bundle, count(DISTINCT u.id) AS classes, ${[
        phpRole("DI extensions and compiler passes", sup(["Extension", "CompilerPassInterface", "ConfigurationInterface", "AbstractExtension", "Bundle", "AbstractBundle"])),
        phpRole("event subscribers", `(${sup(["EventSubscriberInterface"])} OR ${ann(["AsEventListener"])})`),
        phpRole("form types", sup(["AbstractType", "AbstractResourceType", "AbstractTypeExtension"])),
        phpRole("controllers", `(u.name LIKE '%Controller' OR u.name LIKE '%Action')`),
    ].join(", ")} FROM units u WHERE u.component LIKE '%Bundle\\%' AND u.kind = 'type' AND coalesce(u.owner, '') = '' AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
}

// ── Explanations ──────────────────────────────────────────────────────────

const EXPLAIN = {
    moduleCoChange: "Modules that keep changing in the same commits move together, whatever their build files say: a change to one has needed a change to the other. Pairs that change together often but declare no dependency on each other are tied by something the build does not show, such as a shared schema, a message format or copied code.",
    dependentsBars: "Each bar is a folder, as long as the number of other folders that import it directly. The longest bars are the code everything else leans on.",
    layers: "Most frameworks expect work to flow one way: from where a request comes in, through the business logic, down to data access and the data itself. A reference one step down follows that order.\n\nA reference that *skips a layer* makes the skipped layer easy to bypass. One that runs *back up* ties a lower layer to the one above it, so neither can change alone.",

    spring: "Spring creates the application's objects, called *beans*, and wires them together. *Controllers* answer web requests, *services* hold the business logic, *repositories* read and write the database, and *entities* (JPA) are classes mapped to database tables.\n\nThe usual layering runs from controllers to services to repositories to entities.",
    springWeb: "The web layer is where requests come in. Spring MVC marks entry points with `@Controller` or `@RestController` and maps each method to a URL and an HTTP verb: GET reads, POST creates, PUT or PATCH changes, and DELETE removes. Some applications use JAX-RS instead and mark resources with `@Path`; those are counted too, but not per verb.\n\nA controller with many mappings or many collaborators is doing several jobs. It is usually easier to work with once split by resource.",
    springShortcuts: "These entry points use a repository or an entity directly instead of going through a service. It works, but the business rules in the service layer are then skipped for that request, and the web layer becomes tied to the database structure.",
    springServices: "Services hold the business logic. The most used services are the ones most other code depends on, so a change to them reaches furthest.\n\n`@Transactional` sets where a database transaction starts and ends. It usually belongs on services, so that one business operation is one transaction. Only `@Transactional` on a whole class is visible here, not on single methods.",
    springRepos: "Repositories should be the only code that talks to the database. In Spring Data a repository is usually an interface extending `JpaRepository` or `CrudRepository`, one per *aggregate root*: the entity that other entities are saved and loaded through.",
    springSwitches: "Some beans exist only under a condition. `@ConditionalOnProperty` switches a bean on with a configuration property, `@Profile` only in some environments (dev, test, prod), and `@ConditionalOnMissingBean` only when nothing else provides it.\n\nThese are the application's feature switches, and each one is a combination to test.",
    springBackwards: "These repositories and entities use a service or a controller: a lower layer reaching up. An entity that calls a service can no longer be loaded, tested or reused without it.",
    entities: "An *entity* is a class JPA maps to a database table. Entities refer to each other (an order has order lines, and a line refers to a product), and those links become joins and foreign keys.\n\nThe *used by* column counts how many classes use each entity. The most used ones are the heart of the domain model, and a change to them reaches furthest. An entity with no repository of its own is saved through another entity (it is part of that entity's *aggregate*), or not saved on its own at all.",
    entityHierarchy: "JPA entities can extend each other (`@Inheritance`, `@MappedSuperclass`), so that several tables share columns or one table holds several kinds of row. Deep hierarchies make queries and schema changes harder to follow.",

    build: "A multi-module build splits the code into *modules* (Maven modules, Gradle projects). Each has its own build file that declares which other modules it needs, and the build uses those declarations to decide what to build first and what goes on the classpath.\n\nThe code, however, can use anything the classpath offers. So the declared structure and the real one drift apart.",
    drift: "The first table compares what the code does with what the build files say. Module A *uses* module B when a class in A refers to a class in B. *Not declared* means A uses B without listing it, relying on B arriving through another dependency; if that dependency changes, A stops compiling.\n\nThe second table is the opposite: dependencies a module declares but never uses. They slow the build and hide the real structure.",

    django: "A Django project is made of *apps*: packages that each hold their own models (database tables), views (request handlers), forms, admin screens and migrations (recorded changes to the database schema). Apps are meant to be self-contained, so that each can be understood, tested and reused on its own.\n\nSome projects, django-oscar among them, keep models in `abstract_models.py` so that a project using the app can swap a model for its own.",
    djangoCross: "An app that uses another app's models depends on that app's database tables: it cannot be installed, migrated or tested without it. The table counts references from one app's code into another's, and how many of the things used are models.",
    djangoMigrations: "Every change to a model adds a migration file. Apps with many migrations are the ones whose data model changes most, and each migration has to run, in order, on every database the application has.",

    python: "Here a component is a Python package: a folder of Python files that the rest of the code imports by name. FastAPI and Flask mark request handlers with decorators such as `@app.get` or `@router.post`, and Pydantic models and dataclasses describe the data that crosses the API.",

    node: "A JavaScript or TypeScript workspace is often split into *packages*, each with its own `package.json` that lists what it depends on. Here a component is a folder, so the imports between components are the imports between folders.",
    react: "In a React codebase the word *component* means two things. A *React component* is a function that draws part of the page, named in capitals like `UserMenu`. A component in this report is a folder, which can hold many React components.\n\n*Hooks* (functions named `useSomething`) hold reusable state and behaviour, and *data clients* fetch from a server. A healthy front end keeps drawing, state and data fetching apart, so that each can change without the others.",
    reactHooks: "A hook used from many folders is shared infrastructure: a change to it changes every screen that uses it. The table lists the hooks used outside the folder they are declared in, the most widely shared first.",
    vue: "In a Vue codebase the word *component* means two things. A *Vue component* is one `.vue` file: a template that draws part of the page, with the script behind it. A component in this report is a folder, which can hold many Vue components.\n\n*Pages* and *layouts* are the components the router shows, one per screen. *Composables* (functions named `useSomething`) hold reusable state and behaviour, *stores* (Pinia or Vuex) hold state that many screens share, and *data clients* fetch from a server. A healthy front end keeps drawing, state and data fetching apart, so that each can change without the others.",
    vueShared: "A component used from many folders is shared UI: a button, a table, a panel frame. A change to it changes every screen that uses it, so it should be stable and small. The table lists the components used outside the folder they are declared in, the most widely shared first.",
    vueUnused: "These components are not pages or layouts, and no other component or script uses them. Most are left over from a change and can be deleted.\n\nThere is one exception. A component that Nuxt imports automatically, or that is registered globally with `app.component()`, is used without an import line, so it shows up here even though it is in use. Check before deleting.",
    vueComposables: "A *composable* is a function named `useSomething` that packages state and behaviour for components to share: `useFetch`, `useSelection`. One used from many folders is shared infrastructure, and a change to it changes every screen that calls it. The table lists the composables used outside the folder they are declared in, the most widely shared first.",
    vueStores: "A *store* holds state that outlives one screen: the signed-in user, a cart, the open document. Every component that reads a store depends on its shape, so a store used from many files is hard to change.\n\nA store file is a script that imports Pinia or Vuex. The files importing it are counted by the file name they import, so two stores with the same file name in different folders are counted together.",
    reactData: "These folders import a data-fetching library directly. When fetching is spread over many folders, every screen talks to the server its own way; when it sits in a few, the server contract has one home.",

    go: "In Go a component is a *package*: one folder. A name that starts with a capital letter is *exported*, meaning other packages can use it; lower-case names are private to the package.\n\nPackages under a folder named `internal` may only be imported by code inside the folder that holds `internal`, and the Go tool enforces this. Go also refuses import cycles between packages, so a tangle between packages cannot happen.",
    goTags: "A *struct tag* such as `json:\"name\"` or `db:\"user_id\"` tells an encoder how to read and write a struct. A tagged struct crosses a boundary: it is sent over the wire, stored, or read from configuration. Renaming its fields breaks someone outside the code.",
    goDirectives: "*Build constraints* (`//go:build linux`) compile a file only on some platforms or with some tags, so part of the code is invisible in a normal build. *Embedded files* (`//go:embed`) bake files into the binary, and *go:generate* marks code that a tool writes.",

    dotnet: "A .NET solution is made of *projects*, one `.csproj` file each, that reference each other. A project can only use code from the projects it references. Here a component is a namespace.\n\nThe roles below are read from file names (`OrderController.cs`, `OrderService.cs`), which is how .NET code usually names them.",

    php: "PHP code is organised in *namespaces*, grouped into Composer packages and, in Symfony, *bundles*. Controllers answer requests, entities hold the data, repositories load it, form types describe input, and message handlers and event subscribers react to things that happen.",
    phpBundles: "A Symfony *bundle* is a plugin. It registers its own services, listens to events through subscribers, and can bring its own controllers and forms. A bundle with many subscribers and extensions changes how the whole application behaves, not just its own part.",
}

// ── Sections several framework templates share ────────────────────────────

/** What marks a role in each ecosystem, for the roles explanation. */
const ROLE_EXAMPLES: Partial<Record<EcosystemId, string>> = {
    spring: "a class marked `@Service` is a service, and one extending `JpaRepository` is a repository",
    jvm: "a class marked `@Entity` holds persistent data, and one named `…Controller` answers requests",
    django: "a class extending `models.Model` is a model, and a function in `views.py` is a view",
    python: "a class extending Pydantic's `BaseModel` is a schema, and a function decorated with `@app.get` answers a request",
    react: "a function named in Pascal case in a `.tsx` file, such as `UserMenu`, is a component, and one named like `useCart` is a hook",
    vue: "every `.vue` file is a component, one under `pages/` or `layouts/` is a page, and a function named like `useCart` is a composable",
    node: "a class decorated with `@Controller` answers requests, and code that imports `axios` talks to a server",
    go: "a struct with `json:` tags is a model, and a type that imports `database/sql` is a store",
    dotnet: "a class extending `ControllerBase` is a controller, and one using a `DbContext` is data access",
    php: "a class with a `#[Route]` attribute is a controller, and one implementing `ResourceInterface` is an entity or model",
}
function rolesAbout(eco: EcosystemId | ""): string {
    const ex = eco ? ROLE_EXAMPLES[eco] : undefined
    return `Frameworks give classes jobs: a controller answers requests, a repository reads and writes the database, an entity holds the data. Below, each class gets the job that fits it, the same way the Classes view sorts them.\n\nWhat a class says about itself decides first: its annotations, decorators, base classes or struct tags${ex ? `. For example, ${ex}` : ""}. After that come what it imports, and then its name. A class that fits no job is counted separately rather than guessed at.`
}
/** The roles, and a picture of them: where each lives (the map) or how they lean (the floors). */
function anatomy(w: Writer, profile: string, language?: string, picture: "lanes" | "layers" = "lanes") {
    w.explain(rolesAbout(w.eco)).reading("roles", { profile, ...(language ? { language } : {}) })
    if (picture === "layers") layers(w, "How the roles lean on each other")
    else lanes(w)
}
/** What skipping and running back up look like, in the framework's own words. */
const LAYER_EXAMPLES: Record<string, string> = {
    spring: "In Spring: a controller calling a repository directly skips the services; an entity calling a service runs back up.",
    django: "In Django: a view reading a model directly is the normal path, but a model importing a view or a form runs back up.",
    react: "In React: a component calling a data client directly skips the hooks that should hold that state; a data client importing a component runs back up.",
    vue: "In Vue: a page calling a data client directly skips the composables and stores that should hold that state; a store importing a component runs back up.",
    aspnet: "In ASP.NET: a controller using a DbContext directly skips the services; an entity or DTO calling a service runs back up.",
    symfony: "In Symfony: a controller using a repository directly skips the services; an entity calling a service runs back up.",
    "": "For example, an entry point calling data access directly skips the logic, and data access calling an entry point runs back up.",
}
function layering(w: Writer, profile: string, flow?: [string, string, string], language?: string) {
    w.explain(`${EXPLAIN.layers} ${LAYER_EXAMPLES[profile] ?? LAYER_EXAMPLES[""]}`).reading("layers", { profile, ...(language ? { language } : {}) })
    if (flow) slotOf(w, "figure", `How ${flow[2]} relate`, VIEWS.flow(flow[0], flow[1], `Boundary between ${flow[2]}`))
}
const role = (w: Writer, lane: string, profile: string, language?: string) => w.reading("role", { lane, profile, ...(language ? { language } : {}) })

// ── Spring and the JVM ────────────────────────────────────────────────────

const SPRING: ReportTemplate[] = [
    {
        id: "spring-review",
        name: "Spring application review",
        audience: "A Spring team or its architects",
        summary: "A full tour of a Spring application: how the web layer is split into controllers and what each one serves, where the business logic lives, how repositories and entities make up the data model, whether the layers call each other in the right direction, which beans switch on and off, and where complicated code keeps changing.",
        when: "Use it when a Spring application has grown and you want to know whether its layers still hold, before a Spring Boot upgrade, or when a new team takes it over.",
        ecosystem: "spring",
        title: ws => `Spring review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the application does, who uses it, and what this review should settle.")
            w.section("The application at a glance", true, () => { glance(w); w.explain(EXPLAIN.spring).reading("spring") })
            w.section("Roles in the code", has.units(f), () => anatomy(w, "spring"))
            w.section("The web layer: how the controllers are split up", has.marker(f, "the code has no controllers or JAX-RS resources", "annotation:Controller", "annotation:RestController", "annotation:Path"), () => {
                w.explain(EXPLAIN.springWeb)
                role(w, "controllers", "spring")
                w.sql("Web entry points by package", SPRING_SQL.webByPackage(f), 20)
                w.sql("Every web entry point, the busiest first", SPRING_SQL.web(f), 25)
                w.prompt("Is the web layer split by resource (one controller per thing the API serves) or by screen or team? Name the controllers that do too much: many mappings, many collaborators, or many lines.")
            })
            w.section("Services: where the business logic lives", has.units(f), () => {
                w.explain(EXPLAIN.springServices)
                role(w, "services", "spring")
                if (f.markers.has("annotation:Transactional")) w.sql("Where @Transactional sits", SPRING_SQL.transactional(f), 10)
                w.exhibit("recipe", { recipe: "largest-classes" }, "The largest classes")
            })
            w.section("Repositories and the entity model", has.marker(f, "the code has no JPA entities", "annotation:Entity"), () => {
                w.explain(EXPLAIN.springRepos)
                role(w, "repositories", "spring")
                w.explain(EXPLAIN.entities)
                role(w, "entities", "spring")
                w.sql("Entities by package", SPRING_SQL.entitiesByPackage(f), 20)
                w.sql("Entities, the most used first", SPRING_SQL.entities(f), 20)
                w.prompt("Which entities are the heart of the model, and do their packages match the business areas? Name any entity that everything touches.")
            })
            w.section("Do the layers hold?", has.links(f), () => {
                layering(w, "spring", ["controllers", "services", "Controllers and Services"])
                w.explain(EXPLAIN.springShortcuts)
                w.sql("Entry points that skip the services", SPRING_SQL.shortcuts, 20)
                w.explain(EXPLAIN.springBackwards)
                w.sql("Repositories and entities that reach up into services or controllers", SPRING_SQL.backwards, 20)
            })
            w.section("Beans that switch on and off", has.marker(f, "no bean is conditional", "annotation:ConditionalOnProperty", "annotation:Profile", "annotation:ConditionalOnMissingBean", "annotation:Conditional", "annotation:ConditionalOnClass", "annotation:ConditionalOnBean"), () => {
                w.explain(EXPLAIN.springSwitches)
                w.sql("Conditional beans", SPRING_SQL.switches(f), 30)
            })
            w.section("Build modules", needs.modules(f), () => modules(w))
            w.section("Hotspots", needs.git(f), () => { hotspots(w); slotOf(w, "figure", "Churn against code health", VIEWS.treemap("churn", "components", "Churn against health, components")) })
            w.section("Where the work has gone", needs.git(f), () => {
                w.explain(ABOUT.churn).reading("churn", { days: "180" })
                w.explainSlot(SHOWS.workMoved)
                slotOf(w, "figure", "Where the work moved", VIEWS.workMoved("365"))
            })
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above: where the layers hold, where they leak, and which controllers, services or entities need attention first."))
        },
    },
    {
        id: "spring-layering",
        name: "Spring layering check",
        audience: "Keeping a Spring app layered",
        summary: "Checks one question in depth: do controllers, services, repositories and entities call each other in the right direction? It counts references that follow the layers, skip one, or run back up, names the classes behind each, and shows where transactions start.",
        when: "Use it before adding dependency rules, after a period of fast feature work, or when business logic seems to be leaking into controllers or entities.",
        ecosystem: "spring",
        title: ws => `Spring layering: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("The layering the team intends, in a sentence or two, and anything that is allowed to break it on purpose.")
            w.section("The roles", has.units(f), () => anatomy(w, "spring", undefined, "layers"))
            w.section("References between the layers", has.links(f), () => {
                layering(w, "spring", ["services", "repositories", "Services and Repositories"])
                slotOf(w, "table", "Dependency matrix", VIEWS.matrix(f))
            })
            w.section("The packages as floors", true, () => { w.explainSlot(SHOWS.stack); w.exhibit("stack", {}, "The packages as floors") })
            w.section("Entry points that skip the services", has.links(f), () => { w.explain(EXPLAIN.springShortcuts); w.sql("Entry points using repositories or entities directly", SPRING_SQL.shortcuts, 30) })
            w.section("Lower layers reaching up", has.links(f), () => { w.explain(EXPLAIN.springBackwards); w.sql("Repositories and entities that use services or controllers", SPRING_SQL.backwards, 30) })
            w.section("Transaction boundaries", has.marker(f, "no class is marked @Transactional", "annotation:Transactional"), () => { w.explain(EXPLAIN.springServices); w.sql("Where @Transactional sits", SPRING_SQL.transactional(f), 10) })
            w.section("Dependency rules", needs.rules(f), () => rules(w))
            w.section("What to fix, and how to keep it fixed", true, () => w.prompt("The references to move first, and a dependency rule for each layer boundary so the build or the next scan catches a new one."))
        },
    },
    {
        id: "jpa-model",
        name: "JPA entity model",
        audience: "The data model of a JVM app",
        summary: "Describes the persistent data model: which entities there are and in which packages, which ones the rest of the code uses most, how entities refer to each other, which ones have their own repository and which are saved through another, inheritance between entities, and entities the web layer touches directly.",
        when: "Use it before a database migration or schema change, when splitting a monolith by data, or to explain the domain model to someone new.",
        ecosystem: "spring",
        title: ws => `Entity model: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why the data model is being looked at: a migration, a split, performance, or onboarding.")
            w.section("The entities", has.marker(f, "the code has no JPA entities", "annotation:Entity"), () => {
                w.explain(EXPLAIN.entities)
                role(w, "entities", "spring")
                w.sql("Entities by package", SPRING_SQL.entitiesByPackage(f), 20)
                w.sql("Entities, the most used first", SPRING_SQL.entities(f), 25)
                if (f.tables.has("unit_connections")) w.exhibit("recipe", { recipe: "shared-types" }, "The types used from the most places")
            })
            w.section("How entities refer to each other", needs.all(has.marker(f, "the code has no JPA entities", "annotation:Entity"), has.links(f)), () => {
                w.sql("Entities with the most links to other entities", SPRING_SQL.entityLinks, 20)
                slotOf(w, "figure", "Repositories and entities", VIEWS.flow("repositories", "entities", "Boundary between Repositories and Entities"))
                w.prompt("Where are the natural aggregates: groups of entities that are always loaded and saved together? Which links cross from one business area into another?")
            })
            w.section("Entities saved through another", needs.all(has.marker(f, "the code has no JPA entities", "annotation:Entity"), has.links(f)), () => w.sql("Entities no repository uses", SPRING_SQL.orphans(f), 25))
            w.section("Inheritance", has.marker(f, "no entity extends another", "annotation:Inheritance", "annotation:MappedSuperclass"), () => { w.explain(EXPLAIN.entityHierarchy); w.sql("Entities that extend another entity", SPRING_SQL.hierarchy, 30) })
            w.section("Entities the web layer touches directly", needs.all(has.marker(f, "the code has no JPA entities", "annotation:Entity"), has.links(f)), () => w.sql("Entities used by controllers or resources", SPRING_SQL.touchedByWeb, 20))
            w.section("What it means", true, () => w.prompt("What the model says about the business, where it is tangled, and what you would change first."))
        },
    },
    {
        id: "jvm-build",
        name: "Multi-module build review",
        audience: "Maven or Gradle builds",
        summary: "Compares the modules a Maven or Gradle build declares with how the code actually uses them: which modules there are and which are depended on most, which modules use each other's code, and (for Maven) uses the build files do not declare. Ends with a proposal for the module layout.",
        when: "Use it when the build is slow or fragile, when modules have grown out of their original purpose, or before reorganising them.",
        ecosystem: "jvm",
        title: ws => `Build review: ${ws}`,
        build(w) {
            const f = w.facts
            const kind = (f.moduleKinds.maven ?? 0) >= (f.moduleKinds.gradle ?? 0) ? "maven" : "gradle"
            w.prompt("Why the module layout is being looked at: build times, releases, a planned reorganisation.")
            w.section("Modules", needs.modules(f), () => {
                w.explain(EXPLAIN.build).reading("modules")
                w.sql("Modules, the most depended on first", BUILD_SQL.usedBy(kind), 40)
                w.sql("Modules by size, health and recent change", BUILD_SQL.profile(f, kind), 40)
            })
            w.section("How the modules use each other", has.links(f), () => {
                w.explain(kind === "maven" ? EXPLAIN.drift : "The table counts references from one module's classes into another's. The scan cannot read every Gradle dependency declaration, so it does not say which uses are declared.")
                w.sql("Module to module, by references", BUILD_SQL.use(f, kind === "maven" ? "maven" : null), 40)
            })
            w.section("Which modules lean on which", needs.modules(f), () => { w.explainSlot(SHOWS.modulesDeps); w.exhibit("recipe", { recipe: "modules-deps" }, "Which modules depend on which") })
            w.section("Modules that change together", needs.all(needs.modules(f), needs.git(f)), () => {
                w.explain(EXPLAIN.moduleCoChange)
                w.sql("Modules changed in the same commits", BUILD_SQL.coChange(kind), 25)
            })
            w.section("How the code connects", true, () => { structure(w, "stack"); coupling(w) })
            w.section("Dependency rules", needs.rules(f), () => rules(w))
            w.section("Proposal", true, () => w.prompt("Modules to merge, split or point elsewhere, and the references that justify each change."))
        },
    },
    {
        id: "module-drift",
        name: "Module drift check",
        audience: "Maven build hygiene",
        summary: "Lists where a Maven build and its code disagree: modules that use code from a module they do not declare (they compile only by luck of the classpath), and dependencies a module declares but never uses. Each row is a line to add to, or remove from, a pom.xml.",
        when: "Use it before upgrading or splitting modules, when builds break after an unrelated change, or to shorten build times.",
        ecosystem: "jvm",
        title: ws => `Module drift: ${ws}`,
        build(w) {
            const f = w.facts
            const maven = has.moduleKind(f, "maven", "the build is not Maven; the scan cannot read every Gradle declaration")
            w.prompt("What prompted the check: a broken build, an upgrade, or build times.")
            w.section("Used but not declared", needs.all(maven, has.links(f)), () => { w.explain(EXPLAIN.drift); w.sql("Modules using code they do not declare", BUILD_SQL.undeclared(f, "maven"), 40) })
            w.section("Declared but not used", needs.all(maven, has.links(f)), () => w.sql("Declared dependencies whose code is never used", BUILD_SQL.unused(f, "maven"), 40))
            w.section("Changes to make", true, () => w.prompt("The declarations to add and remove, module by module. Removing an unused dependency can break a module that relied on it arriving indirectly, so remove one at a time and build."))
        },
    },
]

// ── Python ────────────────────────────────────────────────────────────────

const PYTHON: ReportTemplate[] = [
    {
        id: "django-review",
        name: "Django project review",
        audience: "A Django team",
        summary: "A tour of a Django project: its apps and what each one holds (models, views, forms, admin, migrations), how the apps depend on each other and on each other's models, the largest view and model files, where complicated code keeps changing, and the state of code health and tests.",
        when: "Use it when a Django project has grown many apps and you want to know whether they are still self-contained, or to introduce the project to new developers.",
        ecosystem: "django",
        title: ws => `Django review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the project does, and what this review should settle.")
            w.section("The project at a glance", true, () => { glance(w); w.explain(EXPLAIN.django).reading("django") })
            w.section("The apps", needs.all(needs.modules(f), has.markers(f)), () => { w.sql("Apps and what they hold", DJANGO_SQL.apps(f), 40); w.prompt("Which apps are the core of the product, which are supporting, and which could go?") })
            w.section("Roles in the code", has.units(f), () => anatomy(w, "django"))
            w.section("How the apps depend on each other", has.links(f), () => {
                w.explain(EXPLAIN.djangoCross)
                w.sql("App to app, by references", DJANGO_SQL.crossApp(f), 30)
                slotOf(w, "figure", "Apps and their imports", VIEWS.chord)
                w.prompt("Which apps are meant to be reusable, and do their imports allow it?")
            })
            w.section("Views and models", has.units(f), () => {
                role(w, "views", "django")
                w.sql("The largest view files", DJANGO_SQL.bigFiles(f, "views"), 10)
                role(w, "models", "django")
                w.sql("The largest model files", DJANGO_SQL.bigFiles(f, "models"), 10)
            })
            w.section("Migrations", true, () => { w.explain(EXPLAIN.djangoMigrations); w.sql("Migrations per app", DJANGO_SQL.migrations, 20) })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Health and tests", needs.health(f), () => { health(w, null); if (f.fileColumns.has("role")) tests(w) })
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above: apps that are too big, apps that lean on each other's models, and views or models to split."))
        },
    },
    {
        id: "django-apps",
        name: "Django app boundaries",
        audience: "Splitting or reusing Django apps",
        summary: "Focuses on the lines between apps: what each app holds, which apps use which other apps' code and models, and which apps nothing else uses. It is the evidence for merging, splitting or extracting an app.",
        when: "Use it before extracting an app into its own package or service, or when apps have started to depend on each other in circles.",
        ecosystem: "django",
        title: ws => `Django app boundaries: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("The change you are considering: which apps to merge, split or extract, and why.")
            w.section("The apps", needs.all(needs.modules(f), has.markers(f)), () => { w.explain(EXPLAIN.django); w.sql("Apps and what they hold", DJANGO_SQL.apps(f), 40) })
            w.section("Apps that use other apps", has.links(f), () => { w.explain(EXPLAIN.djangoCross); w.sql("App to app, by references", DJANGO_SQL.crossApp(f), 40); slotOf(w, "table", "Dependency matrix", VIEWS.matrix(f)) })
            w.section("Apps nothing else uses", has.links(f), () => w.sql("Apps no other app uses", DJANGO_SQL.lonely, 30))
            w.section("Apps that change together", needs.all(needs.modules(f), needs.git(f)), () => {
                w.explain(EXPLAIN.moduleCoChange)
                w.sql("Apps changed in the same commits", BUILD_SQL.coChange("django"), 25)
            })
            w.section("The apps as floors", true, () => { w.explainSlot(SHOWS.stack); w.exhibit("stack", {}, "The code as floors") })
            w.section("Circular dependencies", needs.tangles(f), () => { structure(w, false); w.sql("Tangles", SQL.tangles, 10) })
            w.section("The boundaries you propose", true, () => w.prompt("Per app: keep, merge into another, split, or extract. For each, the references that would have to change."))
        },
    },
    {
        id: "python-review",
        name: "Python codebase review",
        audience: "A Python team",
        summary: "A review of a Python codebase: its packages and how much each holds and is used, its request handlers and data classes if it is a FastAPI or Flask service, the third-party libraries beneath it, where complicated code keeps changing, and the tests.",
        when: "Use it for a general health check of a Python codebase, or before restructuring its packages.",
        ecosystem: "python",
        title: ws => `Python review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the code does, and what this review should settle.")
            w.section("The code", true, () => { w.explain(`${ABOUT.size} ${EXPLAIN.python}`).reading("size", { language: "Python" }) })
            w.section("Packages", has.units(f), () => { w.sql("Packages, the largest first", PYTHON_SQL.packages(f), 25); anatomy(w, "", "python") })
            w.section("Request handlers", has.marker(f, "no function carries a route decorator", "annotation:get", "annotation:post", "annotation:route", "annotation:put", "annotation:delete"), () => w.sql("Request handlers by package", PYTHON_SQL.routes(f), 20))
            w.section("Data classes", has.marker(f, "no Pydantic models or dataclasses", "supertype:BaseModel", "annotation:dataclass", "supertype:TypedDict"), () => w.sql("Pydantic models and dataclasses by package", PYTHON_SQL.schemas(f), 20))
            w.section("Imports between packages", true, () => { structure(w, "stack"); coupling(w, 0, "py") })
            w.section("Third-party libraries", needs.snippets(f), () => libraries(w))
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Tests", needs.tests(f), () => tests(w))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
]

// ── JavaScript and TypeScript ─────────────────────────────────────────────

const WEBAPPS: ReportTemplate[] = [
    {
        id: "node-review",
        name: "JavaScript/TypeScript workspace review",
        audience: "A web or Node team",
        summary: "A review of a JavaScript or TypeScript workspace: its packages and how they use each other, the roles in the code (routes, services, components, data clients, depending on the framework), how much is TypeScript, circular imports between folders, the npm libraries it relies on, where complicated code keeps changing, and the tests.",
        when: "Use it for a general health check of a JavaScript or TypeScript workspace, or before splitting it into packages.",
        ecosystem: "node",
        title: ws => `Workspace review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the workspace ships, and what this review should settle.")
            w.section("The workspace", true, () => { w.explain(`${ABOUT.size} ${EXPLAIN.node}`).reading("size"); w.reading("node") })
            w.section("Packages", has.moduleKind(f, "node", "the code has no package.json files"), () => {
                w.sql("Packages", JS_SQL.packages, 30)
                if (f.tables.has("unit_connections") && (f.moduleKinds.node ?? 0) >= 2) w.sql("Package to package, by references", BUILD_SQL.use(f, null, "node"), 30)
            })
            w.section("Roles in the code", has.units(f), () => { anatomy(w, ""); layering(w, "") })
            w.section("Imports between folders", true, () => { structure(w, "graph"); if (f.tangles) w.sql("Tangles", SQL.tangles, 10) })
            w.section("The code everything uses", true, () => { w.explainSlot(EXPLAIN.dependentsBars); w.exhibit("ranking", { measure: "most dependents" }, "The most depended-on folders") })
            w.section("Libraries", needs.snippets(f), () => { libraries(w); w.exhibit("recipe", { recipe: "external-imports" }, "The outside packages imported most") })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Tests", needs.tests(f), () => tests(w))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "react-review",
        name: "React front end review",
        audience: "A front-end team",
        summary: "A tour of a React front end: which folders hold the React components and hooks, which hooks are shared across features, where data is fetched from the server, whether drawing, state and data access stay apart, which files change most, and how easy the code is to work in.",
        when: "Use it when a front end has grown and features, shared UI and data access have started to mix, or to explain the front end to new developers.",
        ecosystem: "react",
        title: ws => `Front end review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the front end does, and what this review should settle.")
            w.section("The front end", true, () => { w.explain(EXPLAIN.react).reading("node") })
            w.section("Roles in the code", has.units(f), () => anatomy(w, "react"))
            w.section("Components and hooks by folder", has.units(f), () => {
                w.sql("Folders by React components and hooks", JS_SQL.folders(f), 25)
                role(w, "components", "react")
                w.prompt("Are the folders organised by feature (checkout, profile) or by kind (components, hooks)? Which folders are shared UI, and which belong to one feature?")
            })
            w.section("Shared hooks", has.links(f), () => { w.explain(EXPLAIN.reactHooks); role(w, "hooks", "react"); w.sql("Hooks used outside their own folder", JS_SQL.sharedHooks, 20) })
            w.section("Where data is fetched", needs.snippets(f), () => { w.explain(EXPLAIN.reactData); role(w, "data", "react"); w.sql("Folders that import a data-fetching library", JS_SQL.dataLibraries, 20) })
            w.section("Do drawing, state and data stay apart?", has.links(f), () => layering(w, "react", ["components", "data", "Components and Data & Clients"]))
            w.section("Hotspots", needs.git(f), () => { hotspots(w, "files"); slotOf(w, "figure", "Hotspots by directory", VIEWS.treemap("hotspots", "directories", "Hotspots, directories")) })
            w.section("Code health", needs.health(f), () => health(w, "files", 10))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above: folders to reorganise, hooks to stabilise, and data fetching to bring together."))
        },
    },
    {
        id: "vue-review",
        name: "Vue front end review",
        audience: "A front-end team",
        summary: "A tour of a Vue or Nuxt front end: its pages, components, composables and stores and where each lives, the components shared across features and the ones nothing uses, the largest components, where data is fetched from the server, whether drawing, state and data access stay apart, which files change most, and how easy the code is to work in.",
        when: "Use it when a Vue front end has grown and features, shared UI and state have started to mix, or to explain the front end to new developers.",
        ecosystem: "vue",
        title: ws => `Front end review: ${ws}`,
        build(w) {
            const f = w.facts
            const components = has.marker(f, "the scan found no .vue components (a snapshot from before Vue was read needs a rescan)", "filename:vue_component")
            w.prompt("What the front end does, and what this review should settle.")
            w.section("The front end", true, () => { w.explain(EXPLAIN.vue).reading("node") })
            w.section("Roles in the code", has.units(f), () => anatomy(w, "vue", FRONT_END))
            w.section("Pages, components and composables by folder", components, () => {
                w.sql("Folders by pages, components and composables", VUE_SQL.folders(f), 25)
                role(w, "pages", "vue", FRONT_END)
                w.prompt("Are the folders organised by feature (checkout, profile) or by kind (components, composables)? Which folders are shared UI, and which belong to one feature?")
            })
            w.section("Shared components", components === true ? has.links(f) : components, () => { w.explain(EXPLAIN.vueShared); role(w, "components", "vue", FRONT_END); w.sql("Components used outside their own folder", VUE_SQL.shared, 20) })
            w.section("The largest components", components, () => w.sql("Components, the largest first", VUE_SQL.largest(f), 20))
            w.section("Components nothing uses", components === true ? has.links(f) : components, () => { w.explain(EXPLAIN.vueUnused); w.sql("Components no other code uses", VUE_SQL.unused(f), 20) })
            w.section("Shared composables", has.links(f), () => { w.explain(EXPLAIN.vueComposables); role(w, "composables", "vue", FRONT_END); w.sql("Composables used outside their own folder", VUE_SQL.sharedComposables, 20) })
            w.section("Stores", needs.snippets(f), () => { w.explain(EXPLAIN.vueStores); w.sql("Store files, the most imported first", VUE_SQL.stores(f), 20) })
            w.section("Where data is fetched", needs.snippets(f), () => { w.explain(EXPLAIN.reactData); role(w, "data", "vue", FRONT_END); w.sql("Folders that import a data-fetching library", JS_SQL.dataLibraries, 20) })
            w.section("Do drawing, state and data stay apart?", has.links(f), () => layering(w, "vue", ["components", "composables", "Components and Composables"], FRONT_END))
            w.section("Hotspots", needs.git(f), () => { hotspots(w, "files"); slotOf(w, "figure", "Hotspots by directory", VIEWS.treemap("hotspots", "directories", "Hotspots, directories")) })
            w.section("Code health", needs.health(f), () => health(w, "files", 10))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above: folders to reorganise, shared components and stores to stabilise, unused components to delete, and data fetching to bring together."))
        },
    },
]

// ── Go ────────────────────────────────────────────────────────────────────

const GO: ReportTemplate[] = [
    {
        id: "go-review",
        name: "Go module review",
        audience: "A Go team",
        summary: "A tour of Go code: its packages and how much each exports, which internal packages exist and who imports them, the structs that cross a boundary (JSON, database, configuration), build constraints and embedded files, the packages everything imports, and dependency rules and libraries.",
        when: "Use it for a general health check of Go code, before reorganising its packages, or to explain its layout to new developers.",
        ecosystem: "go",
        title: ws => `Go review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the module does, and what this review should settle.")
            w.section("Modules and packages", true, () => { glance(w); w.explain(EXPLAIN.go).reading("go"); if (f.moduleKinds.go) w.sql("Modules", SQL.modulesOf("go"), 30) })
            w.section("What each package holds", has.markers(f), () => { w.sql("Packages: types, functions and what they export", GO_SQL.packages(f), 30); anatomy(w, "", "go") })
            w.section("The packages everything imports", true, () => {
                w.sql("Packages by how many others import them", GO_SQL.fanIn, 15)
                coupling(w, 0, "go")
                structure(w, "graph")
            })
            w.section("Structs that cross a boundary", has.marker(f, "no struct carries a tag", "struct_tag:json", "struct_tag:db", "struct_tag:yaml", "struct_tag:form", "struct_tag:xml", "struct_tag:toml", "struct_tag:mapstructure", "struct_tag:gorm"), () => {
                w.explain(EXPLAIN.goTags)
                w.sql("Tagged structs by package", GO_SQL.tagsByPackage(f), 20)
                w.sql("Structs tagged for the most formats", GO_SQL.tagged(f), 15)
            })
            w.section("Build constraints and embedded files", has.marker(f, "no file carries a build constraint or embed", "directive:build", "directive:embed", "directive:generate"), () => { w.explain(EXPLAIN.goDirectives); w.sql("Directives by package", GO_SQL.directives(f), 20) })
            w.section("Dependency rules", needs.rules(f), () => rules(w))
            w.section("Libraries", needs.snippets(f), () => libraries(w, false, "go"))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above: packages that export too much, internal packages reached from the wrong place, and structs whose fields others rely on."))
        },
    },
]

// ── .NET ──────────────────────────────────────────────────────────────────

const DOTNET: ReportTemplate[] = [
    {
        id: "dotnet-review",
        name: ".NET solution review",
        audience: "A .NET team",
        summary: "A tour of a .NET solution: its projects and which ones everything references, what each project holds (controllers, services, factories, data access, models, validators), the largest controllers, how the roles reference each other, the namespaces' imports, dependency rules and hotspots.",
        when: "Use it for a general health check of a .NET solution, before reorganising its projects, or to explain the solution to new developers.",
        ecosystem: "dotnet",
        title: ws => `.NET review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the solution does, and what this review should settle.")
            w.section("The solution at a glance", true, () => { glance(w); w.explain(EXPLAIN.dotnet).reading("dotnet") })
            w.section("Projects and their references", has.moduleKind(f, "dotnet", "the code has no .csproj files"), () => w.sql("Projects, the most referenced first", DOTNET_SQL.projects, 40))
            w.section("What each project holds", true, () => w.sql("Projects by the roles their file names give away", DOTNET_SQL.roles(f), 40))
            w.section("Controllers", true, () => { w.sql("The largest controllers", DOTNET_SQL.controllers(f), 15); w.prompt("Are controllers thin (they hand work to services) or do they hold the logic themselves?") })
            w.section("Roles and layers", has.units(f), () => { anatomy(w, "aspnet"); layering(w, "aspnet") })
            w.section("Between namespaces", true, () => { structure(w, "stack"); coupling(w) })
            w.section("Dependency rules", needs.rules(f), () => rules(w))
            w.section("Hotspots", needs.git(f), () => hotspots(w))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
]

// ── PHP ───────────────────────────────────────────────────────────────────

const PHP: ReportTemplate[] = [
    {
        id: "php-review",
        name: "PHP application review",
        audience: "A Symfony, Laravel or PHP team",
        summary: "A tour of a PHP application: its Composer packages and what each holds (controllers, entities, repositories, form types, handlers, subscribers, validators), how the packages use each other, how the roles reference each other, the libraries it relies on, and where complicated code keeps changing.",
        when: "Use it for a general health check of a PHP application, before reorganising its packages or bundles, or to explain it to new developers.",
        ecosystem: "php",
        title: ws => `PHP review: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("What the application does, and what this review should settle.")
            w.section("The application at a glance", true, () => { glance(w); w.explain(EXPLAIN.php).reading("php"); if (f.moduleKinds.composer) w.sql("Composer packages", SQL.modulesOf("composer"), 30) })
            w.section("What each package holds", has.markers(f), () => w.sql("Packages by role", PHP_SQL.packages(f), 30))
            w.section("Roles and layers", has.units(f), () => { anatomy(w, ""); layering(w, "") })
            w.section("How the packages use each other", has.links(f), () => w.sql("Package to package, by references", PHP_SQL.crossPackage(f), 30))
            w.section("Between namespaces", true, () => { structure(w); coupling(w) })
            w.section("Dependency rules", needs.rules(f), () => rules(w))
            w.section("Libraries", needs.snippets(f), () => libraries(w, false))
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Findings", true, () => w.prompt("What you found, each tied to the evidence above."))
        },
    },
    {
        id: "symfony-bundles",
        name: "Symfony bundle review",
        audience: "Symfony applications and bundles",
        summary: "Looks at a Symfony application bundle by bundle: what each registers (DI extensions and compiler passes, event subscribers, form types, controllers), and how much each one changes the rest of the application.",
        when: "Use it when bundles have grown hard to reason about, before extracting a bundle, or when behaviour changes in one place for reasons set in another.",
        ecosystem: "php",
        title: ws => `Symfony bundles: ${ws}`,
        build(w) {
            const f = w.facts
            w.prompt("Why the bundles are being looked at.")
            w.section("Bundles and what they register", has.markers(f), () => { w.explain(EXPLAIN.phpBundles); w.sql("Bundles by what they register", PHP_SQL.bundles(f), 30) })
            w.section("How the packages use each other", has.links(f), () => { w.sql("Package to package, by references", PHP_SQL.crossPackage(f), 30); slotOf(w, "table", "Dependency matrix", VIEWS.matrix(f)) })
            w.section("Findings", true, () => w.prompt("Bundles that do too much, subscribers that change behaviour far from their bundle, and what you would move."))
        },
    },
]

export const ECOSYSTEM: ReportTemplate[] = [...SPRING, ...PYTHON, ...WEBAPPS, ...GO, ...DOTNET, ...PHP]
