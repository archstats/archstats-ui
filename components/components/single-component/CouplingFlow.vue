<template>
  <div class="w-full bg-white border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col gap-6">
    <!-- Header with controls -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
      <div class="flex flex-col gap-1">
        <h3 class="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span>Coupling Hierarchy Flow</span>
          <span class="text-[10px] bg-slate-100 text-slate-500 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">Flow View</span>
        </h3>
        <p class="text-xs text-slate-400 leading-relaxed max-w-xl">
          Visual mapping of immediate and indirect path dependencies. Drag to pan, scroll to zoom. Click expandable nodes (<span class="text-indigo-600 font-extrabold">+</span>) to expand.
        </p>
      </div>

      <!-- Controls Stack -->
      <div class="flex flex-wrap items-center gap-3">
        <!-- Search filter -->
        <div class="relative w-40 sm:w-48">
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Search connections..." 
            class="w-full bg-slate-50 border border-slate-200 focus:border-slate-300 focus:bg-white text-xs font-medium pl-8 pr-3 py-1.5 rounded-xl outline-hidden text-slate-700 placeholder-slate-400 transition-all"
          />
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
          </svg>
          <button 
            v-if="searchQuery" 
            @click="searchQuery = ''" 
            class="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Limit Segmented Control -->
        <div class="flex items-center bg-slate-50 p-0.5 rounded-xl border border-slate-200/50">
          <button 
            v-for="limitOpt in limitOptions" 
            :key="limitOpt.value"
            @click="activeLimit = limitOpt.value"
            class="text-[10px] font-bold py-1 px-2.5 rounded-lg transition-all text-center tracking-wide"
            :class="activeLimit === limitOpt.value
              ? 'bg-white text-slate-800 shadow-xs border border-slate-200/20' 
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'"
          >
            {{ limitOpt.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Active Connections Count Badges & Expand Actions Panel -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex gap-4 text-[10px] font-bold">
        <span 
          class="px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all"
          :class="hoveredType === 'inbound' 
            ? 'bg-sky-100 border-sky-300 text-sky-800 scale-105' 
            : 'bg-sky-50/50 border-sky-100 text-sky-700'"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          Inbound Dependents: {{ dependents.length }}
        </span>
        <span 
          class="px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all"
          :class="hoveredType === 'outbound' 
            ? 'bg-rose-100 border-rose-300 text-rose-800 scale-105' 
            : 'bg-rose-50/50 border-rose-100 text-rose-700'"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          Outbound Dependencies: {{ dependencies.length }}
        </span>
      </div>

      <!-- Expand / Collapse All Toggles -->
      <div class="flex items-center gap-2">
        <button 
          @click="toggleExpandAll"
          class="text-[9px] font-extrabold px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer tracking-wider uppercase flex items-center gap-1 shadow-3xs"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3 text-slate-500">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          {{ isAnyExpanded ? 'Collapse All' : 'Expand All' }}
        </button>
      </div>
    </div>

    <!-- Canvas Wrapper with Zoom Controls -->
    <div class="relative w-full overflow-hidden bg-slate-50/30 border border-slate-100 rounded-2xl py-2 flex justify-center items-center">
      <svg 
        :width="width" 
        :height="height" 
        class="font-sans text-[10px] min-w-[850px] select-none"
        :viewBox="`0 0 ${width} ${height}`"
        :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseUp"
        @wheel="handleWheel"
      >
        <!-- Defs for arrow markers -->
        <defs>
          <marker id="arrow-to-center" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 2 L 10 5 L 0 8 z" fill="#0284c7" />
          </marker>
          <marker id="arrow-from-center" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 2 L 10 5 L 0 8 z" fill="#e11d48" />
          </marker>
        </defs>

        <!-- Master Drag & Scale Group -->
        <g :transform="`translate(${panX}, ${panY}) scale(${zoom})`">
          <!-- Center Node: Current Component -->
          <g :transform="`translate(${centerNode.x}, ${centerNode.y})`" class="group flow-element">
            <!-- Outer dynamic pulse halo if anything hovered -->
            <rect 
              x="-115" 
              y="-38" 
              width="230" 
              height="76" 
              rx="14" 
              fill="rgba(30, 41, 59, 0.04)"
              stroke="transparent"
              v-if="hoveredNode || hoveredLevel2Node"
            />
            <rect 
              x="-110" 
              y="-35" 
              width="220" 
              height="70" 
              rx="12" 
              fill="#1e293b" 
              stroke="#0f172a" 
              stroke-width="2.5"
              class="shadow-md transition-all duration-300"
            />
            <text 
              y="-8" 
              text-anchor="middle" 
              fill="#94a3b8" 
              class="font-bold text-[9px] uppercase tracking-wider font-sans"
            >
              Current Component
            </text>
            <text 
              y="14" 
              text-anchor="middle" 
              fill="#ffffff" 
              class="font-semibold font-mono text-[11px]"
            >
              {{ truncateName(component.name, 28) }}
            </text>
          </g>

          <!-- 1. LEFT COLUMN: Immediate Dependents (Inbound) -->
          <g 
            v-for="(dep, index) in topDependents" 
            :key="'in-' + dep.name"
            @mouseenter="hoveredNode = dep.name; hoveredType = 'inbound'"
            @mouseleave="hoveredNode = null; hoveredType = null"
          >
            <!-- Connection line to center component -->
            <path 
              :d="drawCurve(leftColumnX + 150, getLeftY(index), centerNode.x - 110, centerNode.y)"
              fill="none" 
              :stroke="hoveredNode === dep.name || isLeftNodeExpanded(dep.name) ? '#0ea5e9' : '#e2e8f0'" 
              :stroke-width="hoveredNode === dep.name || isLeftNodeExpanded(dep.name) ? 2.25 : 1.5" 
              :stroke-dasharray="hoveredNode === dep.name || isLeftNodeExpanded(dep.name) ? '6,4' : '4,4'"
              :class="{ 'animate-flow-in': hoveredNode === dep.name || isLeftNodeExpanded(dep.name) }"
              marker-end="url(#arrow-to-center)"
              class="flow-element"
            />

            <!-- Component Node Capsule -->
            <g 
              :transform="`translate(${leftColumnX}, ${getLeftY(index)})`" 
              class="cursor-pointer group flow-element"
              @click="handleNodeClick(dep.name, 'left')"
            >
              <!-- Outer border glow on hover or active expand -->
              <rect 
                x="-3" 
                y="-21" 
                width="156" 
                height="42" 
                rx="9" 
                :fill="isLeftNodeExpanded(dep.name) ? 'rgba(14, 165, 233, 0.08)' : 'rgba(14, 165, 233, 0.03)'"
                stroke="transparent"
                class="transition-all duration-200"
                v-if="hoveredNode === dep.name || isLeftNodeExpanded(dep.name)"
              />
              <rect 
                x="0" 
                y="-18" 
                width="150" 
                height="36" 
                rx="8" 
                :fill="isLeftNodeExpanded(dep.name) ? '#bae6fd' : hoveredNode === dep.name ? '#e0f2fe' : '#f0f9ff'" 
                :stroke="isLeftNodeExpanded(dep.name) ? '#0284c7' : hoveredNode === dep.name ? '#0ea5e9' : '#bae6fd'" 
                stroke-width="1.5" 
                class="transition-all duration-300 shadow-3xs"
              />
              
              <!-- Plus/Minus path expand indicator badge on the LEFT edge -->
              <g v-if="isLeftExpandable(dep.name)">
                <circle 
                  cx="0" 
                  cy="0" 
                  r="7" 
                  :fill="isLeftNodeExpanded(dep.name) ? '#0284c7' : '#ffffff'" 
                  :stroke="isLeftNodeExpanded(dep.name) ? '#0369a1' : '#bae6fd'" 
                  stroke-width="1.2"
                  class="transition-all duration-200"
                />
                <text 
                  y="2.5" 
                  text-anchor="middle" 
                  :fill="isLeftNodeExpanded(dep.name) ? '#ffffff' : '#0284c7'" 
                  class="font-extrabold text-[8px]"
                >
                  {{ isLeftNodeExpanded(dep.name) ? '−' : '+' }}
                </text>
              </g>

              <!-- Component Name Label -->
              <text 
                x="20" 
                y="4" 
                :fill="isLeftNodeExpanded(dep.name) ? '#0369a1' : '#0284c7'" 
                class="font-mono font-bold text-[9px] select-none group-hover:fill-sky-800"
              >
                {{ truncateName(dep.name, 16) }}
              </text>

              <!-- Dedicated Navigate details badge on the RIGHT edge area -->
              <g @click.stop="navToComponent(dep.name)" class="hover:scale-110 duration-200">
                <rect x="122" y="-8" width="16" height="16" rx="4" fill="#ffffff" stroke="#bae6fd" stroke-width="1" />
                <text x="130" y="4" text-anchor="middle" fill="#0284c7" class="font-bold text-[8px]">↗</text>
              </g>

              <!-- Count socket badge integrated directly on the RIGHT edge -->
              <g :transform="`translate(150, 0)`">
                <rect 
                  x="-10" 
                  y="-7" 
                  width="20" 
                  height="14" 
                  rx="4" 
                  :fill="isLeftNodeExpanded(dep.name) ? '#0284c7' : hoveredNode === dep.name ? '#bae6fd' : '#e0f2fe'" 
                  :stroke="isLeftNodeExpanded(dep.name) ? '#0369a1' : hoveredNode === dep.name ? '#0284c7' : '#bae6fd'" 
                  stroke-width="1" 
                  class="transition-all duration-200 shadow-3xs"
                />
                <text 
                  text-anchor="middle" 
                  y="3" 
                  :fill="isLeftNodeExpanded(dep.name) ? '#ffffff' : '#0369a1'" 
                  class="font-extrabold font-mono text-[8px]"
                >
                  {{ dep.count }}
                </text>
              </g>
            </g>
          </g>

          <!-- 2. OUTER LEFT COLUMN: Level 2 Inbound Dependents (Nested expansion path for ALL expanded nodes) -->
          <g v-for="parentName in expandedLeftNodes" :key="'l2-group-in-' + parentName">
            <g v-for="(dep2, index) in getLevel2Dependents(parentName)" :key="'in-l2-' + parentName + '-' + dep2.name">
              <!-- Connection curve to expanded parent -->
              <path 
                :d="drawCurve(outerLeftColumnX + 150, getOuterLeftY(index, getLeftParentY(parentName), getLevel2Dependents(parentName).length), leftColumnX, getLeftParentY(parentName))"
                fill="none" 
                :stroke="hoveredLevel2Node === dep2.name ? '#0ea5e9' : '#bae6fd'" 
                :stroke-width="hoveredLevel2Node === dep2.name ? 2 : 1.25" 
                :stroke-dasharray="hoveredLevel2Node === dep2.name ? '6,4' : '4,4'"
                :class="{ 'animate-flow-in': hoveredLevel2Node === dep2.name }"
                marker-end="url(#arrow-to-center)"
                class="flow-element cursor-pointer"
                @mouseenter="hoveredLevel2Node = dep2.name"
                @mouseleave="hoveredLevel2Node = null"
              />
              
              <!-- Level 2 Node Capsule Group -->
              <g 
                :transform="`translate(${outerLeftColumnX}, ${getOuterLeftY(index, getLeftParentY(parentName), getLevel2Dependents(parentName).length)})`" 
                class="cursor-pointer group flow-element"
                @mouseenter="hoveredLevel2Node = dep2.name"
                @mouseleave="hoveredLevel2Node = null"
                @click="navToComponent(dep2.name)"
              >
                <rect 
                  x="0" 
                  y="-18" 
                  width="150" 
                  height="36" 
                  rx="8" 
                  :fill="hoveredLevel2Node === dep2.name ? '#e0f2fe' : '#f0f9ff'" 
                  :stroke="hoveredLevel2Node === dep2.name ? '#0ea5e9' : '#bae6fd'" 
                  stroke-width="1.2" 
                  class="transition-all duration-200 shadow-3xs" 
                />
                <text 
                  x="12" 
                  y="4" 
                  fill="#0369a1" 
                  class="font-mono font-bold text-[9px]"
                >
                  {{ truncateName(dep2.name, 18) }}
                </text>
                <text x="130" y="4" text-anchor="middle" fill="#0ea5e9" class="font-bold text-[8px]">↗</text>
                
                <!-- Socket Badge on the right edge of Level 2 capsule -->
                <g :transform="`translate(150, 0)`">
                  <rect 
                    x="-10" 
                    y="-7" 
                    width="20" 
                    height="14" 
                    rx="4" 
                    :fill="hoveredLevel2Node === dep2.name ? '#0284c7' : '#e0f2fe'" 
                    :stroke="hoveredLevel2Node === dep2.name ? '#0369a1' : '#bae6fd'" 
                    stroke-width="1" 
                    class="transition-all duration-200 shadow-3xs" 
                  />
                  <text 
                    text-anchor="middle" 
                    y="3" 
                    :fill="hoveredLevel2Node === dep2.name ? '#ffffff' : '#0369a1'" 
                    class="font-bold font-mono text-[8px]"
                  >
                    {{ dep2.count }}
                  </text>
                </g>
              </g>
            </g>
          </g>

          <!-- Left empty state: Symmetrical Dashed Slate Placeholder Capsule -->
          <g 
            v-if="topDependents.length === 0"
            :transform="`translate(${leftColumnX}, ${centerNode.y})`" 
            class="opacity-60 select-none flow-element"
          >
            <rect 
              x="0" 
              y="-18" 
              width="150" 
              height="36" 
              rx="8" 
              fill="transparent" 
              stroke="#cbd5e1" 
              stroke-width="1.5" 
              stroke-dasharray="4,4"
            />
            <text 
              x="75" 
              y="4" 
              text-anchor="middle" 
              fill="#94a3b8" 
              class="font-sans font-semibold text-[9px] tracking-wide"
            >
              {{ searchQuery ? 'No Matches' : 'No Inbound Dependents' }}
            </text>
          </g>

          <!-- 3. RIGHT COLUMN: Immediate Dependencies (Outbound) -->
          <g 
            v-for="(dep, index) in topDependencies" 
            :key="'out-' + dep.name"
            @mouseenter="hoveredNode = dep.name; hoveredType = 'outbound'"
            @mouseleave="hoveredNode = null; hoveredType = null"
          >
            <!-- Connection line from center component -->
            <path 
              :d="drawCurve(centerNode.x + 110, centerNode.y, rightColumnX, getRightY(index))"
              fill="none" 
              :stroke="hoveredNode === dep.name || isRightNodeExpanded(dep.name) ? '#f43f5e' : '#e2e8f0'" 
              :stroke-width="hoveredNode === dep.name || isRightNodeExpanded(dep.name) ? 2.25 : 1.5" 
              :stroke-dasharray="hoveredNode === dep.name || isRightNodeExpanded(dep.name) ? '6,4' : '4,4'"
              :class="{ 'animate-flow-out': hoveredNode === dep.name || isRightNodeExpanded(dep.name) }"
              marker-end="url(#arrow-from-center)"
              class="flow-element"
            />

            <!-- Component Node Capsule -->
            <g 
              :transform="`translate(${rightColumnX}, ${getRightY(index)})`" 
              class="cursor-pointer group flow-element"
              @click="handleNodeClick(dep.name, 'right')"
            >
              <!-- Outer border glow on hover or active expand -->
              <rect 
                x="-3" 
                y="-21" 
                width="156" 
                height="42" 
                rx="9" 
                :fill="isRightNodeExpanded(dep.name) ? 'rgba(244, 63, 94, 0.08)' : 'rgba(244, 63, 94, 0.03)'"
                stroke="transparent"
                class="transition-all duration-200"
                v-if="hoveredNode === dep.name || isRightNodeExpanded(dep.name)"
              />
              <rect 
                x="0" 
                y="-18" 
                width="150" 
                height="36" 
                rx="8" 
                :fill="isRightNodeExpanded(dep.name) ? '#fecdd3' : hoveredNode === dep.name ? '#ffe4e6' : '#fff5f5'" 
                :stroke="isRightNodeExpanded(dep.name) ? '#e11d48' : hoveredNode === dep.name ? '#f43f5e' : '#fecdd3'" 
                stroke-width="1.5" 
                class="transition-all duration-300 shadow-3xs"
              />
              
              <!-- Plus/Minus path expand indicator badge on the RIGHT edge -->
              <g v-if="isRightExpandable(dep.name)">
                <circle 
                  cx="150" 
                  cy="0" 
                  r="7" 
                  :fill="isRightNodeExpanded(dep.name) ? '#e11d48' : '#ffffff'" 
                  :stroke="isRightNodeExpanded(dep.name) ? '#be123c' : '#fecdd3'" 
                  stroke-width="1.2"
                  class="transition-all duration-200"
                />
                <text 
                  x="150"
                  y="2.5" 
                  text-anchor="middle" 
                  :fill="isRightNodeExpanded(dep.name) ? '#ffffff' : '#e11d48'" 
                  class="font-extrabold text-[8px]"
                >
                  {{ isRightNodeExpanded(dep.name) ? '−' : '+' }}
                </text>
              </g>

              <!-- Component Name Label -->
              <text 
                x="36" 
                y="4" 
                :fill="isRightNodeExpanded(dep.name) ? '#be123c' : '#e11d48'" 
                class="font-mono font-bold text-[9px] select-none group-hover:fill-rose-800"
              >
                {{ truncateName(dep.name, 16) }}
              </text>

              <!-- Dedicated Navigate details badge on the LEFT edge area -->
              <g @click.stop="navToComponent(dep.name)" class="hover:scale-110 duration-200">
                <rect x="14" y="-8" width="16" height="16" rx="4" fill="#ffffff" stroke="#fecdd3" stroke-width="1" />
                <text x="22" y="4" text-anchor="middle" fill="#e11d48" class="font-bold text-[8px]">↗</text>
              </g>

              <!-- Count socket badge integrated directly on the LEFT edge -->
              <g :transform="`translate(0, 0)`">
                <rect 
                  x="-10" 
                  y="-7" 
                  width="20" 
                  height="14" 
                  rx="4" 
                  :fill="isRightNodeExpanded(dep.name) ? '#e11d48' : hoveredNode === dep.name ? '#fecdd3' : '#ffe4e6'" 
                  :stroke="isRightNodeExpanded(dep.name) ? '#be123c' : hoveredNode === dep.name ? '#e11d48' : '#fecdd3'" 
                  stroke-width="1" 
                  class="transition-all duration-200 shadow-3xs"
                />
                <text 
                  text-anchor="middle" 
                  y="3" 
                  :fill="isRightNodeExpanded(dep.name) ? '#ffffff' : '#be123c'" 
                  class="font-extrabold font-mono text-[8px]"
                >
                  {{ dep.count }}
                </text>
              </g>
            </g>
          </g>

          <!-- 4. OUTER RIGHT COLUMN: Level 2 Outbound Dependencies (Nested expansion path for ALL expanded nodes) -->
          <g v-for="parentName in expandedRightNodes" :key="'l2-group-out-' + parentName">
            <g v-for="(dep2, index) in getLevel2Dependencies(parentName)" :key="'out-l2-' + parentName + '-' + dep2.name">
              <!-- Connection curve from expanded parent -->
              <path 
                :d="drawCurve(rightColumnX + 150, getRightParentY(parentName), outerRightColumnX, getOuterRightY(index, getRightParentY(parentName), getLevel2Dependencies(parentName).length))"
                fill="none" 
                :stroke="hoveredLevel2Node === dep2.name ? '#f43f5e' : '#fecdd3'" 
                :stroke-width="hoveredLevel2Node === dep2.name ? 2 : 1.25" 
                :stroke-dasharray="hoveredLevel2Node === dep2.name ? '6,4' : '4,4'"
                :class="{ 'animate-flow-out': hoveredLevel2Node === dep2.name }"
                marker-end="url(#arrow-from-center)"
                class="flow-element cursor-pointer"
                @mouseenter="hoveredLevel2Node = dep2.name"
                @mouseleave="hoveredLevel2Node = null"
              />
              
              <!-- Level 2 Node Capsule Group -->
              <g 
                :transform="`translate(${outerRightColumnX}, ${getOuterRightY(index, getRightParentY(parentName), getLevel2Dependencies(parentName).length)})`" 
                class="cursor-pointer group flow-element"
                @mouseenter="hoveredLevel2Node = dep2.name"
                @mouseleave="hoveredLevel2Node = null"
                @click="navToComponent(dep2.name)"
              >
                <rect 
                  x="0" 
                  y="-18" 
                  width="150" 
                  height="36" 
                  rx="8" 
                  :fill="hoveredLevel2Node === dep2.name ? '#ffe4e6' : '#fff5f5'" 
                  :stroke="hoveredLevel2Node === dep2.name ? '#f43f5e' : '#fecdd3'" 
                  stroke-width="1.2" 
                  class="transition-all duration-200 shadow-3xs" 
                />
                <text 
                  x="24" 
                  y="4" 
                  fill="#be123c" 
                  class="font-mono font-bold text-[9px]"
                >
                  {{ truncateName(dep2.name, 18) }}
                </text>
                <!-- Details navigate inside Level 2 -->
                <g class="hover:scale-110 duration-200">
                  <rect x="6" y="-8" width="14" height="14" rx="3" fill="#ffffff" stroke="#fecdd3" stroke-width="1" />
                  <text x="13" y="2" text-anchor="middle" fill="#e11d48" class="font-bold text-[7px]">↗</text>
                </g>
                
                <!-- Socket Badge on the left edge of Level 2 capsule -->
                <g :transform="`translate(0, 0)`">
                  <rect 
                    x="-10" 
                    y="-7" 
                    width="20" 
                    height="14" 
                    rx="4" 
                    :fill="hoveredLevel2Node === dep2.name ? '#e11d48' : '#ffe4e6'" 
                    :stroke="hoveredLevel2Node === dep2.name ? '#be123c' : '#fecdd3'" 
                    stroke-width="1" 
                    class="transition-all duration-200 shadow-3xs" 
                  />
                  <text 
                    text-anchor="middle" 
                    y="3" 
                    :fill="hoveredLevel2Node === dep2.name ? '#ffffff' : '#be123c'" 
                    class="font-bold font-mono text-[8px]"
                  >
                    {{ dep2.count }}
                  </text>
                </g>
              </g>
            </g>
          </g>

          <!-- Right empty state: Symmetrical Dashed Slate Placeholder Capsule -->
          <g 
            v-if="topDependencies.length === 0"
            :transform="`translate(${rightColumnX}, ${centerNode.y})`" 
            class="opacity-60 select-none flow-element"
          >
            <rect 
              x="0" 
              y="-18" 
              width="150" 
              height="36" 
              rx="8" 
              fill="transparent" 
              stroke="#cbd5e1" 
              stroke-width="1.5" 
              stroke-dasharray="4,4"
            />
            <text 
              x="75" 
              y="4" 
              text-anchor="middle" 
              fill="#94a3b8" 
              class="font-sans font-semibold text-[9px] tracking-wide"
            >
              {{ searchQuery ? 'No Matches' : 'No Outbound Dependencies' }}
            </text>
          </g>
        </g>
      </svg>

      <!-- Zoom Floating Controls Panel -->
      <div class="absolute bottom-4 right-4 flex items-center bg-white/80 backdrop-blur-md border border-slate-200/60 p-1.5 rounded-2xl shadow-md gap-1">
        <button 
          @click="zoomIn"
          class="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer border border-slate-200/20 active:scale-95"
          title="Zoom In"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <button 
          @click="zoomOut"
          class="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer border border-slate-200/20 active:scale-95"
          title="Zoom Out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
          </svg>
        </button>
        <button 
          @click="resetZoom"
          class="w-7 h-7 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer border border-slate-200/20 active:scale-95"
          title="Reset Zoom"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
        <div class="h-4 w-px bg-slate-200/80 mx-1"></div>
        <span class="text-[9px] font-extrabold text-slate-500 font-mono px-1 min-w-[36px] text-center">
          {{ Math.round(zoom * 100) }}%
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, defineProps, watch } from "vue"
import { Component } from "~/utils/components"
import { useDataStore } from "~/stores/data"
import { useRouter } from "vue-router"

const store = useDataStore()
const router = useRouter()

const props = defineProps<{
  component: Component
}>()

// Limits options
const limitOptions = [
  { label: "Top 5", value: 5 },
  { label: "Top 10", value: 10 },
  { label: "Show All", value: 1000 }
]

const activeLimit = ref(5)
const searchQuery = ref("")
const hoveredNode = ref<string | null>(null)
const hoveredType = ref<'inbound' | 'outbound' | null>(null)

// Zoom and Pan States
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

function handleMouseDown(e: MouseEvent) {
  if (e.button !== 0) return // Left click only
  isDragging.value = true
  dragStart.value = { x: e.clientX - panX.value, y: e.clientY - panY.value }
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  panX.value = e.clientX - dragStart.value.x
  panY.value = e.clientY - dragStart.value.y
}

function handleMouseUp() {
  isDragging.value = false
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const zoomFactor = 1.15
  const nextZoom = e.deltaY < 0 ? zoom.value * zoomFactor : zoom.value / zoomFactor
  zoom.value = Math.max(0.3, Math.min(4.0, nextZoom))
}

function zoomIn() {
  zoom.value = Math.min(4.0, zoom.value * 1.25)
}

function zoomOut() {
  zoom.value = Math.max(0.3, zoom.value / 1.25)
}

function resetZoom() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

// Multiple Level 2 Node expansion arrays
const expandedLeftNodes = ref<string[]>([])
const expandedRightNodes = ref<string[]>([])
const hoveredLevel2Node = ref<string | null>(null)

// Coordinates Layout Width
const width = 1100

// Dynamic X placements depending on active expansions
const leftColumnX = computed(() => expandedLeftNodes.value.length > 0 ? 270 : 140)
const outerLeftColumnX = 40

const rightColumnX = computed(() => expandedRightNodes.value.length > 0 ? 680 : 810)
const outerRightColumnX = 910

// Reactive Canvas Height based on displayed components and total expanded parents fanning
const height = computed(() => {
  const leftCount = topDependents.value.length
  const rightCount = topDependencies.value.length
  
  const expandedCount = expandedLeftNodes.value.length + expandedRightNodes.value.length
  const baseSpacing = 68
  const maxNodes = Math.max(leftCount, rightCount, 1)
  
  return Math.max(320, maxNodes * baseSpacing + expandedCount * 120 + 80)
})

const centerNode = computed(() => ({
  x: width / 2,
  y: height.value / 2
}))

// Helper: check if left/right node is currently expanded
const isLeftNodeExpanded = (name: string): boolean => {
  return expandedLeftNodes.value.includes(name)
}

const isRightNodeExpanded = (name: string): boolean => {
  return expandedRightNodes.value.includes(name)
}

// Master Expand All helper state
const isAnyExpanded = computed(() => {
  return expandedLeftNodes.value.length > 0 || expandedRightNodes.value.length > 0
})

function toggleExpandAll() {
  if (isAnyExpanded.value) {
    expandedLeftNodes.value = []
    expandedRightNodes.value = []
  } else {
    expandedLeftNodes.value = topDependents.value
      .filter(d => isLeftExpandable(d.name))
      .map(d => d.name)
    
    expandedRightNodes.value = topDependencies.value
      .filter(d => isRightExpandable(d.name))
      .map(d => d.name)
  }
}

// Path index lookup helper: check if node has indirect dependents/dependencies
const isLeftExpandable = (name: string) => {
  if (!store.componentConnections) return false
  return store.componentConnections.some(conn => conn.to === name && conn.from !== props.component.name)
}

const isRightExpandable = (name: string) => {
  if (!store.componentConnections) return false
  return store.componentConnections.some(conn => conn.from === name && conn.to !== props.component.name)
}

// Inbound dependents calculations (grouped by component name, summing counts)
const dependents = computed(() => {
  if (!store.componentConnections) return []
  const grouped = new Map<string, number>()
  store.componentConnections
    .filter(conn => conn.to === props.component.name)
    .forEach(conn => {
      const count = conn.reference_count || 1
      grouped.set(conn.from, (grouped.get(conn.from) || 0) + count)
    })
  return Array.from(grouped.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
})

const filteredDependents = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return dependents.value
  return dependents.value.filter(d => d.name.toLowerCase().includes(q))
})

