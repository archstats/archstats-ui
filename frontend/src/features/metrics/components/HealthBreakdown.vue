<template>
  <section v-if="health !== null" class="mt-5 pt-5 hairline-t" aria-labelledby="why-score">
    <h2 id="why-score" class="ui-section-title">{{ t('metrics.healthBreakdown.whyScore') }}</h2>

    <template v-if="hasDeductions">
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
            <tr v-for="r in rows" :key="r.label">
              <td class="text-neutral-900">{{ r.label }}</td>
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
      <p v-if="mismatch" class="mt-2 text-sm text-amber-700">{{ t('metrics.healthBreakdown.deductionsSumNotRecorded', { expected: fmt(expected), health: fmt(health) }) }}</p>
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
import { t, intlLocale } from "~/shared/i18n";
import I18nT from "~/shared/ui/I18nT";

// A file's health is 10 less three capped deductions, floored at 1. Revision
// 2 snapshots store each deduction and threshold, so the score is shown with
// its inputs rather than as a verdict; the rules come from the engine's
// definitions, and no copy of the formula decides anything here.

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

const sizeD = computed(() => num("codesmells__health__deduction__size"));
const maxD = computed(() => num("codesmells__health__deduction__max_nesting"));
const avgD = computed(() => num("codesmells__health__deduction__avg_nesting"));
const maxT = computed(() => num("codesmells__health__threshold__max_nesting"));
const avgT = computed(() => num("codesmells__health__threshold__avg_nesting"));
const hasDeductions = computed(() => sizeD.value !== null && maxD.value !== null && avgD.value !== null);

const rows = computed(() => [
  { label: t("metrics.healthBreakdown.size"), input: t("metrics.healthBreakdown.lines", { lines: fmtInt(lines.value) }), threshold: "over 500", rule: t("metrics.healthBreakdown.text001PerLine"), points: sizeD.value ?? 0 },
  { label: t("metrics.healthBreakdown.deepestNesting"), input: t("metrics.healthBreakdown.levels", { maxNesting: fmtInt(maxNesting.value) }), threshold: maxT.value !== null ? t("metrics.healthBreakdown.over", { maxT: fmt(maxT.value) }) : "—", rule: t("metrics.healthBreakdown.text05PerLevel"), points: maxD.value ?? 0 },
  { label: t("metrics.healthBreakdown.averageNesting"), input: t("metrics.healthBreakdown.levels2", { avgNesting: fmt(avgNesting.value) }), threshold: avgT.value !== null ? t("metrics.healthBreakdown.over2", { avgT: fmt(avgT.value) }) : "—", rule: t("metrics.healthBreakdown.text15PerLevel"), points: avgD.value ?? 0 },
]);

const expected = computed(() => Math.max(1, 10 - rows.value.reduce((s, r) => s + r.points, 0)));
const mismatch = computed(() => health.value !== null && Math.abs(expected.value - health.value) > 0.05);
const sumLine = computed(() => {
  const terms = rows.value.map(r => ` − ${fmt(r.points)}`).join("");
  const unfloored = 10 - rows.value.reduce((s, r) => s + r.points, 0);
  return `10${terms} = ${fmt(unfloored)}${unfloored < 1 ? t("metrics.healthBreakdown.floored1") : ""}`;
});

const { data: hottest } = useAsyncQuery<{ name: string } | null>(
  async () => {
    const rows = await store.query<{ name: string }>("SELECT name FROM files WHERE codesmells__hotspot_score IS NOT NULL ORDER BY codesmells__hotspot_score DESC LIMIT 1");
    return rows[0] ?? null;
  },
  [() => store.datasetKey],
  { initial: null },
);

function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(intlLocale, { maximumFractionDigits: 2 });
}
function fmtInt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString(intlLocale);
}
function basename(p: string): string {
  return p.split("/").pop() || p;
}
</script>
