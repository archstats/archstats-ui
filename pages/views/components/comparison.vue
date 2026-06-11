<template>
  <div class="flex flex-col h-full bg-white">

    <!-- Top Controls Bar -->
    <div class="h-16 bg-white border-b border-archstats-100 flex px-8 gap-6 items-center shrink-0">
      <div class="flex items-center gap-2">
        <label class="text-xs font-bold text-archstats-400 uppercase tracking-wider whitespace-nowrap">Bubble Size</label>
        <StatSelectSingle
          v-model="relativeSize"
          :options="store.getDistinctComponentColumns"
          class="w-64"
        />
      </div>

      <label class="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-archstats-400 uppercase tracking-wider whitespace-nowrap">
        <input
          type="checkbox"
          v-model="clusterByGroup"
          class="rounded border-archstats-300 text-secondary-600 focus:ring-secondary-500 h-4 w-4"
        />
        Separate by Group
      </label>

      <!-- Search input -->
      <div class="relative flex items-center shrink-0 ml-2">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Search components..." 
          class="bg-white border border-slate-200 focus:border-slate-350 focus:outline-none focus:ring-1 focus:ring-slate-350 text-[10px] font-semibold pl-7 pr-7 py-2 rounded-xl text-slate-700 placeholder-slate-400 transition-all shadow-3xs w-44 md:w-56 animate-fade-in"
        />
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
        </svg>
        <button 
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer px-1"
        >
          ✕
        </button>
      </div>

      <div class="ml-auto text-[10px] text-archstats-400 italic select-none">
        💡 Click to navigate · Shift+Click to select · Drag to box-select
      </div>
    </div>

    <!-- Group Legend -->
    <div
      v-if="groupsStore.componentGroups.length > 0"
      class="bg-white border-b border-archstats-100 px-8 py-2.5 flex flex-wrap items-center gap-2 shrink-0"
    >
      <span class="text-[10px] font-bold text-archstats-300 uppercase tracking-wider mr-1">Groups:</span>
      <div
        v-for="group in groupsStore.componentGroups"
        :key="group.id"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer transition-all select-none"
        :class="[
          hiddenGroups.has(group.id)
            ? 'border-archstats-100 text-archstats-200 bg-archstats-50/50'
            : activeFilters.has(group.id)
              ? 'border-archstats-500 bg-archstats-50 text-archstats-800'
              : 'border-archstats-200 text-archstats-400 hover:border-archstats-400 hover:text-archstats-600'
        ]"
        @click="hiddenGroups.has(group.id) ? toggleGroupVisibility(group.id) : toggleFilter(group.id)"
        @mouseenter="!hiddenGroups.has(group.id) && (hoveredGroupId = group.id)"
        @mouseleave="hoveredGroupId = null"
      >
        <div class="w-2.5 h-2.5 rounded-full transition-opacity" :style="{ backgroundColor: group.color }" :class="hiddenGroups.has(group.id) ? 'opacity-20' : ''"></div>
        <span :class="hiddenGroups.has(group.id) ? 'line-through' : ''">{{ group.name }}</span>
        <span class="text-archstats-300 ml-0.5">({{ group.members.length }})</span>
        <button
          v-if="!hiddenGroups.has(group.id)"
          @click.stop="toggleGroupVisibility(group.id)"
          class="ml-0.5 text-archstats-300 hover:text-archstats-600 transition-colors cursor-pointer"
          title="Hide group from view"
        >✕</button>
      </div>

      <button
        v-if="activeFilters.size > 0 || hiddenGroups.size > 0"
        @click="activeFilters.clear(); hiddenGroups.clear()"
        class="ml-auto text-[10px] font-bold text-archstats-400 hover:text-archstats-600 cursor-pointer"
      >
        ✕ Clear
      </button>
    </div>

    <!-- Main area: canvas + optional selection sidebar (now absolutely positioned) -->
    <div class="flex-grow relative overflow-hidden">
      <!-- Canvas Container (always fills parent) -->
      <div ref="canvasContainer" class="w-full h-full relative bg-white overflow-hidden">
        <svg
          ref="svgEl"
          class="w-full h-full"
          :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
          @mouseleave="hoveredNode = null"
          @mousedown="onDragStart"
          @mousemove="onDragMove"
          @mouseup="onDragEnd"
          @wheel.prevent="onWheel"
        >
          <!-- Gradient definitions for multi-group nodes -->
          <defs>
            <linearGradient
              v-for="grad in multiColorGradients"
              :key="grad.id"
              :id="grad.id"
            >
              <stop
                v-for="(stop, idx) in grad.stops"
                :key="idx"
                :offset="stop.offset"
                :stop-color="stop.color"
              />
            </linearGradient>
          </defs>
          <g :transform="zoomTransformStr">
          <!-- Group boundary circles (when clustered) -->
          <g v-if="clusterByGroup">
            <g v-for="gc in groupCircles" :key="gc.id">
              <circle
                :cx="gc.x"
                :cy="gc.y"
                :r="gc.r"
                fill="none"
                :stroke="gc.color"
                stroke-width="1"
                stroke-dasharray="4 3"
                opacity="0.3"
              />
              <text
                :x="gc.x"
                :y="gc.y - gc.r - 8"
                text-anchor="middle"
                class="text-[10px] font-bold uppercase tracking-widest select-none pointer-events-none"
                :fill="gc.color"
                opacity="0.5"
              >
                {{ gc.name }}
              </text>
            </g>
          </g>

          <!-- Bubbles -->
          <g
            v-for="node in displayNodes"
            :key="node.name"
            :opacity="getOpacity(node)"
            :class="{ 'pointer-events-none': !isNodeSelectable(node) }"
            style="transition: opacity 0.2s ease;"
          >
            <!-- Selection ring -->
            <circle
              v-if="isSelected(node.name)"
              :cx="node.x"
              :cy="node.y"
              :r="node.r + 3"
              fill="none"
              stroke="#3b82f6"
              stroke-width="2"
              class="pointer-events-none"
            />
            <circle
              :cx="node.x"
              :cy="node.y"
              :r="node.r"
              :fill="getNodeFill(node)"
              :stroke="hoveredNode?.name === node.name ? '#1e293b' : (node.groups.length > 0 ? '#334155' : '#cbd5e1')"
              :stroke-width="hoveredNode?.name === node.name ? 2.5 : 1"
              class="cursor-pointer select-none"
              style="transition: r 0.3s ease-out;"
              @mouseenter="hoveredNode = node; updateTooltip($event)"
              @mousemove="updateTooltip($event)"
              @mouseleave="hoveredNode = null"
              @mousedown.stop="onBubbleMouseDown($event, node)"
              @click="handleBubbleClick($event, node)"
            />
            <text
              v-if="node.r > 18"
              :x="node.x"
              :y="node.y"
              text-anchor="middle"
              dominant-baseline="central"
              class="text-[7px] font-bold font-mono pointer-events-none select-none"
              :class="node.groups.length > 0 ? 'fill-white' : 'fill-archstats-500'"
            >
              {{ abbreviate(node.name) }}
            </text>
          </g>

          <!-- Drag selection box -->
          <rect
            v-if="dragRect"
            :x="dragRect.x"
            :y="dragRect.y"
            :width="dragRect.width"
            :height="dragRect.height"
            fill="rgba(59, 130, 246, 0.08)"
            stroke="#3b82f6"
            stroke-width="1"
            stroke-dasharray="4 2"
            class="pointer-events-none"
          />
          </g>
        </svg>

        <!-- Tooltip -->
        <div
          v-if="hoveredNode"
          class="absolute pointer-events-none bg-white border border-archstats-200 rounded-xl px-4 py-3 shadow-lg z-50 w-56"
          :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
        >
          <div class="font-mono font-bold text-xs text-archstats-800 break-all leading-tight mb-1.5">{{ hoveredNode.name }}</div>
          <div class="flex items-center gap-1 mb-1" v-if="hoveredNode.groups.length > 0">
            <span
              v-for="g in hoveredNode.groups"
              :key="g.id"
              class="w-2 h-2 rounded-full inline-block"
              :style="{ backgroundColor: g.color }"
            ></span>
            <span class="text-[10px] text-archstats-400 ml-1">{{ hoveredNode.groups.map(g => g.name).join(', ') }}</span>
          </div>
          <div class="text-[10px] text-archstats-400">
            {{ store.statNiceName(relativeSize) }}:
            <span class="font-bold text-archstats-700">{{ hoveredNode.hasValue ? formatVal(hoveredNode.rawValue) : 'N/A' }}</span>
          </div>
        </div>

        <!-- Zoom reset button -->
        <button
          v-if="zoomTransform.k !== 1 || zoomTransform.x !== 0 || zoomTransform.y !== 0"
          @click="resetZoom"
          class="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm border border-archstats-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-archstats-500 hover:text-archstats-700 hover:border-archstats-400 transition-all cursor-pointer shadow-sm z-40"
        >
          Reset Zoom
        </button>

        <!-- Selection Sidebar (floating absolutely) -->
        <Transition name="sidebar">
          <div
            v-if="selectedComponents.length > 0"
            class="absolute top-0 right-0 w-72 bg-white/95 backdrop-blur-md border-l border-archstats-100 flex flex-col h-full z-45 shadow-2xl"
          >
            <!-- Sidebar header -->
            <div class="px-4 py-3 border-b border-archstats-100 flex items-center justify-between shrink-0">
              <div>
                <div class="text-[9px] font-bold text-archstats-300 uppercase tracking-widest">Selection</div>
                <div class="text-xs font-extrabold text-archstats-800">{{ selectedComponents.length }} component{{ selectedComponents.length !== 1 ? 's' : '' }}</div>
              </div>
              <button
                @click="selectedComponents = []"
                class="text-[10px] font-bold text-archstats-400 hover:text-archstats-600 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-archstats-50 transition-colors"
              >
                ✕ Clear
              </button>
            </div>

            <!-- Selected items list -->
            <div class="flex-grow overflow-y-auto">
              <div
                v-for="item in selectedComponents"
                :key="item.name"
                class="group flex items-center gap-2 px-4 py-2 hover:bg-archstats-50/50 border-b border-archstats-50 transition-colors"
              >
                <!-- Group color dot -->
                <div class="flex gap-0.5 shrink-0">
                  <span
                    v-for="g in (item.groups || [])"
                    :key="g.id"
                    class="w-2 h-2 rounded-full"
                    :style="{ backgroundColor: g.color }"
                  ></span>
                  <span
                    v-if="!item.groups || item.groups.length === 0"
                    class="w-2 h-2 rounded-full bg-archstats-200"
                  ></span>
                </div>

                <!-- Name -->
                <div class="flex-grow min-w-0">
                  <div class="text-[11px] font-bold font-mono text-archstats-700 truncate">{{ abbreviate(item.name) }}</div>
                  <div class="text-[9px] text-archstats-300 truncate">{{ item.name }}</div>
                </div>

                <!-- Remove button -->
                <button
                  @click="removeFromSelection(item.name)"
                  class="opacity-0 group-hover:opacity-100 text-archstats-300 hover:text-red-500 transition-all cursor-pointer text-xs shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Reusable Group Action Bar -->
        <GroupsGroupActionBar
          :selected-items="selectedComponentNames"
          type="component"
          @clear="selectedComponents = []"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as d3 from 'd3'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, reactive } from 'vue'