const topDependents = computed(() => filteredDependents.value.slice(0, activeLimit.value))

// Level 2 Inbound Dependents dynamic retrieval helper
function getLevel2Dependents(parentName: string) {
  if (!store.componentConnections) return []
  const grouped = new Map<string, number>()
  store.componentConnections
    .filter(conn => conn.to === parentName && conn.from !== props.component.name)
    .forEach(conn => {
      const count = conn.reference_count || 1
      grouped.set(conn.from, (grouped.get(conn.from) || 0) + count)
    })
  return Array.from(grouped.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5) // Show top 5 to keep fanning clean
}

// Outbound dependencies calculations (grouped by component name, summing counts)
const dependencies = computed(() => {
  if (!store.componentConnections) return []
  const grouped = new Map<string, number>()
  store.componentConnections
    .filter(conn => conn.from === props.component.name)
    .forEach(conn => {
      const count = conn.reference_count || 1
      grouped.set(conn.to, (grouped.get(conn.to) || 0) + count)
    })
  return Array.from(grouped.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
})

const filteredDependencies = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return dependencies.value
  return dependencies.value.filter(d => d.name.toLowerCase().includes(q))
})

const topDependencies = computed(() => filteredDependencies.value.slice(0, activeLimit.value))

// Level 2 Outbound Dependencies dynamic retrieval helper
function getLevel2Dependencies(parentName: string) {
  if (!store.componentConnections) return []
  const grouped = new Map<string, number>()
  store.componentConnections
    .filter(conn => conn.from === parentName && conn.to !== props.component.name)
    .forEach(conn => {
      const count = conn.reference_count || 1
      grouped.set(conn.to, (grouped.get(conn.to) || 0) + count)
    })
  return Array.from(grouped.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5) // Show top 5
}

