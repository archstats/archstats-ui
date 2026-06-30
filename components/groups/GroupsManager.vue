<template>
  <div class="flex flex-col gap-3">
    <!-- Trigger Button -->
    <button
      @click="isModalOpen = true"
      class="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-archstats-800/80 hover:bg-archstats-700/80 border border-archstats-700/50 hover:border-archstats-600/50 transition-all cursor-pointer group"
    >
      <div class="flex items-center gap-2.5">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"
             class="w-4 h-4 text-archstats-400 group-hover:text-archstats-200 transition-colors shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
        </svg>
        <span class="text-xs font-bold text-archstats-200 group-hover:text-archstats-50 transition-colors">Manage Groups</span>
      </div>
      <span
        v-if="groupsStore.allGroups.length > 0"
        class="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md bg-archstats-700/60 text-archstats-300"
      >
        {{ groupsStore.allGroups.length }}
      </span>
    </button>

    <!-- ═══════════════════════════════════════════════════ -->
    <!-- MODAL WORKSPACE                                    -->
    <!-- ═══════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="isModalOpen"
          class="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6"
          @keydown.escape="closeModal"
        >
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeModal" />

          <!-- Modal Card -->
          <div
            class="relative w-full max-w-[960px] h-[min(720px,85vh)] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-modal-in"
            @click.stop
          >
            <!-- ── Header ──────────────────────────────── -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div class="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"
                     class="w-5 h-5 text-slate-400">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                </svg>
                <h2 class="text-base font-bold text-slate-800 tracking-tight">Groups Manager</h2>
                <span class="text-[10px] font-bold font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                  {{ groupsStore.allGroups.length }} group{{ groupsStore.allGroups.length === 1 ? '' : 's' }}
                </span>
              </div>
              <button
                @click="closeModal"
                class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- ── Body: Master-Detail Dual Pane ──────── -->
            <div class="flex flex-1 min-h-0">
              <!-- ─── LEFT PANE: Group Directory ─────── -->
              <div class="w-[280px] shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/50">
                <!-- Search -->
                <div class="px-4 py-3 border-b border-slate-100">
                  <div class="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
                         class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                      v-model="groupSearchQuery"
                      class="w-full pl-8 pr-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-slate-400"
                      placeholder="Search groups…"
                    />
                  </div>
                </div>

                <!-- Directory -->
                <div class="flex-1 overflow-y-auto scroll-container px-2 py-2">
                  <!-- Component Groups Section -->
                  <div class="mb-3">
                    <div class="flex items-center justify-between px-2 py-1.5">
                      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Component Groups</span>
                      <button
                        @click="startCreate('component')"
                        class="text-[9px] font-bold text-violet-500 hover:text-violet-700 cursor-pointer transition-colors"
                      >+ Create</button>
                    </div>
                    <div v-if="filteredComponentGroups.length === 0" class="px-2 py-2">
                      <p class="text-[10px] text-slate-400 italic">No component groups{{ groupSearchQuery ? ' matching' : '' }}</p>
                    </div>
                    <button
                      v-for="group in filteredComponentGroups"
                      :key="group.id"
                      class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer"
                      :class="selectedGroup?.id === group.id
                        ? 'bg-violet-50 border border-violet-200 shadow-sm'
                        : 'hover:bg-white border border-transparent hover:border-slate-200/60 hover:shadow-sm'"
                      @click="selectGroup(group)"
                    >
                      <span
                        class="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/50"
                        :style="{ backgroundColor: group.color }"
                      />
                      <div class="flex-1 min-w-0">
                        <span class="text-xs font-semibold text-slate-700 truncate block leading-tight">{{ group.name }}</span>
                        <span class="text-[10px] text-slate-400 leading-tight">{{ group.members.length }} member{{ group.members.length !== 1 ? 's' : '' }}</span>
                      </div>
                    </button>
                  </div>

                  <!-- File Groups Section -->
                  <div>
                    <div class="flex items-center justify-between px-2 py-1.5">
                      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">File Groups</span>
                      <button
                        @click="startCreate('file')"
                        class="text-[9px] font-bold text-violet-500 hover:text-violet-700 cursor-pointer transition-colors"
                      >+ Create</button>
                    </div>
                    <div v-if="filteredFileGroups.length === 0" class="px-2 py-2">
                      <p class="text-[10px] text-slate-400 italic">No file groups{{ groupSearchQuery ? ' matching' : '' }}</p>
                    </div>
                    <button
                      v-for="group in filteredFileGroups"
                      :key="group.id"
                      class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer"
                      :class="selectedGroup?.id === group.id
                        ? 'bg-violet-50 border border-violet-200 shadow-sm'
                        : 'hover:bg-white border border-transparent hover:border-slate-200/60 hover:shadow-sm'"
                      @click="selectGroup(group)"
                    >
                      <span
                        class="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/50"
                        :style="{ backgroundColor: group.color }"
                      />
                      <div class="flex-1 min-w-0">
                        <span class="text-xs font-semibold text-slate-700 truncate block leading-tight">{{ group.name }}</span>
                        <span class="text-[10px] text-slate-400 leading-tight">{{ group.members.length }} member{{ group.members.length !== 1 ? 's' : '' }}</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <!-- ─── RIGHT PANE: Editor ─────────────── -->
              <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
                <!-- ── Empty State (no selection, no creation) ── -->
                <div
                  v-if="!selectedGroup && !creatingType"
                  class="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4"
                >
                  <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"
                         class="w-7 h-7 text-slate-400">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-slate-700">Select or Create a Group</h3>
                    <p class="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                      Choose a group from the left panel to edit its settings and members, or create a new one.
                    </p>
                  </div>
                  <div class="flex gap-8 mt-4">
                    <div class="flex flex-col items-center gap-1.5">
                      <span class="text-xl font-black text-slate-700 font-mono">{{ groupsStore.componentGroups.length }}</span>
                      <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Component</span>
                    </div>
                    <div class="flex flex-col items-center gap-1.5">
                      <span class="text-xl font-black text-slate-700 font-mono">{{ groupsStore.fileGroups.length }}</span>
                      <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">File</span>
                    </div>
                    <div class="flex flex-col items-center gap-1.5">
                      <span class="text-xl font-black text-slate-700 font-mono">{{ totalMemberCount }}</span>
                      <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Members</span>
                    </div>
                  </div>
                </div>

                <!-- ── Creation Mode ── -->
                <div v-else-if="creatingType" class="flex-1 flex flex-col px-6 py-6 gap-5">
                  <div>
                    <h3 class="text-sm font-bold text-slate-800">
                      Create {{ creatingType === 'component' ? 'Component' : 'File' }} Group
                    </h3>
                    <p class="text-xs text-slate-400 mt-0.5">Set a name and color for your new group.</p>
                  </div>

                  <!-- Name -->
                  <div class="flex flex-col gap-1.5">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Group Name</label>
                    <input
                      ref="createNameInputRef"
                      v-model="newGroupName"
                      class="w-full max-w-sm px-3.5 py-2.5 text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-slate-300"
                      placeholder="e.g. Core Domain, Payment Module…"
                      @keydown.enter="confirmCreate"
                      @keydown.escape="cancelCreate"
                    />
                  </div>

                  <!-- Color -->
                  <div class="flex flex-col gap-2">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Color</label>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="color in COLOR_PALETTE"
                        :key="color"
                        class="w-7 h-7 rounded-full transition-all duration-150 cursor-pointer"
                        :class="newGroupColor === color
                          ? 'ring-2 ring-offset-2 ring-slate-400 scale-110'
                          : 'hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:ring-slate-200'"
                        :style="{ backgroundColor: color }"
                        @click="newGroupColor = color"
                      />
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="flex gap-2 mt-2">
                    <button
                      @click="confirmCreate"
                      :disabled="!newGroupName.trim()"
                      class="px-5 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed shadow-sm"
                    >
                      Create Group
                    </button>
                    <button
                      @click="cancelCreate"
                      class="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <!-- ── Edit Mode ── -->
                <div v-else-if="selectedGroup" class="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <!-- Group Settings Bar -->
                  <div class="px-6 py-4 border-b border-slate-100 shrink-0">
                    <div class="flex items-start justify-between gap-4">
                      <div class="flex-1 min-w-0">
                        <!-- Inline Name Edit -->
                        <div class="flex items-center gap-2 mb-2">
                          <span
                            class="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-offset-2 ring-slate-200 transition-colors"
                            :style="{ backgroundColor: selectedGroup.color }"
                          />
                          <input
                            v-model="editName"
                            @blur="saveNameIfChanged"
                            @keydown.enter="($event.target as HTMLInputElement)?.blur()"
                            class="text-base font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-violet-400 focus:outline-none transition-all py-0.5 px-1 -ml-1 min-w-0 flex-1"
                          />
                        </div>

                        <!-- Color Swatches (Compact) -->
                        <div class="flex flex-wrap gap-1.5 mt-1">
                          <button
                            v-for="color in COLOR_PALETTE"
                            :key="color"
                            class="w-5 h-5 rounded-full transition-all duration-150 cursor-pointer"
                            :class="selectedGroup.color === color
                              ? 'ring-2 ring-offset-1 ring-slate-400 scale-110'
                              : 'hover:scale-110 opacity-60 hover:opacity-100'"
                            :style="{ backgroundColor: color }"
                            @click="changeColor(color)"
                          />
                        </div>
                      </div>

                      <div class="flex items-center gap-2 shrink-0">
                        <NuxtLink
                          :to="`/views/groups/${selectedGroup.id}`"
                          class="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 hover:text-sky-850 transition-all cursor-pointer flex items-center gap-1 shadow-3xs select-none"
                          @click="closeModal"
                        >
                          <span>Open Details</span>
                          <span>↗</span>
                        </NuxtLink>

                        <!-- Delete Button -->
                        <button
                          @click="confirmDelete"
                          class="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer select-none"
                          :class="deleteConfirming
                            ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                            : 'text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200'"
                        >
                          {{ deleteConfirming ? 'Click to confirm delete' : 'Delete' }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- ── Dual-Column Member Manager ── -->
                  <div class="flex-1 flex min-h-0 overflow-hidden">
                    <!-- Left: Current Members -->
                    <div class="flex-1 flex flex-col border-r border-slate-100 min-w-0">
                      <div class="px-4 py-2.5 border-b border-slate-100 shrink-0 flex items-center justify-between">
                        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Current Members ({{ selectedGroup.members.length }})
                        </span>
                      </div>
                      <div class="px-3 py-2 border-b border-slate-50 shrink-0">
                        <input
                          v-model="memberSearchQuery"
                          class="w-full px-2.5 py-1.5 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-300 transition-all placeholder:text-slate-400"
                          placeholder="Filter members…"
                        />
                      </div>
                      <div class="flex-1 overflow-y-auto scroll-container">
                        <div v-if="filteredCurrentMembers.length === 0" class="px-4 py-6 text-center">
                          <p class="text-[10px] text-slate-400 italic">
                            {{ selectedGroup.members.length === 0 ? 'No members yet' : 'No members match filter' }}
                          </p>
                        </div>
                        <div
                          v-for="member in filteredCurrentMembers"
                          :key="member"
                          class="group flex items-center justify-between px-3 py-1.5 hover:bg-red-50/50 transition-colors border-b border-slate-50 last:border-0"
                        >
                          <span class="text-[11px] font-mono text-slate-600 truncate mr-2" :title="member">
                            {{ displayName(member) }}
                          </span>
                          <button
                            @click="removeMember(member)"
                            class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-0.5 rounded cursor-pointer shrink-0"
                            title="Remove member"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Right: Database Search to Add -->
                    <div class="flex-1 flex flex-col min-w-0">
                      <div class="px-4 py-2.5 border-b border-slate-100 shrink-0">
                        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Add from Database
                        </span>
                      </div>
                      <div class="px-3 py-2 border-b border-slate-50 shrink-0">
                        <input
                          v-model="dbSearchQuery"
                          class="w-full px-2.5 py-1.5 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-300 transition-all placeholder:text-slate-400"
                          :placeholder="selectedGroup.type === 'component' ? 'Search components…' : 'Search files…'"
                        />
                      </div>
                      <div class="flex-1 overflow-y-auto scroll-container">
                        <div v-if="dbSearchQuery.length < 2" class="px-4 py-6 text-center">
                          <p class="text-[10px] text-slate-400 italic">Type at least 2 characters to search</p>
                        </div>
                        <div v-else-if="availableItems.length === 0" class="px-4 py-6 text-center">
                          <p class="text-[10px] text-slate-400 italic">No matching items found</p>
                        </div>
                        <template v-else>
                          <div
                            v-for="item in availableItems"
                            :key="item"
                            class="group flex items-center justify-between px-3 py-1.5 hover:bg-green-50/50 transition-colors border-b border-slate-50 last:border-0"
                          >
                            <span class="text-[11px] font-mono text-slate-600 truncate mr-2" :title="item">
                              {{ displayName(item) }}
                            </span>
                            <button
                              @click="addMember(item)"
                              class="opacity-0 group-hover:opacity-100 text-green-500 hover:text-green-700 text-[10px] font-bold transition-all px-1.5 py-0.5 rounded cursor-pointer shrink-0 hover:bg-green-100"
                            >
                              + Add
                            </button>
                          </div>
                          <div v-if="dbSearchHitLimit" class="px-4 py-2 text-center">
                            <p class="text-[9px] text-slate-400 italic">Showing first 100 results — refine your search</p>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Footer ──────────────────────────────── -->
            <div class="flex items-center justify-between px-6 py-3 bg-slate-50 border-t border-slate-100 shrink-0">
              <div class="flex gap-2">
                <button
                  @click="triggerImport"
                  class="text-[10px] font-bold text-slate-500 hover:text-slate-700 hover:bg-white px-3 py-1.5 rounded-lg border border-slate-200 transition-all cursor-pointer"
                >
                  Import JSON
                </button>
                <button
                  @click="handleExport"
                  class="text-[10px] font-bold text-slate-500 hover:text-slate-700 hover:bg-white px-3 py-1.5 rounded-lg border border-slate-200 transition-all cursor-pointer"
                >
                  Export JSON
                </button>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".json"
                  class="hidden"
                  @change="handleImport"
                />
              </div>
              <button
                @click="closeModal"
                class="px-4 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useGroupsStore, type SavedGroup } from '~/stores/groups'
import { useDataStore } from '~/stores/data'

const groupsStore = useGroupsStore()
const dataStore = useDataStore()

const COLOR_PALETTE = [
  'hsl(210, 80%, 55%)',
  'hsl(160, 70%, 42%)',
  'hsl(340, 75%, 55%)',
  'hsl(45, 90%, 50%)',
  'hsl(270, 65%, 58%)',
  'hsl(15, 85%, 55%)',
  'hsl(190, 75%, 45%)',
  'hsl(330, 65%, 50%)',
  'hsl(95, 60%, 45%)',
  'hsl(240, 55%, 60%)',
  'hsl(30, 80%, 52%)',
  'hsl(175, 65%, 40%)',
]

// ═══════════════════════════════════════════════════════
// MODAL STATE
// ═══════════════════════════════════════════════════════

const isModalOpen = ref(false)
const selectedGroup = ref<SavedGroup | null>(null)
const groupSearchQuery = ref('')

// ── Edit State ────────────────────────────────────────
const editName = ref('')
const deleteConfirming = ref(false)
const memberSearchQuery = ref('')
const dbSearchQuery = ref('')

// ── Create State ──────────────────────────────────────
const creatingType = ref<'component' | 'file' | null>(null)
const newGroupName = ref('')
const newGroupColor = ref(COLOR_PALETTE[0])
const createNameInputRef = ref<HTMLInputElement | null>(null)

// ── File Input ────────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)

// ── Data Caches ───────────────────────────────────────
const allFilesCache = ref<string[]>([])

// ═══════════════════════════════════════════════════════
// COMPUTED
// ═══════════════════════════════════════════════════════

const totalMemberCount = computed(() =>
  groupsStore.allGroups.reduce((sum, g) => sum + g.members.length, 0)
)

const filteredComponentGroups = computed(() => {
  const q = groupSearchQuery.value.toLowerCase().trim()
  if (!q) return groupsStore.componentGroups
  return groupsStore.componentGroups.filter(g => g.name.toLowerCase().includes(q))
})

const filteredFileGroups = computed(() => {
  const q = groupSearchQuery.value.toLowerCase().trim()
  if (!q) return groupsStore.fileGroups
  return groupsStore.fileGroups.filter(g => g.name.toLowerCase().includes(q))
})

const filteredCurrentMembers = computed(() => {
  if (!selectedGroup.value) return []
  const q = memberSearchQuery.value.toLowerCase().trim()
  const members = selectedGroup.value.members
  if (!q) return members
  return members.filter(m => m.toLowerCase().includes(q) || displayName(m).toLowerCase().includes(q))
})

const availableItems = computed(() => {
  if (!selectedGroup.value || dbSearchQuery.value.length < 2) return []

  const q = dbSearchQuery.value.toLowerCase().trim()
  const currentMembers = new Set(selectedGroup.value.members)

  let sourceItems: string[]
  if (selectedGroup.value.type === 'component') {
    sourceItems = dataStore.allComponents.map(c => c.name)
  } else {
    sourceItems = allFilesCache.value
  }

  const results: string[] = []
  for (const item of sourceItems) {
    if (currentMembers.has(item)) continue
    if (item.toLowerCase().includes(q) || displayName(item).toLowerCase().includes(q)) {
      results.push(item)
      if (results.length >= 100) break
    }
  }
  return results
})

const dbSearchHitLimit = computed(() =>
  availableItems.value.length >= 100
)

// ═══════════════════════════════════════════════════════
// METHODS
// ═══════════════════════════════════════════════════════

function displayName(raw: string): string {
  if (!raw) return raw
  return dataStore.getComponentName ? dataStore.getComponentName(raw) : raw
}

function closeModal() {
  isModalOpen.value = false
  selectedGroup.value = null
  creatingType.value = null
  deleteConfirming.value = false
  groupSearchQuery.value = ''
  memberSearchQuery.value = ''
  dbSearchQuery.value = ''
}

function selectGroup(group: SavedGroup) {
  selectedGroup.value = group
  editName.value = group.name
  deleteConfirming.value = false
  creatingType.value = null
  memberSearchQuery.value = ''
  dbSearchQuery.value = ''
}

function saveNameIfChanged() {
  if (!selectedGroup.value) return
  const trimmed = editName.value.trim()
  if (trimmed && trimmed !== selectedGroup.value.name) {
    groupsStore.updateGroup(selectedGroup.value.id, { name: trimmed })
  }
}

function changeColor(color: string) {
  if (!selectedGroup.value) return
  groupsStore.updateGroup(selectedGroup.value.id, { color })
}

function confirmDelete() {
  if (!selectedGroup.value) return
  if (!deleteConfirming.value) {
    deleteConfirming.value = true
    return
  }
  const id = selectedGroup.value.id
  groupsStore.deleteGroup(id)
  selectedGroup.value = null
  deleteConfirming.value = false
}

function removeMember(member: string) {
  if (!selectedGroup.value) return
  groupsStore.removeMembersFromGroup(selectedGroup.value.id, [member])
}

function addMember(member: string) {
  if (!selectedGroup.value) return
  groupsStore.addMembersToGroup(selectedGroup.value.id, [member])
}

// ── Creation ──────────────────────────────────────────

function startCreate(type: 'component' | 'file') {
  creatingType.value = type
  selectedGroup.value = null
  newGroupName.value = ''
  newGroupColor.value = COLOR_PALETTE[0]
  nextTick(() => createNameInputRef.value?.focus())
}

function cancelCreate() {
  creatingType.value = null
  newGroupName.value = ''
}

function confirmCreate() {
  const name = newGroupName.value.trim()
  if (!creatingType.value || !name) return
  const created = groupsStore.createGroup(creatingType.value, name)
  // Apply chosen color
  if (newGroupColor.value !== created.color) {
    groupsStore.updateGroup(created.id, { color: newGroupColor.value })
  }
  creatingType.value = null
  newGroupName.value = ''
  // Auto-select the newly created group
  selectGroup(created)
}

// ── Import / Export ──────────────────────────────────

function triggerImport() {
  fileInputRef.value?.click()
}

function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      groupsStore.importGroups(reader.result as string, 'merge')
    } catch (e) {
      console.error('Import failed:', e)
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function handleExport() {
  const json = groupsStore.exportGroups()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'archstats-groups.json'
  a.click()
  URL.revokeObjectURL(url)
}

// ═══════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════

// Load file names cache when modal opens (for file group member management)
watch(isModalOpen, (open) => {
  if (open) {
    try {
      const rows = dataStore.query<{ name: string }>('SELECT name FROM files ORDER BY name')
      allFilesCache.value = rows.map(r => r.name)
    } catch (e) {
      allFilesCache.value = []
    }
  }
})

// Keep selected group in sync if the underlying store changes
watch(() => groupsStore.allGroups, () => {
  if (selectedGroup.value) {
    const updated = groupsStore.allGroups.find(g => g.id === selectedGroup.value!.id)
    if (updated) {
      selectedGroup.value = updated
    }
  }
}, { deep: true })
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
.animate-modal-in {
  animation: modalIn 0.22s ease-out forwards;
}

.scroll-container::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.scroll-container::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 3px;
}
.scroll-container::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}
</style>
