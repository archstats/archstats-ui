export interface Stat {
    name: string;
    fullName: string;
    parent: string;
    level: number;
    isRealStat: boolean;
    children?: Stat[];
}

// Breaks down a hierarchical list of stats like to a tree
export function columnsToStats(columns: string[], separator = ":"): Stat[] {
    const splittedColumns = columns.map(c => c.split(separator))
    const index = new Map<string, Stat>()

    for (let column of splittedColumns) {
        for (let i = 0; i <= column.length; i++) {
            const fullName = column.slice(0, i).join(separator);
            if (index.has(fullName)) {
                continue
            }
            const parent = column.slice(0, i - 1).join(separator);

            const stat: Stat = {
                name: column[i - 1],
                fullName: fullName,
                parent: parent,
                level: i,
                isRealStat: columns.includes(fullName)
            }
            index.set(stat.fullName, stat)
        }
    }

    const stats = Array.from(index.values());
    for (const stat of stats) {
        if (stat.level === 0) continue;
        const parent = index.get(stat.parent)!;
        if (!parent.children) {
            parent.children = []
        }
        parent.children.push(stat)
    }

    return stats;
}