import { useDataStore } from '~/stores/data'
import { useGroupsStore, type SavedGroup } from '~/stores/groups'
import StatSelectSingle from '~/components/ui/stat-select/StatSelectSingle.vue'

const router = useRouter()
const store = useDataStore()
const groupsStore = useGroupsStore()

useSeoMeta({ title: 'Comparison' })
definePageMeta({
  layout: 'has-data-layout',
  middleware: ['redirect-if-no-data'],
})

// ─── State ───
const relativeSize = ref(store.statName('complexity__files'))
const searchQuery = ref('')
const clusterByGroup = ref(false)
const hoveredGroupId = ref<string | null>(null)
const activeFilters = reactive(new Set<string>())
const hiddenGroups = reactive(new Set<string>())
const selectedComponents = ref<any[]>([])
const selectedComponentNames = computed(() => selectedComponents.value.map((c: any) => c.name))

const canvasContainer = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const canvasWidth = ref(800)
const canvasHeight = ref(600)

const hoveredNode = ref<DisplayNode | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })
const zoomTransform = ref<d3.ZoomTransform>(d3.zoomIdentity)
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null

const zoomTransformStr = computed(() => {
  const t = zoomTransform.value
  return `translate(${t.x},${t.y}) scale(${t.k})`
})

function resetZoom() {
  const svg = svgEl.value
  if (!svg || !zoomBehavior) return
  d3.select(svg).transition().duration(300).call(
    zoomBehavior!.transform as any, d3.zoomIdentity
  )
}

