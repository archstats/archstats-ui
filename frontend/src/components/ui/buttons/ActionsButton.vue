
<template>
  <div class="ui-btn p-0 overflow-hidden">
    <button type="button" class="h-full px-2.5 text-base font-medium hover:bg-neutral-50" @click="executeAction(selectedAction)">{{ selectedAction.name }}</button>
    <select v-model="selectedAction" class="h-full w-6 cursor-pointer appearance-none border-l border-neutral-200 bg-transparent text-center text-neutral-500 outline-none hover:bg-neutral-50" aria-label="More actions">
      <option v-for="action in actions" :value="action">{{ action.name }}</option>
    </select>
  </div>
</template>
<script setup lang="ts">
import {defineProps, ref, watch, watchEffect} from "vue";

type Action = { handler: () => void; name: string; description: string }

const {actions} = defineProps<{
  actions: Action[]
}>()

const selectedAction = ref<Action>(actions[0])
watch(selectedAction, () => {
  executeAction(selectedAction.value)
})

function executeAction(action: Action) {
  selectedAction.value = action
  action.handler()
}
</script>

<style scoped>

</style>
