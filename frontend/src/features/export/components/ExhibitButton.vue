<template>
  <!-- The one way out of a figure or a table: a quiet share button at the
       end of the row that names the exhibit (or, on a canvas that fills its
       pane, a control chip in the corner like the zoom controls), opening
       what can be done with it. -->
  <button
    v-if="exhibit"
    ref="buttonEl"
    v-bind="$attrs"
    type="button"
    class="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors duration-100"
    :class="[
      variant === 'chip'
        ? 'bg-surface text-neutral-500 shadow-[0_0_0_1px_rgb(var(--c-neutral-200))] hover:bg-neutral-100 hover:text-neutral-900'
        : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
      open ? '!bg-neutral-100 !text-neutral-900' : '',
    ]"
    :aria-expanded="open"
    aria-haspopup="menu"
    :aria-label="t('export.exhibitButton.export', { exhibitTitle: exhibit.title })"
    :title="status || t('export.exhibitButton.export', { exhibitTitle: exhibit.title })"
    data-exhibit-button
    @click.stop="toggle"
  >
    <Icon :icon="status ? 'check' : 'share'" :size="13" :class="status ? 'text-green-600' : ''"/>
  </button>

  <Teleport to="body">
    <template v-if="open && exhibit">
      <div class="fixed inset-0 z-[69] cursor-default" @click="close"></div>
      <div class="ui-menu flex w-64 flex-col animate-in" :style="style" role="menu" :aria-label="exhibit.title" @keydown.esc.stop="close">
        <p class="ui-menu-title truncate normal-case tracking-normal" :title="exhibit.title">{{ exhibit.title }}</p>

        <template v-if="exhibit.kind === 'figure'">
          <button type="button" class="ui-menu-item" role="menuitem" :disabled="!ready" :class="{ 'opacity-50': !ready }" :title="ready ? '' : t('export.exhibitButton.stillDrawing')" @click="save(t('export.exhibitButton.savePng'), saveFigurePng)">
            <Icon icon="image" :size="12" class="text-neutral-500"/><span>{{ t('export.exhibitButton.savePng2') }}</span>
          </button>
          <button v-if="exhibit.svg !== false" type="button" class="ui-menu-item" role="menuitem" :disabled="!ready" :class="{ 'opacity-50': !ready }" @click="save(t('export.exhibitButton.saveSvg'), saveFigureSvg)">
            <Icon icon="image" :size="12" class="text-neutral-500"/><span>{{ t('export.exhibitButton.saveSvg2') }}</span>
          </button>
        </template>

        <template v-else>
          <p v-if="tableReason" class="px-2 pb-1 text-sm text-neutral-500">{{ tableReason }}</p>
          <template v-else>
            <button type="button" class="ui-menu-item" role="menuitem" @click="table(copyTableMarkdown, true)">
              <Icon icon="copy" :size="12" class="text-neutral-500"/>
              <span class="min-w-0 flex-1 truncate">{{ confirming ? t('export.exhibitButton.copyRowsClickAgain', { value: rows.toLocaleString(intlLocale) }) : t('export.exhibitButton.copyMarkdown') }}</span>
            </button>
            <button type="button" class="ui-menu-item" role="menuitem" @click="table(copyTableCsv)">
              <Icon icon="copy" :size="12" class="text-neutral-500"/><span>{{ t('export.exhibitButton.copyCsv') }}</span>
            </button>
            <button type="button" class="ui-menu-item" role="menuitem" @click="table(saveTableCsv)">
              <Icon icon="table" :size="12" class="text-neutral-500"/><span class="flex-1">{{ t('export.exhibitButton.saveCsv') }}</span>
              <span class="font-mono text-xs text-neutral-400">{{ t('export.exhibitButton.rows', { value: rows.toLocaleString(intlLocale) }) }}</span>
            </button>
          </template>
        </template>

        <template v-if="!isReportView">
          <button type="button" class="ui-menu-item" role="menuitem" :disabled="!usableNow" :class="{ 'opacity-50': !usableNow }" :title="usableNow ? t('export.exhibitButton.previewReportWriteAround') : t('export.exhibitButton.nothingDrawnHereAdd')" @click="handoff(t('export.exhibitButton.addReport'), 'addToReport')">
            <Icon icon="file-text" :size="12" class="text-neutral-500"/><span>{{ t('export.exhibitButton.addReport2') }}</span>
          </button>
          <button v-if="exhibit.kind === 'figure'" type="button" class="ui-menu-item" role="menuitem" :disabled="!usableNow" :class="{ 'opacity-50': !usableNow }" :title="t('export.exhibitButton.keepFigureViewCame')" @click="handoff(t('export.exhibitButton.pin'), 'pin')">
            <Icon icon="bookmark" :size="12" class="text-neutral-500"/><span>{{ t('export.exhibitButton.pinFigure') }}</span>
          </button>
        </template>

        <template v-if="exhibit.kind === 'figure'">
          <div class="my-1 h-px bg-neutral-100" role="separator"></div>
          <button type="button" class="ui-menu-item" role="menuitemcheckbox" :aria-checked="legendInExport" :disabled="!hasLegend" :class="{ 'opacity-50': !hasLegend }" :title="hasLegend ? t('export.exhibitButton.drawLegendUnderFigure') : t('export.exhibitButton.figureDeclaresNoLegend')" @click="legendInExport = !legendInExport">
            <Icon icon="check" :size="12" :class="legendInExport && hasLegend ? 'text-neutral-700' : 'text-transparent'"/><span>{{ t('export.exhibitButton.legendExport') }}</span>
          </button>
          <button v-if="hasLegend" type="button" class="ui-menu-item" role="menuitemcheckbox" :aria-checked="legendHere" :title="t('export.exhibitButton.showLegendUnderFigure')" @click="rememberLegendHere(exhibit.title, !legendHere)">
            <Icon icon="check" :size="12" :class="legendHere ? 'text-neutral-700' : 'text-transparent'"/><span>{{ t('export.exhibitButton.legendHere') }}</span>
          </button>
          <button v-if="dark" type="button" class="ui-menu-item" role="menuitemcheckbox" :aria-checked="asShown" @click="asShown = !asShown">
            <Icon icon="check" :size="12" :class="asShown ? 'text-neutral-700' : 'text-transparent'"/><span>{{ t('export.exhibitButton.shownDark') }}</span>
          </button>
        </template>
      </div>
    </template>
    <p v-if="error" class="ui-popover fixed z-[70] w-72 p-2.5 text-sm text-red-700" :style="style" role="alert" @click="error = ''">{{ error }}</p>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from "vue";
