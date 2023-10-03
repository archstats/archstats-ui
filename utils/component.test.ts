import {assert, describe, expect, it} from 'vitest'
import {
    createComponentGraph,
    RawComponent,
    RawComponentConnection,
    sinks,
    sources,
    successors,
    allCycles,
    allCyclesInGraph, ComponentGraph
} from "./components";


describe('component graph', () => {
    const input = [
        "A->B",
        "A->C",
        "B->D",
        "C->D",
        "D->E",
        "F->E",
        "X->Y",
        "Y->Z",
        "Z->X",
    ];
    const connections = getRawConnections(input);
    const components = getRawComponents(input);
    const graph = createComponentGraph(components, connections);

    it('should have proper sources', function () {
        const allSources = sources(Array.from(graph.components.values()));

        expect(allSources).toHaveLength(1)
        expect(allSources[0].name).toBe("A")
    });
    it('should have proper sinks', function () {
        const allSinks = sinks(Array.from(graph.components.values()))

        expect(allSinks).toHaveLength(1)
        expect(allSinks[0].name).toBe("E")
    });

    it('should have proper successors', function () {
        const allSuccessors = successors(graph.components.get("A"))

        expect(allSuccessors).toHaveLength(4)
        expect(allSuccessors.map(c => c.name)).toEqual(["B", "C", "D", "E"])
    });
})

describe('cycles test', function () {

    it("no cycles", function () {

        const graph = createGraph([
            "A->B",
            "A->C",
            "B->D",
            "C->D",
            "D->E",
            "F->E",
        ])

        expect(allCyclesInGraph(Array.from(graph.components.values())).length).toBe(0)
    })

    it("one simple cycle", function () {
        const graph = createGraph([
            "A->B",
            "B->A",
        ])

        const theCycles = allCyclesInGraph(Array.from(graph.components.values()));
        expect(theCycles).toHaveLength(1)
    })

    it("one complex cycle", function () {
        const graph = createGraph([
            "A->B",
            "B->C",
            "C->A",
        ])
        const theCycles = allCyclesInGraph(Array.from(graph.components.values()));
        expect(theCycles).toHaveLength(1)
    })

    it("two separate cycles", function () {
        const graph = createGraph([
            "A->B",
            "B->C",
            "C->A",
            "X->Y",
            "Y->Z",
            "Z->X",
        ])
        const theCycles = allCyclesInGraph(Array.from(graph.components.values()));
        expect(theCycles).toHaveLength(2)
    })

    it("two cycles with one component in common", function () {
    const graph = createGraph([
            "The problem->B",
            "B->C",
            "C->The problem",
            "The problem->X",
            "X->Y",
            "Y->Z",
            "Z->X",
        ])
        const theCycles = allCyclesInGraph(Array.from(graph.components.values()));
        expect(theCycles).toHaveLength(2)
    })

})

function createGraph(stringConnections: string[]): ComponentGraph {
    const input = stringConnections
    const connections = getRawConnections(input);
    const components = getRawComponents(input);
    const graph = createComponentGraph(components, connections);
    return graph
}

function getRawConnections(connections: string[]): RawComponentConnection[] {
    return connections.map(c => getRawConnectionsFromConnectionString(c))
}

function getRawComponents(connections: string[]): RawComponent[] {
    return connections.map(c => getRawComponentsFromConnectionString(c)).flatMap(c => c)
}

function getRawConnectionsFromConnectionString(connection: string): RawComponentConnection {
    const [from, to] = connection.split("->").map(c => c.trim());
    return {
        from,
        to,
        count: 1,
    }
}

function getRawComponentsFromConnectionString(connection: string): RawComponent[] {
    return connection.split("->").map(c => toRawComponent(c))
}

function toRawComponent(component: string): RawComponent {
    return {
        abstractness: 0, instability: 0,
        name: component
    }
}