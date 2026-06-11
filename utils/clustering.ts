// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClusterNode {
  id: string;          // component name
  community: number;   // assigned community index
  connections: number; // total connections (degree)
}

export interface ClusterEdge {
  source: string;      // source component name
  target: string;      // target component name
  weight: number;      // coupling weight (e.g. number of connections or co-change percentage)
  type: 'static' | 'git'; // edge type
}

export interface Community {
  id: number;
  members: string[];       // component names in this community
  internalEdges: number;
  externalEdges: number;
}

export interface ClusteringResult {
  nodes: ClusterNode[];
  communities: Community[];
  modularity: number;
}

export type ClusteringAlgorithm = 'louvain' | 'label-propagation' | 'connected-components' | 'none'

// ─── Louvain Community Detection ──────────────────────────────────────────────

/**
 * Louvain community detection algorithm.
 *
 * The algorithm proceeds in two alternating phases:
 *   Phase 1 (local moves): Each node is moved to the neighbouring community
 *     that yields the largest positive modularity gain, repeating until no
 *     beneficial move remains.
 *   Phase 2 (aggregation): Communities are collapsed into super-nodes and the
 *     graph is rebuilt. The process then restarts from Phase 1 on the coarsened
 *     graph.
 *
 * The implementation is self-contained and dependency-free.
 */
