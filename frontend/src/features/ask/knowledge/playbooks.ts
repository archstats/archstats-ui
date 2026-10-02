// The architect's method for the big jobs, loaded on demand: which evidence
// to gather in which order, and what to watch for. Skills, in the harness
// sense: expertise that stays out of the prompt until a question needs it.

export interface Playbook { id: string; title: string; when: string; steps: string[] }

export const PLAYBOOKS: Playbook[] = [
    {
        id: "orient", title: "Get my bearings in an unfamiliar codebase", when: "what is this, where do I start, overview, first look",
        steps: [
            "Read the snapshot card: size, languages, roles, top areas, tangles, history span. Note what is absent.",
            "mass (color role) — where the code lives, and how much is tests or generated.",
            "layers — the top areas stacked by import direction; note what points back up and which tangles hide inside floors.",
            "rank dependents and rank pagerank — the load-bearing components.",
            "tangles — the knots, largest first.",
            "rank hotspot with grain files — where change and complexity meet.",
            "Answer: what it is, where the mass is, the three places that matter most, and what the scan cannot see.",
        ],
    },
    {
        id: "untangle", title: "Untangle cycles", when: "cycles, tangles, circular dependencies, what to cut",
        steps: [
            "tangles — how many, how big.",
            "untangle on the largest (or the one the person named) — the cut plan, most untangling first, with the files carrying each import.",
            "file_outline on the carrier file of the first cut — the declaration that makes the import.",
            "cochange between the two components of the first cut — if they also change together, cutting the import will not remove the coupling.",
            "Answer: the first two or three cuts, what each frees, the files and lines to change, and what stays tangled.",
        ],
    },
    {
        id: "extract", title: "Plan an extraction or modularisation", when: "split, extract, carve out, module, service, modularise, boundary",
        steps: [
            "graph `dependents of X depth all` and `dependencies of X depth all` — what the candidate touches both ways.",
            "tangles / untangle — whether the candidate sits in a tangle; if so, the cuts come first.",
            "cochange on the candidate — hidden coupling that has no import.",
            "knowledge on the candidate — who owns it now.",
            "files_of the candidate — its size and the files that import across the seam most.",
            "Answer: the seam, what must be cut (imports, files), the hidden coupling, and a first step that can be checked.",
        ],
    },
    {
        id: "change-impact", title: "What breaks if I change this", when: "impact, blast radius, what breaks, safe to change",
        steps: [
            "component X — dependents, instability, cycles.",
            "graph `dependents of X depth all` — everything that can be reached.",
            "cochange X — what changed with it historically, import or not.",
            "code_search for its public names when the question is about one class or function.",
            "Answer: direct users, how far it reaches, what changed with it before, and the tests that touch it (cookbook test-files-per-component).",
        ],
    },
    {
        id: "knowledge-risk", title: "Knowledge and people risk", when: "bus factor, who knows, owners, silos, left the team",
        steps: [
            "knowledge_map — what is written or changed by active contributors, and what nobody active knows.",
            "knowledge on the largest parts with no active contributor.",
            "rank churn — where the work is now; compare with who knows it.",
            "Answer: the parts at risk (size, last change), the people to ask, and patterns rather than individuals.",
        ],
    },
    {
        id: "health", title: "Code health and hotspots", when: "health, debt, risky code, refactor first, quality",
        steps: [
            "rank hotspot with grain files — complexity meeting change.",
            "cookbook unhealthy-changing — effort going into unhealthy code now.",
            "mass (color health) — where the unhealthy code lives.",
            "file_outline on the top one or two files — what took their health down (complex code, coupling, size) and which functions are complex.",
            "Answer: the few files to start with, why (numbers), and what a first refactoring step would be — name the complex function to split when there is one.",
        ],
    },
]

export function findPlaybook(q: string): Playbook | undefined {
    const s = q.toLowerCase()
    return PLAYBOOKS.find(p => p.id === s) ?? PLAYBOOKS.find(p => p.when.split(", ").some(w => s.includes(w))) ?? PLAYBOOKS.find(p => p.title.toLowerCase().includes(s))
}
