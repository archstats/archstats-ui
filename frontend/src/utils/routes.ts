// Component names are identifiers, not paths, but some languages name them
// after their directory (`src/app/core`, `internal/http`). The detail route
// holds the name in one segment, so the name is encoded to stay in it: pasted
// raw, every slash started a new segment and the link opened nothing.

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

export interface ViewEntry { label: string; to: string; also?: string }

/**
 * Every view by the name a person would type, for Go to anything. The rail
 * lists the main ones; the rest are reached from inside them, and here.
 */
export const VIEWS: ViewEntry[] = [
  { label: "Overview", to: "/" },
  { label: "Metrics", to: "/views/metrics", also: "table components" },
  { label: "Hotspots", to: "/views/components/hotspots", also: "treemap churn" },
  { label: "Connections", to: "/views/connections", also: "graph dependencies" },
  { label: "Dependency matrix", to: "/views/components/matrix", also: "dsm levels" },
  { label: "Chord", to: "/views/components/chord" },
  { label: "Cycles", to: "/views/components/cycles", also: "tangles" },
  { label: "Plotter", to: "/views/components/plotter", also: "scatter" },
  { label: "Main sequence", to: "/views/components/plotter", also: "abstractness instability distance" },
  { label: "Component comparison", to: "/views/components/comparison" },
  { label: "Files table", to: "/views/files/table" },
  { label: "File treemap", to: "/views/files/treemap" },
  { label: "File dependencies", to: "/views/files/dependencies" },
  { label: "Authors", to: "/views/git/authors", also: "people" },
  { label: "Activity", to: "/views/git/activity", also: "commits" },
  { label: "Churn", to: "/views/git/churn" },
  { label: "Timeline", to: "/views/git/timeline" },
  { label: "Hidden coupling", to: "/views/git/coupling", also: "co-change changes together" },
  { label: "Units", to: "/views/units", also: "classes functions modules" },
  { label: "Rules", to: "/views/rules", also: "violations lens rules" },
  { label: "Changes", to: "/views/changes", also: "compare diff" },
  { label: "Over time", to: "/views/trends", also: "trends history" },
  { label: "Lenses", to: "/views/dimensions", also: "dimensions builder" },
  { label: "Evidence", to: "/views/evidence", also: "pins report" },
  { label: "SQL console", to: "/views/query", also: "query" },
  { label: "About this snapshot", to: "/views/snapshot", also: "languages scan" },
  { label: "Metric reference", to: "/views/reference", also: "glossary definitions" },
]
