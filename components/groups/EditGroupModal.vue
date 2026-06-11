<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[1000] flex items-center justify-center p-4"
        @keydown.escape="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="close" />

        <!-- Modal Card -->
        <div
          class="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-modal-in"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-6 pt-6 pb-4">
            <div class="flex items-center gap-3">
              <span
                class="w-4 h-4 rounded-full ring-2 ring-offset-2 ring-slate-200 shrink-0 transition-colors"
                :style="{ backgroundColor: editColor }"
              />
              <h2 class="text-lg font-bold text-slate-900 tracking-tight">Edit Group</h2>
            </div>
            <button
              @click="close"
              class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="px-6 pb-6 flex flex-col gap-5">
            <!-- Group Name -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Group Name</label>
              <input
                ref="nameInputRef"
                v-model="editName"
                class="w-full px-3.5 py-2.5 text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-archstats-500/30 focus:border-archstats-500 transition-all placeholder:text-slate-300"
                placeholder="e.g. Core Domain, Payment Module…"
                @keydown.enter="save"
              />
            </div>

            <!-- Color Picker -->
            <div class="flex flex-col gap-2">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Color</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="color in COLOR_PALETTE"
                  :key="color"
                  class="w-8 h-8 rounded-full transition-all duration-150 cursor-pointer"
                  :class="editColor === color
                    ? 'ring-2 ring-offset-2 ring-slate-400 scale-110'
                    : 'hover:scale-110 hover:ring-2 hover:ring-offset-1 hover:ring-slate-200'"
                  :style="{ backgroundColor: color }"
                  @click="editColor = color"
                />
              </div>
            </div>

            <!-- Members summary -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Members
                </label>
                <span class="text-xs font-mono font-bold text-slate-500">
                  {{ group?.members.length ?? 0 }}
                  {{ group?.type === 'component' ? 'components' : 'files' }}
                </span>
              </div>

              <!-- Scrollable member list -->
              <div v-if="group && group.members.length > 0" class="max-h-48 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50">
                <div class="flex flex-col divide-y divide-slate-100">
                  <div
                    v-for="member in group.members"
                    :key="member"
                    class="group flex items-center justify-between px-3 py-2 hover:bg-slate-100/80 transition-colors"
                  >
                    <span class="text-xs font-mono text-slate-600 truncate mr-3" :title="member">
                      {{ shortenMember(member) }}
                    </span>
                    <button
                      @click="removeMember(member)"
                      class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-0.5 rounded cursor-pointer shrink-0"
                      title="Remove member"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <p v-else class="text-xs text-slate-400 italic">
                No members yet. Add components or files from other views.
              </p>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
            <button
              @click="confirmDelete"
              class="text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              {{ deleteConfirming ? 'Click again to confirm' : 'Delete Group' }}
            </button>
            <div class="flex gap-2">
              <button
                @click="close"
                class="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                @click="save"
                class="px-5 py-2 text-xs font-bold text-white bg-archstats-800 hover:bg-archstats-700 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useGroupsStore, type SavedGroup } from '~/stores/groups'

const groupsStore = useGroupsStore()

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

const props = defineProps<{
  group: SavedGroup | null
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'deleted', id: string): void
}>()

const nameInputRef = ref<HTMLInputElement | null>(null)
const editName = ref('')
const editColor = ref('')
const deleteConfirming = ref(false)

// Sync local state when modal opens or group changes
watch(() => [isOpen.value, props.group] as const, ([open, group]) => {
  if (open && group) {
    editName.value = group.name
    editColor.value = group.color
    deleteConfirming.value = false
    nextTick(() => nameInputRef.value?.focus())
  }
}, { immediate: true })

function shortenMember(member: string): string {
  if (member.length <= 50) return member
  const sep = Math.max(member.lastIndexOf('/'), member.lastIndexOf('\\'), member.lastIndexOf('.'))
  if (sep !== -1 && member.length - sep < 45) {
    return '…' + member.substring(sep)
  }
  return member.substring(0, 48) + '…'
}

function removeMember(member: string) {
  if (!props.group) return
  groupsStore.removeMembersFromGroup(props.group.id, [member])
}

function save() {
  if (!props.group) return
  const trimmed = editName.value.trim()
  const updates: Partial<Pick<SavedGroup, 'name' | 'color'>> = {}
  if (trimmed && trimmed !== props.group.name) updates.name = trimmed
  if (editColor.value !== props.group.color) updates.color = editColor.value
  if (Object.keys(updates).length > 0) {
    groupsStore.updateGroup(props.group.id, updates)
  }
  emit('saved')
  isOpen.value = false
}

function confirmDelete() {
  if (!props.group) return
  if (!deleteConfirming.value) {
    deleteConfirming.value = true
    return
  }
  const id = props.group.id
  groupsStore.deleteGroup(id)
  emit('deleted', id)
  isOpen.value = false
}

function close() {
  isOpen.value = false
}
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
    transform: scale(0.95) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
.animate-modal-in {
  animation: modalIn 0.25s ease-out forwards;
}
</style>
