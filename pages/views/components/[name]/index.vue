<template>
  <div class="flex flex-col gap-6">
    <div v-if="component" class="flex flex-col gap-6 flow-element">
      
      <!-- 1. EXECUTIVE HEALTH SUMMARY BANNER -->
      <section class="bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="flex flex-col gap-2">
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Component Health status</div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>Executive Health Diagnostic</span>
            <span 
              class="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase border"
              :class="healthRatingClass"
            >
              {{ healthRatingLabel }}
            </span>
          </h2>
          <p class="text-xs text-slate-400 leading-relaxed max-w-lg">
            High-level metrics summary mapping architectural safety. Lower hotspot scores and higher code health ratings indicate clean, maintainable namespaces.
          </p>
        </div>

        <!-- Metric Rings Stack -->
        <div class="flex flex-wrap items-center gap-6">
          <!-- Code Health Circle -->
          <div class="flex items-center gap-3 bg-white border border-slate-200/40 px-4 py-3 rounded-2xl shadow-3xs">
            <div class="flex flex-col">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Code Health</span>
              <span class="text-xl font-extrabold text-slate-800 tracking-tight mt-0.5">
                <template v-if="hasMetric('Codesmells__code_health')">
                  {{ formatValue(getMetric('Codesmells__code_health'), 1) }}/10
                </template>
                <template v-else>
                  <span class="text-slate-300 italic font-normal text-sm">N/A</span>
                </template>
              </span>
            </div>
            <div class="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs" :class="healthScoreColorClass">
              ♥
            </div>
          </div>

          <!-- Risk Hotspot Card -->
          <div class="flex items-center gap-3 bg-white border border-slate-200/40 px-4 py-3 rounded-2xl shadow-3xs">
            <div class="flex flex-col">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Hotspot Score</span>
              <span class="text-xl font-extrabold text-slate-800 tracking-tight mt-0.5">
                <template v-if="hasMetric('Codesmells__hotspot_score')">
                  {{ formatValue(getMetric('Codesmells__hotspot_score'), 3) }}
                </template>
                <template v-else>
                  <span class="text-slate-300 italic font-normal text-sm">N/A</span>
                </template>
              </span>
            </div>
            <span 
              class="w-2.5 h-2.5 rounded-full" 
              :class="getBulletClass('Codesmells__hotspot_score')"
            ></span>
          </div>

          <!-- Size summary -->
          <div class="flex items-center gap-3 bg-white border border-slate-200/40 px-4 py-3 rounded-2xl shadow-3xs">
            <div class="flex flex-col">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Lines / Files</span>
              <span class="text-xl font-extrabold text-slate-800 tracking-tight mt-0.5">
                <template v-if="hasMetric('Complexity__lines')">
                  {{ getMetric('Complexity__lines').toLocaleString() }} <span class="text-[10px] text-slate-400 font-semibold">LOC</span>
                </template>
                <template v-else>
                  <span class="text-slate-300 italic font-normal text-sm">N/A LOC</span>
                </template>
              </span>
            </div>
            <span v-if="hasMetric('Complexity__files')" class="text-[10px] bg-slate-100 font-extrabold text-slate-600 px-2 py-1 rounded-lg">
              {{ getMetric('Complexity__files') }} files
            </span>
            <span v-else class="text-[10px] bg-slate-50 border border-slate-100 font-medium text-slate-400 px-2 py-1 rounded-lg italic">
              N/A files
            </span>
          </div>
        </div>
      </section>

      <!-- 2. THREE SAME-HEIGHT DIAGNOSTIC CARDS GRID -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <!-- CARD 1: ARCHITECTURAL CODESMELLS -->
        <div class="bg-white border border-slate-200/70 rounded-3xl p-6 shadow-xs flex flex-col justify-between gap-5 transition-all hover:shadow-sm">
          <div class="flex flex-col gap-1 border-b border-slate-100/70 pb-3">
            <h3 class="text-xs font-extrabold text-slate-800 tracking-tight uppercase tracking-wider">Architectural Codesmells</h3>
            <p class="text-[10px] text-slate-400 leading-snug">Visual logic flaws and design maintenance patterns.</p>
          </div>

          <div class="flex flex-col gap-3.5 my-1">
            <!-- Code Health Score -->
            <div 
              v-if="hasMetric('Codesmells__code_health')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Codesmells__code_health')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Codesmells__code_health')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Code Health Score</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Codesmells__code_health')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Codesmells__code_health') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Codesmells__code_health' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Codesmells__code_health') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Codesmells__code_health')">
                    {{ formatRank('Codesmells__code_health') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Codesmells__code_health') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ formatValue(getMetric('Codesmells__code_health'), 1) }}/10
              </div>
            </div>
            
            <!-- Hotspot Risk Score -->
            <div 
              v-if="hasMetric('Codesmells__hotspot_score')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Codesmells__hotspot_score')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Codesmells__hotspot_score')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Hotspot Risk Score</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Codesmells__hotspot_score')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Codesmells__hotspot_score') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Codesmells__hotspot_score' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Codesmells__hotspot_score') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Codesmells__hotspot_score')">
                    {{ formatRank('Codesmells__hotspot_score') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Codesmells__hotspot_score') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ formatValue(getMetric('Codesmells__hotspot_score'), 3) }}
              </div>
            </div>

            <!-- Bumpy Road Score -->
            <div 
              v-if="hasMetric('Codesmells__bumpy_road')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Codesmells__bumpy_road')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Codesmells__bumpy_road')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Bumpy Road Score</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Codesmells__bumpy_road')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Codesmells__bumpy_road') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Codesmells__bumpy_road' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Codesmells__bumpy_road') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Codesmells__bumpy_road')">
                    {{ formatRank('Codesmells__bumpy_road') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Codesmells__bumpy_road') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ getMetric('Codesmells__bumpy_road') }}
              </div>
            </div>

            <!-- Static Complexity -->
            <div 
              v-if="hasMetric('Codesmells__static_complexity_score')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Codesmells__static_complexity_score')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Codesmells__static_complexity_score')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Static Complexity</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Codesmells__static_complexity_score')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Codesmells__static_complexity_score') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Codesmells__static_complexity_score' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Codesmells__static_complexity_score') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Codesmells__static_complexity_score')">
                    {{ formatRank('Codesmells__static_complexity_score') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Codesmells__static_complexity_score') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ getMetric('Codesmells__static_complexity_score').toLocaleString() }}
              </div>
            </div>
          </div>
          
          <div class="text-[10px] text-slate-400 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100/70 select-none">
            A high bumpy road score points to nested structures, excessive control flow branches, or high cognitive complexity.
          </div>
        </div>

        <!-- CARD 2: COMPLEXITY & STRUCTURE -->
        <div class="bg-white border border-slate-200/70 rounded-3xl p-6 shadow-xs flex flex-col justify-between gap-5 transition-all hover:shadow-sm">
          <div class="flex flex-col gap-1 border-b border-slate-100/70 pb-3">
            <h3 class="text-xs font-extrabold text-slate-800 tracking-tight uppercase tracking-wider">Complexity & Structure</h3>
            <p class="text-[10px] text-slate-400 leading-snug">Physical size metrics and code structure indentations.</p>
          </div>

          <div class="flex flex-col gap-3.5 my-1">
            <!-- Lines of Code -->
            <div 
              v-if="hasMetric('Complexity__lines')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Complexity__lines')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Complexity__lines')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Lines of Code (LOC)</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Complexity__lines')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Complexity__lines') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Complexity__lines' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Complexity__lines') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Complexity__lines')">
                    {{ formatRank('Complexity__lines') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Complexity__lines') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ getMetric('Complexity__lines').toLocaleString() }}
              </div>
            </div>

            <!-- Included Source Files -->
            <div 
              v-if="hasMetric('Complexity__files')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Complexity__files')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Complexity__files')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Included Source Files</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Complexity__files')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Complexity__files') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Complexity__files' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Complexity__files') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Complexity__files')">
                    {{ formatRank('Complexity__files') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Complexity__files') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ getMetric('Complexity__files') }}
              </div>
            </div>

            <!-- Average Indentation -->
            <div 
              v-if="hasMetric('Complexity__Indentation__avg')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Complexity__Indentation__avg')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Complexity__Indentation__avg')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Average Indentation</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Complexity__Indentation__avg')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Complexity__Indentation__avg') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Complexity__Indentation__avg' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Complexity__Indentation__avg') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Complexity__Indentation__avg')">
                    {{ formatRank('Complexity__Indentation__avg') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Complexity__Indentation__avg') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ formatValue(getMetric('Complexity__Indentation__avg'), 3) }}
              </div>
            </div>

            <!-- Maximum Indentation -->
            <div 
              v-if="hasMetric('Complexity__Indentation__max')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Complexity__Indentation__max')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Complexity__Indentation__max')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Maximum Indentation</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Complexity__Indentation__max')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Complexity__Indentation__max') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Complexity__Indentation__max' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Complexity__Indentation__max') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Complexity__Indentation__max')">
                    {{ formatRank('Complexity__Indentation__max') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Complexity__Indentation__max') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ getMetric('Complexity__Indentation__max') }}
              </div>
            </div>
          </div>
          
          <div class="text-[10px] text-slate-400 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100/70 select-none">
            Source files list, directories summary, and detailed code-line distribution can be inspected under the **Files** tab.
          </div>
        </div>

        <!-- CARD 3: DEPENDENCY CYCLE RISK -->
        <div class="bg-white border border-slate-200/70 rounded-3xl p-6 shadow-xs flex flex-col justify-between gap-5 transition-all hover:shadow-sm">
          <div class="flex flex-col gap-1 border-b border-slate-100/70 pb-3">
            <h3 class="text-xs font-extrabold text-slate-800 tracking-tight uppercase tracking-wider">Dependency Cycle Risk</h3>
            <p class="text-[10px] text-slate-400 leading-snug">Structural cyclic coupling vulnerabilities.</p>
          </div>

          <div class="flex flex-col gap-3.5 my-1">
            <!-- Cyclic Connections -->
            <div 
              v-if="hasMetric('Cycles__Short__count')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Cycles__Short__count')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Cycles__Short__count')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Cyclic Connections</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Cycles__Short__count')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Cycles__Short__count') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Cycles__Short__count' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Cycles__Short__count') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Cycles__Short__count')">
                    {{ formatRank('Cycles__Short__count') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Cycles__Short__count') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ getMetric('Cycles__Short__count') }}
              </div>
            </div>

            <!-- Average Cycle Size -->
            <div 
              v-if="hasMetric('Cycles__Short__avg')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Cycles__Short__avg')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Cycles__Short__avg')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Average Cycle Size</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Cycles__Short__avg')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Cycles__Short__avg') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Cycles__Short__avg' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Cycles__Short__avg') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Cycles__Short__avg')">
                    {{ formatRank('Cycles__Short__avg') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Cycles__Short__avg') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ formatValue(getMetric('Cycles__Short__avg'), 1) }} nodes
              </div>
            </div>

            <!-- Maximum Cycle Size -->
            <div 
              v-if="hasMetric('Cycles__Short__max')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('Cycles__Short__max')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('Cycles__Short__max')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Maximum Cycle Size</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('Cycles__Short__max')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('Cycles__Short__max') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'Cycles__Short__max' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('Cycles__Short__max') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('Cycles__Short__max')">
                    {{ formatRank('Cycles__Short__max') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('Cycles__Short__max') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ getMetric('Cycles__Short__max') }} nodes
              </div>
            </div>

            <!-- Instability Index -->
            <div 
              v-if="hasMetric('modularity__instability')"
              class="flex items-center justify-between p-2.5 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all duration-200 group relative"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <div 
                  class="relative group/title flex items-center gap-1.5 cursor-help"
                  @mouseenter="handleMouseEnter('modularity__instability')"
                  @mouseleave="handleMouseLeave"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="getBulletClass('modularity__instability')"></span>
                  <span class="text-[11px] font-bold text-slate-700 underline decoration-dotted decoration-slate-200 group-hover/title:text-slate-900 transition-colors">Instability Index</span>
                  
                  <!-- Tooltip -->
                  <div 
                    v-if="getMetricDefinition('modularity__instability')"
                    class="absolute bottom-full left-0 mb-2 invisible group-hover/title:visible opacity-0 group-hover/title:opacity-100 transition-all duration-200 bg-slate-900/95 backdrop-blur-md text-white text-[10px] font-medium p-3 rounded-xl shadow-xl z-50 pointer-events-none w-72 leading-relaxed border border-white/10"
                  >
                    <div class="font-bold border-b border-white/10 pb-1 mb-1 text-slate-200 uppercase tracking-wider text-[8px]">Definition</div>
                    <div>{{ getMetricShortDefinition('modularity__instability') }}</div>
                    <div 
                      class="transition-all duration-300 overflow-hidden text-slate-300 mt-1.5 pt-1.5 border-t border-white/10"
                      :class="hoveredMetric === 'modularity__instability' && isLongHover ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'"
                    >
                      {{ getMetricLongDefinition('modularity__instability') }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 ml-3">
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('modularity__instability')">
                    {{ formatRank('modularity__instability') }}
                  </span>
                  <span class="text-[8.5px] text-slate-400 font-medium">
                    {{ formatPercentileText('modularity__instability') }}
                  </span>
                </div>
              </div>
              <div class="font-mono font-extrabold text-xs text-slate-800 bg-slate-50 border border-slate-200/30 px-2.5 py-1.5 rounded-xl min-w-[56px] text-center shadow-3xs group-hover:bg-white group-hover:border-slate-200 transition-all">
                {{ formatValue(getMetric('modularity__instability'), 3) }}
              </div>
            </div>
          </div>
          
          <div class="text-[10px] text-slate-400 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100/70 select-none">
            For cyclic paths inspection, component dependency node loops, and interactive path diagrams, check the **Cycles** tab.
          </div>
        </div>
      </div>

      <!-- 3. GRAPH CENTRALITY & INFLUENCE INSPECTOR CARD -->
      <section class="bg-gradient-to-r from-slate-50 to-slate-100/50 border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col gap-6 flow-element">
        <div class="flex flex-col gap-2">
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Analysis</div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <span>Graph Centrality & Influence Inspector</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-indigo-50 border border-indigo-200 text-indigo-700">
              Graph metrics
            </span>
          </h2>
          <p class="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Inspect network topology and coupling metrics. Higher PageRank and Betweenness values indicate highly critical, traffic-heavy hub components.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- 1. PageRank Influence -->
          <div class="bg-white border border-slate-200/40 p-4 rounded-2xl shadow-3xs flex flex-col justify-between gap-3 transition-all duration-300 hover:shadow-2xs hover:border-slate-300/60 hover:-translate-y-0.5 group">
            <div class="flex items-center justify-between">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-indigo-500 transition-colors">PageRank Influence</span>
              <span class="text-xs text-indigo-500 font-extrabold bg-indigo-50 px-2 py-0.5 rounded-md font-sans">Rank</span>
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex items-baseline gap-1.5">
                <span class="text-2xl font-extrabold text-slate-800 tracking-tight font-mono">
                  <template v-if="hasMetric('graph__page_rank')">
                    {{ formatValue(getMetric('graph__page_rank'), 4) }}
                  </template>
                  <template v-else>
                    <span class="text-slate-300 italic font-normal text-sm">N/A</span>
                  </template>
                </span>
              </div>
              <div class="flex items-center gap-1.5" v-if="hasMetric('graph__page_rank')">
                <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('graph__page_rank')">
                  {{ formatRank('graph__page_rank') }}
                </span>
                <span class="text-[8.5px] text-slate-400 font-medium">
                  {{ formatPercentileText('graph__page_rank') }}
                </span>
              </div>
            </div>
            <p class="text-[10px] text-slate-400 leading-normal">
              Measures global network structural import. Hub components have high ranks.
            </p>
          </div>

          <!-- 2. Betweenness Centrality -->
          <div class="bg-white border border-slate-200/40 p-4 rounded-2xl shadow-3xs flex flex-col justify-between gap-3 transition-all duration-300 hover:shadow-2xs hover:border-slate-300/60 hover:-translate-y-0.5 group">
            <div class="flex items-center justify-between">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-sky-500 transition-colors">Betweenness Centrality</span>
              <span class="text-xs text-sky-500 font-extrabold bg-sky-50 px-2 py-0.5 rounded-md font-sans">Bridge</span>
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex items-baseline gap-1.5">
                <span class="text-2xl font-extrabold text-slate-800 tracking-tight font-mono">
                  <template v-if="hasMetric('graph__betweenness')">
                    {{ formatValue(getMetric('graph__betweenness'), 1) }}
                  </template>
                  <template v-else>
                    <span class="text-slate-300 italic font-normal text-sm">N/A</span>
                  </template>
                </span>
              </div>
              <div class="flex items-center gap-1.5" v-if="hasMetric('graph__betweenness')">
                <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('graph__betweenness')">
                  {{ formatRank('graph__betweenness') }}
                </span>
                <span class="text-[8.5px] text-slate-400 font-medium">
                  {{ formatPercentileText('graph__betweenness') }}
                </span>
              </div>
            </div>
            <p class="text-[10px] text-slate-400 leading-normal">
              Measures how often this node lies on the shortest dependency path between others.
            </p>
          </div>

          <!-- 3. Afferent Coupling -->
          <div class="bg-white border border-slate-200/40 p-4 rounded-2xl shadow-3xs flex flex-col justify-between gap-3 transition-all duration-300 hover:shadow-2xs hover:border-slate-300/60 hover:-translate-y-0.5 group">
            <div class="flex items-center justify-between">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-emerald-500 transition-colors">Afferent Coupling</span>
              <span class="text-xs text-emerald-500 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md font-sans">Inbound</span>
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex items-baseline gap-1.5">
                <span class="text-2xl font-extrabold text-slate-800 tracking-tight font-mono">
                  <template v-if="hasMetric('modularity__coupling__afferent')">
                    {{ Math.round(getMetric('modularity__coupling__afferent')) }}
                  </template>
                  <template v-else>
                    <span class="text-slate-300 italic font-normal text-sm">N/A</span>
                  </template>
                </span>
                <span class="text-[10px] font-bold text-slate-400 font-sans" v-if="hasMetric('modularity__coupling__afferent')">dependents</span>
              </div>
              <div class="flex items-center gap-1.5" v-if="hasMetric('modularity__coupling__afferent')">
                <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('modularity__coupling__afferent')">
                  {{ formatRank('modularity__coupling__afferent') }}
                </span>
                <span class="text-[8.5px] text-slate-400 font-medium">
                  {{ formatPercentileText('modularity__coupling__afferent') }}
                </span>
              </div>
            </div>
            <p class="text-[10px] text-slate-400 leading-normal">
              Number of other components that directly depend on this component.
            </p>
          </div>

          <!-- 4. Efferent Coupling -->
          <div class="bg-white border border-slate-200/40 p-4 rounded-2xl shadow-3xs flex flex-col justify-between gap-3 transition-all duration-300 hover:shadow-2xs hover:border-slate-300/60 hover:-translate-y-0.5 group">
            <div class="flex items-center justify-between">
              <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-rose-500 transition-colors">Efferent Coupling</span>
              <span class="text-xs text-rose-500 font-extrabold bg-rose-50 px-2 py-0.5 rounded-md font-sans">Outbound</span>
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex items-baseline gap-1.5">
                <span class="text-2xl font-extrabold text-slate-800 tracking-tight font-mono">
                  <template v-if="hasMetric('modularity__coupling__efferent')">
                    {{ Math.round(getMetric('modularity__coupling__efferent')) }}
                  </template>
                  <template v-else>
                    <span class="text-slate-300 italic font-normal text-sm">N/A</span>
                  </template>
                </span>
                <span class="text-[10px] font-bold text-slate-400 font-sans" v-if="hasMetric('modularity__coupling__efferent')">dependencies</span>
              </div>
              <div class="flex items-center gap-1.5" v-if="hasMetric('modularity__coupling__efferent')">
                <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md" :class="getBadgeClass('modularity__coupling__efferent')">
                  {{ formatRank('modularity__coupling__efferent') }}
                </span>
                <span class="text-[8.5px] text-slate-400 font-medium">
                  {{ formatPercentileText('modularity__coupling__efferent') }}
                </span>
              </div>
            </div>
            <p class="text-[10px] text-slate-400 leading-normal">
              Number of other components that this component directly depends upon.
            </p>
          </div>
        </div>

        <!-- Additional Centralities Row -->
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-[10px] font-medium text-slate-500">
          <div class="flex items-center gap-1.5">
            <span class="font-bold text-slate-400 uppercase tracking-wider font-sans">Additional Centralities:</span>
          </div>
          <div class="flex items-center gap-1.5 bg-white border border-slate-200/30 px-2.5 py-1 rounded-lg shadow-3xs">
            <span>Harmonic Centrality:</span>
            <span class="font-mono font-bold text-slate-700">
              <template v-if="hasMetric('graph__harmonic_centrality')">
                {{ formatValue(getMetric('graph__harmonic_centrality'), 3) }}
              </template>
              <template v-else>N/A</template>
            </span>
          </div>
          <div class="flex items-center gap-1.5 bg-white border border-slate-200/30 px-2.5 py-1 rounded-lg shadow-3xs">
            <span>Farness Centrality:</span>
            <span class="font-mono font-bold text-slate-700">
              <template v-if="hasMetric('graph__farness_centrality')">
                {{ formatValue(getMetric('graph__farness_centrality'), 1) }}
              </template>
              <template v-else>N/A</template>
            </span>
          </div>
          <div class="flex items-center gap-1.5 bg-white border border-slate-200/30 px-2.5 py-1 rounded-lg shadow-3xs">
            <span>Residual Closeness:</span>
            <span class="font-mono font-bold text-slate-700">
              <template v-if="hasMetric('graph__residual_closeness')">
                {{ formatValue(getMetric('graph__residual_closeness'), 1) }}
              </template>
              <template v-else>N/A</template>
            </span>
          </div>
          <div class="flex items-center gap-1.5 bg-white border border-slate-200/30 px-2.5 py-1 rounded-lg shadow-3xs">
            <span>Authority Score:</span>
            <span class="font-mono font-bold text-slate-700">
              <template v-if="hasMetric('graph__hits__authority') || hasMetric('hits__authority_score')">
                {{ formatValue(getMetric('graph__hits__authority') || getMetric('hits__authority_score'), 3) }}
              </template>
              <template v-else>N/A</template>
            </span>
          </div>
          <div class="flex items-center gap-1.5 bg-white border border-slate-200/30 px-2.5 py-1 rounded-lg shadow-3xs">
            <span>Hub Score:</span>
            <span class="font-mono font-bold text-slate-700">
              <template v-if="hasMetric('graph__hits__hub') || hasMetric('hits__hub_score')">
                {{ formatValue(getMetric('graph__hits__hub') || getMetric('hits__hub_score'), 3) }}
              </template>
              <template v-else>N/A</template>
            </span>
          </div>
        </div>
      </section>

    </div>

    <div v-else class="text-center py-12 text-slate-400 font-medium italic">
      Component data is loading...
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import { useMetrics } from "~/composables/useMetrics"

const route = useRoute()
const store = useDataStore()
const { hasMetric, getMetricDefinition, getMetricShortDefinition, getMetricLongDefinition } = useMetrics()

const hoveredMetric = ref<string | null>(null)
const isLongHover = ref(false)
let hoverTimeout: any = null

function handleMouseEnter(metricKey: string) {
  hoveredMetric.value = metricKey
  isLongHover.value = false
  clearTimeout(hoverTimeout)
  hoverTimeout = setTimeout(() => {
    if (hoveredMetric.value === metricKey) {
      isLongHover.value = true
    }
  }, 750)
}

function handleMouseLeave() {
  hoveredMetric.value = null
  isLongHover.value = false
  clearTimeout(hoverTimeout)
}

onUnmounted(() => {
  clearTimeout(hoverTimeout)
})

const nameInRoute = computed(() => route.params.name as string)
const component = computed(() => store.allComponents.find((c: any) => c.name === nameInRoute.value)!)

const getMetric = (keyName: string): number => {
  if (!component.value) return 0
  const val = component.value[keyName] ?? 
              component.value[keyName.toLowerCase()] ?? 
              (store.statName ? component.value[store.statName(keyName)] : undefined) ?? 
              (store.statName ? component.value[store.statName(keyName.toLowerCase())] : undefined)
  return Number(val) || 0
}

const formatValue = (val: number, precision: number = 0): string => {
  if (val === undefined || isNaN(val)) return "N/A"
  return val.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  })
}

// Client-side rank and percentile calculator
interface ValItem {
  name: string
  val: number
}

const getMetricRankAndPercentile = (metricKey: string) => {
  if (!store.hasData || !store.allComponents.length || !component.value) {
    return { rank: 0, total: 0, percentile: 0, severity: 'low' }
  }

  // Resolve target key
  const targetKeyLower = metricKey.toLowerCase()
  const resolvedKeyLower = store.statName ? store.statName(metricKey).toLowerCase() : ""

  const allValues = store.allComponents
    .map((c: any): ValItem => {
      let val = c[metricKey]
      if (val === undefined) val = c[targetKeyLower]
      if (val === undefined && resolvedKeyLower) val = c[resolvedKeyLower]
      
      return {
        name: c.name,
        val: Number(val) || 0
      }
    });

  // Warning-aware sorting
  const isCodeHealth = metricKey.toLowerCase().includes("code_health")
  if (isCodeHealth) {
    // Lower score is worse (higher severity) -> sort ascending
    allValues.sort((a: ValItem, b: ValItem) => a.val - b.val)
  } else {
    // Higher score is worse (higher severity) -> sort descending
    allValues.sort((a: ValItem, b: ValItem) => b.val - a.val)
  }

  const targetName = component.value.name
  const index = allValues.findIndex((item: ValItem) => item.name === targetName)
  if (index === -1) {
    return { rank: 0, total: 0, percentile: 0, severity: 'low' }
  }

  const rank = index + 1
  const total = allValues.length
  
  // Percentile: how many components are better (or less severe) than us
  const percentile = Math.round(((total - rank) / (total || 1)) * 100)

  // Severity classification
  let severity: 'low' | 'medium' | 'high' = 'low'
  if (isCodeHealth) {
    const val = getMetric(metricKey)
    if (val >= 8.0) {
      severity = 'low'
    } else if (val >= 6.0) {
      severity = 'medium'
    } else {
      severity = 'high'
    }
  } else {
    if (percentile >= 85) {
      severity = 'high'
    } else if (percentile >= 60) {
      severity = 'medium'
    } else {
      severity = 'low'
    }
  }

  return { rank, total, percentile, severity }
}

const formatRank = (metricKey: string): string => {
  const { rank, total } = getMetricRankAndPercentile(metricKey)
  if (!rank) return "Rank N/A"
  return `Rank #${rank} of ${total}`
}

const formatPercentileText = (metricKey: string): string => {
  const { percentile, rank } = getMetricRankAndPercentile(metricKey)
  if (!rank) return ""
  
  // Ordinal suffix: 1st, 2nd, 3rd, 4th...
  const s = ["th", "st", "nd", "rd"]
  const v = percentile % 100
  const suffix = s[(v - 20) % 10] || s[v] || s[0]
  
  return `• ${percentile}${suffix} percentile`
}

const getBadgeClass = (metricKey: string): string => {
  const { severity, rank } = getMetricRankAndPercentile(metricKey)
  if (!rank) return "bg-slate-50 text-slate-500 border-slate-200"
  
  if (severity === 'high') {
    return "bg-rose-50 border border-rose-200 text-rose-700 font-bold animate-pulse-subtle"
  } else if (severity === 'medium') {
    return "bg-amber-50 border border-amber-200 text-amber-700 font-semibold"
  } else {
    return "bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium"
  }
}

const getBulletClass = (metricKey: string): string => {
  const { severity, rank } = getMetricRankAndPercentile(metricKey)
  if (!rank) return "bg-slate-300"
  
  if (severity === 'high') return "bg-rose-500"
  if (severity === 'medium') return "bg-amber-500"
  return "bg-emerald-500"
}

// Executive rating logic
const healthRatingLabel = computed(() => {
  if (!hasMetric('Codesmells__code_health')) {
    return "Diagnostics Unavailable"
  }
  const score = getMetric('Codesmells__code_health')
  if (score >= 8.0) return "Excellent Maintainability"
  if (score >= 6.0) return "Healthy"
  return "Needs Attention"
})

const healthRatingClass = computed(() => {
  if (!hasMetric('Codesmells__code_health')) {
    return "bg-slate-50 border-slate-200 text-slate-500 font-medium"
  }
  const score = getMetric('Codesmells__code_health')
  if (score >= 8.0) return "bg-emerald-50 border-emerald-200 text-emerald-700 font-bold"
  if (score >= 6.0) return "bg-amber-50 border-amber-200 text-amber-700"
  return "bg-rose-50 border-rose-200 text-rose-700 font-extrabold animate-pulse-subtle"
})

const healthScoreColorClass = computed(() => {
  if (!hasMetric('Codesmells__code_health')) {
    return "bg-slate-100 text-slate-400"
  }
  const score = getMetric('Codesmells__code_health')
  if (score >= 8.0) return "bg-emerald-100 text-emerald-800"
  if (score >= 6.0) return "bg-amber-100 text-amber-800"
  return "bg-rose-100 text-rose-800"
})
</script>

<style scoped>
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.02); }
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s infinite ease-in-out;
}
.flow-element {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>