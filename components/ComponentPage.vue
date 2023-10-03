<template>
  <div class="">
    <div class="fixed w-full top-0 left-0 py-4 bg-gray-900 flex align-middle gap-4 z-10">
      <PrimaryButton @click="applySelectionToScope" class="" :disabled="!selectedTableComponents.length && !hasChanges">
        Refine scope ({{ selectedTableComponents.length }})
      </PrimaryButton>

      <PrimaryButton @click="resetCurrentScope">Reset scope</PrimaryButton>

    </div>
    <div class="my-36 container ">
      <div class="mb-12">
        <h1 class="text-5xl mb-12 font-bold text-sky-500">Your project</h1>
        <div v-if="allComponentScopes.length">
          <div class="" v-if="lastComponentScope">
            <input class="text-2xl" type="text" :value="lastComponentScope" @input="nameChange">
          </div>

          <div class="flex justify-start gap-8">
            <div v-for="scope in allComponentScopes" class="flex gap-2">
              <a @click="selectScope(scope)" class="hover:text-sky-500 cursor-pointer"
                 :class="{'font-bold': currentComponentScope?.name === scope.name}">{{ scope.name }}
                ({{ scope.components.length }})</a>
            </div>
          </div>
        </div>
        <p class="w-1/2 mb-8 text-gray-700" v-else>You have no saved scopes </p>

      </div>

      <ComponentTable v-on:newSelection="onNewSelection"
                      :applyToScopeEnabled="true"
                      :components="componentsToShow"/>

      <div class="w-2/3 mx-auto mb-24">
        <ComponentComparison :components="componentsToShow"></ComponentComparison>
      </div>

      <div class="w-2/3 mx-auto mb-24">
        <DistanceMainSequenceChart :components="componentsToShow"/>
      </div>

      <ConnectionChart :components="componentsToShow" class="mb-24"/>
<!--      <ChordView class="mb-24" :components="componentsToShow"></ChordView>-->
    </div>
  </div>

</template>

<script lang="ts" setup>
import {useDataStore} from "~/stores/data";
import PrimaryButton from "./ui/PrimaryButton.vue";
import SecondaryButton from "./ui/SecondaryButton.vue";
import ConnectionChart from "./ConnectionChart.vue";
import ChordView from "./ChordView.vue";
import SelectGitRepository from "./SelectGitRepository.vue";
import ComponentTable from "./ComponentTable.vue";
import DistanceMainSequenceChart from "./views/distance-main-sequence/DistanceMainSequenceChart.vue";
import {computed, defineProps, ref, watch, watchEffect} from "vue";
import {Component, ComponentGraph, resizeConnectionsOnComponents} from "~/utils/components";
import ActionsButton from "./ui/ActionsButton.vue";
import GraphWalker from "./views/graph-walker/GraphWalker.vue";

interface ComponentScope {
  name: string;
  components: string[];
}

const newComponentScopeName = ref(null);
const selectedTableComponents = ref<string[]>([])

const lastComponentScope = ref<string>(null)
const currentComponentScope = ref<ComponentScope>(null)
const store = useDataStore();

const allComponentScopes = computed(() => {
  return store.componentScopes as ComponentScope[];
})

watch(currentComponentScope, () => {
  if (currentComponentScope.value) {
    lastComponentScope.value = currentComponentScope.value.name;
  }
}, {deep: true})

const fullComponentGraph = computed(() => {
  return store.componentGraph;
})

const componentsToShow = computed(() => {
  const {components: componentLookup} = fullComponentGraph.value as ComponentGraph;
  const allComponents = Array.from(componentLookup.values());
  if (!currentComponentScope.value?.components?.length) return allComponents;

  const selection = currentComponentScope.value.components.flatMap(c =>
      componentLookup.has(c) ? componentLookup.get(c) as Component : [])

  return resizeConnectionsOnComponents(selection)
})

function applySelectionToScope() {
  currentComponentScope.value = {
    name: currentComponentScope.value?.name || "New Scope",
    components: [...selectedTableComponents.value]
  }
}

function selectScope(scope: ComponentScope) {
  currentComponentScope.value = scope;
}

function onNewSelection(selection: string[]) {
  selectedTableComponents.value = selection
}

function resetCurrentScope() {
  currentComponentScope.value.components = [];
  unselectAll();
}

function saveCurrentScope() {
  if (!currentComponentScope.value) return;
  store.saveComponentScope(currentComponentScope.value?.name, currentComponentScope.value?.components);
  unselectAll();
}

function addNewScope() {
  store.addComponentScope("New Scope", []);
}

function unselectAll() {
  selectedTableComponents.value = [];
}

function nameChange(e) {
  store.renameComponentScope(lastComponentScope.value, e.target.value);
}

</script>