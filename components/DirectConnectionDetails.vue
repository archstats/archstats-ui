<template>

  <div>
    <div class="font-semibold mb-2 flex gap-1 text-archstats-900">
      <span>{{ from }}</span>
      <Icon @click="flipped = !flipped" :icon=" flipped ? 'arrow-left':'arrow-right'" class="hover:text-secondary-500 cursor-pointer"/>
      <span>{{ to }}</span>
    </div>



    <GitSharedCommitSummary class="mt-2" v-if="gitEnabled" :from="realFrom" :to="realTo"></GitSharedCommitSummary>



    <Expandable class="mt-4" v-if="connections.length">
      <template #default>
        <h2 class="text-archstats-400 hover:text-archstats-300 whitespace-nowrap cursor-pointer"><span
            class="font-mono text-archstats-900">{{ connections.length }}</span>
          {{ connections.length === 1 ? 'file' : 'files'}} in <span class="font-mono text-archstats-900">{{ realFrom }}</span> {{ connections.length === 1 ? 'references': 'reference'}} <span
              class="font-mono  text-archstats-900">{{ realTo }}</span></h2>
      </template>
      <template #expanded-content>
        <div class="border bg-gray-100 p-4 mt-2">
          <div class="flex" v-for="connection in connections">
            <DirectConnectionDetail class="font-mono text-archstats-700  font-normal" v-bind="connection"
                                    :expanded-by-default="connections.length < 3">{{ connection.file }}
            </DirectConnectionDetail>
          </div>
        </div>

      </template>
    </Expandable>




  </div>

</template>

<script lang="ts" setup>
import {useDataStore} from "~/stores/data";
import {computed} from "vue";
import Expandable from "~/components/ui/Expandable.vue";

const props = defineProps<{
  from: string,
  to: string
}>()

const store = useDataStore();

const filesExpanded = ref(false)

const flipped = ref(false)
const gitEnabled = computed(() => store.hasView("git_component_shared_commits"))

const realFrom = computed(() => flipped.value ? props.to : props.from)
const realTo = computed(() => flipped.value ? props.from : props.to)

const connections = computed(() => {
  return store.query(`
    SELECT *
    FROM component_connections_direct
    WHERE "from" = '${realFrom.value}'
      AND "to" = '${realTo.value}'
  `) as {
    from: string,
    to: string,
    reference_count: number
    file: string
  }[]
})
</script>
