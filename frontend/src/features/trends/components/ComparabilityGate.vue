<template>
  <div class="mx-auto flex max-w-[640px] flex-col gap-4 px-6 py-16">
    <h2 class="text-lg font-semibold text-neutral-900">{{ t('trends.comparabilityGate.theseTwoSnapshotsWere') }}</h2>
    <ul class="flex list-disc flex-col gap-1.5 pl-5 text-base text-neutral-700">
      <li v-for="r in reasons" :key="r">{{ r }}</li>
    </ul>
    <p class="text-base text-neutral-600">{{ t('trends.comparabilityGate.differencesBetweenThemMay') }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="ui-btn ui-btn-primary" :disabled="workspaces.isScanning" @click="workspaces.requestRescan(baseId)">
        {{ baseCommit ? t('trends.comparabilityGate.rescanBaselineCommit', { slice: baseCommit.slice(0, 7) }) : t('trends.comparabilityGate.rescanBaselineSCommit') }}{{ revision ? t('trends.comparabilityGate.r', { revision }) : "" }}
      </button>
      <button type="button" class="ui-btn" @click="emit('anyway')">{{ t('trends.comparabilityGate.compareAnyway') }}</button>
    </div>
    <p v-if="workspaces.isScanning" class="text-sm text-neutral-500">{{ t('trends.comparabilityGate.scanRunningGateClears') }}</p>
  </div>
</template>

<script setup lang="ts">
import { useDataStore } from "~/features/snapshot/data.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { t } from "~/shared/i18n";

// Shown instead of a comparison whose differences would mostly be the
// analysis's: a different revision, different ignore rules. The way through
// is to rebuild the baseline, not to squint at the numbers.

defineProps<{ reasons: string[]; baseId: string; baseCommit?: string }>();
const emit = defineEmits<{ (e: "anyway"): void }>();
const workspaces = useWorkspacesStore();
const revision = useDataStore()._engineRevision;
</script>
