// What Archstats can answer, the way an architect who knows the tool would
// say it: the question, how to get the answer, where to see it, and when the
// snapshot cannot tell. The model sees the family headings every turn and
// looks entries up with the `capabilities` tool; the harness also looks the
// question up whenever the model is about to say "the scan cannot show this".

export interface Capability {
    id: string
    family: string
    /** Ways a person asks it. */
    asks: string[]
    /** How to answer it with the tools, in one or two sentences. */
    how: string
    tools: string[]
    view?: { label: string; route: string }
    /** What the snapshot must have. */
    needs?: string
    traps?: string
}

export const CAPABILITIES: Capability[] = [
    // ── Orientation ──
    { id: "shape", family: "Orientation", asks: ["what is this codebase", "what is it made of", "where is the mass", "give me an overview", "how big is it", "main parts"],
        how: "The snapshot card in your context has the size, roots and largest components. For more, rank components by lines, and group by root.", tools: ["rank", "cookbook"], view: { label: "Overview", route: "/" } },
    { id: "languages", family: "Orientation", asks: ["which languages", "what frameworks", "tech stack", "what kind of project"],
        how: "The snapshot card lists the extensions scanned. The cookbook has files and lines per extension.", tools: ["cookbook"], view: { label: "About this snapshot", route: "/views/snapshot" } },
    { id: "entry-points", family: "Orientation", asks: ["entry points", "where does it start", "top level", "what depends on nothing", "roots of the graph"],
        how: "Components with no dependents are the tops of the graph: rank by dependents, ascending, over components with dependencies > 0.", tools: ["rank", "cookbook"] },
    { id: "find", family: "Orientation", asks: ["where is", "where does x live", "which component handles", "find the code for", "where is the feature"],
        how: "find by name first; if the word is not in names, code_search looks inside the files.", tools: ["find", "code_search"], view: { label: "Find in code", route: "/views/search" } },

    { id: "visualise", family: "Orientation", asks: ["show me visualisations", "show me a picture", "draw it", "diagram", "figures", "charts", "visualize the architecture", "show me the structure"],
        how: "Draw, don't describe: layers (the stack), mass (the folder map), knowledge_map, tangles then untangle (the cycle drawing), graph (a matrix), rank (bars); and show for any view, which appears as a preview of its real figure. Pick the two or three that answer what they asked.", tools: ["layers", "mass", "untangle", "show"] },

    // ── Coupling ──
    { id: "dependents", family: "Coupling", asks: ["what depends on", "who uses", "used by", "fan in", "afferent", "how many components depend on"],
        how: "component gives dependents (a component count) and the strongest ones. For the full set, graph with `dependents of X`.", tools: ["component", "graph"], view: { label: "Connections", route: "/views/connections" },
        traps: "modularity__coupling__afferent counts importing FILES, not components." },
    { id: "dependencies", family: "Coupling", asks: ["what does x depend on", "what does it use", "fan out", "efferent", "its dependencies"],
        how: "component gives dependencies (a component count); graph with `dependencies of X` gives the set.", tools: ["component", "graph"], traps: "modularity__coupling__efferent counts files, not components." },
    { id: "most-coupled", family: "Coupling", asks: ["most coupled", "most depended on", "core components", "load bearing", "central", "most important component"],
        how: "rank by dependents for how many rely on it; by pagerank for how central it is in the whole graph.", tools: ["rank"], view: { label: "Metrics", route: "/views/metrics" } },
    { id: "instability", family: "Coupling", asks: ["stable", "unstable", "instability", "main sequence", "abstractness", "zone of pain"],
        how: "rank by instability or distance. Instability 0 means everything points at it; 1 means it points at everything.", tools: ["rank", "metric"], view: { label: "Metrics", route: "/views/metrics" } },

    // ── Reach ──
    { id: "blast-radius", family: "Reach", asks: ["blast radius", "impact of changing", "what breaks if", "what is affected", "ripple", "transitively"],
        how: "graph with `dependents of X depth all` is everything that could be affected; depth 1 is direct users.", tools: ["graph"], view: { label: "Connections", route: "/views/connections" } },
    { id: "path", family: "Reach", asks: ["path from", "how does a reach b", "why does a depend on b", "route between", "connected"],
        how: "graph with `path from A to B` for the shortest routes, `between A and B` for every route. Then file_outline or code_search on the edge's file for the import line.", tools: ["graph", "file_outline"] },
    { id: "neighbourhood", family: "Reach", asks: ["around", "neighbours of", "what talks to", "context of"],
        how: "graph with `around X` (depth 1) or `around X depth 2`.", tools: ["graph"] },

    // ── Cycles ──
    { id: "tangles", family: "Cycles", asks: ["tangled", "tangles", "circular dependencies", "cycles", "loops", "strongly connected", "how many cycles"],
        how: "tangles lists every set of components that all reach each other, largest first. cycles lists the individual shortest cycles.", tools: ["tangles", "cycles"], view: { label: "Cycles", route: "/views/components/cycles" } },
    { id: "smallest-cycle", family: "Cycles", asks: ["smallest cycle", "shortest cycle", "mutual dependency", "two components depend on each other", "biggest cycle", "longest cycle"],
        how: "cycles with sort=size (ascending for the smallest, descending for the longest). A 2-cycle is a mutual pair.", tools: ["cycles"] },
    { id: "untangle", family: "Cycles", asks: ["how to untangle", "what to cut", "break the cycle", "which imports to remove", "fix the cycles"],
        how: "untangle on a component or a tangle number: the imports to cut, most untangling first, with the files that carry each import.", tools: ["untangle", "file_outline"], view: { label: "Cycles", route: "/views/components/cycles" } },

    // ── Hotspots and health ──
    { id: "hotspots", family: "Hotspots", asks: ["hotspots", "risky code", "where to refactor", "technical debt", "worst code", "problem areas"],
        how: "rank by hotspot (churn weighted by complexity), then component or file_outline on the top ones. Say it at file grain with grain=files.", tools: ["rank", "file_outline"], view: { label: "Hotspots", route: "/views/components/hotspots" } },
    { id: "health", family: "Hotspots", asks: ["code health", "unhealthy", "complex", "hard to read", "nesting", "bumpy road"],
        how: "rank by health ascending (10 is best). file_outline shows a file's health and size.", tools: ["rank", "file_outline"], needs: "codesmells metrics", traps: "Before analysis revision 2, a health of 0 means 'not rated', not terrible." },
    { id: "size", family: "Hotspots", asks: ["largest", "biggest", "most code", "lines of code", "god class", "huge file"],
        how: "rank by lines, grain components or files.", tools: ["rank"] },

    // ── History ──
    { id: "churn", family: "History", asks: ["changes most", "churn", "most commits", "volatile", "active", "what is being worked on"],
        how: "rank by churn (all-time commits) or recent churn (last 90 days). If recent is all zero, the history ended before 90 days ago: use all-time.", tools: ["rank", "activity"], view: { label: "Activity", route: "/views/git/activity" }, needs: "git history" },
    { id: "activity", family: "History", asks: ["over time", "timeline", "when was it changed", "activity", "commits per month", "is it still maintained"],
        how: "activity gives commits per month, for the codebase or one component.", tools: ["activity"], view: { label: "Activity", route: "/views/git/activity" }, needs: "git history" },
    { id: "cochange", family: "History", asks: ["change together", "hidden coupling", "co-change", "logical coupling", "coupled without import"],
        how: "cochange with a component: its partners in the same commits and whether an import explains each. cochange with no component: the strongest pairs in the whole codebase; hidden_only=true keeps those with no import (hidden coupling).", tools: ["cochange"], view: { label: "Connections", route: "/views/connections" }, needs: "git history" },
    { id: "age", family: "History", asks: ["oldest", "stale", "not touched", "dead code", "abandoned", "last changed"],
        how: "rank by age, or the cookbook's 'untouched for a year'. Unimported and unchanged is a candidate, not proof: dynamic loading is invisible.", tools: ["rank", "cookbook"], needs: "git history" },

    // ── People ──
    { id: "knowledge", family: "People", asks: ["who knows", "who to ask", "owner", "bus factor", "knowledge silo", "who wrote"],
        how: "knowledge on a component: authors by share of its commits; one author above ~80% is a silo.", tools: ["knowledge"], view: { label: "Authors", route: "/views/git/authors" }, needs: "git history",
        traps: "Commit counts are not productivity. Names may be pseudonymised." },
    { id: "authors", family: "People", asks: ["how many authors", "team size", "contributors", "most active authors"],
        how: "The snapshot card has the author count; the cookbook ranks authors.", tools: ["cookbook"], needs: "git history" },

    // ── Files and code ──
    { id: "file", family: "Files and code", asks: ["what does this file do", "what is in", "explain the file", "classes in", "methods of", "outline"],
        how: "file_outline gives the declarations with line numbers, imports both ways, size, health and churn. file_read shows the lines themselves.", tools: ["file_outline", "file_read"] },
    { id: "files-of", family: "Files and code", asks: ["files in component", "what is inside", "contents of the package"],
        how: "files_of a component, sorted by lines, with churn and health.", tools: ["files_of"] },
    { id: "search", family: "Files and code", asks: ["where is x used", "usages", "grep", "find text", "which files mention", "annotation", "calls to"],
        how: "code_search with the text (regex=true for patterns). Returns the files and the matching lines.", tools: ["code_search"], view: { label: "Find in code", route: "/views/search" } },
    { id: "why-import", family: "Files and code", asks: ["which file imports", "why the dependency", "where is the import", "which line"],
        how: "untangle and graph edges name the files that carry an import; file_outline on that file lists its import lines.", tools: ["graph", "file_outline", "code_search"] },

    // ── Declared architecture ──
    { id: "layers", family: "Declared architecture", asks: ["layers", "layering", "is it layered", "architecture violations", "dependency direction", "clean architecture", "stack", "which way do imports run"],
        how: "layers stacks the top-level areas so imports run down and lists the ones that point back up; within narrows it to one area. tangles shows what has no layers at all. Declared rules live in the Rules view.", tools: ["layers", "tangles"], view: { label: "Units", route: "/views/units" } },
    { id: "mass-map", family: "Orientation", asks: ["where does the code live", "map of the code", "where are the tests", "where is the unhealthy code", "which folders", "treemap"],
        how: "mass draws every file by size in its folders, coloured by role, health, churn or component.", tools: ["mass"] },
    { id: "knowledge-map", family: "People", asks: ["who still knows", "knowledge map", "orphaned code", "nobody knows", "who left", "abandoned parts", "who to ask about each part"],
        how: "knowledge_map marks every component by whether active contributors wrote it, changed it, changed it once, or nobody active touched it, with the person to ask.", tools: ["knowledge_map"], view: { label: "Authors", route: "/views/git/authors" }, needs: "git history" },
    { id: "groups", family: "Declared architecture", asks: ["groups", "lenses", "modules", "domains", "bounded contexts"],
        how: "The workspace's groups and lenses are shown in the sidebar. The snapshot has build modules in `modules`.", tools: ["sql", "cookbook"], view: { label: "Lens builder", route: "/views/dimensions" } },

    // ── Beyond the snapshot ──
    { id: "compare", family: "Beyond this snapshot", asks: ["what changed since", "compare with last scan", "drift", "trend", "better or worse"],
        how: "The chat reads one snapshot and cannot compare scans. The Changes view compares two; say so plainly (the compare tool offers it), never guess what changed.", tools: [], view: { label: "Changes", route: "/views/changes" } },
    { id: "runtime", family: "Beyond this snapshot", asks: ["performance", "runtime", "latency", "production errors", "test coverage", "security vulnerabilities"],
        how: "The scan reads code and history, not running systems, coverage or CVEs. Say 'the scan cannot tell' and why.", tools: [] },
]