// Parent Y anchor retrieval helpers
function getLeftParentY(parentName: string): number {
  const idx = topDependents.value.findIndex(d => d.name === parentName)
  if (idx === -1) return centerNode.value.y
  return getLeftY(idx)
}

function getRightParentY(parentName: string): number {
  const idx = topDependencies.value.findIndex(d => d.name === parentName)
  if (idx === -1) return centerNode.value.y
  return getRightY(idx)
}

function getLeftY(index: number) {
  const count = topDependents.value.length
  if (count === 1) return centerNode.value.y
  const availableHeight = height.value - 80
  const spacing = availableHeight / (count - 1 || 1)
  return 40 + index * spacing
}

function getRightY(index: number) {
  const count = topDependencies.value.length
  if (count === 1) return centerNode.value.y
  const availableHeight = height.value - 80
  const spacing = availableHeight / (count - 1 || 1)
  return 40 + index * spacing
}

// Clamped centering coordinates math to ensure no fanning overlaps
function getOuterLeftY(index: number, parentY: number, count: number) {
  if (count === 1) return parentY
  const spacing = 38
  const totalHeight = (count - 1) * spacing
  let startY = parentY - totalHeight / 2
  
  const minY = 30
  const maxY = height.value - 30
  if (startY < minY) startY = minY
  if (startY + totalHeight > maxY) startY = maxY - totalHeight
  
  return startY + index * spacing
}

