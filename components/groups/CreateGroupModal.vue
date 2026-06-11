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
          class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-modal-in"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-6 pt-6 pb-4">
            <div class="flex items-center gap-3">
              <span
                class="w-4 h-4 rounded-full bg-indigo-500 shrink-0"
              />
              <h2 class="text-base font-bold text-slate-900 tracking-tight">Create Component Group</h2>
            </div>
            <button
              @click="close"
              class="p-1.5 rounded-lg text-slate-400 hover:text-slate-655 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="px-6 pb-6 flex flex-col gap-5">
            <!-- Group Name Input -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Group Name</label>
              <input
                ref="nameInputRef"
                v-model="groupName"
                class="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-350"
                placeholder="e.g. billing-service, auth-module..."
                @keydown.enter="submit"
              />
            </div>

            <!-- Members Info Badge -->
            <div class="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex items-center justify-between">
              <span class="text-[10px] font-bold text-indigo-900">Members to assign</span>
              <span class="text-[10px] font-mono font-black text-indigo-700 bg-white border border-indigo-200/50 px-2 py-0.5 rounded-md">
                {{ members.length }} component{{ members.length !== 1 ? 's' : '' }}
              </span>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
            <button
              @click="close"
              class="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              @click="submit"
              :disabled="!groupName.trim()"
              class="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              Create Group
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useGroupsStore } from '~/stores/groups'

const props = defineProps<{
  defaultName: string
  members: string[]
  type: 'component' | 'file'
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  (e: 'created', name: string): void
}>()

const groupsStore = useGroupsStore()
const nameInputRef = ref<HTMLInputElement | null>(null)
const groupName = ref('')

watch(isOpen, (open) => {
  if (open) {
    groupName.value = props.defaultName
    nextTick(() => {
      nameInputRef.value?.focus()
      nameInputRef.value?.select()
    })
  }
})

function submit() {
  const name = groupName.value.trim()
  if (!name) return
  groupsStore.createGroup(props.type, name, props.members)
  emit('created', name)
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
