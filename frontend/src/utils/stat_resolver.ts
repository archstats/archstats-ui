// This class is used to resolve the name of a stat based on the version of Archstats.
// It is used in cases where the name of a stat has changed between versions,
// to facilitate backwards compatibility (resolving raw SQL column keys).
export class StatNameResolver {
    constructor(private version: string) {}

    getStatName(stat: string): string {
        return stat;
    }

    getStatNames(stats: string[]): string[] {
        return stats.map(stat => this.getStatName(stat));
    }
}

// Static dictionary index mapping standard SQL column names to human-readable nice display names.
const statDictionary: Record<string, string> = {
    "complexity__lines": "Lines of Code",
    "complexity__files": "Number of Files",
    "complexity__functions": "Number of Functions",
    "complexity__classes": "Number of Classes",
    "complexity__indentation__avg": "Average Indentation",
    "complexity__indentation__max": "Maximum Indentation",
    "git__commits": "Total Commits",
    "git__commits:total": "Total Commits",
    "git__commits__total": "Total Commits",
    "git__authors": "Number of Authors",
    "git__authors:total": "Number of Authors",
    "git__authors__total": "Number of Authors",
    "git__commits:last_30_days": "Commits (Last 30 Days)",
    "git__commits:last_90_days": "Commits (Last 90 Days)",
    "git__commits:last_365_days": "Commits (Last 365 Days)",
    "modularity__instability": "Instability",
    "modularity__abstractness": "Abstractness",
    "modularity__distance": "Distance",
    "modularity__coupling__afferent": "Afferent Coupling (Inbound)",
    "modularity__coupling__efferent": "Efferent Coupling (Outbound)",
    "modularity__component__imports": "Component Imports",
    "modularity__component__imported_by": "Component Imported By",
    "directory": "Directory",
    "component_count": "Component Count",
    "references": "References"
};

export function getNiceStatName(stat: string): string {
    if (!stat) return "";
    
    if (statDictionary[stat]) {
        return statDictionary[stat];
    }

    const lowerStat = stat.toLowerCase();
    if (statDictionary[lowerStat]) {
        return statDictionary[lowerStat];
    }

    // Fallback: format custom segments beautifully
    return stat
        .replace(/__/g, " → ")
        .replace(/_/g, " ")
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}