function getOuterRightY(index: number, parentY: number, count: number) {
  if (count === 1) return parentY
  const spacing = 38
  const totalHeight = (count - 1) * spacing
  let startY = parentY - totalHeight / 2
  
  const minY = 30
  const maxY = height.value - 30
  if (startY < minY) startY = minY
  if (startY + totalHeight > maxY) startY = maxY - totalHeight
  
  return startY + index * spacing
}

function drawCurve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.abs(x2 - x1) * 0.45
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

function handleNodeClick(name: string, side: 'left' | 'right') {
  if (side === 'left') {
    if (isLeftExpandable(name)) {
      const idx = expandedLeftNodes.value.indexOf(name)
      if (idx !== -1) {
        expandedLeftNodes.value.splice(idx, 1)
      } else {
        expandedLeftNodes.value.push(name)
      }
    }
  } else {
    if (isRightExpandable(name)) {
      const idx = expandedRightNodes.value.indexOf(name)
      if (idx !== -1) {
        expandedRightNodes.value.splice(idx, 1)
      } else {
        expandedRightNodes.value.push(name)
      }
    }
  }
}

// Keep active expansions inside limits filter bound
watch([searchQuery, activeLimit], () => {
  expandedLeftNodes.value = expandedLeftNodes.value.filter(name => 
    topDependents.value.some(d => d.name === name)
  )
  expandedRightNodes.value = expandedRightNodes.value.filter(name => 
    topDependencies.value.some(d => d.name === name)
  )
})