function toggleFilter(groupId: string) {
  if (activeFilters.has(groupId)) activeFilters.delete(groupId)
  else activeFilters.add(groupId)
}

function toggleGroupVisibility(groupId: string) {
  if (hiddenGroups.has(groupId)) hiddenGroups.delete(groupId)
  else hiddenGroups.add(groupId)
}

// ─── Selection ───
function isSelected(name: string) {
  return selectedComponentNames.value.includes(name)
}

function toggleSelection(node: DisplayNode) {
  const idx = selectedComponents.value.findIndex((c: any) => c.name === node.name)
  if (idx >= 0) {
    selectedComponents.value.splice(idx, 1)
  } else {
    selectedComponents.value.push(node)
  }
}

function removeFromSelection(name: string) {
  selectedComponents.value = selectedComponents.value.filter((c: any) => c.name !== name)
}



// ─── Drag box selection ───
const dragAnchor = ref<{ x: number; y: number } | null>(null)
const dragCurrent = ref<{ x: number; y: number } | null>(null)

const dragRect = computed(() => {
  if (!dragAnchor.value || !dragCurrent.value) return null
  const x = Math.min(dragAnchor.value.x, dragCurrent.value.x)
  const y = Math.min(dragAnchor.value.y, dragCurrent.value.y)
  const w = Math.abs(dragAnchor.value.x - dragCurrent.value.x)
  const h = Math.abs(dragAnchor.value.y - dragCurrent.value.y)
  if (w < 3 && h < 3) return null
  return { x, y, width: w, height: h }
})

