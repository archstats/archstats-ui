// This class is used to resolve the name of a stat based on the version of Archstats.
// It is used in cases where the name of a stat has changed between versions,
// to facilitate backwards compatibility (resolving raw SQL column keys).
import { t } from "~/shared/i18n"

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
    "complexity__lines": t("snapshot.statNames.linesCode"),
    "complexity__files": t("snapshot.statNames.numberFiles"),
    "complexity__functions": t("snapshot.statNames.numberFunctions"),
    "complexity__classes": t("snapshot.statNames.numberClasses"),
    "complexity__indentation__avg": t("snapshot.statNames.averageIndentation"),
    "complexity__indentation__max": t("snapshot.statNames.maximumIndentation"),
    "git__commits": t("snapshot.statNames.totalCommits"),
    "git__commits:total": t("snapshot.statNames.totalCommits"),
    "git__commits__total": t("snapshot.statNames.totalCommits"),
    "git__authors": t("snapshot.statNames.numberAuthors"),
    "git__authors:total": t("snapshot.statNames.numberAuthors"),
    "git__authors__total": t("snapshot.statNames.numberAuthors"),
    "git__commits:last_30_days": t("snapshot.statNames.commitsLast30Days"),
    "git__commits:last_90_days": t("snapshot.statNames.commitsLast90Days"),
    "git__commits:last_365_days": t("snapshot.statNames.commitsLast365Days"),
    "modularity__instability": t("snapshot.statNames.instability"),
    "modularity__abstractness": t("snapshot.statNames.abstractness"),
    "modularity__distance": t("snapshot.statNames.distance"),
    "modularity__coupling__afferent": t("snapshot.statNames.afferentCouplingInbound"),
    "modularity__coupling__efferent": t("snapshot.statNames.efferentCouplingOutbound"),
    "modularity__component__imports": t("snapshot.statNames.componentImports"),
    "modularity__component__imported_by": t("snapshot.statNames.componentImported"),
    "directory": t("snapshot.statNames.directory"),
    "component_count": t("snapshot.statNames.componentCount"),
    "references": t("snapshot.statNames.references")
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