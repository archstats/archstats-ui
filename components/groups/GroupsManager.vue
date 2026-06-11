<template>
  <div class="text-archstats-50 flex flex-col gap-5">

    <!-- ═══════════════════════════════════════════════════ -->
    <!-- COMPONENT GROUPS                                    -->
    <!-- ═══════════════════════════════════════════════════ -->
    <section class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between mb-1">
        <h3 class="uppercase text-[10px] font-bold text-archstats-300 tracking-wider">
          Component Groups ({{ groupsStore.componentGroups.length }})
        </h3>
        <button
          class="text-[10px] font-semibold text-archstats-400 hover:text-archstats-50 transition-colors cursor-pointer"
          @click="startCreate('component')"
        >
          + New
        </button>
      </div>

      <!-- Create form -->
      <div v-if="creatingType === 'component'" class="mb-1 flex gap-1.5">
        <input
          ref="createInputComponent"
          v-model="newGroupName"
          class="flex-1 text-xs px-2 py-1 rounded-md bg-archstats-800 border border-archstats-600 text-archstats-50 placeholder-archstats-500 focus:outline-none focus:border-secondary-400"
          placeholder="Group name…"
          @keydown.enter="confirmCreate"
          @keydown.escape="cancelCreate"
        />
        <button
          class="text-[10px] font-semibold px-2 py-1 rounded-md bg-secondary-600 hover:bg-secondary-500 text-white transition-colors cursor-pointer"
          @click="confirmCreate"
        >
          Create
        </button>
        <button
          class="text-[10px] px-1 text-archstats-500 hover:text-archstats-200 transition-colors cursor-pointer"
          @click="cancelCreate"
        >
          ✕
        </button>
      </div>

      <!-- Empty state -->
      <p v-if="groupsStore.componentGroups.length === 0" class="text-[10px] text-archstats-500 italic pl-1">
        No groups yet
      </p>

      <!-- Group list -->
      <div
        v-for="group in groupsStore.componentGroups"
        :key="group.id"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-archstats-800/70 transition-colors cursor-pointer group"
        @click="openEditModal(group)"
      >
        <span
          class="w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: group.color }"
        />
        <div class="flex-1 min-w-0">
          <span class="text-xs truncate block leading-tight">{{ group.name }}</span>
          <span class="text-[10px] text-archstats-400 leading-tight">
            {{ group.members.length }} component{{ group.members.length !== 1 ? 's' : '' }}
          </span>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
             class="w-3.5 h-3.5 text-archstats-600 group-hover:text-archstats-300 transition-colors shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════ -->
    <!-- FILE / CLASS GROUPS                                 -->
    <!-- ═══════════════════════════════════════════════════ -->
    <section class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between mb-1">
        <h3 class="uppercase text-[10px] font-bold text-archstats-300 tracking-wider">
          File Groups ({{ groupsStore.fileGroups.length }})
        </h3>
        <button
          class="text-[10px] font-semibold text-archstats-400 hover:text-archstats-50 transition-colors cursor-pointer"
          @click="startCreate('file')"
        >
          + New
        </button>
      </div>

      <!-- Create form -->
      <div v-if="creatingType === 'file'" class="mb-1 flex gap-1.5">
        <input
          ref="createInputFile"
          v-model="newGroupName"
          class="flex-1 text-xs px-2 py-1 rounded-md bg-archstats-800 border border-archstats-600 text-archstats-50 placeholder-archstats-500 focus:outline-none focus:border-secondary-400"
          placeholder="Group name…"
          @keydown.enter="confirmCreate"
          @keydown.escape="cancelCreate"
        />
        <button
          class="text-[10px] font-semibold px-2 py-1 rounded-md bg-secondary-600 hover:bg-secondary-500 text-white transition-colors cursor-pointer"
          @click="confirmCreate"
        >
          Create
        </button>
        <button
          class="text-[10px] px-1 text-archstats-500 hover:text-archstats-200 transition-colors cursor-pointer"
          @click="cancelCreate"
        >
          ✕
        </button>
      </div>

      <!-- Empty state -->
      <p v-if="groupsStore.fileGroups.length === 0" class="text-[10px] text-archstats-500 italic pl-1">
        No groups yet
      </p>

      <!-- Group list -->
      <div
        v-for="group in groupsStore.fileGroups"
        :key="group.id"
        class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-archstats-800/70 transition-colors cursor-pointer group"
        @click="openEditModal(group)"
      >
        <span
          class="w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: group.color }"
        />
        <div class="flex-1 min-w-0">
          <span class="text-xs truncate block leading-tight">{{ group.name }}</span>
          <span class="text-[10px] text-archstats-400 leading-tight">
            {{ group.members.length }} file{{ group.members.length !== 1 ? 's' : '' }}
          </span>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
             class="w-3.5 h-3.5 text-archstats-600 group-hover:text-archstats-300 transition-colors shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════ -->
    <!-- IMPORT / EXPORT                                     -->
    <!-- ═══════════════════════════════════════════════════ -->
    <div class="flex gap-2 pt-3 border-t border-archstats-800">
      <button
        class="flex-1 text-[10px] font-semibold px-3 py-1.5 rounded-md bg-archstats-800 hover:bg-archstats-700 text-archstats-300 hover:text-archstats-100 transition-colors cursor-pointer"
        @click="triggerImport"
      >
        Import JSON
      </button>
      <button
        class="flex-1 text-[10px] font-semibold px-3 py-1.5 rounded-md bg-archstats-800 hover:bg-archstats-700 text-archstats-300 hover:text-archstats-100 transition-colors cursor-pointer"
        @click="handleExport"
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

    <!-- Edit Modal -->
    <EditGroupModal
      v-model:open="editModalOpen"
      :group="editingGroup"
      @saved="editingGroup = null"
      @deleted="editingGroup = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useGroupsStore, type SavedGroup } from '~/stores/groups'
import EditGroupModal from '~/components/groups/EditGroupModal.vue'

const groupsStore = useGroupsStore()

// ── Creating ──────────────────────────────────────────
const creatingType = ref<'component' | 'file' | null>(null)
const newGroupName = ref('')
const createInputComponent = ref<HTMLInputElement | null>(null)
const createInputFile = ref<HTMLInputElement | null>(null)

function startCreate(type: 'component' | 'file') {
  creatingType.value = type
  newGroupName.value = ''
  nextTick(() => {
    const input = type === 'component' ? createInputComponent.value : createInputFile.value
    input?.focus()
  })
}

function cancelCreate() {
  creatingType.value = null
  newGroupName.value = ''
}

function confirmCreate() {
  const name = newGroupName.value.trim()
  if (!creatingType.value || !name) return
  const created = groupsStore.createGroup(creatingType.value, name)
  creatingType.value = null
  newGroupName.value = ''
  // Immediately open the edit modal for the new group
  openEditModal(created)
}

// ── Edit Modal ───────────────────────────────────────
const editModalOpen = ref(false)
const editingGroup = ref<SavedGroup | null>(null)

function openEditModal(group: SavedGroup) {
  editingGroup.value = group
  editModalOpen.value = true
}

// ── Import / Export ──────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)

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
</script>