function svgPoint(event: MouseEvent): { x: number; y: number } | null {
  const svg = svgEl.value
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.x = event.clientX
  pt.y = event.clientY
  const ctm = svg.getScreenCTM()?.inverse()
  if (!ctm) return null
  const svgP = pt.matrixTransform(ctm)
  // Invert zoom transform to get pre-zoom coordinates
  const t = zoomTransform.value
  return {
    x: (svgP.x - t.x) / t.k,
    y: (svgP.y - t.y) / t.k
  }
}

function onDragStart(event: MouseEvent) {
  if ((event.target as Element)?.tagName === 'circle') return
  const p = svgPoint(event)
  if (p) { dragAnchor.value = p; dragCurrent.value = p }
}

function onDragMove(event: MouseEvent) {
  if (!dragAnchor.value) return
  const p = svgPoint(event)
  if (p) dragCurrent.value = p
}

function onDragEnd() {
  if (dragRect.value) {
    const r = dragRect.value
    selectedComponents.value = displayNodes.value.filter(n =>
      n.x !== undefined && n.y !== undefined &&
      n.x > r.x && n.x < r.x + r.width &&
      n.y > r.y && n.y < r.y + r.height &&
      isNodeSelectable(n)
    )
  }
  dragAnchor.value = null
  dragCurrent.value = null
}

function isNodeSelectable(node: DisplayNode): boolean {
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    if (!node.name.toLowerCase().includes(q)) return false
  }

  if (activeFilters.size > 0) {
    const hasActiveFilter = node.groups.some(g => activeFilters.has(g.id))
    if (!hasActiveFilter) return false
  }

  return true
}

// ─── Bubble Dragging ───
const draggedNode = ref<DisplayNode | null>(null)
let dragHasMoved = false
let dragStartPos = { x: 0, y: 0 }
let lastDragHadMovement = false

function onBubbleMouseDown(event: MouseEvent, node: DisplayNode) {
  if (event.button !== 0) return // Only left-click
  draggedNode.value = node
  dragHasMoved = false
  dragStartPos = { x: event.clientX, y: event.clientY }

  // Fix the node's position to current coordinates
  node.fx = node.x
  node.fy = node.y

  // Reheat the simulation so physics updates immediately
  if (simulation) {
    simulation.alphaTarget(0.3).restart()
  }

  window.addEventListener('mousemove', onBubbleMouseMove)
  window.addEventListener('mouseup', onBubbleMouseUp)
}

