// Templates for one framework or build tool. The general templates describe
// any codebase; these describe what that framework makes of it: a Spring
// application's controllers, services, repositories and entities, a Django
// project's apps, a Go module's packages and their public API. The roles come
// from the Classes view's framework profiles (anatomy.ts), the details from
// the markers the scan put on each class and function: annotations, base
// types, file names, struct tags and directives.

import { prodFile, reactComponent, type EcosystemId, type SnapshotFacts } from "./readings"
import {
    ABOUT, coupling, glance, health, hotspots, lanes, libraries, lit, modules, needs, rules, slotOf, SQL, structure, tests, VIEWS,
    type ReportTemplate, type Writer,
} from "./templateKit"
import { t } from "~/shared/i18n"

// ── What the framework sections need ──────────────────────────────────────

const has = {
    units: (f: SnapshotFacts): true | string => (f.tables.has("units") ? true : t("reports.ecosystemTemplates.snapshotPredatesClassesFunctions")),
    /** Units and the markers on them: annotations, base types, file names, tags. */
    markers: (f: SnapshotFacts): true | string => (f.tables.has("units") && f.tables.has("unit_markers") ? true : t("reports.ecosystemTemplates.snapshotDoesNotRecord")),
    links: (f: SnapshotFacts): true | string => (f.tables.has("units") && f.tables.has("unit_connections") && f.tables.has("unit_markers") ? true : t("reports.ecosystemTemplates.snapshotDoesNotRecord2")),
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
        phpRole(t("reports.ecosystemTemplates.entitiesModels"), `(${ann(["Entity", "Embeddable", "ORM"])} OR ${sup(["ResourceInterface", "Model", "Authenticatable"])} OR (u.file LIKE '%/Model/%' AND u.id NOT IN ${marked("supertype", ["interface"])}) OR u.name LIKE '%Entity')`),
        phpRole("repositories", `(u.name LIKE '%Repository' OR ${sup(["EntityRepository", "RepositoryInterface", "ServiceEntityRepository"])})`),
        phpRole(t("reports.ecosystemTemplates.formTypes"), sup(["AbstractType", "AbstractResourceType", "AbstractTypeExtension", "FormRequest"])),
        phpRole(t("reports.ecosystemTemplates.messageCommandHandlers"), `(${ann(["AsMessageHandler", "AsCommand"])} OR u.name LIKE '%Handler' OR ${sup(["Command", "Job"])})`),
        phpRole(t("reports.ecosystemTemplates.eventSubscribersListeners"), `(${ann(["AsEventListener"])} OR ${sup(["EventSubscriberInterface"])} OR u.name LIKE '%Listener' OR u.name LIKE '%Subscriber')`),
        phpRole("validators", sup(["ConstraintValidator", "Constraint"])),
    ].join(", ")} FROM units u WHERE u.kind = 'type' AND coalesce(u.owner, '') = '' AND u.file LIKE '%.php' AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
    crossPackage: (f: SnapshotFacts) => `SELECT u.a AS package, u.b AS "uses code from", u.refs AS "references", u.files AS "files" FROM (${moduleUse(f)}) u ORDER BY 3 DESC, 1, 2`,
    bundles: (f: SnapshotFacts) => `SELECT CASE WHEN instr(u.component, '\\Bundle\\') > 0 THEN substr(substr(u.component, instr(u.component, '\\Bundle\\') + 8), 1, instr(substr(u.component, instr(u.component, '\\Bundle\\') + 8) || '\\', '\\') - 1) ELSE substr(u.component, 1, instr(u.component || '\\', 'Bundle\\') + 5) END AS bundle, count(DISTINCT u.id) AS classes, ${[
        phpRole(t("reports.ecosystemTemplates.diExtensionsCompilerPasses"), sup(["Extension", "CompilerPassInterface", "ConfigurationInterface", "AbstractExtension", "Bundle", "AbstractBundle"])),
        phpRole(t("reports.ecosystemTemplates.eventSubscribers"), `(${sup(["EventSubscriberInterface"])} OR ${ann(["AsEventListener"])})`),
        phpRole(t("reports.ecosystemTemplates.formTypes"), sup(["AbstractType", "AbstractResourceType", "AbstractTypeExtension"])),
        phpRole("controllers", `(u.name LIKE '%Controller' OR u.name LIKE '%Action')`),
    ].join(", ")} FROM units u WHERE u.component LIKE '%Bundle\\%' AND u.kind = 'type' AND coalesce(u.owner, '') = '' AND u.file IN ${PROD(f)} GROUP BY 1 ORDER BY 2 DESC, 1`,
}

// ── Explanations ──────────────────────────────────────────────────────────

