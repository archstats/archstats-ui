interface RawComponent {
    name: string;
    instability: number;
    abstractness: number
    [key: string]: any;
}

interface RawComponentConnection {
    from: string;
    to: string;
    count: number;
}

interface ComponentGraph {
    components: Map<string, Component>;
}

enum ConnectionType {
    INCOMING = "INCOMING",
    OUTGOING = "OUTGOING",
}

interface Connection {
    from: Component;
    to: Component;
    count: number;
    type: ConnectionType;
}

interface Component extends RawComponent {
    connections: Connection[];
}

function createComponentGraph(components: RawComponent[], connections: RawComponentConnection[]): ComponentGraph {
    if (!components.length) {
        return {
            components: new Map(),
        }
    }
    const allComponents: Component[] = components.map(c => ({
        ...c,
        connections: [],
    }));
    const graph: Map<string, Component> = new Map(allComponents.map(c => [c.name, c]));
    for (const component of allComponents) {
        // @ts-ignore
        graph[component.name] = {
            ...component
        };
    }

    connections.forEach(connection => {
        let {from, to, count} = connection;
        const fromComponent = graph.get(from)!;
        const toComponent = graph.get(to)!;

        fromComponent.connections.push({
            from: fromComponent,
            to: toComponent,
            count,
            type: ConnectionType.OUTGOING,
        });
        toComponent.connections.push({
            from: fromComponent,
            to: toComponent,
            count,
            type: ConnectionType.INCOMING,
        });
    })
    return {
        components: graph,
    }
}

function resizeConnectionsOnComponents(components: Component[]): Component[] {
    if (!components.length) return [];
    const lookup = new Set(components.filter(c => c).map(c => c.name));
    return components.map(c => ({
        ...c,
        connections: c.connections.filter(c => lookup.has(c.to.name) && lookup.has(c.from.name)),
    }));
}

function sources(graph: Component[]): Component[] {
    return graph.filter(c => c.connections.filter(c => c.type === ConnectionType.INCOMING).length === 0);
}

function sinks(graph: Component[]): Component[] {
    return graph.filter(c => c.connections.filter(c => c.type === ConnectionType.OUTGOING).length === 0);
}


interface RelatedComponent extends Component {
    distance: number;
    path: Component[]
}
function indirectRelatives(component: Component, directRelativesFn: (arg0: Component) => Component[]): RelatedComponent[] {
    const visited: Map<string, RelatedComponent> = new Map();
    const queue: RelatedComponent[] = [{...component, distance: 0, path: []}];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current.name)) continue;

        visited.set(current.name, current);
        queue.push(...directRelativesFn(current).map(component => ({
            ...component,
            distance: current.distance + 1,
            path: [current, ...current.path],
        })));
    }
    visited.delete(component.name);
    return Array.from(visited.values());
}

function directPredecessors(component: Component): Component[] {
    return component.connections.filter(c => c.type === ConnectionType.INCOMING).map(c => c.from);
}

function directSuccessors(component: Component): Component[] {
    return component.connections.filter(c => c.type === ConnectionType.OUTGOING).map(c => c.to);
}

function successors(component: Component): RelatedComponent[] {
    return indirectRelatives(component, directSuccessors);
}

function predecessors(component: Component): RelatedComponent[] {
    return indirectRelatives(component, directPredecessors);
}

function findCycles(successor: Component, component: Component, visited: Map<string, boolean>, stack: Component[], cycles: Component[][]) {
    if (visited.has(successor.name)) return;
    visited.set(successor.name, true);
    stack.push(successor);
    if (successor.name === component.name) {
        cycles.push([...stack]);
    } else {
        const successors = directSuccessors(successor);
        for (const successor of successors) {
            findCycles(successor, component, visited, stack, cycles);
        }
    }
    stack.pop();
    visited.delete(successor.name);

}

function allCyclesInGraph(graph: Component[]): string[][] {
    let visited: {
        [key: string]: string[]
    } = {};

    for (const component of graph) {
        const theCycles = allCycles(component);
        if (theCycles.length > 0) {
            const sortedCycles = theCycles.map(cycle => cycle.map(component => component.name).sort());

            for (const cycle of sortedCycles) {
                const key = cycle.join(" -> ");
                if (visited[key]) continue;
                visited[key] = cycle;
            }
        }
    }
    return Object.values(visited);
}

function allCycles(component: Component): Component[][] {
    const cycles: Component[][] = [];
    const visited: Map<string, boolean> = new Map();
    const stack: Component[] = [];
    const successors = directSuccessors(component);
    for (const successor of successors) {
        findCycles(successor, component, visited, stack, cycles);
    }
    return cycles;
}

export type {
    RawComponent,
    RawComponentConnection,
    ComponentGraph,
    ConnectionType,
    Component,
    RelatedComponent,
    Connection
};
export {
    createComponentGraph,
    sources,
    sinks,
    directSuccessors,
    directPredecessors,
    successors,
    predecessors,
    resizeConnectionsOnComponents,
    allCycles,
    allCyclesInGraph,
};