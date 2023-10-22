<template>
  <div
      class="option-container"
      @mouseover="showTooltip"
      @mouseout="hideTooltip"
      @click="select"
  >
    {{ option.label }}

    <div v-if="isTooltipVisible" class="tooltip">
      {{ option.extraInfo }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  option: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['select']);

const isTooltipVisible = ref(false);

const showTooltip = () => {
  isTooltipVisible.value = true;
};

const hideTooltip = () => {
  isTooltipVisible.value = false;
};

const select = () => {
  console.log('hover select')
  emit('select', props.option);
};
</script>

<style scoped>
.option-container {
  position: relative;
  padding: 10px;
  cursor: pointer;
}

.tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background-color: #333;
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  white-space: nowrap;
  z-index: 10;
}
</style>
