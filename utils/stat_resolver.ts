// This class is used to resolve the name of a stat based on the version of Archstats.
// It is used in cases where the name of a stat has changed between versions,
// to facilitate backwards compatibility.
export class StatNameResolver {
    constructor(private version: string) {
    }

    getStatName(stat: string): string {
        return stat;
    }

    getStatNames(stats: string[]): string[] {
        return stats.map(stat => this.getStatName(stat));
    }
}