export function louvainClustering(
  nodes: string[],
  edges: ClusterEdge[],
  resolution: number = 1.0,
  seedCommunities?: Map<string, number>,
): ClusteringResult {
  // Handle empty inputs
  if (nodes.length === 0) {
    return { nodes: [], communities: [], modularity: 0 };
  }

  // Handle graph with no edges: every node is its own community
  if (edges.length === 0) {
    return buildIsolatedResult(nodes);
  }

  // --- Build initial adjacency structure ---
  // Map node names → contiguous indices for efficient internal processing
  const nodeIndex = new Map<string, number>();
  nodes.forEach((n, i) => nodeIndex.set(n, i));

  const n = nodes.length;

  // Weighted adjacency list: adj[i] = Map<j, weight>
  // Self-loops are stored once with their weight (used after aggregation).
  const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());

  // Total weight of the graph (sum of all edge weights; self-loops counted once)
  let totalWeight = 0;

  for (const edge of edges) {
    const si = nodeIndex.get(edge.source);
    const ti = nodeIndex.get(edge.target);
    if (si === undefined || ti === undefined) continue; // skip unknown nodes

    const w = edge.weight > 0 ? edge.weight : 1;

    if (si === ti) {
      // Self-loop
      adj[si].set(si, (adj[si].get(si) ?? 0) + w);
      totalWeight += w;
    } else {
      adj[si].set(ti, (adj[si].get(ti) ?? 0) + w);
      adj[ti].set(si, (adj[ti].get(si) ?? 0) + w);
      totalWeight += w;
    }
  }

  if (totalWeight === 0) {
    return buildIsolatedResult(nodes);
  }

  // --- Normalize seed communities ---
  let seedIds: number[] = Array.from({ length: n }, (_, i) => i);
  if (seedCommunities) {
    const uniqueSeeds = new Set<number>();
    for (const val of seedCommunities.values()) {
      uniqueSeeds.add(val);
    }
    const seedToContiguous = new Map<number, number>();
    let seedIdx = 0;
    for (const val of uniqueSeeds) {
      seedToContiguous.set(val, seedIdx++);
    }
    for (let i = 0; i < n; i++) {
      const nodeName = nodes[i];
      if (seedCommunities.has(nodeName)) {
        seedIds[i] = seedToContiguous.get(seedCommunities.get(nodeName)!)!;
      } else {
        seedIds[i] = seedIdx++;
      }
    }
  }

  // --- Iterative Louvain ---

  // Current-level graph properties (mutated across aggregation rounds)
  let currentAdj = adj;
  let currentN = n;
  // community[i] = community label of node i at the current level
  let community = [...seedIds];
  // Track mapping from current-level nodes back to original nodes
  // superToOriginal[superNode] = array of original node indices
  let superToOriginal: number[][] = Array.from({ length: n }, (_, i) => [i]);

  const MAX_PASSES = 20; // safety cap

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // ── Phase 1: Local node moves ──
    const moved = phase1(currentAdj, currentN, community, totalWeight, resolution);

    if (!moved) break; // convergence

    // ── Phase 2: Aggregate ──
    const agg = aggregate(currentAdj, currentN, community, superToOriginal);
    currentAdj = agg.adj;
    currentN = agg.n;
    community = Array.from({ length: currentN }, (_, i) => i);
    superToOriginal = agg.superToOriginal;
  }

  // --- Map final communities back to original node names ---
  // community[] now refers to the coarsest-level super-nodes.
  // superToOriginal maps each super-node to the original indices.
  // After final phase-1 without aggregation, community[i] gives the community
  // of coarse node i. We merge via superToOriginal.

  // Build final community id per original node
  const originalCommunity = new Int32Array(n);
  for (let i = 0; i < currentN; i++) {
    const cid = community[i];
    for (const origIdx of superToOriginal[i]) {
      originalCommunity[origIdx] = cid;
    }
  }

  // Re-label communities to contiguous 0-based ids
  const labelMap = new Map<number, number>();
  let nextLabel = 0;
  for (let i = 0; i < n; i++) {
    const raw = originalCommunity[i];
    if (!labelMap.has(raw)) {
      labelMap.set(raw, nextLabel++);
    }
    originalCommunity[i] = labelMap.get(raw)!;
  }

  // Compute degree per original node
  const degree = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (const w of adj[i].values()) {
      degree[i] += w;
    }
  }

  // Build ClusterNode[]
  const clusterNodes: ClusterNode[] = nodes.map((name, i) => ({
    id: name,
    community: originalCommunity[i],
    connections: degree[i],
  }));

  // Build Community[]
  const communityMembers = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const cid = originalCommunity[i];
    if (!communityMembers.has(cid)) communityMembers.set(cid, []);
    communityMembers.get(cid)!.push(nodes[i]);
  }

  const communities: Community[] = [];
  for (const [cid, members] of communityMembers) {
    let internalEdges = 0;
    let externalEdges = 0;

    // Count edges whose both endpoints are in this community (internal)
    // vs edges with one endpoint outside (external).
    const memberSet = new Set(members.map((m) => nodeIndex.get(m)!));
    for (const mi of memberSet) {
      for (const [ni, w] of adj[mi]) {
        if (mi === ni) {
          // self-loop: counted as internal
          internalEdges += w;
        } else if (memberSet.has(ni)) {
          // Both endpoints inside — each undirected edge is visited twice
          internalEdges += w;
        } else {
          externalEdges += w;
        }
      }
    }

    // Undirected edges were double-counted
    internalEdges = Math.round(internalEdges / 2);

    communities.push({ id: cid, members, internalEdges, externalEdges });
  }

  // Compute final modularity
  const mod = computeModularity(adj, n, originalCommunity, totalWeight, resolution);

  return { nodes: clusterNodes, communities, modularity: mod };
}

// ─── Label Propagation Community Detection ────────────────────────────────────

/**
 * Label Propagation community detection algorithm.
 *
 * Each node starts in its own community. On each iteration, nodes adopt the
 * community label that has the highest total edge weight among their neighbours.
 * The process repeats until convergence or `maxIterations` is reached.
 */
