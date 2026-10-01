// Component names are identifiers, not paths, but some languages name them
// after their directory (`src/app/core`, `internal/http`). The detail route
// holds the name in one segment, so the name is encoded to stay in it: pasted
// raw, every slash started a new segment and the link opened nothing.

import { t } from "~/shared/i18n"

/** The detail page of a component, or one of its tabs. */
export function componentPath(name: string, tab?: string): string {
  const base = `/views/components/${encodeURIComponent(name)}`
  return tab ? `${base}/${tab}` : base
}

/**
 * How a component is named on screen. Files at the top of a repository form a
 * component whose id is ".", which read as nothing at all -- the biggest node
 * of gin's graph was labelled with a full stop. The id stays "." everywhere
 * it is an id.
 */
export function componentLabel(name: string, projectName = ""): string {
  return name === "." ? `${projectName || "project"} (root)` : name
}

/**
 * The detail page of a file. Files are paths and the route is a catch-all, so
 * slashes stay; each segment is encoded for the characters a path may hold
 * and a URL may not (`#`, `?`, `%`, spaces).
 */
export function filePath(name: string, tab?: string): string {
  const base = `/views/files/${name.split("/").map(encodeURIComponent).join("/")}`
  return tab ? `${base}/${tab}` : base
}

/** A group's page, or one of its tabs. */
export function groupPath(id: string, tab?: string): string {
  const base = `/views/groups/${encodeURIComponent(id)}`
  return tab ? `${base}/${tab}` : base
}

/** Find in code, for a needle. */
export function searchPath(needle: string): string {
  return `/views/search?q=${encodeURIComponent(needle)}`
}

/** The Folder X-ray of a directory. */
export function xrayPath(dir: string): string {
  return `/views/xray?dir=${encodeURIComponent(dir)}`
}

export interface ViewEntry { label: string; to: string; also?: string }

/**
 * Every view by the name a person would type, for Go to anything. The rail
 * lists the main ones; the rest are reached from inside them, and here.
 */
export const VIEWS: ViewEntry[] = [
  { label: t("navigation.routes.overview"), to: "/" },
  { label: t("navigation.routes.ask"), to: "/views/ask", also: "chat assistant question ai" },
  { label: t("navigation.routes.metrics"), to: "/views/metrics", also: "table components" },
  { label: t("navigation.routes.hotspots"), to: "/views/components/hotspots", also: "treemap churn" },
  { label: t("navigation.routes.connections"), to: "/views/connections", also: "graph dependencies" },
  { label: t("navigation.routes.dependencyMatrix"), to: "/views/components/matrix", also: "dsm levels" },
  { label: t("navigation.routes.chord"), to: "/views/components/chord" },
  { label: t("navigation.routes.cycles"), to: "/views/components/cycles", also: "tangles" },
  { label: t("navigation.routes.plotter"), to: "/views/metrics?view=plot", also: "scatter" },
  { label: t("navigation.routes.mainSequence"), to: "/views/metrics?view=plot&preset=dms", also: "abstractness instability distance" },
  { label: t("navigation.routes.componentComparison"), to: "/views/components/comparison" },
  { label: t("navigation.routes.filesTable"), to: "/views/files/table" },
  { label: t("navigation.routes.fileTreemap"), to: "/views/files/treemap" },
  { label: t("navigation.routes.fileDependencies"), to: "/views/files/dependencies" },
  { label: t("navigation.routes.authors"), to: "/views/git/authors", also: "people knowledge bus factor" },
  { label: t("navigation.routes.activity"), to: "/views/git/activity", also: "commits work now breadth" },
  { label: t("navigation.routes.churn"), to: "/views/git/churn" },
  { label: t("navigation.routes.timeline"), to: "/views/git/timeline" },
  { label: t("navigation.routes.hiddenCoupling"), to: "/views/git/coupling", also: "co-change changes together" },
  { label: t("navigation.routes.folderXRay"), to: "/views/xray", also: "folder directory utils helpers topics grab-bag" },
  { label: t("navigation.routes.units"), to: "/views/units", also: "classes functions modules layers lanes inversions unreachable dead code duplicates entry points structure checks" },
  { label: t("navigation.routes.deployables"), to: "/views/deployables", also: "pipelines services apps containers ship run deploy" },
  { label: t("navigation.routes.checks"), to: "/views/checks", also: "findings structure checks" },
  { label: t("navigation.routes.libraries"), to: "/views/libraries", also: "imports frameworks external dependencies" },
  { label: t("navigation.routes.rules"), to: "/views/rules", also: "violations lens rules" },
  { label: t("navigation.routes.changes"), to: "/views/changes", also: "compare diff" },
  { label: t("navigation.routes.overTime"), to: "/views/trends", also: "trends history" },
  { label: t("navigation.routes.lenses"), to: "/views/dimensions", also: "dimensions builder" },
  { label: t("navigation.routes.evidence"), to: "/views/evidence", also: "pins report" },
  { label: t("navigation.routes.sqlConsole"), to: "/views/query", also: "query" },
  { label: t("navigation.routes.aboutSnapshot"), to: "/views/snapshot", also: "languages scan" },
  { label: t("navigation.routes.metricReference"), to: "/views/reference", also: "glossary definitions" },
]