export const FAMILIES = [...new Set(CAPABILITIES.map(c => c.family))]

const STOP = new Set(["the", "a", "an", "is", "are", "of", "to", "in", "on", "it", "this", "that", "what", "which", "how", "does", "do", "i", "me", "my", "for", "and", "or", "with", "be", "can", "there", "any", "most", "x"])

export function words(s: string): string[] {
    return s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)).map(stem)
}

function stem(w: string): string {
    return w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "") || w
}

/** Catalogue entries for a question, best first. Word overlap over the phrasings, weighted by rarity. */
export function searchCapabilities(question: string, limit = 3): Capability[] {
    const q = new Set(words(question))
    if (!q.size) return []
    const df = new Map<string, number>()
    const bags = CAPABILITIES.map(c => {
        const bag = new Set(words([...c.asks, c.id, c.family].join(" ")))
        for (const w of bag) df.set(w, (df.get(w) ?? 0) + 1)
        return bag
    })
    const scored = CAPABILITIES.map((c, i) => {
        let s = 0
        for (const w of q) if (bags[i].has(w)) s += Math.log(1 + CAPABILITIES.length / (df.get(w) ?? 1))
        return { c, s }
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
    return scored.slice(0, limit).map(x => x.c)
}

export function describeCapability(c: Capability): string {
    return [
        `• ${c.asks[0]} (${c.family})`,
        `  how: ${c.how}`,
        c.tools.length ? `  tools: ${c.tools.join(", ")}` : "",
        c.view ? `  view: ${c.view.label}` : "",
        c.needs ? `  needs: ${c.needs}` : "",
        c.traps ? `  trap: ${c.traps}` : "",
    ].filter(Boolean).join("\n")
}