const EXPLAIN = {
    layers: t("reports.ecosystemTemplates.mostFrameworksExpectWork"),

    spring: t("reports.ecosystemTemplates.springCreatesApplicationS"),
    springWeb: t("reports.ecosystemTemplates.webLayerWhereRequests"),
    springShortcuts: t("reports.ecosystemTemplates.theseEntryPointsUse"),
    springServices: t("reports.ecosystemTemplates.servicesHoldBusinessLogic"),
    springRepos: t("reports.ecosystemTemplates.repositoriesShouldOnlyCode"),
    springSwitches: t("reports.ecosystemTemplates.someBeansExistOnly"),
    springBackwards: t("reports.ecosystemTemplates.theseRepositoriesEntitiesUse"),
    entities: t("reports.ecosystemTemplates.entityClassJpaMaps"),
    entityHierarchy: t("reports.ecosystemTemplates.jpaEntitiesCanExtend"),

    build: t("reports.ecosystemTemplates.multiModuleBuildSplits"),
    drift: t("reports.ecosystemTemplates.firstTableComparesWhat"),

    django: t("reports.ecosystemTemplates.djangoProjectMadeApps"),
    djangoCross: t("reports.ecosystemTemplates.appUsesAnotherApp"),
    djangoMigrations: t("reports.ecosystemTemplates.everyChangeModelAdds"),

    python: t("reports.ecosystemTemplates.hereComponentPythonPackage"),

    node: t("reports.ecosystemTemplates.javascriptTypescriptWorkspaceOften"),
    react: "In a React codebase the word *component* means two things. A *React component* is a function that draws part of the page, named in capitals like `UserMenu`. A component in this report is a folder, which can hold many React components.\n\n*Hooks* (functions named `useSomething`) hold reusable state and behaviour, and *data clients* fetch from a server. A healthy front end keeps drawing, state and data fetching apart, so that each can change without the others.",
    reactHooks: t("reports.ecosystemTemplates.hookUsedManyFolders"),
    vue: t("reports.ecosystemTemplates.vueCodebaseWordComponent"),
    vueShared: t("reports.ecosystemTemplates.componentUsedManyFolders"),
    vueUnused: t("reports.ecosystemTemplates.theseComponentsNotPages"),
    vueComposables: "A *composable* is a function named `useSomething` that packages state and behaviour for components to share: `useFetch`, `useSelection`. One used from many folders is shared infrastructure, and a change to it changes every screen that calls it. The table lists the composables used outside the folder they are declared in, the most widely shared first.",
    vueStores: t("reports.ecosystemTemplates.storeHoldsStateOutlives"),
    reactData: t("reports.ecosystemTemplates.theseFoldersImportData"),

    go: t("reports.ecosystemTemplates.goComponentPackageOne"),
    goTags: t("reports.ecosystemTemplates.structTagSuchJson"),
    goDirectives: t("reports.ecosystemTemplates.buildConstraintsGoBuild"),

    dotnet: t("reports.ecosystemTemplates.netSolutionMadeProjects"),

    php: t("reports.ecosystemTemplates.phpCodeOrganisedNamespaces"),
    phpBundles: t("reports.ecosystemTemplates.symfonyBundlePluginRegisters"),
}

// ── Sections several framework templates share ────────────────────────────

/** What marks a role in each ecosystem, for the roles explanation. */
const ROLE_EXAMPLES: Partial<Record<EcosystemId, string>> = {
    spring: t("reports.ecosystemTemplates.classMarkedServiceService"),
    jvm: t("reports.ecosystemTemplates.classMarkedEntityHolds"),
    django: "a class extending `models.Model` is a model, and a function in `views.py` is a view",
    python: "a class extending Pydantic's `BaseModel` is a schema, and a function decorated with `@app.get` answers a request",
    react: "a function named in Pascal case in a `.tsx` file, such as `UserMenu`, is a component, and one named like `useCart` is a hook",
    vue: "every `.vue` file is a component, one under `pages/` or `layouts/` is a page, and a function named like `useCart` is a composable",
    node: t("reports.ecosystemTemplates.classDecoratedControllerAnswers"),
    go: t("reports.ecosystemTemplates.structJsonTagsModel"),
    dotnet: t("reports.ecosystemTemplates.classExtendingControllerbaseController"),
    php: t("reports.ecosystemTemplates.classRouteAttributeController"),
}
function rolesAbout(eco: EcosystemId | ""): string {
    const ex = eco ? ROLE_EXAMPLES[eco] : undefined
    return t("reports.ecosystemTemplates.frameworksGiveClassesJobs", { value: ex ? t("reports.ecosystemTemplates.example", { ex }) : "" })
}
function anatomy(w: Writer, profile: string, language?: string) {
    w.explain(rolesAbout(w.eco)).reading("roles", { profile, ...(language ? { language } : {}) })
    lanes(w)
}
/** What skipping and running back up look like, in the framework's own words. */
const LAYER_EXAMPLES: Record<string, string> = {
    spring: t("reports.ecosystemTemplates.springControllerCallingRepository"),
    django: t("reports.ecosystemTemplates.djangoViewReadingModel"),
    react: t("reports.ecosystemTemplates.reactComponentCallingData"),
    vue: t("reports.ecosystemTemplates.vuePageCallingData"),
    aspnet: t("reports.ecosystemTemplates.aspNetControllerUsing"),
    symfony: t("reports.ecosystemTemplates.symfonyControllerUsingRepository"),
    "": t("reports.ecosystemTemplates.exampleEntryPointCalling"),
}
function layering(w: Writer, profile: string, flow?: [string, string, string], language?: string) {
    w.explain(`${EXPLAIN.layers} ${LAYER_EXAMPLES[profile] ?? LAYER_EXAMPLES[""]}`).reading("layers", { profile, ...(language ? { language } : {}) })
    if (flow) slotOf(w, "figure", t("reports.ecosystemTemplates.howRelate", { value: flow[2] }), VIEWS.flow(flow[0], flow[1], t("reports.ecosystemTemplates.boundaryBetween", { value: flow[2] })))
}
const role = (w: Writer, lane: string, profile: string, language?: string) => w.reading("role", { lane, profile, ...(language ? { language } : {}) })

// ── Spring and the JVM ────────────────────────────────────────────────────

