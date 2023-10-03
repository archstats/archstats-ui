<template>
  <div class="" @click="open=true" @keyup.esc="open=false">
    <slot name="trigger"></slot>
  </div>
  <Teleport v-if="open" to="body">
    <div v-if="open" @keyup.esc="open=false"
         class="fixed z-100 h-screen bg-gray-700 bg-opacity-50 w-screen top-0 left-0 flex align-middle justify-center"
         @click.self="closeModal" @close-modal="closeModal">
      <slot name="modal"></slot>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>

import {closeModalKey as closeModalKey} from "~/utils/modal";

const open = ref(false);

const closeModal = () => {
  if (open.value)
    open.value = false;
}

provide(closeModalKey, closeModal)
</script>