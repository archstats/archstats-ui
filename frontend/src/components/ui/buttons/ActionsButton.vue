<template>
  <div class="flex   text-white rounded overflow-clip">
    <button class="transition-all w-full px-4 py-1 bg-tertiary-500 overflow-ellipsis outline-0" @click="executeAction(selectedAction)">{{selectedAction.name}}</button>
    <select v-model="selectedAction" class="w-4 bg-tertiary-500 rounded-r outline-0 " >
      <option v-for="action in actions" :value="action">{{action.name}}</option>
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