const SPRING: ReportTemplate[] = [
    {
        id: "spring-review",
        name: t("reports.ecosystemTemplates.springApplicationReview"),
        audience: t("reports.ecosystemTemplates.springTeamArchitects"),
        summary: t("reports.ecosystemTemplates.fullTourSpringApplication"),
        when: t("reports.ecosystemTemplates.useWhenSpringApplication"),
        ecosystem: "spring",
        title: ws => t("reports.ecosystemTemplates.springReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whatApplicationDoesWho"))
            w.section(t("reports.ecosystemTemplates.applicationGlance"), true, () => { glance(w); w.explain(EXPLAIN.spring).reading("spring") })
            w.section(t("reports.ecosystemTemplates.rolesCode"), has.units(f), () => anatomy(w, "spring"))
            w.section(t("reports.ecosystemTemplates.webLayerHowControllers"), has.marker(f, t("reports.ecosystemTemplates.codeHasNoControllers"), "annotation:Controller", "annotation:RestController", "annotation:Path"), () => {
                w.explain(EXPLAIN.springWeb)
                role(w, "controllers", "spring")
                w.sql(t("reports.ecosystemTemplates.webEntryPointsPackage"), SPRING_SQL.webByPackage(f), 20)
                w.sql(t("reports.ecosystemTemplates.everyWebEntryPoint"), SPRING_SQL.web(f), 25)
                w.prompt(t("reports.ecosystemTemplates.webLayerSplitResource"))
            })
            w.section(t("reports.ecosystemTemplates.servicesWhereBusinessLogic"), has.units(f), () => {
                w.explain(EXPLAIN.springServices)
                role(w, "services", "spring")
                if (f.markers.has("annotation:Transactional")) w.sql(t("reports.ecosystemTemplates.whereTransactionalSits"), SPRING_SQL.transactional(f), 10)
            })
            w.section(t("reports.ecosystemTemplates.repositoriesEntityModel"), has.marker(f, t("reports.ecosystemTemplates.codeHasNoJpa"), "annotation:Entity"), () => {
                w.explain(EXPLAIN.springRepos)
                role(w, "repositories", "spring")
                w.explain(EXPLAIN.entities)
                role(w, "entities", "spring")
                w.sql(t("reports.ecosystemTemplates.entitiesPackage"), SPRING_SQL.entitiesByPackage(f), 20)
                w.sql(t("reports.ecosystemTemplates.entitiesMostUsedFirst"), SPRING_SQL.entities(f), 20)
                w.prompt(t("reports.ecosystemTemplates.whichEntitiesHeartModel"))
            })
            w.section(t("reports.ecosystemTemplates.doLayersHold"), has.links(f), () => {
                layering(w, "spring", ["controllers", "services", t("reports.ecosystemTemplates.controllersServices")])
                w.explain(EXPLAIN.springShortcuts)
                w.sql(t("reports.ecosystemTemplates.entryPointsSkipServices"), SPRING_SQL.shortcuts, 20)
                w.explain(EXPLAIN.springBackwards)
                w.sql(t("reports.ecosystemTemplates.repositoriesEntitiesReachUp"), SPRING_SQL.backwards, 20)
            })
            w.section(t("reports.ecosystemTemplates.beansSwitchOff"), has.marker(f, t("reports.ecosystemTemplates.noBeanConditional"), "annotation:ConditionalOnProperty", "annotation:Profile", "annotation:ConditionalOnMissingBean", "annotation:Conditional", "annotation:ConditionalOnClass", "annotation:ConditionalOnBean"), () => {
                w.explain(EXPLAIN.springSwitches)
                w.sql(t("reports.ecosystemTemplates.conditionalBeans"), SPRING_SQL.switches(f), 30)
            })
            w.section(t("reports.ecosystemTemplates.buildModules"), needs.modules(f), () => modules(w))
            w.section("Hotspots", needs.git(f), () => { hotspots(w); slotOf(w, "figure", t("reports.ecosystemTemplates.churnAgainstCodeHealth"), VIEWS.treemap("churn", "components", t("reports.ecosystemTemplates.churnAgainstHealthComponents"))) })
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach")))
        },
    },
    {
        id: "spring-layering",
        name: t("reports.ecosystemTemplates.springLayeringCheck"),
        audience: t("reports.ecosystemTemplates.keepingSpringAppLayered"),
        summary: t("reports.ecosystemTemplates.checksOneQuestionDepth"),
        when: t("reports.ecosystemTemplates.useBeforeAddingDependency"),
        ecosystem: "spring",
        title: ws => t("reports.ecosystemTemplates.springLayering", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.layeringTeamIntendsSentence"))
            w.section(t("reports.ecosystemTemplates.roles"), has.units(f), () => anatomy(w, "spring"))
            w.section(t("reports.ecosystemTemplates.referencesBetweenLayers"), has.links(f), () => {
                layering(w, "spring", ["services", "repositories", t("reports.ecosystemTemplates.servicesRepositories")])
                slotOf(w, "table", t("reports.ecosystemTemplates.dependencyMatrix"), VIEWS.matrix(f))
            })
            w.section(t("reports.ecosystemTemplates.entryPointsSkipServices"), has.links(f), () => { w.explain(EXPLAIN.springShortcuts); w.sql(t("reports.ecosystemTemplates.entryPointsUsingRepositories"), SPRING_SQL.shortcuts, 30) })
            w.section(t("reports.ecosystemTemplates.lowerLayersReachingUp"), has.links(f), () => { w.explain(EXPLAIN.springBackwards); w.sql(t("reports.ecosystemTemplates.repositoriesEntitiesUseServices"), SPRING_SQL.backwards, 30) })
            w.section(t("reports.ecosystemTemplates.transactionBoundaries"), has.marker(f, t("reports.ecosystemTemplates.noClassMarkedTransactional"), "annotation:Transactional"), () => { w.explain(EXPLAIN.springServices); w.sql(t("reports.ecosystemTemplates.whereTransactionalSits"), SPRING_SQL.transactional(f), 10) })
            w.section(t("reports.ecosystemTemplates.dependencyRules"), needs.rules(f), () => rules(w))
            w.section(t("reports.ecosystemTemplates.whatFixHowKeep"), true, () => w.prompt(t("reports.ecosystemTemplates.referencesMoveFirstDependency")))
        },
    },
    {
        id: "jpa-model",
        name: t("reports.ecosystemTemplates.jpaEntityModel"),
        audience: t("reports.ecosystemTemplates.dataModelJvmApp"),
        summary: t("reports.ecosystemTemplates.describesPersistentDataModel"),
        when: t("reports.ecosystemTemplates.useBeforeDatabaseMigration"),
        ecosystem: "spring",
        title: ws => t("reports.ecosystemTemplates.entityModel", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whyDataModelBeing"))
            w.section(t("reports.ecosystemTemplates.entities"), has.marker(f, t("reports.ecosystemTemplates.codeHasNoJpa"), "annotation:Entity"), () => {
                w.explain(EXPLAIN.entities)
                role(w, "entities", "spring")
                w.sql(t("reports.ecosystemTemplates.entitiesPackage"), SPRING_SQL.entitiesByPackage(f), 20)
                w.sql(t("reports.ecosystemTemplates.entitiesMostUsedFirst"), SPRING_SQL.entities(f), 25)
            })
            w.section(t("reports.ecosystemTemplates.howEntitiesReferEach"), needs.all(has.marker(f, t("reports.ecosystemTemplates.codeHasNoJpa"), "annotation:Entity"), has.links(f)), () => {
                w.sql(t("reports.ecosystemTemplates.entitiesMostLinksOther"), SPRING_SQL.entityLinks, 20)
                slotOf(w, "figure", t("reports.ecosystemTemplates.repositoriesEntities"), VIEWS.flow("repositories", "entities", t("reports.ecosystemTemplates.boundaryBetweenRepositoriesEntities")))
                w.prompt(t("reports.ecosystemTemplates.whereNaturalAggregatesGroups"))
            })
            w.section(t("reports.ecosystemTemplates.entitiesSavedThroughAnother"), needs.all(has.marker(f, t("reports.ecosystemTemplates.codeHasNoJpa"), "annotation:Entity"), has.links(f)), () => w.sql(t("reports.ecosystemTemplates.entitiesNoRepositoryUses"), SPRING_SQL.orphans(f), 25))
            w.section("Inheritance", has.marker(f, t("reports.ecosystemTemplates.noEntityExtendsAnother"), "annotation:Inheritance", "annotation:MappedSuperclass"), () => { w.explain(EXPLAIN.entityHierarchy); w.sql(t("reports.ecosystemTemplates.entitiesExtendAnotherEntity"), SPRING_SQL.hierarchy, 30) })
            w.section(t("reports.ecosystemTemplates.entitiesWebLayerTouches"), needs.all(has.marker(f, t("reports.ecosystemTemplates.codeHasNoJpa"), "annotation:Entity"), has.links(f)), () => w.sql(t("reports.ecosystemTemplates.entitiesUsedControllersResources"), SPRING_SQL.touchedByWeb, 20))
            w.section(t("reports.ecosystemTemplates.whatMeans"), true, () => w.prompt(t("reports.ecosystemTemplates.whatModelSaysAbout")))
        },
    },
    {
        id: "jvm-build",
        name: t("reports.ecosystemTemplates.multiModuleBuildReview"),
        audience: t("reports.ecosystemTemplates.mavenGradleBuilds"),
        summary: t("reports.ecosystemTemplates.comparesModulesMavenGradle"),
        when: t("reports.ecosystemTemplates.useWhenBuildSlow"),
        ecosystem: "jvm",
        title: ws => t("reports.ecosystemTemplates.buildReview", { ws }),
        build(w) {
            const f = w.facts
            const kind = (f.moduleKinds.maven ?? 0) >= (f.moduleKinds.gradle ?? 0) ? "maven" : "gradle"
            w.prompt(t("reports.ecosystemTemplates.whyModuleLayoutBeing"))
            w.section("Modules", needs.modules(f), () => { w.explain(EXPLAIN.build).reading("modules"); w.sql(t("reports.ecosystemTemplates.modulesMostDependedFirst"), BUILD_SQL.usedBy(kind), 40) })
            w.section(t("reports.ecosystemTemplates.howModulesUseEach"), has.links(f), () => {
                w.explain(kind === "maven" ? EXPLAIN.drift : t("reports.ecosystemTemplates.tableCountsReferencesOne"))
                w.sql(t("reports.ecosystemTemplates.moduleModuleReferences"), BUILD_SQL.use(f, kind === "maven" ? "maven" : null), 40)
            })
            w.section(t("reports.ecosystemTemplates.howCodeConnects"), true, () => { structure(w); coupling(w) })
            w.section(t("reports.ecosystemTemplates.dependencyRules"), needs.rules(f), () => rules(w))
            w.section("Proposal", true, () => w.prompt(t("reports.ecosystemTemplates.modulesMergeSplitPoint")))
        },
    },
    {
        id: "module-drift",
        name: t("reports.ecosystemTemplates.moduleDriftCheck"),
        audience: t("reports.ecosystemTemplates.mavenBuildHygiene"),
        summary: t("reports.ecosystemTemplates.listsWhereMavenBuild"),
        when: t("reports.ecosystemTemplates.useBeforeUpgradingSplitting"),
        ecosystem: "jvm",
        title: ws => t("reports.ecosystemTemplates.moduleDrift", { ws }),
        build(w) {
            const f = w.facts
            const maven = has.moduleKind(f, "maven", t("reports.ecosystemTemplates.buildNotMavenScan"))
            w.prompt(t("reports.ecosystemTemplates.whatPromptedCheckBroken"))
            w.section(t("reports.ecosystemTemplates.usedButNotDeclared"), needs.all(maven, has.links(f)), () => { w.explain(EXPLAIN.drift); w.sql(t("reports.ecosystemTemplates.modulesUsingCodeThey"), BUILD_SQL.undeclared(f, "maven"), 40) })
            w.section(t("reports.ecosystemTemplates.declaredButNotUsed"), needs.all(maven, has.links(f)), () => w.sql(t("reports.ecosystemTemplates.declaredDependenciesWhoseCode"), BUILD_SQL.unused(f, "maven"), 40))
            w.section(t("reports.ecosystemTemplates.changesMake"), true, () => w.prompt(t("reports.ecosystemTemplates.declarationsAddRemoveModule")))
        },
    },
]