export function labelPropagationClustering(
  nodes: string[],
  edges: ClusterEdge[],
  maxIterations: number = 15,
  seedCommunities?: Map<string, number>,
): ClusteringResult {
  // Handle empty inputs
  if (nodes.length === 0) {
    return { nodes: [], communities: [], modularity: 0 };
  }

  // Handle graph with no edges: every node is its own community
  if (edges.length === 0) {
    return buildIsolatedResult(nodes);
  }

  const n = nodes.length;
  const nodeIndex = new Map<string, number>();
  nodes.forEach((name, i) => nodeIndex.set(name, i));

  // Build adjacency map: nodeIdx → Map<neighborIdx, weight>
  const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  let totalWeight = 0;

  for (const edge of edges) {
    const si = nodeIndex.get(edge.source);
    const ti = nodeIndex.get(edge.target);
    if (si === undefined || ti === undefined) continue;

    const w = edge.weight > 0 ? edge.weight : 1;

    if (si === ti) {
      adj[si].set(si, (adj[si].get(si) ?? 0) + w);
      totalWeight += w;
    } else {
      adj[si].set(ti, (adj[si].get(ti) ?? 0) + w);
      adj[ti].set(si, (adj[ti].get(si) ?? 0) + w);
      totalWeight += w;
    }
  }

  if (totalWeight === 0) {
    return buildIsolatedResult(nodes);
  }

  // --- Normalize seed communities ---
  let seedIds: number[] = Array.from({ length: n }, (_, i) => i);
  if (seedCommunities) {
    const uniqueSeeds = new Set<number>();
    for (const val of seedCommunities.values()) {
      uniqueSeeds.add(val);
    }
    const seedToContiguous = new Map<number, number>();
    let seedIdx = 0;
    for (const val of uniqueSeeds) {
      seedToContiguous.set(val, seedIdx++);
    }
    for (let i = 0; i < n; i++) {
      const nodeName = nodes[i];
      if (seedCommunities.has(nodeName)) {
        seedIds[i] = seedToContiguous.get(seedCommunities.get(nodeName)!)!;
      } else {
        seedIds[i] = seedIdx++;
      }
    }
  }

  // Initialize each node with its own community label or seed label
  const labels = [...seedIds];

  // Create index order array for shuffling
  const order = Array.from({ length: n }, (_, i) => i);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Shuffle the node order (Fisher-Yates)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }

    let anyChanged = false;

    for (const i of order) {
      // Accumulate total weight per neighbouring community label
      const communityWeights = new Map<number, number>();
      for (const [neighbor, w] of adj[i]) {
        if (neighbor === i) continue; // skip self-loops for label decision
        const nl = labels[neighbor];
        communityWeights.set(nl, (communityWeights.get(nl) ?? 0) + w);
      }

      if (communityWeights.size === 0) continue; // isolated node

      // Find the maximum weight
      let maxWeight = -Infinity;
      for (const w of communityWeights.values()) {
        if (w > maxWeight) maxWeight = w;
      }

      // Collect all labels tied at the maximum weight
      const candidates: number[] = [];
      for (const [label, w] of communityWeights) {
        if (w === maxWeight) candidates.push(label);
      }

      // Pick randomly among tied labels
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];

      if (chosen !== labels[i]) {
        labels[i] = chosen;
        anyChanged = true;
      }
    }

    if (!anyChanged) break;
  }

  // Re-label communities to contiguous 0-based ids
  const labelMap = new Map<number, number>();
  let nextLabel = 0;
  for (let i = 0; i < n; i++) {
    if (!labelMap.has(labels[i])) {
      labelMap.set(labels[i], nextLabel++);
    }
    labels[i] = labelMap.get(labels[i])!;
  }

  // Compute degree per node
  const degree = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (const w of adj[i].values()) {
      degree[i] += w;
    }
  }

  // Build ClusterNode[]
  const clusterNodes: ClusterNode[] = nodes.map((name, i) => ({
    id: name,
    community: labels[i],
    connections: degree[i],
  }));

  // Build Community[]
  const communityMembers = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const cid = labels[i];
    if (!communityMembers.has(cid)) communityMembers.set(cid, []);
    communityMembers.get(cid)!.push(nodes[i]);
  }

  const communities: Community[] = [];
  for (const [cid, members] of communityMembers) {
    let internalEdges = 0;
    let externalEdges = 0;

    const memberSet = new Set(members.map((m) => nodeIndex.get(m)!));
    for (const mi of memberSet) {
      for (const [ni, w] of adj[mi]) {
        if (mi === ni) {
          internalEdges += w;
        } else if (memberSet.has(ni)) {
          internalEdges += w;
        } else {
          externalEdges += w;
        }
      }
    }

    internalEdges = Math.round(internalEdges / 2);
    communities.push({ id: cid, members, internalEdges, externalEdges });
  }

  const mod = computeModularity(adj, n, labels, totalWeight);

  return { nodes: clusterNodes, communities, modularity: mod };
}