function onBubbleMouseMove(event: MouseEvent) {
  const node = draggedNode.value
  if (!node) return

  const dx = event.clientX - dragStartPos.x
  const dy = event.clientY - dragStartPos.y
  if (!dragHasMoved && Math.sqrt(dx * dx + dy * dy) > 3) {
    dragHasMoved = true
  }

  const p = svgPoint(event)
  if (p) {
    node.fx = p.x
    node.fy = p.y
  }
}

function onBubbleMouseUp() {
  const node = draggedNode.value
  if (node) {
    // Release the fixed position
    node.fx = null
    node.fy = null

    // Cool the simulation
    if (simulation) {
      simulation.alphaTarget(0)
    }
  }

  lastDragHadMovement = dragHasMoved
  draggedNode.value = null

  window.removeEventListener('mousemove', onBubbleMouseMove)
  window.removeEventListener('mouseup', onBubbleMouseUp)

  // Clear lastDragHadMovement flag after a brief delay so click handlers can check it
  setTimeout(() => {
    lastDragHadMovement = false
  }, 50)
}

function handleBubbleClick(event: MouseEvent, node: DisplayNode) {
  if (lastDragHadMovement) {
    // It was a drag, do not navigate or select
    return
  }

  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    toggleSelection(node)
  } else {
    navigateTo(node)
  }
}

// ─── Trackpad / Wheel Panning ───
function onWheel(event: WheelEvent) {
  if (event.ctrlKey) {
    // Let D3 Zoom handle pinch-to-zoom / ctrl+wheel zoom
    return
  }
  if (zoomBehavior && svgEl.value) {
    const k = zoomTransform.value.k
    // Translate the zoom transform programmatically based on scroll deltas
    d3.select(svgEl.value).call(
      zoomBehavior.translateBy as any,
      -event.deltaX / k,
      -event.deltaY / k
    )
  }
}

// ─── Types ───
interface DisplayNode extends d3.SimulationNodeDatum {
  name: string
  x: number
  y: number
  r: number
  rawValue: number
  hasValue: boolean
  groups: SavedGroup[]
}

// ─── Layout data ───
const displayNodes = ref<DisplayNode[]>([])
const groupCircles = ref<Array<{ id: string; name: string; x: number; y: number; r: number; color: string }>>([])
let simulation: d3.Simulation<DisplayNode, undefined> | null = null

