import type { FileRole } from "./languages"

// Which files are tests. Revision 2 snapshots record a role per file (E5);
// older ones are read by the same path conventions, labelled as such, so the
// Production/Tests switch works on every snapshot.

export type RoleFacet = "all" | "production" | "test"

const TEST_PATH = [
    /(^|\/)src\/test\//,
    /(^|\/)(tests?|__tests__|spec|specs|e2e|cypress|testdata|Behat)\//,
    /(^|\/)[^/]*\.Tests?\//,
    /Tests?\.(java|kt|cs|php)$/,
    /IT\.java$/,
    /Spec\.php$/,
    /(^|\/)test_[^/]*\.py$/,
    /_test\.(py|go)$/,
    /(^|\/)conftest\.py$/,
    /\.(test|spec)\.[cm]?[jt]sx?$/,
    /\.feature$/,
]

/**
 * The same rules as SQLite GLOB patterns, for queries over snapshots without
 * roles: a path matching any of them is a test. Kept in step with TEST_PATH
 * by a test over sample paths.
 */
const TEST_DIRS = ["tests", "test", "__tests__", "spec", "specs", "e2e", "cypress", "testdata", "Behat"]
const JS_EXT = ["js", "ts", "jsx", "tsx", "mjs", "cjs", "mts", "cts"]
export const TEST_GLOBS: string[] = [
    "src/test/*", "*/src/test/*",
    ...TEST_DIRS.flatMap(d => [`${d}/*`, `*/${d}/*`]),
    "*.Test/*", "*.Tests/*",
    ...["java", "kt", "cs", "php"].flatMap(x => [`*Test.${x}`, `*Tests.${x}`]),
    "*IT.java", "*Spec.php",
    "test_*.py", "*/test_*.py", "*_test.py", "*_test.go",
    "conftest.py", "*/conftest.py",
    ...JS_EXT.flatMap(x => [`*.test.${x}`, `*.spec.${x}`]),
    "*.feature",
]

/** The engine's test-path rules, for snapshots that predate the role column. */
export function isTestPath(path: string): boolean {
    return TEST_PATH.some(r => r.test(path))
}

/** A file's role: the recorded one, or production/test by path convention. */
export function roleOf(file: { name: string; role?: string | null }): FileRole {
    if (file.role) return file.role as FileRole
    return isTestPath(file.name) ? "test" : "production"
}

/** Whether a file passes the facet. Third-party, generated and non-code files count as production-side. */
export function passesFacet(role: FileRole, facet: RoleFacet): boolean {
    if (facet === "all") return true
    return facet === "test" ? role === "test" : role !== "test"
}

/**
 * A component's side of the facet: a test component is one whose files are
 * all tests. A component with no files known passes either way.
 */
export function componentPassesFacet(roles: FileRole[], facet: RoleFacet): boolean {
    if (facet === "all" || roles.length === 0) return true
    const allTests = roles.every(r => r === "test")
    return facet === "test" ? allTests : !allTests
}

const NON_CODE_EXT = /\.(css|scss|sass|less|html?|json|ya?ml|md|rst|txt|svg|xml|xsd|properties|ini|toml|po|pot|mo|csv|lock|map|png|jpe?g|gif|ico|woff2?|ttf|eot)$/i
const VENDORED = /(^|\/)(vendor|vendors|node_modules|third[_-]?party|bower_components|external|lib_npm)\/|(^|\/)wwwroot\/lib\/|(^|\/)lib\/[^/]*\.js$|\.min\.(js|css)$|(^|\/)static\/.*\/lib\//i
// A library carried by name or by version: jquery-ui-1.13.3.custom.js, bootstrap.bundle.js.
const LIBRARY = /(^|\/)(jquery|bootstrap|lodash|underscore|angular|backbone|moment|d3|select2|tinymce|ckeditor|codemirror|handlebars|knockout|modernizr|popper|chart)[^/]*\.js$|(^|\/)[^/]*[-.]\d+\.\d+(\.\d+)?[^/]*\.(js|css)$/i

/**
 * For snapshots without recorded roles: whether a path reads as production
 * code by convention (not a test, not stylesheets or data, not a vendored
 * library). Only a fallback; revision 2 records the role.
 */
export function looksLikeProductionCode(path: string): boolean {
    return guessRole(path) === "production"
}

/** The role a path reads as, by convention, for a snapshot that recorded none. */
export function guessRole(path: string): FileRole {
    if (isTestPath(path)) return "test"
    if (VENDORED.test(path) || LIBRARY.test(path)) return "third_party"
    if (NON_CODE_EXT.test(path)) return "non_code"
    return "production"
}

/**
 * Paths that are not production code (vendored, a library by name or version,
 * not code), as SQLite GLOB patterns beside TEST_GLOBS; kept in step with
 * guessRole by a test over sample paths. GLOB is case-sensitive, so the usual
 * spellings are listed.
 */
const LIBRARY_NAMES = ["jquery", "bootstrap", "lodash", "underscore", "angular", "backbone", "moment", "d3", "select2", "tinymce", "ckeditor", "codemirror", "handlebars", "knockout", "modernizr", "popper", "chart"]
const NON_CODE = ["css", "scss", "sass", "less", "html", "htm", "json", "yml", "yaml", "md", "rst", "txt", "svg", "xml", "xsd", "properties", "ini", "toml", "po", "pot", "mo", "csv", "lock", "map", "png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "eot"]
export const NON_PRODUCTION_GLOBS: string[] = [
    ...["vendor", "vendors", "node_modules", "third_party", "third-party", "thirdparty", "bower_components", "external", "lib_npm"].flatMap(d => [`${d}/*`, `*/${d}/*`]),
    "wwwroot/lib/*", "*/wwwroot/lib/*", "lib/*.js", "*/lib/*.js", "static/*/lib/*", "*/static/*/lib/*", "*.min.js", "*.min.css",
    ...LIBRARY_NAMES.flatMap(n => [`${n}*.js`, `*/${n}*.js`]),
    "*[-.][0-9]*.[0-9]*.js", "*[-.][0-9]*.[0-9]*.css",
    ...NON_CODE.flatMap(x => [`*.${x}`, `*.${x.toUpperCase()}`]),
]
