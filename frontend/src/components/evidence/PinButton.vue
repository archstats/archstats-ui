<template>
  <button
    type="button"
    class="ui-btn ui-btn-sm"
    :class="[icon ? 'ui-btn-icon ui-btn-quiet' : '', pinned ? 'text-accent-700' : '']"
    :title="pinned ? 'Pinned: open the evidence board' : `Pin ${title} to the evidence board`"
    :aria-label="pinned ? 'Open the evidence board' : `Pin ${title}`"
    :disabled="busy"
    @click.stop="onClick"
  >
    <Icon icon="bookmark" :size="13" :class="pinned ? 'text-accent-600' : 'text-neutral-500'"/>
    <span v-if="!icon">{{ busy ? "Pinning…" : pinned ? "Pinned" : "Pin" }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import Icon from "~/components/ui/common/Icon.vue";
import { exportables } from "~/composables/useExportables";
import { useEvidenceStore } from "~/stores/evidence";
import { useWorkspacesStore } from "~/stores/workspaces";
import { pngBase64 } from "~/utils/figure";
import { buildProvenance, provenanceShort } from "~/utils/provenance";
import type { PinKind, PinValues } from "~/utils/evidence";

// The one pin in the app. It keeps a finding on the workspace's evidence
// board with the snapshot, commit, lens and scope it was seen under; a view
// pin also keeps a figure of what was on screen.

const props = withDefaults(defineProps<{
  kind: PinKind
  entityKey: string
  title: string
  values?: PinValues | (() => PinValues)
  /** Keep a PNG of the view's first figure (view pins). */
  figure?: boolean
  icon?: boolean
}>(), { values: () => ({}), figure: false, icon: false });

const evidence = useEvidenceStore();
const workspaces = useWorkspacesStore();
const router = useRouter();
const busy = ref(false);
const pinned = computed(() => evidence.isPinned(props.kind, props.entityKey));

async function onClick() {
  if (pinned.value) { void router.push("/views/evidence"); return; }
  if (workspaces.active) await evidence.load(workspaces.active.id);
  busy.value = true;
  try {
    let figure: string | null = null;
    if (props.figure) {
      const f = exportables.value.find(e => e.kind === "figure" && e.ready());
      if (f && f.kind === "figure") {
        const out = await f.render({ light: true });
        if (out) figure = await pngBase64(out, provenanceShort(buildProvenance()), { light: true });
      }
    }
    await evidence.pin({ kind: props.kind, entityKey: props.entityKey, title: props.title, values: typeof props.values === "function" ? props.values() : props.values, figure });
  } finally {
    busy.value = false;
  }
}
</script>
