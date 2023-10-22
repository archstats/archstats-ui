<template>
  <div class="custom-select">
    <div class="selected-value" @click="toggleDropdown">
      {{ selectedOption ? selectedOption.label : placeholder }}
    </div>


    <div v-if="isDropdownOpen" class="dropdown-container">
      <div v-for="option in options" :key="option.value">
        <slot name="optionSlot" :option="option" @select="handleSelect">
          <!-- Default option component -->
          <Option :option="option" @select="handleSelect"/>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import {ref} from 'vue';
import Option from "~/components/CustomSelect/Option.vue";

// Props
const props = defineProps({
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: 'Select an option'
  }
});

const emit = defineEmits(['input']);

// Local State
const isDropdownOpen = ref(false);
const selectedOption = ref(null);

// Methods
const toggleDropdown = () => {
  console.log('toggle dropdown', isDropdownOpen.value)
  isDropdownOpen.value = !isDropdownOpen.value;
};

const handleSelect = (option) => {
  console.log('being handled')
  selectedOption.value = option;
  isDropdownOpen.value = false;
  console.log(option.value)
  console.log(isDropdownOpen.value)
  emit('input', option.value); // For v-model support
};

</script>

<style scoped>
.custom-select {
  /* Basic styling for the select box. Enhance as per your design */
  border: 1px solid #ccc;
  padding: 10px;
  cursor: pointer;
  position: relative;
}

.dropdown-container {
  /* Basic styling for the dropdown container. Adjust as per your design */
  border: 1px solid #ccc;
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  z-index: 1; /* To ensure it appears on top of other content */
  background-color: #fff;
  max-height: 250px;
  overflow-y: auto;
}

.selected-value {
  /* Style for the displayed selected value */
}
</style>
