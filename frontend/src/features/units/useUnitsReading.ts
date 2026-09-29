import { computed } from "vue"
import { useDataStore } from "~/features/snapshot/data.store"
import { laneOf, UNCLASSIFIED } from "~/features/frameworks/frameworkProfiles"
import { useFileGraph } from "~/features/checks/useFileGraph"
import { duplicateNames, reachability, sameNamedFiles } from "~/features/checks/checks"
import { useUnitsModel } from "./useUnitsModel"
import { laneFlows } from "./graph"
import { findingsFor, type Finding } from "./findings"
import { duplicateFinding, reachFinding } from "./checkFindings"

// The top of the Units descent, read once: the lanes, how they lean on each
// other, and the findings worth making. The Units landing and the Overview
// both draw from it, so the two never tell a different story.

export function useUnitsReading(extraRoots: () => RegExp[] = () => []) {
  const store = useDataStore()
  const model = useUnitsModel()

  const graph = computed(() => model.moduleGraph.value)

  const frameworkName = computed(() =>
    model.detection.value.confident && model.profile.value.id !== "structure" ? model.profile.value.label : "")

  function laneColor(lane: string) { return laneOf(model.profile.value, lane).color }
  function laneLabel(lane: string) { return laneOf(model.profile.value, lane).label }

  /** Lanes as bands, counted in modules rather than units. */
  const laneBands = computed(() => {
    const counts = new Map<string, number>()
    for (const m of graph.value.modules) counts.set(m.lane, (counts.get(m.lane) ?? 0) + 1)
    return model.profile.value.lanes
      .filter((l) => counts.has(l.id))
      .map((l) => ({ id: l.id, label: l.label, color: l.color, count: counts.get(l.id) ?? 0 }))
  })

  const laneOfModule = computed(() => new Map(graph.value.modules.map((m) => [m.path, m.lane])))
  const flows = computed(() => laneFlows(laneOfModule.value, graph.value.edges))
  // No reference between modules resolved, while the component graph has
  // thousands: the snapshot could not read unit references for this language,
  // not a codebase in which nothing imports anything. Absence findings built
  // on that would call every module a deletion candidate (nopCommerce: 3,537).
  const referencesUnresolved = computed(() => graph.value.edges.length === 0 && store.componentConnections.length > 0)
  /** Distinct component pairs, the figure Connections shows, not import rows. */
  const componentPairs = computed(() => new Set((store.componentConnections as Array<{ from: string; to: string }>).filter((c) => c.from !== c.to).map((c) => c.from + "\u0000" + c.to)).size)
  /** Lanes that are not layers, so a reference climbing into or out of them breaks nothing. */
  const notLayers = computed(() => [UNCLASSIFIED, ...model.profile.value.lanes.filter((l) => l.byReferences).map((l) => l.id)])

  // The file import graph -- unit references plus resolved raw imports plus the
  // imports read from files the engine could not parse -- is the one the
  // structure checks walk. The unit graph above is the one lanes are read on.
  const fileGraph = useFileGraph()
  const prodFiles = computed(() => [...fileGraph.production.value])
  const reach = computed(() => reachability(fileGraph.codeFiles.value, fileGraph.data.value.tests, fileGraph.edges.value, fileGraph.data.value.markers, { extraRoots: extraRoots() }))
  const dupNames = computed(() => duplicateNames(fileGraph.data.value.units, fileGraph.production.value))
  const dupFiles = computed(() => sameNamedFiles(prodFiles.value))

  const findings = computed(() => {
    const all = findingsFor({
      graph: graph.value, laneLabel, generated: model.generated.value,
      definitional: new Set(model.profile.value.lanes.filter((l) => l.byReferences).map((l) => l.id)),
    })
    // "Never imported" is the half of reachability a leaf can show; once the
    // entry-point walk is in, it says the same thing less well.
    const walked = !fileGraph.loading.value && fileGraph.edges.value.length > 0
    const checks = walked
      ? [reachFinding(reach.value, fileGraph.data.value.lines), duplicateFinding(dupNames.value, dupFiles.value)].filter((f): f is Finding => !!f)
      : []
    const kept = all.filter((f) => f.id !== "dark" || (!referencesUnresolved.value && !walked && !fileGraph.loading.value))
    return [...kept, ...checks]
  })

  return {
    model, graph, frameworkName, laneColor, laneLabel, laneBands, laneOfModule, flows,
    referencesUnresolved, componentPairs, notLayers,
    fileGraph, prodFiles, reach, dupNames, dupFiles, findings,
  }
}