// ─── Connected Components Clustering ──────────────────────────────────────────

/**
 * Cluster nodes by connected components using BFS.
 * Each connected component becomes a community.
 */
export function connectedComponentsClustering(
  nodes: string[],
  edges: ClusterEdge[],
): ClusteringResult {
  // Handle empty inputs
  if (nodes.length === 0) {
    return { nodes: [], communities: [], modularity: 0 };
  }

  if (edges.length === 0) {
    return buildIsolatedResult(nodes);
  }

  const n = nodes.length;
  const nodeIndex = new Map<string, number>();
  nodes.forEach((name, i) => nodeIndex.set(name, i));

  // Build adjacency list
  const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  let totalWeight = 0;

  for (const edge of edges) {
    const si = nodeIndex.get(edge.source);
    const ti = nodeIndex.get(edge.target);
    if (si === undefined || ti === undefined) continue;

    const w = edge.weight > 0 ? edge.weight : 1;

    if (si === ti) {
      adj[si].set(si, (adj[si].get(si) ?? 0) + w);
      totalWeight += w;
    } else {
      adj[si].set(ti, (adj[si].get(ti) ?? 0) + w);
      adj[ti].set(si, (adj[ti].get(si) ?? 0) + w);
      totalWeight += w;
    }
  }

  // BFS to find connected components
  const componentId = new Int32Array(n).fill(-1);
  let currentComponent = 0;

  for (let i = 0; i < n; i++) {
    if (componentId[i] !== -1) continue;

    // BFS from node i
    const queue: number[] = [i];
    componentId[i] = currentComponent;

    let head = 0;
    while (head < queue.length) {
      const node = queue[head++];
      for (const neighbor of adj[node].keys()) {
        if (neighbor === node) continue; // skip self-loops
        if (componentId[neighbor] === -1) {
          componentId[neighbor] = currentComponent;
          queue.push(neighbor);
        }
      }
    }

    currentComponent++;
  }

  // Compute degree per node
  const degree = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (const w of adj[i].values()) {
      degree[i] += w;
    }
  }

  // Build ClusterNode[]
  const clusterNodes: ClusterNode[] = nodes.map((name, i) => ({
    id: name,
    community: componentId[i],
    connections: degree[i],
  }));

  // Build Community[]
  const communityMembers = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const cid = componentId[i];
    if (!communityMembers.has(cid)) communityMembers.set(cid, []);
    communityMembers.get(cid)!.push(nodes[i]);
  }

  const communities: Community[] = [];
  for (const [cid, members] of communityMembers) {
    let internalEdges = 0;
    let externalEdges = 0;

    const memberSet = new Set(members.map((m) => nodeIndex.get(m)!));
    for (const mi of memberSet) {
      for (const [ni, w] of adj[mi]) {
        if (mi === ni) {
          internalEdges += w;
        } else if (memberSet.has(ni)) {
          internalEdges += w;
        } else {
          externalEdges += w;
        }
      }
    }

    internalEdges = Math.round(internalEdges / 2);
    communities.push({ id: cid, members, internalEdges, externalEdges });
  }

  const mod = computeModularity(adj, n, componentId, totalWeight);

  return { nodes: clusterNodes, communities, modularity: mod };
}

// ─── No Clustering ────────────────────────────────────────────────────────────

/**
 * Placeholder clustering that places all nodes into a single community.
 * Modularity is 0.
 */