// ── Python ────────────────────────────────────────────────────────────────

const PYTHON: ReportTemplate[] = [
    {
        id: "django-review",
        name: t("reports.ecosystemTemplates.djangoProjectReview"),
        audience: t("reports.ecosystemTemplates.djangoTeam"),
        summary: t("reports.ecosystemTemplates.tourDjangoProjectApps"),
        when: t("reports.ecosystemTemplates.useWhenDjangoProject"),
        ecosystem: "django",
        title: ws => t("reports.ecosystemTemplates.djangoReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whatProjectDoesWhat"))
            w.section(t("reports.ecosystemTemplates.projectGlance"), true, () => { glance(w); w.explain(EXPLAIN.django).reading("django") })
            w.section(t("reports.ecosystemTemplates.apps"), needs.all(needs.modules(f), has.markers(f)), () => { w.sql(t("reports.ecosystemTemplates.appsWhatTheyHold"), DJANGO_SQL.apps(f), 40); w.prompt(t("reports.ecosystemTemplates.whichAppsCoreProduct")) })
            w.section(t("reports.ecosystemTemplates.rolesCode"), has.units(f), () => anatomy(w, "django"))
            w.section(t("reports.ecosystemTemplates.howAppsDependEach"), has.links(f), () => {
                w.explain(EXPLAIN.djangoCross)
                w.sql(t("reports.ecosystemTemplates.appAppReferences"), DJANGO_SQL.crossApp(f), 30)
                slotOf(w, "figure", t("reports.ecosystemTemplates.appsTheirImports"), VIEWS.chord)
                w.prompt(t("reports.ecosystemTemplates.whichAppsMeantReusable"))
            })
            w.section(t("reports.ecosystemTemplates.viewsModels"), has.units(f), () => {
                role(w, "views", "django")
                w.sql(t("reports.ecosystemTemplates.largestViewFiles"), DJANGO_SQL.bigFiles(f, "views"), 10)
                role(w, "models", "django")
                w.sql(t("reports.ecosystemTemplates.largestModelFiles"), DJANGO_SQL.bigFiles(f, "models"), 10)
            })
            w.section("Migrations", true, () => { w.explain(EXPLAIN.djangoMigrations); w.sql(t("reports.ecosystemTemplates.migrationsPerApp"), DJANGO_SQL.migrations, 20) })
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section(t("reports.ecosystemTemplates.healthTests"), needs.health(f), () => { health(w, null); if (f.fileColumns.has("role")) tests(w) })
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach2")))
        },
    },
    {
        id: "django-apps",
        name: t("reports.ecosystemTemplates.djangoAppBoundaries"),
        audience: t("reports.ecosystemTemplates.splittingReusingDjangoApps"),
        summary: t("reports.ecosystemTemplates.focusesLinesBetweenApps"),
        when: t("reports.ecosystemTemplates.useBeforeExtractingApp"),
        ecosystem: "django",
        title: ws => t("reports.ecosystemTemplates.djangoAppBoundaries2", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.changeYouConsideringWhich"))
            w.section(t("reports.ecosystemTemplates.apps"), needs.all(needs.modules(f), has.markers(f)), () => { w.explain(EXPLAIN.django); w.sql(t("reports.ecosystemTemplates.appsWhatTheyHold"), DJANGO_SQL.apps(f), 40) })
            w.section(t("reports.ecosystemTemplates.appsUseOtherApps"), has.links(f), () => { w.explain(EXPLAIN.djangoCross); w.sql(t("reports.ecosystemTemplates.appAppReferences"), DJANGO_SQL.crossApp(f), 40); slotOf(w, "table", t("reports.ecosystemTemplates.dependencyMatrix"), VIEWS.matrix(f)) })
            w.section(t("reports.ecosystemTemplates.appsNothingElseUses"), has.links(f), () => w.sql(t("reports.ecosystemTemplates.appsNoOtherApp"), DJANGO_SQL.lonely, 30))
            w.section(t("reports.ecosystemTemplates.circularDependencies"), needs.tangles(f), () => { structure(w, false); w.sql("Tangles", SQL.tangles, 10) })
            w.section(t("reports.ecosystemTemplates.boundariesYouPropose"), true, () => w.prompt(t("reports.ecosystemTemplates.perAppKeepMerge")))
        },
    },
    {
        id: "python-review",
        name: t("reports.ecosystemTemplates.pythonCodebaseReview"),
        audience: t("reports.ecosystemTemplates.pythonTeam"),
        summary: t("reports.ecosystemTemplates.reviewPythonCodebasePackages"),
        when: t("reports.ecosystemTemplates.useGeneralHealthCheck"),
        ecosystem: "python",
        title: ws => t("reports.ecosystemTemplates.pythonReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whatCodeDoesWhat"))
            w.section(t("reports.ecosystemTemplates.code"), true, () => { w.explain(`${ABOUT.size} ${EXPLAIN.python}`).reading("size", { language: t("reports.ecosystemTemplates.python") }) })
            w.section("Packages", has.units(f), () => { w.sql(t("reports.ecosystemTemplates.packagesLargestFirst"), PYTHON_SQL.packages(f), 25); anatomy(w, "", "python") })
            w.section(t("reports.ecosystemTemplates.requestHandlers"), has.marker(f, "no function carries a route decorator", "annotation:get", "annotation:post", "annotation:route", "annotation:put", "annotation:delete"), () => w.sql(t("reports.ecosystemTemplates.requestHandlersPackage"), PYTHON_SQL.routes(f), 20))
            w.section(t("reports.ecosystemTemplates.dataClasses"), has.marker(f, t("reports.ecosystemTemplates.noPydanticModelsDataclasses"), "supertype:BaseModel", "annotation:dataclass", "supertype:TypedDict"), () => w.sql(t("reports.ecosystemTemplates.pydanticModelsDataclassesPackage"), PYTHON_SQL.schemas(f), 20))
            w.section(t("reports.ecosystemTemplates.importsBetweenPackages"), true, () => { structure(w); coupling(w, 0, "py") })
            w.section(t("reports.ecosystemTemplates.thirdPartyLibraries"), needs.snippets(f), () => libraries(w))
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Tests", needs.tests(f), () => tests(w))
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach3")))
        },
    },
]

