<template>
  <div class="w-full flex flex-col gap-6">
    <!-- Commit Activity contribution grid at the very top -->
    <div class="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs">
      <div class="overflow-x-auto scrollbar-none">
        <GitActivityChart :end-date="new Date()" :commits="gitCommits" class="border-0 bg-transparent p-0" />
      </div>
    </div>

    <section class="p-6 flex flex-col gap-6 bg-slate-50 border border-slate-100 rounded-3xl shadow-3xs">
      <!-- Summary Metrics Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs transition-all hover:shadow-sm">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Commits</span>
          <div class="text-2xl font-bold text-slate-800 mt-1">{{ gitCommits.length }}</div>
        </div>
        <div class="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs transition-all hover:shadow-sm">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Additions</span>
          <div class="text-2xl font-bold text-emerald-600 mt-1">+{{ totalAdditions }}</div>
        </div>
        <div class="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs transition-all hover:shadow-sm">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Deletions</span>
          <div class="text-2xl font-bold text-rose-600 mt-1">-{{ totalDeletions }}</div>
        </div>
      </div>

      <!-- Split Timeline and Authors -->
      <div class="flex flex-col lg:flex-row gap-6">
        <!-- Timeline (Left) -->
        <div class="flex-grow lg:w-2/3 bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
          <h3 class="font-bold text-slate-800 text-sm border-b border-slate-50 pb-2">Commit History Timeline</h3>
          <div v-if="gitCommits.length === 0" class="text-slate-400 italic text-sm py-12 text-center">
            No commit history recorded for this component.
          </div>
          <div v-else class="max-h-[500px] overflow-y-auto flex flex-col gap-3 pr-2 scrollbar-thin">
            <div 
              v-for="commit in gitCommits" 
              :key="commit.commit_hash" 
              class="border border-slate-100 hover:border-slate-200/80 rounded-xl p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40 hover:bg-slate-50"
            >
              <div class="flex flex-col gap-1 min-w-0">
                <span class="font-semibold text-slate-800 text-xs tracking-tight leading-snug break-words">
                  {{ commit.commit_message }}
                </span>
                <div class="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-medium">
                  <span class="font-bold text-slate-600">{{ commit.author_name }}</span>
                  <span>•</span>
                  <span>{{ formatDate(commit.commit_time) }}</span>
                  <span>•</span>
                  <span class="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{{ commit.commit_hash.substring(0, 7) }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2 text-xs font-mono font-bold flex-shrink-0">
                <span v-if="commit.additions" class="text-emerald-600 bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-100/50">+{{ commit.additions }}</span>
                <span v-if="commit.deletions" class="text-rose-600 bg-rose-50/50 px-2 py-0.5 rounded border border-rose-100/50">-{{ commit.deletions }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Authors (Right) -->
        <div class="lg:w-1/3 bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col gap-4 h-fit">
          <h3 class="font-bold text-slate-800 text-sm border-b border-slate-50 pb-2">Top Contributors</h3>
          <div v-if="topAuthors.length === 0" class="text-slate-400 italic text-sm py-12 text-center">
            No contributors recorded.
          </div>
          <div v-else class="flex flex-col gap-4">
            <div 
              v-for="author in topAuthors" 
              :key="author.name" 
              class="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-b-0 last:pb-0"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <!-- Initials Avatar -->
                <div class="w-8 h-8 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center font-extrabold text-slate-600 text-xs flex-shrink-0">
                  {{ author.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() }}
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="font-bold text-slate-700 text-xs truncate">{{ author.name }}</span>
                  <span class="text-[10px] text-slate-400 truncate">{{ author.email }}</span>
                </div>
              </div>
              <div class="bg-slate-50 text-slate-700 font-mono font-bold text-[10px] px-2 py-1 rounded-lg border border-slate-100 flex-shrink-0">
                {{ author.count }} commits
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useDataStore } from "~/stores/data"
import GitActivityChart from "~/components/components/git/git-activity/GitActivityChart.vue"
import type { GitCommit } from "~/utils/git"

const route = useRoute()
const store = useDataStore()

const nameInRoute = computed(() => route.params.name as string)

const gitCommits = computed(() => {
  if (!store.hasData) return []
  return store.query(
    `select commit_hash,
            commit_time,
            commit_message,
            author_name,
            author_email,
            count(file)         as files_changed,
            sum(file_additions) as additions,
            sum(file_deletions) as deletions
     from git_commits
     where component = '${nameInRoute.value}'
     group by commit_hash
    `
  ) as GitCommit[]
})

const totalAdditions = computed(() => {
  return gitCommits.value.reduce((acc, c) => acc + (Number(c.additions) || 0), 0)
})

const totalDeletions = computed(() => {
  return gitCommits.value.reduce((acc, c) => acc + (Number(c.deletions) || 0), 0)
})

const topAuthors = computed(() => {
  const counts: Record<string, { name: string, email: string, count: number }> = {}
  gitCommits.value.forEach(c => {
    const author = c.author_name || "Unknown Author"
    if (!counts[author]) {
      counts[author] = { name: author, email: c.author_email || "", count: 0 }
    }
    counts[author].count++
  })
  return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5)
})

function formatDate(timeString: string | number) {
  if (!timeString) return ""
  const date = new Date(timeString)
  return isNaN(date.getTime()) ? String(timeString) : date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>
