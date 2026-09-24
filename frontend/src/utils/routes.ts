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