// ── JavaScript and TypeScript ─────────────────────────────────────────────

const WEBAPPS: ReportTemplate[] = [
    {
        id: "node-review",
        name: t("reports.ecosystemTemplates.javascriptTypescriptWorkspaceReview"),
        audience: t("reports.ecosystemTemplates.webNodeTeam"),
        summary: t("reports.ecosystemTemplates.reviewJavascriptTypescriptWorkspace"),
        when: t("reports.ecosystemTemplates.useGeneralHealthCheck2"),
        ecosystem: "node",
        title: ws => t("reports.ecosystemTemplates.workspaceReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whatWorkspaceShipsWhat"))
            w.section(t("reports.ecosystemTemplates.workspace"), true, () => { w.explain(`${ABOUT.size} ${EXPLAIN.node}`).reading("size"); w.reading("node") })
            w.section("Packages", has.moduleKind(f, "node", t("reports.ecosystemTemplates.codeHasNoPackage")), () => {
                w.sql("Packages", JS_SQL.packages, 30)
                if (f.tables.has("unit_connections") && (f.moduleKinds.node ?? 0) >= 2) w.sql(t("reports.ecosystemTemplates.packagePackageReferences"), BUILD_SQL.use(f, null, "node"), 30)
            })
            w.section(t("reports.ecosystemTemplates.rolesCode"), has.units(f), () => { anatomy(w, ""); layering(w, "") })
            w.section(t("reports.ecosystemTemplates.importsBetweenFolders"), true, () => { structure(w); if (f.tangles) w.sql("Tangles", SQL.tangles, 10) })
            w.section("Libraries", needs.snippets(f), () => libraries(w))
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Tests", needs.tests(f), () => tests(w))
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach3")))
        },
    },
    {
        id: "react-review",
        name: t("reports.ecosystemTemplates.reactFrontEndReview"),
        audience: t("reports.ecosystemTemplates.frontEndTeam"),
        summary: t("reports.ecosystemTemplates.tourReactFrontEnd"),
        when: t("reports.ecosystemTemplates.useWhenFrontEnd"),
        ecosystem: "react",
        title: ws => t("reports.ecosystemTemplates.frontEndReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whatFrontEndDoes"))
            w.section(t("reports.ecosystemTemplates.frontEnd"), true, () => { w.explain(EXPLAIN.react).reading("node") })
            w.section(t("reports.ecosystemTemplates.rolesCode"), has.units(f), () => anatomy(w, "react"))
            w.section(t("reports.ecosystemTemplates.componentsHooksFolder"), has.units(f), () => {
                w.sql(t("reports.ecosystemTemplates.foldersReactComponentsHooks"), JS_SQL.folders(f), 25)
                role(w, "components", "react")
                w.prompt(t("reports.ecosystemTemplates.foldersOrganisedFeatureCheckout"))
            })
            w.section(t("reports.ecosystemTemplates.sharedHooks"), has.links(f), () => { w.explain(EXPLAIN.reactHooks); role(w, "hooks", "react"); w.sql(t("reports.ecosystemTemplates.hooksUsedOutsideTheir"), JS_SQL.sharedHooks, 20) })
            w.section(t("reports.ecosystemTemplates.whereDataFetched"), needs.snippets(f), () => { w.explain(EXPLAIN.reactData); role(w, "data", "react"); w.sql(t("reports.ecosystemTemplates.foldersImportDataFetching"), JS_SQL.dataLibraries, 20) })
            w.section(t("reports.ecosystemTemplates.doDrawingStateData"), has.links(f), () => layering(w, "react", ["components", "data", t("reports.ecosystemTemplates.componentsDataClients")]))
            w.section("Hotspots", needs.git(f), () => { hotspots(w, "files"); slotOf(w, "figure", t("reports.ecosystemTemplates.hotspotsDirectory"), VIEWS.treemap("hotspots", "directories", t("reports.ecosystemTemplates.hotspotsDirectories"))) })
            w.section(t("reports.ecosystemTemplates.codeHealth"), needs.health(f), () => health(w, "files", 10))
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach4")))
        },
    },
    {
        id: "vue-review",
        name: t("reports.ecosystemTemplates.vueFrontEndReview"),
        audience: t("reports.ecosystemTemplates.frontEndTeam"),
        summary: t("reports.ecosystemTemplates.tourVueNuxtFront"),
        when: t("reports.ecosystemTemplates.useWhenVueFront"),
        ecosystem: "vue",
        title: ws => t("reports.ecosystemTemplates.frontEndReview", { ws }),
        build(w) {
            const f = w.facts
            const components = has.marker(f, t("reports.ecosystemTemplates.scanFoundNoVue"), "filename:vue_component")
            w.prompt(t("reports.ecosystemTemplates.whatFrontEndDoes"))
            w.section(t("reports.ecosystemTemplates.frontEnd"), true, () => { w.explain(EXPLAIN.vue).reading("node") })
            w.section(t("reports.ecosystemTemplates.rolesCode"), has.units(f), () => anatomy(w, "vue", FRONT_END))
            w.section(t("reports.ecosystemTemplates.pagesComponentsComposablesFolder"), components, () => {
                w.sql(t("reports.ecosystemTemplates.foldersPagesComponentsComposables"), VUE_SQL.folders(f), 25)
                role(w, "pages", "vue", FRONT_END)
                w.prompt(t("reports.ecosystemTemplates.foldersOrganisedFeatureCheckout2"))
            })
            w.section(t("reports.ecosystemTemplates.sharedComponents"), components === true ? has.links(f) : components, () => { w.explain(EXPLAIN.vueShared); role(w, "components", "vue", FRONT_END); w.sql(t("reports.ecosystemTemplates.componentsUsedOutsideTheir"), VUE_SQL.shared, 20) })
            w.section(t("reports.ecosystemTemplates.largestComponents"), components, () => w.sql(t("reports.ecosystemTemplates.componentsLargestFirst"), VUE_SQL.largest(f), 20))
            w.section(t("reports.ecosystemTemplates.componentsNothingUses"), components === true ? has.links(f) : components, () => { w.explain(EXPLAIN.vueUnused); w.sql(t("reports.ecosystemTemplates.componentsNoOtherCode"), VUE_SQL.unused(f), 20) })
            w.section(t("reports.ecosystemTemplates.sharedComposables"), has.links(f), () => { w.explain(EXPLAIN.vueComposables); role(w, "composables", "vue", FRONT_END); w.sql(t("reports.ecosystemTemplates.composablesUsedOutsideTheir"), VUE_SQL.sharedComposables, 20) })
            w.section("Stores", needs.snippets(f), () => { w.explain(EXPLAIN.vueStores); w.sql(t("reports.ecosystemTemplates.storeFilesMostImported"), VUE_SQL.stores(f), 20) })
            w.section(t("reports.ecosystemTemplates.whereDataFetched"), needs.snippets(f), () => { w.explain(EXPLAIN.reactData); role(w, "data", "vue", FRONT_END); w.sql(t("reports.ecosystemTemplates.foldersImportDataFetching"), JS_SQL.dataLibraries, 20) })
            w.section(t("reports.ecosystemTemplates.doDrawingStateData"), has.links(f), () => layering(w, "vue", ["components", "composables", t("reports.ecosystemTemplates.componentsComposables")], FRONT_END))
            w.section("Hotspots", needs.git(f), () => { hotspots(w, "files"); slotOf(w, "figure", t("reports.ecosystemTemplates.hotspotsDirectory"), VIEWS.treemap("hotspots", "directories", t("reports.ecosystemTemplates.hotspotsDirectories"))) })
            w.section(t("reports.ecosystemTemplates.codeHealth"), needs.health(f), () => health(w, "files", 10))
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach5")))
        },
    },
]

