<template>
  <div class="slider-container relative cursor-pointer bg-red-500" @mousedown="startDrag">
    <div class="slider-track w-full h-1 bg-gray-300 relative" ref="track">
      <div class="slider-thumb w-4 h-4 bg-red-500 rounded-full absolute top-1/2 transform -translate-y-1/2"
           :style="{ left: thumbPosition + 'px' }" ref="thumb"></div>
    </div>
  </div>
</template>

<script setup>
import {ref, onMounted, onBeforeUnmount, defineProps, defineEmits} from "vue";

const props = defineProps({
  modelValue: {
    type: Number,
    default: 0
  },
  min: {
    type: Number,
    default: 0
  },
  max: {
    type: Number,
    default: 100
  },
  step: {
    type: Number,
    default: 1
  }
});

const emit = defineEmits();

const isDragging = ref(false);
const thumbPosition = ref(0);
const maxValue = ref(100);
const value = ref(0);

const track = ref(null);
const thumb = ref(null);

const startDrag = (e) => {
  isDragging.value = true;
  drag(e);
};

const drag = (e) => {
  if (!isDragging.value) return;

  const rect = track.value.getBoundingClientRect();
  const newValue = ((e.clientX - rect.left) / rect.width) * maxValue.value;

  if (newValue >= 0 && newValue <= maxValue.value) {
    value.value = newValue;
    thumbPosition.value = (value.value / maxValue.value) * rect.width;
    emit("update:modelValue", value.value);
  }
};

const stopDrag = () => {
  isDragging.value = false;
};

onMounted(() => {
  thumbPosition.value = (props.modelValue / maxValue.value) * track.value?.getBoundingClientRect().width || 0;
  document.addEventListener("mouseup", stopDrag);
  document.addEventListener("mousemove", drag);
});

onBeforeUnmount(() => {
  document.removeEventListener("mouseup", stopDrag);
  document.removeEventListener("mousemove", drag);
});
</script>
