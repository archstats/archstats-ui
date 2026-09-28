<template>
  <span class="inline-flex items-center gap-1">
    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!declared" :title="declared ? 'Save this declaration as archstats-rules.yml: archstats assert runs it on every build and fails, with file and line, when an import crosses it' : 'Declare dependencies on this lens first'" @click="save">Rules for CI…</button>
    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!declared" title="Copy a GitHub Actions job that runs the saved rules" @click="copyText(CI_SNIPPET)">Copy CI step</button>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { detectSeparator } from "~/features/snapshot/names";
import { useGroupsStore } from "~/features/groups/groups.store";
import { parseQuery } from "~/features/groups/query";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { copyText, saveText } from "~/platform/files";
import { CI_SNIPPET, ruleGroup, rulesYaml } from "../rulesAsCode";

// A lens's declaration, carried out of the app into the build: the rules a
// person drew here, run by `archstats assert` on every change.

const props = defineProps<{ lens: string }>();
const data = useDataStore();
const groups = useGroupsStore();
const workspaces = useWorkspacesStore();
const declared = computed(() => groups.dimensionRecords.find(d => d.name === props.lens)?.declared ?? null);

function save() {
  const d = declared.value;
  if (!d) return;
  const rgs = groups.groups.filter(g => g.dimension === props.lens).map(g => {
    const lines = g.query ? parseQuery(g.query).lines.map(l => ({ raw: l.raw, exclude: l.exclude, plainGlob: l.source.kind === "glob" && l.conds.length === 0 })) : null;
    const comps = new Map([...groups.componentsOf(g)].map(([c, cov]) => [c, { whole: cov.full }]));
    return ruleGroup(g, lines, comps, groups.filesOf(g), f => data.fileComponentIndex.get(f));
  });
  const sep = detectSeparator(data.componentFilesIndex.keys());
  const origin = `${workspaces.active?.name ?? "workspace"}, scan ${(workspaces.openScanId ?? "").slice(0, 8)}`;
  void saveText("archstats-rules.yml", rulesYaml(props.lens, rgs, d, sep, origin), [{ name: "YAML", patterns: "*.yml" }], "Save the rules for CI");
}
</script>
