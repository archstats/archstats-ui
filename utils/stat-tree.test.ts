import {describe, expect, it} from 'vitest'
import {columnsToStats} from "./stat-tree";

describe('stat tree', () => {

    const input = [
        "a:b:c",
        "a:b:d",
        "a:e",
        "a:f",
        "a",
    ];
    it('should work', function () {
        const stats = columnsToStats(input, ":")
        const getStat = (name: string) => stats.find(s => s.fullName === name)!
        const getChildren = (name: string) => getStat(name).children?.map(c => c.fullName)

        expect(stats).toHaveLength(7)

        expect(stats[0].fullName).toBe("")
        expect(getChildren("")).toEqual(["a"])
        expect(getChildren("a")).toEqual(["a:b", "a:e", "a:f"])
        expect(getChildren("a:b")).toEqual(["a:b:c", "a:b:d"])
        expect(getChildren("a:b:c")).toEqual(undefined)
        expect(getChildren("a:b:d")).toEqual(undefined)
        expect(getChildren("a:e")).toEqual(undefined)
        expect(getChildren("a:f")).toEqual(undefined)
        expect(getStat("a:b").isRealStat).toBe(false)
    });
});