// ── Go ────────────────────────────────────────────────────────────────────

const GO: ReportTemplate[] = [
    {
        id: "go-review",
        name: t("reports.ecosystemTemplates.goModuleReview"),
        audience: t("reports.ecosystemTemplates.goTeam"),
        summary: t("reports.ecosystemTemplates.tourGoCodePackages"),
        when: t("reports.ecosystemTemplates.useGeneralHealthCheck3"),
        ecosystem: "go",
        title: ws => t("reports.ecosystemTemplates.goReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whatModuleDoesWhat"))
            w.section(t("reports.ecosystemTemplates.modulesPackages"), true, () => { glance(w); w.explain(EXPLAIN.go).reading("go"); if (f.moduleKinds.go) w.sql("Modules", SQL.modulesOf("go"), 30) })
            w.section(t("reports.ecosystemTemplates.whatEachPackageHolds"), has.markers(f), () => { w.sql(t("reports.ecosystemTemplates.packagesTypesFunctionsWhat"), GO_SQL.packages(f), 30); anatomy(w, "", "go") })
            w.section(t("reports.ecosystemTemplates.packagesEverythingImports"), true, () => { w.sql(t("reports.ecosystemTemplates.packagesHowManyOthers"), GO_SQL.fanIn, 15); coupling(w, 0, "go") })
            w.section(t("reports.ecosystemTemplates.structsCrossBoundary"), has.marker(f, t("reports.ecosystemTemplates.noStructCarriesTag"), "struct_tag:json", "struct_tag:db", "struct_tag:yaml", "struct_tag:form", "struct_tag:xml", "struct_tag:toml", "struct_tag:mapstructure", "struct_tag:gorm"), () => {
                w.explain(EXPLAIN.goTags)
                w.sql(t("reports.ecosystemTemplates.taggedStructsPackage"), GO_SQL.tagsByPackage(f), 20)
                w.sql(t("reports.ecosystemTemplates.structsTaggedMostFormats"), GO_SQL.tagged(f), 15)
            })
            w.section(t("reports.ecosystemTemplates.buildConstraintsEmbeddedFiles"), has.marker(f, t("reports.ecosystemTemplates.noFileCarriesBuild"), "directive:build", "directive:embed", "directive:generate"), () => { w.explain(EXPLAIN.goDirectives); w.sql(t("reports.ecosystemTemplates.directivesPackage"), GO_SQL.directives(f), 20) })
            w.section(t("reports.ecosystemTemplates.dependencyRules"), needs.rules(f), () => rules(w))
            w.section("Libraries", needs.snippets(f), () => libraries(w, false, "go"))
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach6")))
        },
    },
]