// ─── D3 Force Layout ───
function runForceLayout() {
  if (simulation) {
    simulation.stop()
  }

  const components = store.allComponents
  if (components.length === 0) {
    displayNodes.value = []
    groupCircles.value = []
    return
  }

  const w = canvasWidth.value
  const h = canvasHeight.value

  // Don't run layout if canvas has no dimensions yet
  if (w <= 0 || h <= 0) return

  const size = Math.min(w, h)

  // Map values to radius using scaleSqrt for area proportionality
  const vals = components.map(c => Number(c[relativeSize.value]) || 0)
  const maxVal = Math.max(...vals, 0)
  const sizeScale = d3.scaleSqrt()
    .domain([0, maxVal || 1])
    .range([8, 48])

  // Preserve positions of existing nodes for smooth transition
  const existingNodesMap = new Map<string, DisplayNode>()
  displayNodes.value.forEach(n => {
    // Only preserve positions that are valid and inside the current canvas
    if (!isNaN(n.x) && !isNaN(n.y) && n.x > 0 && n.y > 0 && n.x < w && n.y < h) {
      existingNodesMap.set(n.name, n)
    }
  })

  const nodes: DisplayNode[] = components.map(c => {
    const raw = c[relativeSize.value]
    const hasValue = raw !== null && raw !== undefined && raw !== ''
    const rawValue = Number(raw) || 0
    const groups = groupsStore.getGroupsForComponent(c.name)
    const radius = sizeScale(rawValue)

    const existing = existingNodesMap.get(c.name)
    return {
      name: c.name,
      x: existing ? existing.x : (w / 2 + (Math.random() - 0.5) * size * 0.5),
      y: existing ? existing.y : (h / 2 + (Math.random() - 0.5) * size * 0.5),
      r: radius,
      rawValue,
      hasValue,
      groups
    }
  })

  // Set up target centers depending on clustering toggle
  const centers = new Map<string, { x: number; y: number }>()
  const groupRadii = new Map<string, number>()

  // Determine visible (non-hidden) groups
  const visibleGroups = groupsStore.componentGroups.filter(g => !hiddenGroups.has(g.id))

  if (!clusterByGroup.value || visibleGroups.length === 0) {
    groupCircles.value = []
  } else {
    const allGroupedVisible = new Set<string>()
    visibleGroups.forEach(g => g.members.forEach(m => allGroupedVisible.add(m)))

    const groupIds = visibleGroups.map(g => g.id)
    // Components not in any visible group go to unassigned
    const hasUnassigned = nodes.some(n => {
      const vis = n.groups.filter(g => !hiddenGroups.has(g.id))
      return vis.length === 0
    })
    if (hasUnassigned) {
      groupIds.push('__unassigned__')
    }

    // Index nodes by their primary VISIBLE group for area computation
    const nodesByGroup = new Map<string, DisplayNode[]>()
    for (const gid of groupIds) nodesByGroup.set(gid, [])
    for (const node of nodes) {
      const visGroups = node.groups.filter(g => !hiddenGroups.has(g.id))
      if (visGroups.length > 0) {
        const gid = visGroups[0].id
        if (nodesByGroup.has(gid)) nodesByGroup.get(gid)!.push(node)
      } else if (nodesByGroup.has('__unassigned__')) {
        nodesByGroup.get('__unassigned__')!.push(node)
      }
    }

    // Compute boundary radius from actual member areas
    // Pack factor ~1.35 accounts for circle-in-circle packing inefficiency
    const PACK_FACTOR = 1.35
    const PADDING = 25
    for (const gid of groupIds) {
      const members = nodesByGroup.get(gid) || []
      const totalArea = members.reduce((sum, n) => sum + Math.PI * n.r * n.r, 0)
      const computedRadius = Math.sqrt(totalArea / Math.PI) * PACK_FACTOR + PADDING
      groupRadii.set(gid, Math.max(40, computedRadius))
    }

    // Adaptive orbit: largest group radius + a gap so groups don't overlap
    const maxGroupRadius = Math.max(...Array.from(groupRadii.values()))
    const cx = w / 2
    const cy = h / 2

    if (groupIds.length === 1) {
      // Single group → center it
      centers.set(groupIds[0], { x: cx, y: cy })
    } else {
      // Compute minimum orbit so adjacent groups don't overlap
      // For N groups equally spaced on a circle, the angular gap is 2π/N.
      // Adjacent groups touch when orbit ≥ (r1 + r2) / (2·sin(π/N))
      const n = groupIds.length
      const angleStep = (2 * Math.PI) / n
      let neededOrbit = 0
      for (let i = 0; i < n; i++) {
        const r1 = groupRadii.get(groupIds[i])!
        const r2 = groupRadii.get(groupIds[(i + 1) % n])!
        const minDist = r1 + r2 + 30 // 30px gap between groups
        const orbitForPair = minDist / (2 * Math.sin(Math.PI / n))
        neededOrbit = Math.max(neededOrbit, orbitForPair)
      }
      // Also ensure groups stay within the canvas with some margin
      const maxAllowed = Math.min(w, h) / 2 - maxGroupRadius - 20
      const orbitRadius = Math.min(neededOrbit, Math.max(maxAllowed, maxGroupRadius + 40))

      groupIds.forEach((gid, idx) => {
        const angle = (idx / n) * 2 * Math.PI - Math.PI / 2
        centers.set(gid, {
          x: cx + Math.cos(angle) * orbitRadius,
          y: cy + Math.sin(angle) * orbitRadius
        })
      })
    }

    groupCircles.value = groupIds.map(gid => {
      const center = centers.get(gid)!
      const name = gid === '__unassigned__' ? 'Unassigned' : (visibleGroups.find(g => g.id === gid)?.name || '')
      const color = gid === '__unassigned__' ? '#94a3b8' : (visibleGroups.find(g => g.id === gid)?.color || '#94a3b8')

      return {
        id: gid,
        name,
        x: center.x,
        y: center.y,
        r: groupRadii.get(gid)!,
        color
      }
    })
  }

  const getTargetCenter = (node: DisplayNode) => {
    if (!clusterByGroup.value || visibleGroups.length === 0) {
      return { x: w / 2, y: h / 2 }
    }
    // Get the node's visible groups
    const nodeVisGroups = node.groups.filter(g => !hiddenGroups.has(g.id))
    if (nodeVisGroups.length === 0) {
      return centers.get('__unassigned__') || { x: w / 2, y: h / 2 }
    }
    if (nodeVisGroups.length === 1) {
      return centers.get(nodeVisGroups[0].id) || { x: w / 2, y: h / 2 }
    }
    // Multi-group: gravitate toward the average of all visible group centers
    let avgX = 0, avgY = 0, count = 0
    for (const g of nodeVisGroups) {
      const c = centers.get(g.id)
      if (c) { avgX += c.x; avgY += c.y; count++ }
    }
    if (count === 0) return { x: w / 2, y: h / 2 }
    return { x: avgX / count, y: avgY / count }
  }

  // Get the boundary radius for a node's group (null if not clustering or multi-group)
  const getNodeGroupRadius = (node: DisplayNode): number | null => {
    if (!clusterByGroup.value || groupRadii.size === 0) return null
    const nodeVisGroups = node.groups.filter(g => !hiddenGroups.has(g.id))
    if (nodeVisGroups.length === 0) {
      return groupRadii.get('__unassigned__') ?? null
    }
    // Multi-group nodes float between groups — don't constrain to any single circle
    if (nodeVisGroups.length > 1) return null
    return groupRadii.get(nodeVisGroups[0].id) ?? null
  }

  // Extract component connections — use `count` field (not `strength`)
  const nodeSet = new Set<string>()
  nodes.forEach(n => nodeSet.add(n.name))

  interface SimLink { source: string; target: string; count: number }
  const links: SimLink[] = []
  store.componentConnections.forEach(conn => {
    if (nodeSet.has(conn.from) && nodeSet.has(conn.to) && conn.from !== conn.to) {
      const c = Number(conn.count) || 0
      if (c > 0) {
        links.push({ source: conn.from, target: conn.to, count: c })
      }
    }
  })

  // Set up and start D3 simulation
  const isClustering = clusterByGroup.value && groupRadii.size > 0
  simulation = d3.forceSimulation<DisplayNode>(nodes)
    .force('charge', d3.forceManyBody<DisplayNode>().strength(-20))
    .force('x', d3.forceX<DisplayNode>(d => getTargetCenter(d).x).strength(isClustering ? 0.25 : 0.12))
    .force('y', d3.forceY<DisplayNode>(d => getTargetCenter(d).y).strength(isClustering ? 0.25 : 0.12))
    .force('collide', d3.forceCollide<DisplayNode>().radius(d => d.r + 3).iterations(3))

  // Only use forceCenter when NOT clustering (it pulls everything to canvas center)
  if (!isClustering) {
    simulation.force('center', d3.forceCenter<DisplayNode>(w / 2, h / 2).strength(0.05))
  }

  if (links.length > 0) {
    const maxCount = Math.max(...links.map(l => l.count))
    simulation.force('link', d3.forceLink<DisplayNode, SimLink>(links)
      .id((d: any) => d.name)
      .distance(l => Math.max(20, 60 - (l.count / maxCount) * 40))
      .strength(l => 0.01 + (l.count / maxCount) * 0.04)
    )
  }

  simulation.on('tick', () => {
    for (const n of nodes) {
      // NaN guard
      if (isNaN(n.x!) || isNaN(n.y!)) {
        n.x = w / 2 + (Math.random() - 0.5) * 20
        n.y = h / 2 + (Math.random() - 0.5) * 20
        continue
      }
      // Boundary containment: keep nodes inside their group circle
      const groupR = getNodeGroupRadius(n)
      if (groupR !== null) {
        const center = getTargetCenter(n)
        const dx = n.x! - center.x
        const dy = n.y! - center.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const maxDist = groupR - n.r - 3
        if (maxDist > 0 && dist > maxDist) {
          n.x = center.x + dx * (maxDist / dist)
          n.y = center.y + dy * (maxDist / dist)
        }
      }
    }
    displayNodes.value = [...nodes]
  })

  simulation.alpha(1).restart()
}