import Icon from "~/shared/ui/Icon.vue";
import { useAnchoredPanel } from "~/shared/ui/useAnchoredPanel";
import { isDarkAppearance, isEmptyLegend } from "~/features/export/figure";
import { exhibitHandoff, saveFigurePng, saveFigureSvg, type FigureChoice } from "~/features/export/figureActions";
import { copyTableCsv, copyTableMarkdown, saveTableCsv, type TableSource } from "~/features/export/exportActions";
import { MARKDOWN_ROW_WARNING } from "~/features/export/export";
import { asShown, legendHereFor, legendInExport, rememberLegendHere } from "~/features/export/figurePrefs";
import { FRAME, type Exhibit } from "~/features/export/exhibitFrame";
import type { FigureExportable } from "~/features/export/useExportables";
import { t, intlLocale } from "~/shared/i18n";

// Two roots (the button and its menu, teleported), so a class for placement goes on the button by hand.
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  /** Defaults to the exhibit of the frame this button sits in. */
  exhibit?: Exhibit | null
  /** `chip` floats on a canvas; `quiet` sits in a row of text. */
  variant?: "quiet" | "chip"
}>(), { exhibit: undefined, variant: "quiet" });

const frame = inject(FRAME, null);
const exhibit = computed<Exhibit | null>(() => props.exhibit ?? frame?.exhibit.value ?? null);

const buttonEl = ref<HTMLElement | null>(null);
const open = ref(false);
const status = ref("");
const error = ref("");
const confirming = ref(false);
const dark = ref(isDarkAppearance());
const { style } = useAnchoredPanel(buttonEl, open, "right");
let statusTimer: ReturnType<typeof setTimeout> | null = null;

const ready = computed(() => exhibit.value?.kind === "figure" && exhibit.value.ready());
const hasLegend = computed(() => exhibit.value?.kind === "figure" && !isEmptyLegend(exhibit.value.legend()));
const legendHere = computed(() => exhibit.value?.kind === "figure" && legendHereFor(exhibit.value.title, exhibit.value.legendInUi()));
const rows = computed(() => (exhibit.value?.kind === "table" ? exhibit.value.rows().length : 0));
const tableReason = computed(() => {
  const e = exhibit.value;
  if (e?.kind !== "table") return "";
  return e.disabledReason?.() || (e.ready && !e.ready() ? t("export.exhibitButton.stillLoading") : rows.value === 0 ? t("export.exhibitButton.noRowsScope") : "");
});
const usableNow = computed(() => (exhibit.value?.kind === "figure" ? ready.value : !tableReason.value));
const isReportView = computed(() => typeof location !== "undefined" && location.hash.startsWith("#/views/evidence"));
const choice = (): FigureChoice => ({ light: !asShown.value, legend: legendInExport.value });

function toggle() { dark.value = isDarkAppearance(); error.value = ""; confirming.value = false; open.value = !open.value; }
function close() { open.value = false; confirming.value = false; }

function done(word: string) {
  error.value = "";
  status.value = word;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.value = ""; }, 1600);
}
const fail = (what: string, e: unknown) => { error.value = `${what} failed: ${e instanceof Error ? e.message : String(e)}`; };

async function save(what: string, action: (f: FigureExportable, c: FigureChoice) => Promise<string | null>) {
  const e = exhibit.value;
  if (e?.kind !== "figure" || !ready.value) return;
  close();
  try { const word = await action(e, choice()); if (word) done(word); } catch (err) { fail(what, err); }
}

async function table(action: (t: TableSource) => Promise<string | null>, markdown = false) {
  const e = exhibit.value;
  if (e?.kind !== "table") return;
  if (markdown && rows.value > MARKDOWN_ROW_WARNING && !confirming.value) { confirming.value = true; return; }
  close();
  try { const word = await action(e); if (word) done(word); } catch (err) { fail(t("export.exhibitButton.export2"), err); }
}

async function handoff(what: string, which: "addToReport" | "pin") {
  const h = exhibitHandoff(), e = exhibit.value;
  if (!e || !usableNow.value) return;
  close();
  if (!h) { fail(what, new Error(t("export.exhibitButton.reportsNotLoadedWindow"))); return; }
  try {
    if (which === "pin" && e.kind === "figure") { await h.pin(e, choice()); done("Pinned"); }
    else await h.addToReport(e, choice());
  } catch (err) { fail(what, err); }
}

onBeforeUnmount(() => { if (statusTimer) clearTimeout(statusTimer); });
</script>