// ── .NET ──────────────────────────────────────────────────────────────────

const DOTNET: ReportTemplate[] = [
    {
        id: "dotnet-review",
        name: t("reports.ecosystemTemplates.netSolutionReview"),
        audience: t("reports.ecosystemTemplates.netTeam"),
        summary: t("reports.ecosystemTemplates.tourNetSolutionProjects"),
        when: t("reports.ecosystemTemplates.useGeneralHealthCheck4"),
        ecosystem: "dotnet",
        title: ws => t("reports.ecosystemTemplates.netReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whatSolutionDoesWhat"))
            w.section(t("reports.ecosystemTemplates.solutionGlance"), true, () => { glance(w); w.explain(EXPLAIN.dotnet).reading("dotnet") })
            w.section(t("reports.ecosystemTemplates.projectsTheirReferences"), has.moduleKind(f, "dotnet", t("reports.ecosystemTemplates.codeHasNoCsproj")), () => w.sql(t("reports.ecosystemTemplates.projectsMostReferencedFirst"), DOTNET_SQL.projects, 40))
            w.section(t("reports.ecosystemTemplates.whatEachProjectHolds"), true, () => w.sql(t("reports.ecosystemTemplates.projectsRolesTheirFile"), DOTNET_SQL.roles(f), 40))
            w.section("Controllers", true, () => { w.sql(t("reports.ecosystemTemplates.largestControllers"), DOTNET_SQL.controllers(f), 15); w.prompt(t("reports.ecosystemTemplates.controllersThinTheyHand")) })
            w.section(t("reports.ecosystemTemplates.rolesLayers"), has.units(f), () => { anatomy(w, "aspnet"); layering(w, "aspnet") })
            w.section(t("reports.ecosystemTemplates.betweenNamespaces"), true, () => { structure(w); coupling(w) })
            w.section(t("reports.ecosystemTemplates.dependencyRules"), needs.rules(f), () => rules(w))
            w.section("Hotspots", needs.git(f), () => hotspots(w))
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach3")))
        },
    },
]

