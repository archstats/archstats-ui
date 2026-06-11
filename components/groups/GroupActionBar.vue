<template>
  <ClientOnly>
    <!-- Group Action Bar -->
    <Teleport to="body">
      <Transition name="slide-up">
        <div
          v-if="selectedItems.length > 0"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-slate-700/60 rounded-2xl px-6 py-4 shadow-2xl backdrop-blur-md flex items-center gap-4 text-white z-50 select-none animate-slide-up"
        >
          <!-- Count Indicator -->
          <div class="flex flex-col pr-4 border-r border-slate-700/60 leading-tight">
            <span class="text-[9px] font-bold text-sky-400 uppercase tracking-wider">Selection</span>
            <span class="text-xs font-extrabold whitespace-nowrap">
              {{ selectedItems.length }} {{ type }}{{ selectedItems.length !== 1 ? 's' : '' }}
            </span>
          </div>

          <!-- Add to Group Custom Popover -->
          <div class="relative">
            <button
              @click.stop="togglePopover"
              class="bg-slate-800 hover:bg-slate-700 active:bg-slate-750 border border-slate-700/60 rounded-xl px-3 py-2 text-[10px] font-bold transition-all cursor-pointer focus:outline-none flex items-center gap-2 text-slate-100 min-w-[130px] justify-between"
            >
              <span>Add to group...</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3.5 h-3.5 text-slate-400 transition-transform" :class="showPopover ? 'rotate-180' : ''">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            <!-- Custom Popover Menu -->
            <Transition name="popover-fade">
              <div
                v-if="showPopover"
                ref="popoverEl"
                class="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-56 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl z-55 overflow-hidden flex flex-col py-1.5 backdrop-blur-md"
              >
                <!-- Group List -->
                <div class="max-h-48 overflow-y-auto">
                  <div
                    v-for="g in availableGroups"
                    :key="g.id"
                    @click="addToGroup(g.id)"
                    class="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-200 hover:bg-slate-850 hover:text-white transition-colors cursor-pointer"
                  >
                    <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: g.color }"></div>
                    <span class="truncate flex-grow text-left">{{ g.name }}</span>
                    <span class="text-slate-500 font-mono text-[9px] shrink-0">({{ g.members.length }})</span>
                  </div>
                </div>

                <!-- Empty state -->
                <div v-if="availableGroups.length === 0" class="px-3 py-2 text-[10px] text-slate-400 italic">
                  No groups created yet.
                </div>

                <div class="h-px bg-slate-750/60 my-1"></div>

                <!-- Create option -->
                <div
                  @click="openCreateModal"
                  class="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-sky-400 hover:bg-slate-850 hover:text-sky-300 transition-colors cursor-pointer"
                >
                  <span class="text-xs">+</span>
                  <span>Create new group...</span>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Remove from Groups Action -->
          <button
            @click="removeFromAllGroups"
            class="px-3 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-200 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            title="Remove selected items from all groups"
          >
            <span>🗑</span>
            <span>Remove from groups</span>
          </button>

          <!-- Divider -->
          <div class="h-5 w-px bg-slate-700/60 my-0.5"></div>

          <!-- Clear Selection -->
          <button
            @click="emit('clear')"
            class="px-2.5 py-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            ✕ Clear
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- Create Group Centered Mini Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="showModal"
          class="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm select-none"
          @click.self="closeCreateModal"
        >
          <div class="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 shadow-2xl w-80 text-white transform transition-all animate-modal-in">
            <!-- Modal Header -->
            <h3 class="text-xs font-bold text-slate-300 uppercase tracking-widest mb-4">Create New Group</h3>

            <!-- Modal Content -->
            <div class="space-y-4">
              <input
                ref="nameInput"
                v-model="newGroupName"
                type="text"
                placeholder="Group name..."
                class="w-full bg-slate-800 border border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-semibold"
                @keyup.enter="createNewGroup"
                @keyup.esc="closeCreateModal"
              />

              <div class="flex justify-end gap-2 text-[10px] font-extrabold uppercase">
                <button
                  @click="closeCreateModal"
                  class="px-3 py-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  @click="createNewGroup"
                  class="px-4 py-2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white rounded-xl transition-colors cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import { useGroupsStore } from '~/stores/groups'

const props = defineProps({
  selectedItems: {
    type: Array as () => string[],
    required: true,
  },
  type: {
    type: String as () => 'component' | 'file',
    default: 'component',
  },
})

const emit = defineEmits(['clear'])

const groupsStore = useGroupsStore()
const showPopover = ref(false)
const showModal = ref(false)
const newGroupName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const popoverEl = ref<HTMLElement | null>(null)

const availableGroups = computed(() => {
  return props.type === 'component' ? groupsStore.allComponentGroups : groupsStore.allFileGroups
})

function togglePopover() {
  showPopover.value = !showPopover.value
  if (showPopover.value) {
    // Add window level listener to close popover when clicking outside
    nextTick(() => {
      window.addEventListener('click', handleWindowClick)
      window.addEventListener('keydown', handleKeyDown)
    })
  } else {
    cleanupListeners()
  }
}

function handleWindowClick(event: MouseEvent) {
  if (popoverEl.value && !popoverEl.value.contains(event.target as Node)) {
    showPopover.value = false
    cleanupListeners()
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    showPopover.value = false
    closeCreateModal()
    cleanupListeners()
  }
}

function cleanupListeners() {
  window.removeEventListener('click', handleWindowClick)
  window.removeEventListener('keydown', handleKeyDown)
}

onBeforeUnmount(() => {
  cleanupListeners()
})

function addToGroup(groupId: string) {
  groupsStore.addMembersToGroup(groupId, props.selectedItems)
  showPopover.value = false
  cleanupListeners()
  emit('clear')
}

function openCreateModal() {
  showPopover.value = false
  cleanupListeners()
  showModal.value = true
  newGroupName.value = ''
  nextTick(() => {
    nameInput.value?.focus()
  })
}

function closeCreateModal() {
  showModal.value = false
}

function createNewGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  groupsStore.createGroup(props.type, name, props.selectedItems)
  showModal.value = false
  newGroupName.value = ''
  emit('clear')
}

function removeFromAllGroups() {
  const groups = props.type === 'component' ? groupsStore.allComponentGroups : groupsStore.allFileGroups
  for (const group of groups) {
    const hasOverlap = props.selectedItems.some(item => group.members.includes(item))
    if (hasOverlap) {
      groupsStore.removeMembersFromGroup(group.id, props.selectedItems)
    }
  }
  emit('clear')
}
</script>

<style scoped>
.animate-slide-up {
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideUp {
  from {
    transform: translate(-50%, 2rem);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
}

/* Popover Fade Transition */
.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
}
.popover-fade-enter-from,
.popover-fade-leave-to {
  transform: translate(-50%, 0.5rem) scale(0.96);
  opacity: 0;
}

/* Modal Fade Transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* Modal Scale Animation */
.animate-modal-in {
  animation: modalScale 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes modalScale {
  from {
    transform: scale(0.94);
  }
  to {
    transform: scale(1);
  }
}
</style>
