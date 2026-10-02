<template>
  <section v-if="health !== null" class="mt-5 pt-5 hairline-t" aria-labelledby="why-score">
    <h2 id="why-score" class="ui-section-title">{{ t('metrics.healthBreakdown.whyScore') }}</h2>

    <template v-if="breakdown">
      <p v-if="breakdown.kind === 'indentation'" class="mt-2 max-w-[76ch] text-base text-neutral-600">{{ t('metrics.healthBreakdown.readFromIndentation') }}</p>
      <p v-else-if="breakdown.kind === 'legacy' && store.snapshotOutdated" class="mt-2 max-w-[76ch] text-base text-neutral-600">{{ t('metrics.healthBreakdown.olderFormula') }}</p>
      <div class="mt-3 overflow-hidden rounded-lg hairline">
        <table class="ui-table">
          <thead>
            <tr>
              <th>{{ t('metrics.healthBreakdown.reading') }}</th>
              <th>{{ t('metrics.healthBreakdown.input') }}</th>
              <th>{{ t('metrics.healthBreakdown.threshold') }}</th>
              <th>{{ t('metrics.healthBreakdown.rule') }}</th>
              <th class="w-[90px] text-right">{{ t('metrics.healthBreakdown.points') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in breakdown.rows" :key="r.id">
              <td class="text-neutral-900"><router-link v-if="r.to" :to="r.to" class="underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-700">{{ r.label }}</router-link><template v-else>{{ r.label }}</template></td>
              <td class="is-num">{{ r.input }}</td>
              <td class="is-num text-neutral-600">{{ r.threshold }}</td>
              <td class="text-neutral-600">{{ r.rule }}</td>
              <td class="is-num text-right" :class="r.points > 0 ? 'text-red-700' : 'text-neutral-400'">{{ r.points > 0 ? `−${fmt(r.points)}` : "0" }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="hairline-t">
              <td colspan="4" class="font-mono text-sm text-neutral-700">{{ sumLine }}</td>
              <td class="is-num text-right font-medium text-neutral-900">{{ fmt(health) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="mismatch" class="mt-2 text-sm text-amber-700">{{ t('metrics.healthBreakdown.deductionsSumNotRecorded', { expected: fmt(breakdown.expected), health: fmt(health) }) }}</p>
      <ComplexFunctions v-if="breakdown.kind === 'functions'" :file="fileName" section-class="mt-5"/>
    </template>
    <p v-else class="mt-2 max-w-[70ch] text-base text-neutral-600">
      <I18nT k="metrics.healthBreakdown.linesNestingUpLevels"><template #lines>{{ fmtInt(lines) }}</template><template #maxNesting>{{ fmtInt(maxNesting) }}</template><template #avgNesting>{{ fmt(avgNesting) }}</template><template #span><span class="text-neutral-500">{{ t('metrics.healthBreakdown.snapshotDoesNotRecord') }}</span></template></I18nT>
    </p>

    <p class="mt-3 max-w-[76ch] text-base leading-6 text-neutral-700">
      <template v-if="commits === null || commits === 0">{{ t('metrics.healthBreakdown.noCommitsTouchFile') }}</template>
      <template v-else>
        {{ t('metrics.healthBreakdown.hotspotLog2Commits1', { hotspot: fmtInt(hotspot), commits: fmtInt(commits), lines: fmtInt(lines), raw: fmtInt(raw) }) }}
        <template v-if="hottest && hottest.name !== fileName">{{ t('metrics.healthBreakdown.relativeHottestFileSnapshot') }}<router-link :to="filePath(hottest.name)" class="font-mono text-sm text-neutral-900 underline-offset-2 hover:underline">{{ basename(hottest.name) }}</router-link> = 100).</template>
        <template v-else-if="hottest">{{ t('metrics.healthBreakdown.hottestFileSnapshotSo') }}</template>
        <template v-else>{{ t('metrics.healthBreakdown.relativeHottestFileSnapshot2') }}</template>
      </template>
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery";
import { useDataStore } from "~/features/snapshot/data.store";
import { filePath } from "~/features/navigation/routes";
import { t } from "~/shared/i18n";
import I18nT from "~/shared/ui/I18nT";
import ComplexFunctions from "~/features/metrics/components/ComplexFunctions.vue";
import { healthBreakdown, fmt, fmtInt } from "~/features/metrics/healthBreakdown";

// A file's health with the deductions the engine stored for it, each with
// its input and rule (healthBreakdown.ts reads which formula the snapshot
// used). The score is shown with its inputs rather than as a verdict, and
// for a parsed file with the functions behind its complex-code deduction.

const props = defineProps<{ file: Record<string, any> }>();
const store = useDataStore();

const num = (key: string): number | null => {
  const v = props.file?.[key];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fileName = computed(() => String(props.file?.name ?? ""));
const health = computed(() => num("codesmells__code_health"));
const lines = computed(() => num("complexity__lines") ?? 0);
const maxNesting = computed(() => num("complexity__indentation__max") ?? 0);
const avgNesting = computed(() => num("complexity__indentation__avg") ?? 0);
const commits = computed(() => num("git__commits__total"));
const hotspot = computed(() => num("codesmells__hotspot_score") ?? 0);
const raw = computed(() => num("codesmells__hotspot__raw") ?? Math.log2((commits.value ?? 0) + 1) * lines.value);

const breakdown = computed(() => healthBreakdown(props.file ?? {}));
const mismatch = computed(() => breakdown.value !== null && health.value !== null && Math.abs(breakdown.value.expected - health.value) > 0.05);
const sumLine = computed(() => {
  const b = breakdown.value;
  if (!b) return "";
  return `10${b.rows.map(r => ` − ${fmt(r.points)}`).join("")} = ${fmt(b.unfloored)}${b.unfloored < 1 ? t("metrics.healthBreakdown.floored1") : ""}`;
});

const { data: hottest } = useAsyncQuery<{ name: string } | null>(
  async () => {
    const rows = await store.query<{ name: string }>("SELECT name FROM files WHERE codesmells__hotspot_score IS NOT NULL ORDER BY codesmells__hotspot_score DESC LIMIT 1");
    return rows[0] ?? null;
  },
  [() => store.datasetKey],
  { initial: null },
);

function basename(p: string): string {
  return p.split("/").pop() || p;
}
</script>
