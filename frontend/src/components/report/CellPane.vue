<template>
  <!-- The selected cell: what it is made of, what it ran on, what moved. -->
  <div v-if="block" class="flex flex-col gap-4">
    <div>
      <p class="text-[13px] font-semibold text-neutral-900">{{ spec.type === 'reading' ? reading?.label ?? "Computed paragraph" : `${number}${title ? ` · ${title}` : ""}` }}</p>
      <p class="mt-0.5 text-xs text-neutral-500">{{ what }}</p>
    </div>

    <!-- A table cell: its source, columns, order and length. -->
    <section v-if="spec.type === 'table'" class="flex flex-col gap-2">
      <h3 class="ui-label">Table</h3>
      <div class="ui-segmented" role="group" aria-label="Rows of">
        <button type="button" :aria-pressed="spec.source === 'components'" @click="setSpec({ source: 'components' })">Components</button>
        <button type="button" :aria-pressed="spec.source === 'files'" @click="setSpec({ source: 'files' })">Files</button>
      </div>
      <StatSelectMulti :key="`${block.id}:${spec.source}`" :model-value="spec.columns" :options="columnOptions" @update:model-value="setSpec({ columns: $event })"/>
      <label class="flex items-center justify-between gap-2 text-xs text-neutral-600">
        Sorted by
        <select class="ui-input ui-input-sm w-40" :value="spec.sort" @change="setSpec({ sort: ($event.target as HTMLSelectElement).value })">
          <option v-for="c in spec.columns" :key="c" :value="c">{{ label(c) }}</option>
        </select>
      </label>
      <div class="flex items-center justify-between gap-2 text-xs text-neutral-600">
        Order
        <div class="ui-segmented" role="group" aria-label="Order">
          <button type="button" :aria-pressed="spec.desc" @click="setSpec({ desc: true })">Highest first</button>
          <button type="button" :aria-pressed="!spec.desc" @click="setSpec({ desc: false })">Lowest first</button>
        </div>
      </div>
      <label class="flex items-center justify-between gap-2 text-xs text-neutral-600">
        Rows
        <input type="number" min="1" max="500" class="ui-input ui-input-sm w-20 font-mono" :value="spec.limit" @change="setSpec({ limit: Math.max(1, Math.min(500, Number(($event.target as HTMLInputElement).value) || 10)) })">
      </label>
    </section>

    <!-- A pin: its note belongs to the pin, shared by every report. -->
    <section v-else-if="spec.type === 'pin' && pin" class="flex flex-col gap-2">
      <h3 class="ui-label">Pin note</h3>
      <textarea
        :value="pin.note"
        rows="4"
        class="ui-input w-full resize-y text-[13px] leading-5"
        placeholder="What this shows, in your words"
        aria-label="Pin note"
        @change="$emit('pinNote', ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p class="text-[11px] leading-4 text-neutral-500">Shared by {{ usage.length > 1 ? `the ${usage.length} reports that use this pin` : "every report that uses this pin" }}. Run the cell to bring a changed note in.</p>
    </section>

    <section v-else-if="spec.type === 'sql'" class="flex flex-col gap-2">
      <h3 class="ui-label">Query</h3>
      <p class="text-xs leading-5 text-neutral-600">Edit the SQL in the cell; ⇧↵ runs it. Queries are read-only and stop after 10 seconds.</p>
      <label class="flex items-center justify-between gap-2 text-xs text-neutral-600">
        Rows kept
        <input type="number" min="1" max="500" class="ui-input ui-input-sm w-20 font-mono" :value="spec.limit" @change="setSpec({ limit: Math.max(1, Math.min(500, Number(($event.target as HTMLInputElement).value) || 50)) })">
      </label>
    </section>

    <!-- A computed paragraph: what it counts, how it is set, and the way out. -->
    <section v-else-if="spec.type === 'reading'" class="flex flex-col gap-2">
      <h3 class="ui-label">Counted</h3>
      <p class="text-xs leading-5 text-neutral-600">{{ reading?.describe }}</p>
      <template v-for="p in reading?.params ?? []" :key="p.id">
        <div v-if="p.choices" class="flex items-center justify-between gap-2 text-xs text-neutral-600">
          {{ p.label }}
          <div class="ui-segmented" role="group" :aria-label="p.label">
            <button v-for="c in p.choices" :key="c.value" type="button" :aria-pressed="(spec.params?.[p.id] ?? p.choices[0].value) === c.value" @click="setParam(p.id, c.value)">{{ c.label }}</button>
          </div>
        </div>
        <label v-else class="flex items-center justify-between gap-2 text-xs text-neutral-600">
          {{ p.label }}
          <input :value="spec.params?.[p.id] ?? ''" class="ui-input ui-input-sm w-44 font-mono" list="cellpane-components" placeholder="A component" @change="setParam(p.id, ($event.target as HTMLInputElement).value.trim())">
          <datalist id="cellpane-components"><option v-for="c in componentNames" :key="c" :value="c"/></datalist>
        </label>
      </template>
      <p class="text-[11px] leading-4 text-neutral-500">Facts only; it re-runs on a newer snapshot and says what moved. To change the words, make it yours: it becomes a paragraph you edit, and stops re-running.</p>
      <button type="button" class="ui-btn ui-btn-sm self-start" :disabled="!cell.output?.reading" @click="$emit('adopt')">Write as my own</button>
    </section>

    <section v-else-if="spec.type === 'slot'" class="flex flex-col gap-2">
      <h3 class="ui-label">To add</h3>
      <dl class="ui-kv">
        <template v-for="r in asked" :key="r.label"><dt>{{ r.label }}</dt><dd>{{ r.asked }}</dd></template>
      </dl>
      <p class="text-[11px] leading-4 text-neutral-500">Take it: the view opens set as asked, and what it shows comes back to you to check before it takes this place and number.</p>
      <div class="flex items-center gap-2">
        <button type="button" class="ui-btn ui-btn-sm" @click="$emit('take')">Take it from {{ spec.view }}</button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="$emit('fill')">Set it yourself</button>
      </div>
    </section>

    <section v-else-if="spec.type === 'capture'" class="flex flex-col gap-2">
      <h3 class="ui-label">Captured</h3>
      <p class="text-xs leading-5 text-neutral-600">Kept as {{ spec.view }} showed it. To bring it up to date, open the view and add it again.</p>
      <router-link :to="spec.route" class="ui-btn ui-btn-sm self-start">Open {{ spec.view }}</router-link>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="ui-label">{{ spec.type === 'slot' ? 'Runs on' : 'Ran on' }}</h3>
      <dl v-if="cell.ranOn" class="ui-kv">
        <dt>Snapshot</dt><dd>{{ cell.ranOn.label }}</dd>
        <template v-if="cell.ranOn.commit"><dt>Commit</dt><dd>{{ cell.ranOn.commit.slice(0, 12) }}</dd></template>
        <dt>Analysis</dt><dd>r{{ cell.ranOn.revision }}</dd>
        <template v-if="cell.ranOn.lens"><dt>Lens</dt><dd>{{ cell.ranOn.lens }}</dd></template>
        <template v-if="cell.ranOn.scope"><dt>Scope</dt><dd class="!whitespace-normal">{{ cell.ranOn.scope }}</dd></template>
        <template v-if="cell.ranOn.role"><dt>Files</dt><dd>{{ cell.ranOn.role }}</dd></template>
        <dt>At</dt><dd>{{ new Date(cell.ranOn.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }}</dd>
      </dl>
      <p v-else class="text-xs text-neutral-500">{{ spec.type === 'slot' ? "What you add keeps the snapshot it came from." : "Not run yet." }}</p>
      <p v-if="change" class="text-xs leading-5 text-neutral-800">{{ change }}</p>
      <div class="flex gap-2">
        <button v-if="spec.type !== 'capture' && spec.type !== 'slot'" type="button" class="ui-btn ui-btn-sm" :class="stale ? 'ui-btn-primary' : ''" :disabled="running" @click="$emit('run')">
          {{ running ? "Running…" : `Run on ${kernelLabel}` }}
        </button>
        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto text-red-700" @click="$emit('remove')">Remove</button>
      </div>
    </section>
  </div>
  <p v-else class="text-sm leading-5 text-neutral-500">Select a cell to see what it is made of and what it ran on.</p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StatSelectMulti from "~/components/ui/stat-select/StatSelectMulti.vue";
import { useDataStore } from "~/stores/data";
import { readingDef } from "~/utils/readings";
import { askedSettings } from "~/utils/slotSettings";
import { describeChange } from "~/utils/reportCells";
import type { CellBlock, CellSpec } from "~/utils/reportDoc";

const props = defineProps<{
  block: CellBlock | null
  number: string
  pin: { note: string } | null
  usage: string[]
  running: boolean
  stale: boolean
  kernelLabel: string
  columns: Record<"components" | "files", string[]>
  label: (id: string) => string
}>();
const emit = defineEmits<{ (e: "spec", spec: CellSpec): void; (e: "run"): void; (e: "remove"): void; (e: "pinNote", note: string): void; (e: "adopt"): void; (e: "fill"): void; (e: "take"): void }>();
const asked = computed(() => (spec.value.type === "slot" ? askedSettings(spec.value.route) : []));
const data = useDataStore();
const reading = computed(() => (spec.value.type === "reading" ? readingDef(spec.value.reading) : undefined));
const componentNames = computed(() => (reading.value?.params?.some(p => p.kind === "component") ? (data.allComponents ?? []).map((c: any) => String(c.name)).filter((n: string) => n !== ".").sort() : []));
function setParam(id: string, value: string) {
  emit("spec", { ...spec.value, params: { ...(spec.value.params ?? {}), [id]: value } });
}

const cell = computed(() => props.block!.cell);
const spec = computed(() => cell.value.spec as any);
const title = computed(() => cell.value.title || cell.value.output?.pin?.title || "");
const columnOptions = computed(() => (spec.value.type === "table" ? props.columns[spec.value.source as "components" | "files"] ?? [] : []));
const what = computed(() => {
  const s = spec.value;
  if (s.type === "table") return `The ${s.limit} ${s.source} with the ${s.desc ? "highest" : "lowest"} ${props.label(s.sort).toLowerCase()}.`;
  if (s.type === "sql") return "A read-only query on the snapshot.";
  if (s.type === "pin") return "A pin from the pool: its values as pinned and now.";
  if (s.type === "reading") return "A paragraph counted from the snapshot.";
  if (s.type === "slot") return `A ${s.kind} the template asks for, not added yet.`;
  return `Captured from ${s.view}.`;
});
const change = computed(() => describeChange(cell.value.previous, cell.value.output, props.label));
function setSpec(patch: Record<string, unknown>) {
  const next = { ...spec.value, ...patch };
  if (patch.columns && !(next.columns as string[]).includes(next.sort)) next.sort = (next.columns as string[])[0] ?? next.sort;
  emit("spec", next);
}
</script>