export function noClustering(nodes: string[]): ClusteringResult {
  return {
    nodes: nodes.map((name) => ({
      id: name,
      community: 0,
      connections: 0,
    })),
    communities: nodes.length > 0
      ? [{
          id: 0,
          members: [...nodes],
          internalEdges: 0,
          externalEdges: 0,
        }]
      : [],
    modularity: 0,
  };
}

// ─── Phase 1: Local Moves ─────────────────────────────────────────────────────

/**
 * Repeatedly scan all nodes and move each to the neighbouring community that
 * maximises modularity gain. Returns true if at least one move was made.
 */
function phase1(
  adj: Map<number, number>[],
  n: number,
  community: number[],
  totalWeight: number,
  resolution: number = 1.0,
): boolean {
  // Precompute: sum of weights of edges incident to each node (k_i)
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (const w of adj[i].values()) {
      k[i] += w;
    }
  }

  // Sum of weights incident to each community (Σ_tot)
  const sigmaTot = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sigmaTot[community[i]] += k[i];
  }

  const m2 = totalWeight * 2; // 2m
  let anyMoved = false;
  let changed = true;
  const MAX_ITERATIONS = 50; // safety cap for inner loop
  let iter = 0;

  while (changed && iter++ < MAX_ITERATIONS) {
    changed = false;

    for (let i = 0; i < n; i++) {
      const ci = community[i];
      const ki = k[i];

      // Compute k_{i,in} for each neighbouring community
      // (sum of weights from i to nodes in community c)
      const neighborWeights = new Map<number, number>();
      for (const [j, w] of adj[i]) {
        const cj = community[j];
        neighborWeights.set(cj, (neighborWeights.get(cj) ?? 0) + w);
      }

      // Gain of removing i from its own community
      const kiIn = neighborWeights.get(ci) ?? 0;
      const removeLoss = kiIn / totalWeight - resolution * (sigmaTot[ci] * ki) / (m2 * totalWeight);

      let bestGain = 0;
      let bestCommunity = ci;

      for (const [c, kiC] of neighborWeights) {
        if (c === ci) continue;
        // Modularity gain of inserting i into community c
        // ΔQ = [ k_{i,c} / m  -  Σ_tot_c * k_i / (2m²) ] - removeLoss
        const insertGain = kiC / totalWeight - resolution * (sigmaTot[c] * ki) / (m2 * totalWeight);
        const deltaQ = insertGain - removeLoss;

        if (deltaQ > bestGain) {
          bestGain = deltaQ;
          bestCommunity = c;
        }
      }

      if (bestCommunity !== ci) {
        // Move node i from ci to bestCommunity
        sigmaTot[ci] -= ki;
        sigmaTot[bestCommunity] += ki;
        community[i] = bestCommunity;
        changed = true;
        anyMoved = true;
      }
    }
  }

  return anyMoved;
}

// ─── Phase 2: Aggregation ─────────────────────────────────────────────────────

/**
 * Collapse communities into super-nodes and build a new weighted graph.
 */
function aggregate(
  adj: Map<number, number>[],
  n: number,
  community: number[],
  prevSuperToOriginal: number[][],
): {
  adj: Map<number, number>[];
  n: number;
  superToOriginal: number[][];
} {
  // Map community labels → contiguous super-node indices
  const labelSet = new Set(community);
  const labelToSuper = new Map<number, number>();
  let idx = 0;
  for (const l of labelSet) {
    labelToSuper.set(l, idx++);
  }
  const superN = labelSet.size;

  // Build mapping from super-nodes back to original nodes
  const superToOriginal: number[][] = Array.from({ length: superN }, () => []);
  for (let i = 0; i < n; i++) {
    const si = labelToSuper.get(community[i])!;
    superToOriginal[si].push(...prevSuperToOriginal[i]);
  }

  // Build new adjacency
  const newAdj: Map<number, number>[] = Array.from({ length: superN }, () => new Map());

  for (let i = 0; i < n; i++) {
    const si = labelToSuper.get(community[i])!;
    for (const [j, w] of adj[i]) {
      const sj = labelToSuper.get(community[j])!;
      if (si <= sj) {
        // To avoid double counting for undirected edges, we only add when si <= sj
        // Self-loops (si === sj) include both intra-community edges
        const key = sj;
        newAdj[si].set(key, (newAdj[si].get(key) ?? 0) + w);
        if (si !== sj) {
          newAdj[sj].set(si, (newAdj[sj].get(si) ?? 0) + w);
        }
      }
    }
  }

  return { adj: newAdj, n: superN, superToOriginal };
}

