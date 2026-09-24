<template>
  <div v-if="state !== 'hidden'" class="mt-6">
    <h4 class="ui-label">Used from outside</h4>
    <p v-if="state === 'unrecorded'" class="mt-1.5 text-sm text-neutral-500">Unit references are not recorded for this language in this snapshot.</p>
    <template v-else>
      <p class="mt-1.5 text-base text-neutral-700">{{ rows.length.toLocaleString("en-US") }} of {{ total.toLocaleString("en-US") }} units are used from outside.</p>
      <table v-if="rows.length" class="ui-table mt-2">
        <thead><tr><th>Unit</th><th class="w-24">Kind</th><th class="w-[110px] text-right">Components</th><th class="w-[90px] text-right">Units</th></tr></thead>
        <tbody>
          <template v-for="r in rows.slice(0, shown)" :key="r.id">
            <tr class="is-clickable" @click="toggle(r.id)">
              <td class="max-w-0 truncate font-mono text-sm text-neutral-900" :title="r.id">{{ r.name }}</td>
              <td><span class="ui-tag">{{ r.kind }}</span></td>
              <td class="is-num text-right">{{ r.callers }}</td>
              <td class="is-num text-right">{{ r.callerUnits }}</td>
            </tr>
            <tr v-if="open === r.id">
              <td colspan="4" class="!py-2">
                <p v-if="!callers.length" class="text-sm text-neutral-500">Reading callers…</p>
                <ul v-else class="flex flex-col gap-1.5">
                  <li v-for="c in callers" :key="c.component">
                    <router-link :to="componentPath(c.component)" class="font-mono text-sm text-neutral-800 hover:underline">{{ c.component }}</router-link>
                    <span class="ml-2 font-mono text-xs text-neutral-500">{{ c.units.slice(0, 6).map(u => u.split(".").pop()).join(", ") }}{{ c.units.length > 6 ? ` and ${c.units.length - 6} more` : "" }}</span>
                  </li>
                </ul>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <button v-if="rows.length > shown" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-2" @click="shown += 50">Show {{ Math.min(50, rows.length - shown) }} more</button>
      <p class="mt-2 text-sm text-neutral-500">{{ (total - rows.length).toLocaleString("en-US") }} units are used only inside.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAsyncQuery } from "~/composables/useAsyncQuery";
import { useDataStore } from "~/stores/data";
import { componentPath } from "~/utils/routes";
import { sqlLiteral } from "~/utils/sql";

// How much of a component the rest of the code actually reaches: the units
// (types, functions) referenced from other components, and who reaches them.
// A count of what is used only inside, never a list and never "public".

const props = defineProps<{ name: string }>();
const data = useDataStore();
const shown = ref(50);
const open = ref<string | null>(null);
const callers = ref<Array<{ component: string; units: string[] }>>([]);

interface Row { id: string; name: string; kind: string; callers: number; callerUnits: number }
const { data: loaded } = useAsyncQuery<{ rows: Row[]; total: number; recorded: boolean }>(
  async () => {
    if (!data.hasView("unit_connections") || !data.hasView("units")) return { rows: [], total: 0, recorded: false };
    const lit = sqlLiteral(props.name);
    const [any] = await data.query<{ n: number }>(`SELECT count(*) AS n FROM (SELECT 1 FROM unit_connections LIMIT 1)`);
    const [tot] = await data.query<{ n: number }>(`SELECT count(*) AS n FROM units WHERE component = ${lit}`);
    const rows = await data.query<Row>(`SELECT u.id AS id, u.name AS name, u.kind AS kind, count(DISTINCT uc.from_component) AS callers, count(DISTINCT uc."from") AS callerUnits
      FROM unit_connections uc JOIN units u ON u.id = uc."to"
      WHERE uc.to_component = ${lit} AND uc.from_component <> uc.to_component
      GROUP BY u.id ORDER BY callers DESC, callerUnits DESC, u.name`);
    return { rows, total: Number(tot?.n ?? 0), recorded: Number(any?.n ?? 0) > 0 };
  },
  [() => props.name],
  { initial: { rows: [], total: 0, recorded: false } },
);
const rows = computed(() => loaded.value.rows);
const total = computed(() => loaded.value.total);
const state = computed(() => (!loaded.value.total ? "hidden" : !loaded.value.recorded ? "unrecorded" : "shown"));
watch(() => props.name, () => { shown.value = 50; open.value = null; });

async function toggle(id: string) {
  if (open.value === id) { open.value = null; return; }
  open.value = id;
  callers.value = [];
  const rs = await data.query<{ component: string; unit: string }>(`SELECT DISTINCT from_component AS component, "from" AS unit FROM unit_connections WHERE "to" = ${sqlLiteral(id)} AND from_component <> ${sqlLiteral(props.name)} ORDER BY 1, 2`);
  const by = new Map<string, string[]>();
  for (const r of rs) by.set(r.component, [...(by.get(r.component) ?? []), r.unit]);
  if (open.value === id) callers.value = [...by.entries()].map(([component, units]) => ({ component, units })).sort((a, b) => b.units.length - a.units.length);
}
</script>