// ── PHP ───────────────────────────────────────────────────────────────────

const PHP: ReportTemplate[] = [
    {
        id: "php-review",
        name: t("reports.ecosystemTemplates.phpApplicationReview"),
        audience: t("reports.ecosystemTemplates.symfonyLaravelPhpTeam"),
        summary: t("reports.ecosystemTemplates.tourPhpApplicationComposer"),
        when: t("reports.ecosystemTemplates.useGeneralHealthCheck5"),
        ecosystem: "php",
        title: ws => t("reports.ecosystemTemplates.phpReview", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whatApplicationDoesWhat"))
            w.section(t("reports.ecosystemTemplates.applicationGlance"), true, () => { glance(w); w.explain(EXPLAIN.php).reading("php"); if (f.moduleKinds.composer) w.sql(t("reports.ecosystemTemplates.composerPackages"), SQL.modulesOf("composer"), 30) })
            w.section(t("reports.ecosystemTemplates.whatEachPackageHolds"), has.markers(f), () => w.sql(t("reports.ecosystemTemplates.packagesRole"), PHP_SQL.packages(f), 30))
            w.section(t("reports.ecosystemTemplates.rolesLayers"), has.units(f), () => { anatomy(w, ""); layering(w, "") })
            w.section(t("reports.ecosystemTemplates.howPackagesUseEach"), has.links(f), () => w.sql(t("reports.ecosystemTemplates.packagePackageReferences"), PHP_SQL.crossPackage(f), 30))
            w.section(t("reports.ecosystemTemplates.betweenNamespaces"), true, () => { structure(w); coupling(w) })
            w.section(t("reports.ecosystemTemplates.dependencyRules"), needs.rules(f), () => rules(w))
            w.section("Libraries", needs.snippets(f), () => libraries(w, false))
            w.section("Hotspots", needs.git(f), () => hotspots(w, "files"))
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.whatYouFoundEach3")))
        },
    },
    {
        id: "symfony-bundles",
        name: t("reports.ecosystemTemplates.symfonyBundleReview"),
        audience: t("reports.ecosystemTemplates.symfonyApplicationsBundles"),
        summary: t("reports.ecosystemTemplates.looksSymfonyApplicationBundle"),
        when: t("reports.ecosystemTemplates.useWhenBundlesHave"),
        ecosystem: "php",
        title: ws => t("reports.ecosystemTemplates.symfonyBundles", { ws }),
        build(w) {
            const f = w.facts
            w.prompt(t("reports.ecosystemTemplates.whyBundlesBeingLooked"))
            w.section(t("reports.ecosystemTemplates.bundlesWhatTheyRegister"), has.markers(f), () => { w.explain(EXPLAIN.phpBundles); w.sql(t("reports.ecosystemTemplates.bundlesWhatTheyRegister2"), PHP_SQL.bundles(f), 30) })
            w.section(t("reports.ecosystemTemplates.howPackagesUseEach"), has.links(f), () => { w.sql(t("reports.ecosystemTemplates.packagePackageReferences"), PHP_SQL.crossPackage(f), 30); slotOf(w, "table", t("reports.ecosystemTemplates.dependencyMatrix"), VIEWS.matrix(f)) })
            w.section("Findings", true, () => w.prompt(t("reports.ecosystemTemplates.bundlesDoTooMuch")))
        },
    },
]

export const ECOSYSTEM: ReportTemplate[] = [...SPRING, ...PYTHON, ...WEBAPPS, ...GO, ...DOTNET, ...PHP]
