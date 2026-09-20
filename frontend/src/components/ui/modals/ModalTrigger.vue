
<template>
  <div @click="open=true" @keyup.esc="open=false">
    <slot name="trigger"></slot>
  </div>
  <Teleport v-if="open" to="body">
    <div v-if="open" @keyup.esc="open=false"
         class="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/40 p-6 backdrop-blur-[2px]"
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
