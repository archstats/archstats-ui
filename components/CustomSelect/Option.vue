<template>
  <div
      class="dropdown-option"
      @click="select"
  >
    {{ option.label }}
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  option: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['select']);

const select = () => {
  console.log('select in option')
  emit('select', props.option);
};
</script>

<style scoped>
.dropdown-option {
  padding: 10px;
  cursor: pointer;
}
.dropdown-option:hover {
  background-color: #f6f6f6;
}
</style>