// ─── Modularity Calculation ───────────────────────────────────────────────────

/**
 * Compute Newman-Girvan modularity Q for a given partition.
 *
 *   Q = (1 / 2m) Σ_{ij} [ A_{ij} - k_i k_j / 2m ] δ(c_i, c_j)
 */
function computeModularity(
  adj: Map<number, number>[],
  n: number,
  community: Int32Array | number[],
  totalWeight: number,
  resolution: number = 1.0,
): number {
  const m2 = totalWeight * 2;
  if (m2 === 0) return 0;

  // Degree of each node
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (const w of adj[i].values()) {
      k[i] += w;
    }
  }

  let q = 0;
  for (let i = 0; i < n; i++) {
    for (const [j, aij] of adj[i]) {
      if (community[i] === community[j]) {
        q += aij - resolution * (k[i] * k[j]) / m2;
      }
    }
  }

  return q / m2;
}

// ─── Isolated Result Helper ───────────────────────────────────────────────────

/** Build a ClusteringResult where every node is its own community. */
function buildIsolatedResult(nodes: string[]): ClusteringResult {
  return {
    nodes: nodes.map((name, i) => ({ id: name, community: i, connections: 0 })),
    communities: nodes.map((name, i) => ({
      id: i,
      members: [name],
      internalEdges: 0,
      externalEdges: 0,
    })),
    modularity: 0,
  };
}

// ─── Color Generation ─────────────────────────────────────────────────────────

/**
 * Generate `count` visually distinct colours using the golden-angle
 * distribution in HSL space. Returns an array of hex colour strings.
 *
 * Saturation and lightness are tuned for pleasant dark-mode-friendly palettes.
 */
export function generateCommunityColors(count: number): string[] {
  if (count <= 0) return [];

  const GOLDEN_ANGLE = 137.508; // degrees
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    const hue = (i * GOLDEN_ANGLE) % 360;
    // Vary saturation slightly per index for extra distinctness
    const saturation = 65 + (i % 3) * 5; // 65-75%
    const lightness = 55 + (i % 3) * 5;  // 55-65%
    colors.push(hslToHex(hue, saturation, lightness));
  }

  return colors;
}

/**
 * Convert HSL values to a hex colour string.
 * h: 0-360, s: 0-100, l: 0-100
 */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0, g = 0, b = 0;

  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── Component Name Abbreviation ──────────────────────────────────────────────

/**
 * Abbreviate a component name for display in compact spaces.
 *
 * If the name contains '/' path separators, the last segment(s) are shown
 * up to `maxLength`. Otherwise, the name is truncated with an ellipsis.
 */
export function abbreviateComponentName(
  name: string,
  maxLength: number = 25,
): string {
  if (name.length <= maxLength) return name;

  if (name.includes('/')) {
    const segments = name.split('/');

    // Try progressively including more trailing segments
    let result = segments[segments.length - 1];
    for (let i = segments.length - 2; i >= 0; i--) {
      const candidate = segments.slice(i).join('/');
      if (candidate.length <= maxLength) {
        result = candidate;
      } else {
        break;
      }
    }

    // If even the last segment is too long, truncate it
    if (result.length > maxLength) {
      return result.slice(0, maxLength - 1) + '…';
    }

    // Prepend ellipsis to hint there is more
    if (result.length < name.length) {
      const withEllipsis = '…' + result;
      if (withEllipsis.length <= maxLength) return withEllipsis;
      return result; // drop ellipsis if it would exceed limit
    }

    return result;
  }

  // No slashes — simple truncation
  return name.slice(0, maxLength - 1) + '…';
}
