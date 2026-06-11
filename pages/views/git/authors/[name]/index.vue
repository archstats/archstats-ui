<template>
  <div class="w-full flex flex-col gap-6">
    <!-- 1. Profile Header -->
    <section class="bg-gradient-to-r from-violet-50/60 to-slate-50 border border-slate-100 rounded-3xl p-6 shadow-xs flex items-center gap-5">
      <!-- Initials Avatar -->
      <div class="w-16 h-16 rounded-2xl bg-violet-100 border-2 border-violet-200/80 flex items-center justify-center font-black text-violet-700 text-xl tracking-tight flex-shrink-0 shadow-xs">
        {{ initials }}
      </div>
      <div class="flex flex-col gap-1 min-w-0">
        <h2 class="text-lg font-extrabold text-slate-800 tracking-tight truncate">{{ authorName }}</h2>
        <span v-if="authorRow?.author_email" class="text-xs text-slate-400 font-medium truncate">{{ authorRow.author_email }}</span>
        <span class="text-[10px] font-bold text-violet-600 uppercase tracking-widest mt-0.5">Git Author</span>
      </div>
    </section>

    <!-- 2. KPI Cards Row -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs transition-all hover:shadow-sm">
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Commits</span>
        <div class="text-2xl font-black font-mono text-slate-800 mt-1">{{ Number(authorRow?.git__commits__total || 0).toLocaleString() }}</div>
      </div>
      <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs transition-all hover:shadow-sm">
        <span class="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Total Additions</span>
        <div class="text-2xl font-black font-mono text-emerald-600 mt-1">+{{ Number(authorRow?.git__additions__total || 0).toLocaleString() }}</div>
      </div>
      <div class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs transition-all hover:shadow-sm">
        <span class="text-[10px] font-black text-rose-400 uppercase tracking-widest">Total Deletions</span>
        <div class="text-2xl font-black font-mono text-rose-600 mt-1">-{{ Number(authorRow?.git__deletions__total || 0).toLocaleString() }}</div>
      </div>
    </div>

    <!-- 3. Time-Bucketed Activity Grid -->
    <section class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
      <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Activity by Period</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-slate-100">
              <th class="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 pr-4">Metric</th>
              <th class="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 px-4 text-right">Total</th>
              <th class="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 px-4 text-right">30d</th>
              <th class="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 px-4 text-right">90d</th>
              <th class="text-[10px] font-black text-slate-400 uppercase tracking-widest py-2 pl-4 text-right">180d</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="metric in timeBucketMetrics" :key="metric.label" class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <td class="text-xs font-bold text-slate-700 py-2.5 pr-4">{{ metric.label }}</td>
              <td class="text-xs font-black font-mono text-slate-800 py-2.5 px-4 text-right">{{ formatNum(metric.total) }}</td>
              <td class="text-xs font-black font-mono text-slate-600 py-2.5 px-4 text-right">{{ formatNum(metric.d30) }}</td>
              <td class="text-xs font-black font-mono text-slate-600 py-2.5 px-4 text-right">{{ formatNum(metric.d90) }}</td>
              <td class="text-xs font-black font-mono text-slate-600 py-2.5 pl-4 text-right">{{ formatNum(metric.d180) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 4. Component Hotspots -->
    <section class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
      <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Component Hotspots</h3>
      <div v-if="componentHotspots.length === 0" class="text-slate-400 italic text-sm py-8 text-center">
        No component data recorded for this author.
      </div>
      <div v-else class="flex flex-col gap-2.5">
        <NuxtLink
          v-for="item in componentHotspots"
          :key="item.component"
          :to="`/views/components/${item.component}`"
          class="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
        >
          <div class="flex-grow min-w-0">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-bold text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                {{ store.getComponentName(item.component) }}
              </span>
              <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                <span class="text-[10px] font-black font-mono text-slate-600">{{ item.commits }}</span>
                <span v-if="item.additions" class="text-[10px] font-mono font-bold text-emerald-600">+{{ item.additions }}</span>
                <span v-if="item.deletions" class="text-[10px] font-mono font-bold text-rose-600">-{{ item.deletions }}</span>
              </div>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="getHotspotBarColor(item.component)"
                :style="{ width: `${(item.commits / maxComponentCommits) * 100}%` }"
              ></div>
            </div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </NuxtLink>
      </div>
    </section>

    <!-- 5. Coupling Partners -->
    <section class="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-3xs">
      <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Coupling Partners</h3>
      <p class="text-[10px] text-slate-400 mb-4 -mt-2">Other authors who work on the same components</p>
      <div v-if="couplingPartners.length === 0" class="text-slate-400 italic text-sm py-8 text-center">
        No coupling partners found.
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NuxtLink
          v-for="partner in couplingPartners"
          :key="partner.author_name"
          :to="`/views/git/authors/${partner.author_name}`"
          class="group flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 transition-all cursor-pointer"
        >
          <div class="w-9 h-9 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center font-extrabold text-slate-600 text-[10px] flex-shrink-0">
            {{ partner.author_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() }}
          </div>
          <div class="flex flex-col min-w-0 flex-grow">
            <span class="text-xs font-bold text-slate-700 truncate group-hover:text-slate-900 transition-colors">{{ partner.author_name }}</span>
            <span class="text-[10px] text-slate-400 font-medium">{{ partner.shared_components }} shared components · {{ partner.commits }} commits</span>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"

const route = useRoute()
const store = useDataStore()

const authorName = computed(() => route.params.name as string)
const escapedName = computed(() => authorName.value.replace(/'/g, "''"))

const initials = computed(() => {
  return authorName.value
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
})

const authorRow = computed(() => {
  if (!store.hasData) return null
  const rows = store.query<Record<string, any>>(
    `SELECT * FROM git_authors WHERE author_name = '${escapedName.value}'`
  )
  return rows.length > 0 ? rows[0] : null
})

// Time-bucketed activity
const timeBucketMetrics = computed(() => {
  if (!authorRow.value) return []
  const r = authorRow.value
  return [
    {
      label: "Commits",
      total: r.git__commits__total,
      d30: r.git__commits__30d,
      d90: r.git__commits__90d,
      d180: r.git__commits__180d
    },
    {
      label: "Additions",
      total: r.git__additions__total,
      d30: r.git__additions__30d,
      d90: r.git__additions__90d,
      d180: r.git__additions__180d
    },
    {
      label: "Deletions",
      total: r.git__deletions__total,
      d30: r.git__deletions__30d,
      d90: r.git__deletions__90d,
      d180: r.git__deletions__180d
    },
    {
      label: "Files",
      total: r.git__files__total,
      d30: r.git__files__30d,
      d90: r.git__files__90d,
      d180: r.git__files__180d
    },
    {
      label: "Components",
      total: r.git__components__total,
      d30: r.git__components__30d,
      d90: r.git__components__90d,
      d180: r.git__components__180d
    }
  ]
})

function formatNum(val: any): string {
  const n = Number(val)
  if (isNaN(n) || val === undefined || val === null) return "—"
  return n.toLocaleString()
}

// Component Hotspots
const componentHotspots = computed(() => {
  if (!store.hasData) return []
  return store.query<{ component: string; commits: number; additions: number; deletions: number }>(
    `SELECT component, count(DISTINCT commit_hash) as commits, sum(file_additions) as additions, sum(file_deletions) as deletions
     FROM git_commits
     WHERE author_name = '${escapedName.value}'
     GROUP BY component
     ORDER BY commits DESC
     LIMIT 15`
  )
})

const maxComponentCommits = computed(() => {
  if (componentHotspots.value.length === 0) return 1
  return Math.max(...componentHotspots.value.map(c => Number(c.commits) || 1))
})

// Hotspot score color lookup
const hotspotScores = computed(() => {
  if (!store.hasData || componentHotspots.value.length === 0) return new Map<string, number>()
  const componentNames = componentHotspots.value.map(c => `'${c.component.replace(/'/g, "''")}'`).join(',')
  const rows = store.query<{ name: string; codesmells__hotspot_score: number }>(
    `SELECT name, codesmells__hotspot_score FROM components WHERE name IN (${componentNames})`
  )
  const map = new Map<string, number>()
  rows.forEach(r => map.set(r.name, Number(r.codesmells__hotspot_score) || 0))
  return map
})

function getHotspotBarColor(component: string): string {
  const score = hotspotScores.value.get(component) ?? 0
  if (score >= 0.7) return "bg-rose-500"
  if (score >= 0.4) return "bg-amber-400"
  return "bg-violet-500"
}

// Coupling Partners
const couplingPartners = computed(() => {
  if (!store.hasData) return []
  return store.query<{ author_name: string; shared_components: number; commits: number }>(
    `SELECT author_name, count(DISTINCT component) as shared_components, count(DISTINCT commit_hash) as commits
     FROM git_commits
     WHERE component IN (SELECT DISTINCT component FROM git_commits WHERE author_name = '${escapedName.value}')
       AND author_name != '${escapedName.value}'
     GROUP BY author_name
     ORDER BY shared_components DESC
     LIMIT 10`
  )
})
</script>