function truncateName(name: string, maxLen: number): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  
  // Extract package/namespace last segment if possible (simplified middle/suffix truncation)
  const dotIdx = name.lastIndexOf('.')
  if (dotIdx !== -1 && name.length - dotIdx < maxLen) {
    return ".." + name.substring(dotIdx)
  }
  
  const slashIdx = Math.max(name.lastIndexOf("\\"), name.lastIndexOf("/"))
  if (slashIdx !== -1 && name.length - slashIdx < maxLen) {
    return ".." + name.substring(slashIdx)
  }
  
  return name.substring(0, maxLen - 2) + ".."
}

function navToComponent(name: string) {
  router.push(`/views/components/${name}`)
}
</script>

<style scoped>
/* Flow line dash animations */
@keyframes flow-inbound {
  to {
    stroke-dashoffset: 20;
  }
}
@keyframes flow-outbound {
  to {
    stroke-dashoffset: -20;
  }
}

.animate-flow-in {
  animation: flow-inbound 1s linear infinite;
}
.animate-flow-out {
  animation: flow-outbound 1s linear infinite;
}

/* Grab cursors for panning experience */
.cursor-grab {
  cursor: grab;
}
.cursor-grabbing {
  cursor: grabbing;
}

/* Premium hardware accelerated flow element glide transitions */
.flow-element {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), 
              opacity 0.4s ease, 
              fill 0.3s ease, 
              stroke 0.3s ease, 
              stroke-width 0.3s ease,
              d 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