// ─── Opacity ───
function getOpacity(node: DisplayNode): number {
  if (hoveredNode.value?.name === node.name) return 1

  // Search filter takes precedence
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    if (!node.name.toLowerCase().includes(q)) {
      return 0.05
    }
  }

  if (hoveredGroupId.value) {
    return node.groups.some(g => g.id === hoveredGroupId.value) ? 1 : 0.05
  }
  if (activeFilters.size > 0) {
    return node.groups.some(g => activeFilters.has(g.id)) ? 1 : 0.05
  }
  return 1
}

// ─── Helpers ───
function abbreviate(name: string) {
  const parts = name.split(/[\/\.:]/)
  return parts[parts.length - 1]
}

function formatVal(v: number): string {
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs < 0.001) return v.toExponential(2)
  if (abs < 0.01) return v.toFixed(4)
  if (abs < 1) return v.toFixed(3)
  if (v % 1 !== 0) return v.toFixed(2)
  return v.toLocaleString()
}

// ─── Multi-color gradients ───
const multiColorGradients = computed(() => {
  const seen = new Map<string, { id: string; stops: Array<{ offset: string; color: string }> }>()
  for (const node of displayNodes.value) {
    const visGroups = node.groups.filter(g => !hiddenGroups.has(g.id))
    if (visGroups.length > 1) {
      const colors = visGroups.map(g => g.color)
      const key = colors.join('-')
      if (!seen.has(key)) {
        const stops: Array<{ offset: string; color: string }> = []
        const n = colors.length
        for (let i = 0; i < n; i++) {
          // Sharp color stops: each color occupies an equal slice
          stops.push({ offset: `${(i / n) * 100}%`, color: colors[i] })
          stops.push({ offset: `${((i + 1) / n) * 100}%`, color: colors[i] })
        }
        seen.set(key, { id: `mg-${key.replace(/[^a-zA-Z0-9]/g, '')}`, stops })
      }
    }
  }
  return Array.from(seen.values())
})

