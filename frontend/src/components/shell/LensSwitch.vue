<template>
  <div v-if="groupsStore.dimensions.length > 1" class="ui-segmented" role="group" aria-label="Lens">
    <button v-for="d in groupsStore.dimensions" :key="d" type="button" :aria-pressed="lens.active === d" :title="`Look through ${d}`" @click="lens.set(d)">{{ d }}</button>
  </div>
  <span v-else-if="lens.active" class="text-sm text-neutral-500">{{ lens.active }}</span>
</template>

<script setup lang="ts">
import { useGroupsStore } from "~/stores/groups";
import { useLensStore } from "~/stores/lens";

// The lens, switchable wherever a view legends by it. One choice for the
// whole workspace: changing it here changes every other view too.
const groupsStore = useGroupsStore();
const lens = useLensStore();
</script>
