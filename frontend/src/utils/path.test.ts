import {assert, describe, expect, it} from 'vitest'
import {stringToPath, getOccurrencesForPathSegments} from "./path";

describe('path parsing', () => {

    it('should parse an empty string', function () {
        const path = stringToPath("")
        expect(path).toEqual([])
    })

    it('should parse a simple path with one segment', function () {
        const path = stringToPath("a")
        expect(path).toEqual([
            {
                currentComponent: 'a',
            }
        ])
    })

    it('should parse a simple depends on path with two segments', function () {
        const path = stringToPath("a -> b")
        expect(path).toEqual([
            {
                currentComponent: 'a',
                relationship: 'depends on',
                otherComponent: 'b'
            },
            {
                currentComponent: 'b',
            }
        ])
    })

    it('should parse a simple depends on path with multiple segments', function () {
        const path = stringToPath("a -> b -> c -> d -> e")
        expect(path).toEqual([
            {
                currentComponent: 'a',
                relationship: 'depends on',
                otherComponent: 'b'
            },
            {
                currentComponent: 'b',
                relationship: 'depends on',
                otherComponent: 'c'
            },
            {
                currentComponent: 'c',
                relationship: 'depends on',
                otherComponent: 'd'
            },
            {
                currentComponent: 'd',
                relationship: 'depends on',
                otherComponent: 'e'
            },
            {
                currentComponent: 'e',
            }
        ])
    })

    it('should parse a simple is depended on by path with multiple segments', function () {
        const path = stringToPath("a <- b <- c <- d <- e")
        expect(path).toEqual([
            {
                currentComponent: 'a',
                relationship: 'is depended on by',
                otherComponent: 'b'
            },
            {
                currentComponent: 'b',
                relationship: 'is depended on by',
                otherComponent: 'c'
            },
            {
                currentComponent: 'c',
                relationship: 'is depended on by',
                otherComponent: 'd'
            },
            {
                currentComponent: 'd',
                relationship: 'is depended on by',
                otherComponent: 'e'
            },
            {
                currentComponent: 'e',
            }
        ])
    })

    it('should parse a simple is depended on by path with two segments', function () {
        const path = stringToPath("a <- b")
        expect(path).toEqual([
            {
                currentComponent: 'a',
                relationship: 'is depended on by',
                otherComponent: 'b'
            },
            {
                currentComponent: 'b',
            }
        ])
    })
    it('should parse a complex mixed path', () => {
        const path = stringToPath("a -> b <- a -> b -> c -> d <- e")
        expect(path).toEqual([
            {
                currentComponent: 'a',
                relationship: 'depends on',
                otherComponent: 'b'
            },
            {
                currentComponent: 'b',
                relationship: 'is depended on by',
                otherComponent: 'a'
            },
            {
                currentComponent: 'a',
                relationship: 'depends on',
                otherComponent: 'b'
            },
            {
                currentComponent: 'b',
                relationship: 'depends on',
                otherComponent: 'c'
            },
            {
                currentComponent: 'c',
                relationship: 'depends on',
                otherComponent: 'd'
            },
            {
                currentComponent: 'd',
                relationship: 'is depended on by',
                otherComponent: 'e'
            },
            {
                currentComponent: 'e',
            }])

    });
})
describe('occurence count', () => {

    it('should count occurrences', () => {
        const path = stringToPath("a -> b -> a -> b -> a")
        const occurrences = getOccurrencesForPathSegments(path)
        expect(occurrences).toEqual([0, 0, 1, 1, 2])
    })
})