function getNodeFill(node: DisplayNode): string {
  const visGroups = node.groups.filter(g => !hiddenGroups.has(g.id))
  if (visGroups.length === 0) return '#cbd5e1'
  if (visGroups.length === 1) return visGroups[0].color
  const key = visGroups.map(g => g.color).join('-')
  return `url(#mg-${key.replace(/[^a-zA-Z0-9]/g, '')})`
}

function navigateTo(node: DisplayNode) {
  router.push('/views/components/' + node.name)
}

function updateTooltip(event: MouseEvent) {
  const rect = canvasContainer.value?.getBoundingClientRect()
  if (!rect) return
  tooltipPos.value = {
    x: event.clientX - rect.left + 16,
    y: event.clientY - rect.top + 16,
  }
}

// ─── Resize ───
function measure() {
  if (canvasContainer.value) {
    canvasWidth.value = canvasContainer.value.clientWidth || 800
    canvasHeight.value = canvasContainer.value.clientHeight || 600
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(() => {
    measure()
    runForceLayout()
    // Set up D3 zoom behavior (scroll wheel to zoom)
    const svg = svgEl.value
    if (svg) {
      zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 8])
        .filter((event: any) => {
          // Only allow wheel zoom when ctrlKey is true (trackpad pinch or ctrl+scroll)
          if (event.type === 'wheel') return event.ctrlKey
          if (event.type === 'dblclick') return true
          // Allow touch gestures for pinch zoom/pan on mobile
          if (event.type === 'touchstart' || event.type === 'touchmove' || event.type === 'touchend') {
            return true
          }
          // Do not allow mouse drag-to-pan, as background drag is for box selection
          return false
        })
        .on('zoom', (event: any) => {
          zoomTransform.value = event.transform
        })
      d3.select(svg).call(zoomBehavior)
    }
  })
  if (canvasContainer.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        const newWidth = Math.round(entry.contentRect.width)
        const newHeight = Math.round(entry.contentRect.height)
        if (newWidth !== canvasWidth.value || newHeight !== canvasHeight.value) {
          canvasWidth.value = newWidth
          canvasHeight.value = newHeight
          runForceLayout()
        }
      }
    })
    resizeObserver.observe(canvasContainer.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  simulation?.stop()
  window.removeEventListener('mousemove', onBubbleMouseMove)
  window.removeEventListener('mouseup', onBubbleMouseUp)
})

watch([relativeSize, clusterByGroup, () => groupsStore.componentGroups, hiddenGroups], () => {
  runForceLayout()
}, { deep: true })
</script>

<style scoped>
.sidebar-enter-active,
.sidebar-leave-active {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.sidebar-enter-from,
.sidebar-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>