import type { FileRole } from "~/utils/languages"

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
const VENDORED = /(^|\/)(vendor|vendors|node_modules|third[_-]?party|bower_components|external)\/|(^|\/)lib\/[^/]*\.js$|\.min\.(js|css)$|(^|\/)static\/.*\/lib\//i
// A library carried by name or by version: jquery-ui-1.13.3.custom.js, bootstrap.bundle.js.
const LIBRARY = /(^|\/)(jquery|bootstrap|lodash|underscore|angular|backbone|moment|d3|select2|tinymce|ckeditor|codemirror|handlebars|knockout|modernizr|popper|chart)[^/]*\.js$|(^|\/)[^/]*[-.]\d+\.\d+(\.\d+)?[^/]*\.(js|css)$/i

/**
 * For snapshots without recorded roles: whether a path reads as production
 * code by convention (not a test, not stylesheets or data, not a vendored
 * library). Only a fallback; revision 2 records the role.
 */
export function looksLikeProductionCode(path: string): boolean {
    return !isTestPath(path) && !NON_CODE_EXT.test(path) && !VENDORED.test(path) && !LIBRARY.test(path)
}
