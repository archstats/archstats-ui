import {switchCase} from "@babel/types";


export type Relationship = 'depends on' | 'is depended on by'
export type Path = PathSegment[]

export interface PathSegment {
    currentComponent: string,
    relationship?: Relationship,
    otherComponent?: string
}


// Counts to see if an item in the path has already been seen before, does not take relationship into account: a -> b -> a -> b -> a = [0, 0, 1, 1, 2]
// TODO: Make another method that counts cycles, taking into account the relationship (a -> b <- a -> b -> a -> b -> a = [0, 0, 0, 0, 1, 1, 2])
export function getOccurrencesForPathSegments(path: Path): number[] {
    const seenSegments = new Map<string, number>()
    const occurrenceList: number[] = []
    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        const key = segment.currentComponent

        const currentCount = seenSegments.get(key) ?? 1;
        occurrenceList.push(currentCount)
        seenSegments.set(key, currentCount + 1)
    }
    return occurrenceList
}


// Create a path from a string that looks like: a -> b <- a -> b -> c -> d -> e
export function stringToPath(string: string): Path {
    if (!string) return []
    const path: Path = []
    const regexSplitter = /->|<-/g

    const segments = string.split(regexSplitter).map(s => s.trim())

    const relationships = Array.from(string.matchAll(regexSplitter)).map(m => m[0].trim());

    let i = 0;

    for (const segment of segments) {
        const relationship = i >=
        relationships.length ?
            undefined : (relationships[i] == '->' ? 'depends on' : 'is depended on by')
        path.push({
            currentComponent: segment,
            relationship: relationship,
            otherComponent: i >= segments.length ? undefined : segments[i + 1]
        })
        i++
    }
    return path
}