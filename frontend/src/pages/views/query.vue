<template>
  <ViewWorkspaceLayout :queryable="false" title="SQL console">
    <template #switches>
      <SingleSelect :model-value="scanOption" :options="scanOptions" @update:model-value="(o: any) => (scanId = o?.id ?? scanId)"/>
    </template>
    <template #visualizer>
      <div ref="rootEl" class="flex min-h-0 grow" @keydown="onKey">
        <!-- Explorer -->
        <aside class="flex shrink-0 flex-col" :style="{ width: `${explorerW}px` }" aria-label="Explorer">
          <SchemaExplorer
            ref="explorer"
            :scan-id="scanId"
            :saved="saved"
            :reports="reports.sqlCells"
            :current="tab ? { savedId: tab.savedId, cellId: tab.cell?.cellId } : null"
            :describe="describeColumn"
            @open-table="openTable"
            @insert="insert"
            @open-saved="q => con.openSaved(q)"
            @remove-saved="removeSaved"
            @open-cell="openCell"
            @open-report="openReport"
            @reference="openReference"
          />
        </aside>
        <div class="qc-split qc-split-v" role="separator" aria-orientation="vertical" aria-label="Resize the explorer" @mousedown.prevent="dragExplorer"></div>

        <main class="flex min-w-0 grow flex-col" aria-label="Console">
          <!-- Tabs, like an IDE's open editors. -->
          <div class="qc-tabs hairline-b" role="tablist" aria-label="Queries">
            <div class="flex min-w-0 flex-1 items-stretch overflow-x-auto">
              <div
                v-for="t in con.tabs"
                :key="t.id"
                class="qc-tab group/tab"
                :class="{ 'qc-tab-on': t.id === con.activeId, 'qc-tab-drop': dropOn === t.id }"
                role="tab"
                :aria-selected="t.id === con.activeId"
                :title="tabTitle(t)"
                draggable="true"
                @mousedown="e => { if (e.button === 0) con.activate(t.id) }"
                @mouseup.middle.prevent="con.close(t.id)"
                @dblclick="startRename(t)"
                @contextmenu.prevent="openMenu($event, t)"
                @dragstart="dragTab = t.id"
                @dragover.prevent="dropOn = t.id"
                @dragleave="dropOn = null"
                @drop.prevent="dropTab(t.id)"
                @dragend="dragTab = null; dropOn = null"
              >
                <component :is="t.cell ? FileText : t.savedId ? Bookmark : TerminalSquare" :size="12" class="shrink-0 text-neutral-400"/>
                <input
                  v-if="renaming === t.id"
                  v-model="renameText"
                  class="qc-rename"
                  aria-label="Tab name"
                  v-select-on-mount
                  @keydown.enter.prevent="endRename(true)"
                  @keydown.esc.prevent="endRename(false)"
                  @blur="endRename(true)"
                  @mousedown.stop
                >
                <span v-else class="min-w-0 truncate">{{ t.name }}</span>
                <span v-if="changed(t)" class="qc-dirty" :title="t.cell ? 'Changed since it came from the report' : 'Changed since it was saved'" aria-label="changed"></span>
                <Loader2 v-if="con.runs[t.id]?.running" :size="11" class="shrink-0 animate-spin text-neutral-500"/>
                <button type="button" class="qc-tab-x" :aria-label="`Close ${t.name}`" @mousedown.stop @click.stop="con.close(t.id)"><X :size="11"/></button>
              </div>
            </div>
            <button type="button" class="qc-tab-add" title="New query (⌘T)" aria-label="New query" @click="newTab()"><Plus :size="14"/></button>
          </div>

          <!-- What this tab can do. -->
          <div class="qc-bar hairline-b">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!canRun" :title="runTitle" @click="run()">
              <Play :size="10" fill="currentColor"/> {{ runLabel }} <span class="font-mono text-[10.5px] opacity-70">⌘↵</span>
            </button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!canRun" title="How SQLite will read the tables for this statement: which it scans in full and which it searches by index" @click="explain()"><ListTree :size="13" class="text-neutral-500"/> Explain</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!tab?.sql.trim()" title="Reformat: one clause per line, long lists one item per line (⌥⌘L)" @click="format()"><AlignLeft :size="13" class="text-neutral-500"/> Format</button>
            <span class="qc-sep" aria-hidden="true"></span>
            <template v-if="savingName !== null">
              <input ref="saveEl" v-model="savingName" class="ui-input ui-input-sm w-52" placeholder="Name this query" aria-label="Query name" @keydown.enter.prevent="saveQuery" @keydown.esc="savingName = null">
              <button type="button" class="ui-btn ui-btn-sm" :disabled="!savingName.trim()" @click="saveQuery">Save</button>
              <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="savingName = null">Cancel</button>
            </template>
            <button v-else type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!tab?.sql.trim()" :title="savedOf(tab) ? `Save changes to “${savedOf(tab)!.name}” (⌘S)` : 'Keep this query with the workspace; reports can insert it too (⌘S)'" @click="save()">
              <Bookmark :size="13" class="text-neutral-500"/> {{ savedOf(tab) ? (changed(tab!) ? "Save" : "Saved") : "Save…" }}
            </button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!result" :title="result ? 'Put this query in a report as a live table: it runs again on the report’s snapshot' : 'Run a query first'" @click="addToReport"><FilePlus2 :size="13" class="text-neutral-500"/> Add to report</button>
            <span class="ml-auto truncate font-mono text-[11px] text-neutral-400" title="The console reads the snapshot and never writes to it. One statement at a time; the first 5,000 rows; stopped after 10 seconds.">read-only · 5,000 rows · 10 s</span>
          </div>

          <!-- A tab opened from a report's cell writes back to it. -->
          <div v-if="tab?.cell" class="qc-link hairline-b">
            <FileText :size="13" class="shrink-0 text-neutral-500"/>
            <span class="min-w-0 truncate"><span class="font-medium text-neutral-900">{{ tab.cell.label }}</span> in <button type="button" class="font-medium text-neutral-900 hover:underline" @click="openReport(tab.cell.reportId)">{{ tab.cell.report }}</button></span>
            <span class="shrink-0 text-neutral-500">{{ linkNote }}</span>
            <button type="button" class="ui-btn ui-btn-sm ml-auto" :disabled="!changed(tab) || updating" :title="changed(tab) ? 'Write this SQL into the report’s cell and run it on the report’s snapshot' : 'Nothing changed since it came from the report'" @click="updateCell">{{ updating ? "Updating…" : "Update cell" }}</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Keep this tab, without the link to the report" @click="con.patch(tab.id, { cell: undefined })">Unlink</button>
          </div>

          <!-- The query's :parameters, filled here and written in as literals when it runs. -->
          <div v-if="tab && params.length" class="qc-params hairline-b" aria-label="Parameters">
            <Braces :size="13" class="shrink-0 text-neutral-500"/>
            <label v-for="p in params" :key="p.name" class="qc-param" :class="{ 'qc-param-missing': missing.includes(p.name) }">
              <span class="font-mono text-[11.5px] text-neutral-600">{{ p.written }}</span>
              <input
                :ref="el => { if (el) paramEls[p.name] = el as HTMLInputElement }"
                :value="tab.params?.[p.name] ?? ''"
                class="ui-input ui-input-sm ui-input-mono w-48"
                :list="`qp-${tab.id}-${p.name}`"
                :placeholder="paramHint(p)"
                :aria-label="`Value of ${p.written}`"
                autocomplete="off"
                spellcheck="false"
                @input="e => onParam(p, (e.target as HTMLInputElement).value)"
                @focus="suggest(p, tab.params?.[p.name] ?? '')"
                @keydown.enter.prevent="run()"
              >
              <datalist :id="`qp-${tab.id}-${p.name}`"><option v-for="v in paramValues[p.name] ?? []" :key="v" :value="v"></option></datalist>
            </label>
            <span class="ml-auto hidden shrink-0 text-[11px] text-neutral-500 xl:inline">Written into the SQL as values when it runs; ↵ runs</span>
          </div>

          <!-- Editor over results. -->
          <div ref="stackEl" class="flex min-h-0 grow flex-col">
            <div class="min-h-0" :style="{ flex: resultsOpen ? `0 0 ${editorPct}%` : '1 1 auto' }">
              <SqlEditor
                v-if="tab"
                :key="tab.id"
                ref="editor"
                :model-value="tab.sql"
                :scan-id="scanId"
                :error="run$.error || null"
                fill
                line-numbers
                placeholder="select name, complexity__lines from components order by 2 desc"
                aria-label="SQL query"
                @update:model-value="v => con.setSql(tab!.id, v)"
                @run="run()"
                @format="format()"
                @caret="c => (caret = c)"
              />
            </div>

            <div v-if="resultsOpen" class="qc-split qc-split-h" role="separator" aria-orientation="horizontal" aria-label="Resize the results" @mousedown.prevent="dragResults"></div>

            <!-- Results, plan and history. -->
            <section class="flex min-h-0 flex-col" :class="resultsOpen ? 'flex-1' : 'shrink-0'" aria-label="Output">
              <div class="qc-out-head" :class="{ 'hairline-t': !resultsOpen }">
                <div class="ui-segmented" role="tablist" aria-label="Output">
                  <button type="button" role="tab" :aria-pressed="pane === 'result'" :aria-selected="pane === 'result'" @click="showPane('result')">Result</button>
                  <button type="button" role="tab" :aria-pressed="pane === 'chart'" :aria-selected="pane === 'chart'" :disabled="!result" @click="showPane('chart')">Chart</button>
                  <button type="button" role="tab" :aria-pressed="pane === 'plan'" :aria-selected="pane === 'plan'" @click="showPane('plan')">Plan</button>
                  <button type="button" role="tab" :aria-pressed="pane === 'history'" :aria-selected="pane === 'history'" @click="showPane('history')">History <span class="font-mono text-[10.5px] text-neutral-400">{{ con.history.length }}</span></button>
                </div>
                <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <template v-if="pane === 'result' && result && resultsOpen">
                  <label class="relative ml-1 flex shrink-0 items-center">
                    <Filter :size="12" class="pointer-events-none absolute left-2 text-neutral-400"/>
                    <input v-model="rowFilter" type="search" class="ui-input ui-input-sm w-40 pl-6" placeholder="Filter loaded rows" aria-label="Filter loaded rows">
                  </label>
                  <span class="qc-meta" :title="resultTitle">
                    <template v-if="rowFilter.trim()">{{ fmt(viewRows.length) }} of </template>{{ fmt(result.rows.length) }}{{ result.truncated ? "+" : "" }} rows · {{ fmt(result.elapsedMs) }} ms · <span class="font-mono">{{ result.scan }}</span>
                  </span>
                  <span v-if="diff" class="qc-diff" :title="diffTitle">
                    <span class="qc-diff-add">+{{ fmt(diff.counts.added) }}</span>
                    <span class="qc-diff-del">−{{ fmt(diff.counts.removed) }}</span>
                    <span class="qc-diff-chg">~{{ fmt(diff.counts.changed) }}</span>
                    <span class="text-neutral-500">{{ fmt(diff.counts.same) }} same</span>
                  </span>
                  <label v-if="diff" class="qc-check"><Checkbox v-model="changesOnly" aria-label="Changes only"/> Changes only</label>
                  <span v-if="result.truncated" class="ui-tag shrink-0" title="The console keeps the first 5,000 rows. Narrow the query with WHERE, LIMIT or an aggregate to see the rest.">first 5,000</span>
                  <span v-if="stale" class="ui-tag shrink-0" :title="`This result came from ${result.scan}; the console now reads ${scanOption?.name}. Run again to read it.`">other snapshot</span>
                </template>
                <span v-else-if="pane === 'plan' && run$.plan" class="qc-meta truncate font-mono">{{ oneLine(run$.plan.sql) }}</span>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <label v-if="(pane === 'result' || pane === 'chart') && resultsOpen && compareOptions.length" class="qc-compare" :class="{ 'qc-compare-on': compareId }" title="Run the same statement on another snapshot of this workspace and mark what was added, removed and changed">
                    <GitCompare :size="13" class="shrink-0"/>
                    <span class="hidden xl:inline">Compare with</span>
                    <select v-model="compareId" class="qc-compare-select" aria-label="Compare with">
                      <option :value="null">no snapshot</option>
                      <option v-for="o in compareOptions" :key="o.id" :value="o.id">{{ o.name }}</option>
                    </select>
                    <Loader2 v-if="run$.baseline?.running" :size="11" class="animate-spin"/>
                  </label>
                  <template v-if="pane === 'result' && result && resultsOpen">
                    <div class="relative">
                      <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :aria-expanded="copyOpen" @click="copyOpen = !copyOpen"><Copy :size="12" class="text-neutral-500"/> Copy as <ChevronDown :size="11" class="text-neutral-400"/></button>
                      <div v-if="copyOpen" class="fixed inset-0 z-40" @click="copyOpen = false"></div>
                      <div v-if="copyOpen" class="ui-menu absolute right-0 z-50 mt-1 w-60 p-1 animate-in" role="menu">
                        <button type="button" class="ui-menu-item" role="menuitem" @click="copyAs('tsv')">Tab-separated, for a spreadsheet</button>
                        <button type="button" class="ui-menu-item" role="menuitem" @click="copyAs('csv')">CSV</button>
                        <button type="button" class="ui-menu-item" role="menuitem" @click="copyAs('md')">Markdown table</button>
                        <button type="button" class="ui-menu-item" role="menuitem" :disabled="!unitColumn" @click="copyAs('in')">SQL list of the {{ unitColumn?.kind ?? "name" }}s</button>
                      </div>
                    </div>
                    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-pressed="metricNames" :class="{ 'qc-on': metricNames }" :disabled="!hasMetrics" :title="hasMetrics ? (metricNames ? 'Headers read the metrics’ ids' : 'Headers read the metrics’ names; hover one for its definition') : 'No column here is a defined metric'" aria-label="Metric names in headers" @click="metricNames = !metricNames"><CaseSensitive :size="14"/></button>
                    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :aria-pressed="viewer" :class="{ 'qc-on': viewer }" title="Show the selected value in full" aria-label="Value pane" @click="viewer = !viewer"><PanelRight :size="13"/></button>
                    <ExhibitButton :exhibit="resultTable"/>
                  </template>
                  <button v-if="pane === 'history' && con.history.length && resultsOpen" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="con.clearHistory()">Clear history</button>
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :title="resultsOpen ? 'Hide the output' : 'Show the output'" :aria-label="resultsOpen ? 'Hide the output' : 'Show the output'" @click="resultsOpen = !resultsOpen">
                    <ChevronDown v-if="resultsOpen" :size="13"/><ChevronUp v-else :size="13"/>
                  </button>
                </div>
                <span v-if="run$.running" class="shell-progress absolute inset-x-0 bottom-0 h-[2px]" aria-hidden="true"><span></span></span>
              </div>

              <template v-if="resultsOpen">
                <!-- Result -->
                <template v-if="pane === 'result'">
                  <div v-if="run$.error" class="qc-error" role="alert">
                    <AlertTriangle :size="14" class="mt-0.5 shrink-0"/>
                    <div class="min-w-0">
                      <p class="font-mono text-[12px] leading-5">{{ run$.error }}</p>
                      <p class="mt-1 text-xs text-neutral-600">{{ errorHint }}</p>
                    </div>
                  </div>
                  <p v-if="!run$.error && result && run$.baseline?.error && compareId" class="qc-warn" role="status"><AlertTriangle :size="13" class="shrink-0"/><span class="min-w-0 truncate">The baseline, {{ compareName }}, could not run it: <span class="font-mono">{{ run$.baseline.error }}</span></span></p>
                  <ResultGrid
                    v-if="!run$.error && result"
                    v-model:viewer="viewer"
                    :columns="result.columns"
                    :rows="viewRows"
                    :sort="sort"
                    :unit="unitColumn"
                    :units="selectedUnits"
                    :highlight="rowFilter"
                    :diff="gridDiff"
                    :define="define"
                    :names="metricNames"
                    :empty-text="rowFilter.trim() ? `No loaded row holds “${rowFilter.trim()}”.` : 'The query ran and returned no rows.'"
                    @sort="toggleSort"
                    @toggle-unit="toggleUnit"
                    @set-units="v => (selectedUnits = new Set(v))"
                    @open-unit="openUnit"
                    @reference="openReference"
                  />
                  <div v-if="!run$.error && !result" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <p class="text-[13px] text-neutral-700">Write a query and press <kbd class="qc-kbd">⌘↵</kbd>. With several statements, the one under the caret runs; a selection runs as it is.</p>
                    <h3 class="ui-section-title mt-5">Start from</h3>
                    <ul class="mt-1.5 flex max-w-[860px] flex-col">
                      <li v-for="ex in EXAMPLES" :key="ex.sql">
                        <button type="button" class="qc-example" @click="useExample(ex)">
                          <span class="text-[13px] text-neutral-900">{{ ex.label }}</span>
                          <code class="block truncate font-mono text-[11.5px] text-neutral-500">{{ ex.sql }}</code>
                        </button>
                      </li>
                    </ul>
                    <h3 class="ui-section-title mt-5">Keys</h3>
                    <dl class="qc-keys">
                      <dt>⌘↵</dt><dd>Run the statement at the caret, or the selection</dd>
                      <dt>⌃Space</dt><dd>Suggest tables, columns, metrics and values</dd>
                      <dt>⌥⌘L</dt><dd>Reformat</dd>
                      <dt>⌘/</dt><dd>Comment the line</dd>
                      <dt>⌘T · ⇧⌘[ ⇧⌘]</dt><dd>New tab · previous and next tab</dd>
                      <dt>⌘S</dt><dd>Save the query</dd>
                      <dt>:name</dt><dd>A parameter: fill it in above the editor, with the snapshot's values offered</dd>
                    </dl>
                  </div>
                </template>

                <!-- Chart -->
                <template v-else-if="pane === 'chart'">
                  <ResultChart
                    v-if="result"
                    :columns="result.columns"
                    :rows="chartRows"
                    :title="figureTitle"
                    :sql="result.sql"
                    :scan="result.scan"
                    :define="define"
                  />
                  <p v-else class="px-4 py-3 text-[13px] text-neutral-600">Run a query to draw it: a name and a number make ranked bars, two numbers a scatter.</p>
                </template>

                <!-- Plan -->
                <div v-else-if="pane === 'plan'" class="min-h-0 flex-1 overflow-auto px-4 py-3">
                  <p v-if="!run$.plan" class="text-[13px] text-neutral-600">Explain shows how SQLite will read the tables for the statement at the caret: a <span class="font-mono">SCAN</span> reads every row, a <span class="font-mono">SEARCH</span> goes straight to the rows it needs.</p>
                  <p v-else-if="run$.plan.error" class="qc-error !m-0" role="alert"><AlertTriangle :size="14" class="mt-0.5 shrink-0"/><span class="font-mono text-[12px]">{{ run$.plan.error }}</span></p>
                  <ul v-else class="qc-plan">
                    <li v-for="p in planRows" :key="p.id" :style="{ paddingLeft: `${p.depth * 18}px` }">
                      <span class="qc-plan-mark" :class="p.kind" aria-hidden="true"></span>
                      <span class="font-mono">{{ p.detail }}</span>
                      <span v-if="p.kind === 'scan'" class="ui-tag">reads every row</span>
                    </li>
                  </ul>
                </div>

                <!-- History -->
                <div v-else class="min-h-0 flex-1 overflow-y-auto">
                  <p v-if="!con.history.length" class="px-4 py-3 text-[13px] text-neutral-600">Every statement run here is kept for this workspace, newest first.</p>
                  <ul v-else>
                    <li v-for="h in con.history" :key="h.id" class="qc-hist group/h" :title="h.sql" @dblclick="con.open({ sql: h.sql })">
                      <span class="qc-hist-time">{{ histTime(h.at) }}</span>
                      <span class="qc-hist-stat" :class="{ 'text-red-700': h.error }">{{ h.error ? "failed" : `${fmt(h.rows ?? 0)} rows` }}</span>
                      <code class="qc-hist-sql">{{ oneLine(h.sql) }}</code>
                      <span class="qc-hist-scan">{{ h.scan }}</span>
                      <span class="flex shrink-0 gap-1 opacity-0 group-hover/h:opacity-100 focus-within:opacity-100">
                        <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" title="Put it at the caret in this tab" @click="insert(h.sql)">Insert</button>
                        <button type="button" class="ui-btn ui-btn-sm" title="Open it in a new tab (double-click)" @click="con.open({ sql: h.sql })">Open</button>
                      </span>
                    </li>
                  </ul>
                </div>
              </template>
            </section>
          </div>
        </main>
      </div>

      <!-- A tab's menu. -->
      <template v-if="menu">
        <div class="fixed inset-0 z-40" @mousedown="menu = null" @contextmenu.prevent="menu = null"></div>
        <div class="ui-menu fixed z-50 w-52 p-1 animate-in" role="menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
          <button type="button" class="ui-menu-item" role="menuitem" @click="startRename(menu.tab); menu = null">Rename</button>
          <button type="button" class="ui-menu-item" role="menuitem" @click="con.open({ name: `${menu.tab.name} copy`, sql: menu.tab.sql }); menu = null">Duplicate</button>
          <button v-if="menu.tab.cell" type="button" class="ui-menu-item" role="menuitem" @click="openReport(menu.tab.cell.reportId); menu = null">Open the report</button>
          <div class="my-1 h-px bg-neutral-200" role="separator"></div>
          <button type="button" class="ui-menu-item" role="menuitem" @click="con.close(menu.tab.id); menu = null">Close</button>
          <button type="button" class="ui-menu-item" role="menuitem" :disabled="con.tabs.length < 2" @click="con.closeOthers(menu.tab.id); menu = null">Close others</button>
        </div>
      </template>

      <p v-if="notice" class="qc-notice" role="status">{{ notice }}</p>
      <GroupActionBar v-if="unitColumn && selectedUnits.size" :selected-items="[...selectedUnits]" :kind="unitColumn.kind" @clear="selectedUnits = new Set()" @created="selectedUnits = new Set()"/>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { AlertTriangle, AlignLeft, Bookmark, Braces, CaseSensitive, GitCompare, ChevronDown, ChevronUp, Copy, FilePlus2, FileText, Filter, ListTree, Loader2, PanelRight, Play, Plus, TerminalSquare, X } from "lucide-vue-next";
import { Console } from "wailsjs/go/app/QueryService";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import SqlEditor from "~/features/sql/components/SqlEditor.vue";
import SchemaExplorer, { type CellSql, type SavedQuery } from "~/features/sql/components/SchemaExplorer.vue";
import ResultGrid from "~/features/sql/components/ResultGrid.vue";
import ResultChart from "~/features/sql/components/ResultChart.vue";
import { bindParams, paramColumn, paramsIn, type SqlParam } from "~/features/sql/sqlParams";
import { diffResults, type DiffEntry } from "~/features/sql/resultDiff";
import { useSqlSchema } from "~/features/sql/useSqlSchema";
import Checkbox from "~/shared/ui/Checkbox.vue";
import { useConsoleStore, type ConsoleTab, type PlanRow } from "~/features/sql/console.store";
import { formatSql, statementAt } from "~/features/sql/sqlFormat";
import GroupActionBar from "~/features/groups/components/GroupActionBar.vue";
import SingleSelect from "~/shared/ui/SingleSelect.vue";
import { useTable } from "~/features/export/useExportables";
import ExhibitButton from "~/features/export/components/ExhibitButton.vue";
import { useDataStore } from "~/features/snapshot/data.store";
import { useStateStore } from "~/platform/state.store";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useReportsStore } from "~/features/reports/reports.store";
import { headerCase, metricsNote } from "~/features/reports/reportCells";
import { useMetricDocs } from "~/features/snapshot/useMetricDocs";
import { detailRoute } from "~/features/connections/connections";
import { newestFirst } from "~/features/workspace/scanOrder";
import { snapshotName } from "~/features/workspace/snapshotName";
import { formatScanTime } from "~/shared/time";

// For the question no view asks: read-only SQL against any snapshot of the
// workspace, laid out like a database IDE. Tabs and history stay with the
// workspace; a result exports like any table, goes into a report as a live
// query, and a column of component or file names can become a group.

const data = useDataStore();
const state = useStateStore();
const workspaces = useWorkspacesStore();
const reports = useReportsStore();
const con = useConsoleStore();
const router = useRouter();

const EXAMPLES = [
  { label: "Largest components", sql: "select name, complexity__lines, codesmells__code_health\nfrom components\norder by 2 desc\nlimit 20" },
  { label: "Files changed most in the last 90 days", sql: "select name, git__commits__last_90_days\nfrom files\norder by 2 desc\nlimit 20" },
  { label: "Who touched a component, by commits", sql: "select author_name, count(distinct commit_hash) as commits\nfrom git_commits\nwhere component = :component\ngroup by 1\norder by 2 desc" },
  { label: "What each metric means", sql: "select *\nfrom _metric_definitions" },
];

// ── Snapshot ──────────────────────────────────────────────────────────
const complete = computed(() => newestFirst(workspaces.scans.filter((s: any) => s.status === "complete")) as any[]);
const scanOptions = computed(() => {
  const base = complete.value.map(s => ({ id: s.id, name: `${s.label ? s.label + " · " : ""}${formatScanTime(s.headTime ?? s.startedAt)}`, scanned: formatScanTime(s.startedAt) }));
  // The same commit scanned twice reads the same; the scan's own time tells them apart.
  const count = new Map<string, number>();
  for (const o of base) count.set(o.name, (count.get(o.name) ?? 0) + 1);
  return base.map(o => ({ id: o.id, name: (count.get(o.name) ?? 0) > 1 ? `${o.name} · scanned ${o.scanned}` : o.name }));
});
const scanId = ref<string>(workspaces.openScanId ?? "");
watch(() => workspaces.openScanId, id => { if (id && !scanId.value) scanId.value = id; });
const scanOption = computed(() => scanOptions.value.find(o => o.id === scanId.value) ?? null);
const scan = computed(() => complete.value.find(s => s.id === scanId.value) ?? null);

// ── Tabs ──────────────────────────────────────────────────────────────
con.ensure();
watch(() => state.workspace, () => con.ensure());
const tab = computed(() => con.active);
const EMPTY = { running: false, error: "", result: null, plan: null };
const run$ = computed(() => (tab.value ? con.runs[tab.value.id] : null) ?? EMPTY);
const result = computed(() => run$.value.result);
const stale = computed(() => !!result.value && result.value.scanId !== scanId.value);
const editor = ref<InstanceType<typeof SqlEditor> | null>(null);
const explorer = ref<InstanceType<typeof SchemaExplorer> | null>(null);
const caret = ref(0);

function newTab(sql = "", name?: string) {
  con.open({ sql, name });
  void nextTick(() => editor.value?.focus());
}
const savedOf = (t: ConsoleTab | null) => (t?.savedId ? saved.value.find(q => q.id === t.savedId) ?? null : null);
function changed(t: ConsoleTab) {
  if (t.cell) return t.sql.trim() !== t.cell.sql.trim();
  const s = savedOf(t);
  return !!s && s.sql.trim() !== t.sql.trim();
}
function tabTitle(t: ConsoleTab) {
  if (t.cell) return `${t.cell.label} in ${t.cell.report}. Double-click to rename.`;
  if (t.savedId) return `Saved query “${savedOf(t)?.name ?? t.name}”. Double-click to rename.`;
  return "Double-click to rename; right-click for more.";
}
const renaming = ref<string | null>(null);
const renameText = ref("");
function startRename(t: ConsoleTab) { renaming.value = t.id; renameText.value = t.name; }
function endRename(keep: boolean) {
  const id = renaming.value;
  if (!id) return;
  renaming.value = null;
  if (keep && renameText.value.trim()) con.rename(id, renameText.value);
}
const menu = ref<{ x: number; y: number; tab: ConsoleTab } | null>(null);
function openMenu(e: MouseEvent, t: ConsoleTab) { menu.value = { x: Math.min(e.clientX, window.innerWidth - 220), y: e.clientY, tab: t }; }
const dragTab = ref<string | null>(null);
const dropOn = ref<string | null>(null);
function dropTab(onto: string) {
  if (dragTab.value && dragTab.value !== onto) con.move(dragTab.value, con.tabs.findIndex(t => t.id === onto));
  dragTab.value = null; dropOn.value = null;
}
function cycle(d: 1 | -1) {
  const i = con.tabs.findIndex(t => t.id === con.activeId);
  const next = con.tabs[(i + d + con.tabs.length) % con.tabs.length];
  if (next) con.activate(next.id);
}

/** The rename field takes the focus with its text selected. */
const vSelectOnMount = { mounted: (el: HTMLInputElement) => { el.focus(); el.select(); } };

// ── Running ───────────────────────────────────────────────────────────
/** The selection when there is one, else the statement under the caret. */
function target(): string {
  const t = tab.value;
  if (!t) return "";
  const sel = editor.value?.selection();
  if (sel && sel.to > sel.from) return t.sql.slice(sel.from, sel.to).trim().replace(/;\s*$/, "");
  return (statementAt(t.sql, sel?.caret ?? caret.value)?.text ?? "").trim();
}
const multi = computed(() => !!tab.value && /;\s*\S/.test(tab.value.sql.replace(/'[^']*'/g, "")));
const runLabel = computed(() => (run$.value.running ? "Running…" : multi.value ? "Run statement" : "Run"));
const runTitle = computed(() => (multi.value ? "Run the statement at the caret, or the selection (⌘↵)" : "Run (⌘↵)"));
const canRun = computed(() => !!tab.value?.sql.trim() && !!scanId.value && !run$.value.running);

async function run() {
  const t = tab.value;
  const stmt = target();
  if (!t || !stmt || !scanId.value || con.runs[t.id]?.running) return;
  const bound = bindParams(stmt, t.params ?? {});
  missing.value = bound.missing;
  if (bound.missing.length) {
    flash(`Fill in :${bound.missing[0]} first.`);
    void nextTick(() => paramEls.value[bound.missing[0]]?.focus());
    return;
  }
  const sql = bound.sql;
  const r = con.run(t.id);
  r.running = true;
  pane.value = "result";
  resultsOpen.value = true;
  rowFilter.value = "";
  sort.value = null;
  selectedUnits.value = new Set();
  // Named as the snapshot picker names it, so the result and the toolbar agree.
  const label = scanOption.value?.name ?? (scan.value ? snapshotName(scan.value) : "");
  const on = scanId.value;
  const other = compareId.value ? runBaseline(t.id, sql) : null;
  if (!compareId.value) r.baseline = null;
  try {
    const res: any = await Console(on, sql);
    con.setResult(t.id, { columns: res?.columns ?? [], rows: res?.rows ?? [], truncated: !!res?.truncated, elapsedMs: Number(res?.elapsedMs) || 0, sql, scanId: on, scan: label, at: new Date().toISOString() });
    con.record({ sql, scanId: on, scan: label, rows: res?.rows?.length ?? 0, ms: Number(res?.elapsedMs) || 0 });
    const s = savedOf(t);
    if (s) setSaved(saved.value.map(q => (q.id === s.id ? { ...q, lastRun: { snapshot: label, rows: res?.rows?.length ?? 0 } } : q)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    con.setResult(t.id, null, msg);
    con.record({ sql, scanId: on, scan: label, rows: null, ms: null, error: msg });
  } finally {
    r.running = false;
  }
  await other;
}
const errorHint = computed(() => {
  const e = run$.value.error.toLowerCase();
  if (e.includes("no such table")) return "The explorer on the left lists every table and view this snapshot has.";
  if (e.includes("no such column")) return "Expand the table in the explorer to see its columns, or press ⌃Space after a dot.";
  if (e.includes("one statement")) return "Put the caret in the statement to run, or select it; ⌘↵ runs only that.";
  if (e.includes("stopped after") || e.includes("interrupt")) return "Narrow it with WHERE or LIMIT, or aggregate before joining.";
  if (e.includes("not authorized") || e.includes("read-only")) return "The console only reads: SELECT, WITH and EXPLAIN.";
  return "The underline in the editor marks where SQLite stopped reading.";
});

async function explain() {
  const t = tab.value;
  const sql = bindParams(target(), t?.params ?? {}).sql;
  if (!t || !sql || !scanId.value) return;
  const r = con.run(t.id);
  pane.value = "plan";
  resultsOpen.value = true;
  try {
    const res: any = await Console(scanId.value, `EXPLAIN QUERY PLAN ${sql}`);
    const cols: string[] = res?.columns ?? [];
    const at = (k: string) => cols.indexOf(k);
    const rows: PlanRow[] = (res?.rows ?? []).map((row: any[]) => ({ id: Number(row[at("id")]), parent: Number(row[at("parent")]), detail: String(row[at("detail")] ?? "") }));
    r.plan = { sql, rows, error: "" };
  } catch (e) {
    r.plan = { sql, rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}
const planRows = computed(() => {
  const rows = run$.value.plan?.rows ?? [];
  const depth = new Map<number, number>();
  return rows.map(p => {
    const d = (depth.get(p.parent) ?? -1) + 1;
    depth.set(p.id, d);
    const kind = /^SCAN\b/.test(p.detail) && !/USING (COVERING )?INDEX/.test(p.detail) ? "scan" : /^SEARCH\b|USING/.test(p.detail) ? "search" : "step";
    return { ...p, depth: d, kind };
  });
});

function format() {
  const t = tab.value;
  if (!t?.sql.trim()) return;
  const next = formatSql(t.sql);
  if (next !== t.sql) editor.value?.replaceAll(next, 0);
}

// ── Parameters ────────────────────────────────────────────────────────
const params = computed<SqlParam[]>(() => (tab.value ? paramsIn(tab.value.sql) : []));
const missing = ref<string[]>([]);
const paramEls = ref<Record<string, HTMLInputElement>>({});
const paramValues = ref<Record<string, string[]>>({});
const { schema: schemaOf, values: columnValues } = useSqlSchema(scanId);
const paramCols = computed(() => {
  const t = tab.value;
  const out: Record<string, { table: string; column: string } | null> = {};
  if (!t) return out;
  const sch = schemaOf();
  for (const p of params.value) out[p.name] = paramColumn(t.sql, p, sch);
  return out;
});
function paramHint(p: SqlParam) {
  const c = paramCols.value[p.name];
  return c ? `a ${c.column} in ${c.table}` : "a value";
}
let suggestTimer: ReturnType<typeof setTimeout> | null = null;
function suggest(p: SqlParam, prefix: string) {
  const c = paramCols.value[p.name];
  if (!c) return;
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async () => {
    const hits = await columnValues(c.table, c.column, prefix.trim());
    paramValues.value = { ...paramValues.value, [p.name]: hits.slice(0, 40).map(h => h.value) };
  }, 120);
}
function onParam(p: SqlParam, value: string) {
  if (!tab.value) return;
  con.setParam(tab.value.id, p.name, value);
  missing.value = missing.value.filter(m => m !== p.name);
  suggest(p, value);
}

// ── The explorer's actions ────────────────────────────────────────────
function insert(text: string) {
  if (editor.value) editor.value.insert(text);
  else if (tab.value) con.setSql(tab.value.id, tab.value.sql + text);
}
function openTable(name: string) {
  const sql = `select *\nfrom ${/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`}\nlimit 100`;
  const blank = tab.value && !tab.value.sql.trim() && !tab.value.cell && !tab.value.savedId;
  if (blank) { con.setSql(tab.value!.id, sql); con.rename(tab.value!.id, name); }
  else con.open({ sql, name });
  void nextTick(() => run());
}
function useExample(ex: { label: string; sql: string }) {
  if (tab.value && !tab.value.sql.trim()) { con.setSql(tab.value.id, ex.sql); con.rename(tab.value.id, ex.label); }
  else con.open({ sql: ex.sql, name: ex.label });
  void nextTick(() => editor.value?.focus());
}

// ── Saved queries (workspace state; reports insert them too) ───────────
const saved = computed<SavedQuery[]>(() => state.get<SavedQuery[]>("queries.saved", []) ?? []);
const savingName = ref<string | null>(null);
const saveEl = ref<HTMLInputElement | null>(null);
function setSaved(list: SavedQuery[]) { state.set("queries.saved", list.length ? list : null); }
function save() {
  const t = tab.value;
  if (!t?.sql.trim()) return;
  const s = savedOf(t);
  if (s) { setSaved(saved.value.map(q => (q.id === s.id ? { ...q, sql: t.sql.trim() } : q))); flash(`Saved “${s.name}”.`); return; }
  savingName.value = /^Query \d+$/.test(t.name) ? "" : t.name;
  void nextTick(() => saveEl.value?.focus());
}
function saveQuery() {
  const t = tab.value;
  const name = (savingName.value ?? "").trim();
  if (!t || !name) return;
  const id = Date.now().toString(36);
  setSaved([...saved.value, { id, name, sql: t.sql.trim() }]);
  con.patch(t.id, { savedId: id, name });
  savingName.value = null;
  flash(`Saved “${name}”. Reports can insert it from their Query menu.`);
}
function removeSaved(id: string) {
  setSaved(saved.value.filter(q => q.id !== id));
  for (const t of con.tabs) if (t.savedId === id) con.patch(t.id, { savedId: undefined });
}

// ── Reports ───────────────────────────────────────────────────────────
onMounted(() => { if (workspaces.active) void reports.load(workspaces.active.id); });
function openCell(reportId: string, report: string, cell: CellSql) {
  con.openCell({ reportId, cellId: cell.cellId, report, label: cell.label, sql: cell.sql }, cell.title);
  void nextTick(() => editor.value?.focus());
}
function openReport(reportId: string) {
  reports.open(reportId);
  void router.push("/views/evidence");
}
const updating = ref(false);
const updatedAt = ref<string | null>(null);
async function updateCell() {
  const t = tab.value;
  if (!t?.cell || updating.value) return;
  updating.value = true;
  try {
    const ok = await reports.updateSqlCell(t.cell.reportId, t.cell.cellId, t.sql.trim());
    if (!ok) { flash("That cell is no longer in the report; Unlink keeps the tab as it is."); return; }
    con.patch(t.id, { cell: { ...t.cell, sql: t.sql.trim() } });
    updatedAt.value = t.id;
    const k = reports.kernel;
    flash(`Updated ${t.cell.label} in “${t.cell.report}”${k ? ` and ran it on ${k.label}` : ""}.`);
  } finally {
    updating.value = false;
  }
}
const linkNote = computed(() => (tab.value && changed(tab.value) ? "· edited here; the report still has the old SQL" : "· same SQL as the report"));
function addToReport() {
  const r = result.value;
  const t = tab.value;
  if (!r || !t) return;
  const s = complete.value.find(x => x.id === r.scanId);
  const rows = r.rows.slice(0, 500).map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
  const numeric = (i: number) => r.rows.slice(0, 300).some(row => typeof row[i] === "number") && r.rows.slice(0, 300).every(row => row[i] === null || typeof row[i] === "number");
  void reports.beginImport({
    kind: "table",
    title: /^Query \d+$/.test(t.name) ? "" : t.name,
    view: "SQL console",
    route: "/views/query",
    ranOn: { scanId: r.scanId, label: s ? snapshotName(s) : r.scan, commit: s?.headCommit ?? "", committed: s?.headTime ? formatScanTime(s.headTime) : undefined, revision: Number(s?.analysisRevision) || 0, at: r.at },
    table: { columns: r.columns.map((c, i) => ({ id: c, label: define(c)?.name || headerCase(c), numeric: numeric(i) })), rows, total: r.rows.length, ...(metricsNote(r.columns, define) ? { note: metricsNote(r.columns, define) } : {}) },
    sql: r.sql,
  });
}

// ── Output ────────────────────────────────────────────────────────────
type Pane = "result" | "chart" | "plan" | "history";
const pane = ref<Pane>("result");
function showPane(p: Pane) { pane.value = p; resultsOpen.value = true; }
const rowFilter = ref("");
const sort = ref<{ col: number; desc: boolean } | null>(null);
const viewer = ref(false);
const copyOpen = ref(false);
function toggleSort(col: number) {
  const s = sort.value;
  sort.value = !s || s.col !== col ? { col, desc: false } : !s.desc ? { col, desc: true } : null;
}
// Rows as shown: against the baseline when comparing, then filtered and sorted.
const diff = computed(() => {
  const r = result.value, b = run$.value.baseline?.result;
  return r && b && compareId.value && b.scanId === compareId.value ? diffResults(r, b) : null;
});
const changesOnly = ref(false);
const viewEntries = computed<DiffEntry[]>(() => {
  const r = result.value;
  if (!r) return [];
  let list: DiffEntry[] = diff.value ? diff.value.entries : r.rows.map(row => ({ row, before: null, status: "same" as const }));
  if (diff.value && changesOnly.value) list = list.filter(e => e.status !== "same");
  const q = rowFilter.value.trim().toLowerCase();
  if (q) list = list.filter(({ row }) => row.some(v => v !== null && v !== undefined && (typeof v === "number" ? fmt(v) + " " + String(v) : String(v)).toLowerCase().includes(q)));
  const s = sort.value;
  if (s) {
    const dir = s.desc ? -1 : 1;
    list = [...list].sort((ea, eb) => {
      const x = ea.row[s.col], y = eb.row[s.col];
      if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
    });
  }
  return list;
});
const viewRows = computed(() => viewEntries.value.map(e => e.row));
const gridDiff = computed(() => (diff.value ? viewEntries.value : null));
/** What the chart draws: the rows this snapshot has, as they are shown. */
const chartRows = computed(() => viewEntries.value.filter(e => e.status !== "removed").map(e => e.row));
const figureTitle = computed(() => (tab.value && !/^Query \d+$/.test(tab.value.name) ? tab.value.name : "SQL console result"));

// ── Compare with another snapshot ───────────────────────────────────────
const compareId = ref<string | null>(null);
const baselineId = computed(() => (workspaces.active as any)?.baselineScanId ?? null);
const compareOptions = computed(() => {
  const opts = scanOptions.value.filter(o => o.id !== scanId.value).map(o => ({ id: o.id, name: o.id === baselineId.value ? `${o.name} · baseline` : o.name }));
  return [...opts.filter(o => o.id === baselineId.value), ...opts.filter(o => o.id !== baselineId.value)];
});
const compareName = computed(() => scanOptions.value.find(o => o.id === compareId.value)?.name ?? "");
watch(scanId, id => { if (compareId.value === id) compareId.value = null; });
async function runBaseline(tabId: string, sql: string) {
  const id = compareId.value;
  if (!id) return;
  const r = con.run(tabId);
  r.baseline = { result: null, error: "", running: true };
  const label = scanOptions.value.find(o => o.id === id)?.name ?? "";
  try {
    const res: any = await Console(id, sql);
    r.baseline = { result: markRaw({ columns: res?.columns ?? [], rows: res?.rows ?? [], truncated: !!res?.truncated, elapsedMs: Number(res?.elapsedMs) || 0, sql, scanId: id, scan: label, at: new Date().toISOString() }), error: "", running: false };
  } catch (e) {
    r.baseline = { result: null, error: e instanceof Error ? e.message : String(e), running: false };
  }
}
// Picking a snapshot compares the result already on screen.
watch(compareId, id => {
  changesOnly.value = false;
  const t = tab.value, r = result.value;
  if (id && t && r) void runBaseline(t.id, r.sql);
});
const diffTitle = computed(() => {
  const d = diff.value;
  if (!d) return "";
  const how = d.key.length ? `Rows are matched on ${d.key.join(", ")}` : "Rows are matched by position (the result has no text column)";
  return `${how}; ${compareName.value} is the baseline.${d.missing.length ? ` It has no ${d.missing.join(", ")}.` : ""}${d.ambiguous ? " Some names repeat, so repeats are matched in order." : ""}`;
});

const resultTitle = computed(() => (result.value ? `${oneLine(result.value.sql)}\nRan on ${result.value.scan} at ${new Date(result.value.at).toLocaleTimeString()}. Sorting and the filter work on the loaded rows.` : ""));
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
function histTime(at: string) {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

async function copyAs(kind: "tsv" | "csv" | "md" | "in") {
  copyOpen.value = false;
  const r = result.value;
  if (!r) return;
  const rows = viewRows.value;
  const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  let text = "";
  if (kind === "tsv") text = [r.columns.join("\t"), ...rows.map(row => row.map(v => cell(v).replace(/[\t\n]/g, " ")).join("\t"))].join("\n");
  else if (kind === "csv") text = [r.columns, ...rows].map(row => row.map(v => { const s = cell(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
  else if (kind === "md") text = [`| ${r.columns.join(" | ")} |`, `| ${r.columns.map((_, i) => (rows.some(row => typeof row[i] === "number") ? "---:" : "---")).join(" | ")} |`, ...rows.map(row => `| ${row.map(v => cell(v).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`)].join("\n");
  else if (unitColumn.value) text = `(${[...new Set(rows.map(row => cell(row[unitColumn.value!.index])))].map(v => `'${v.replace(/'/g, "''")}'`).join(", ")})`;
  try { await navigator.clipboard.writeText(text); flash(`Copied ${fmt(rows.length)} rows.`); } catch { flash("The clipboard refused the copy."); }
}

// ── A column of names becomes a group; a name opens ───────────────────
const unitColumn = computed<{ index: number; kind: "component" | "file" } | null>(() => {
  const r = result.value;
  if (!r || !r.rows.length || r.scanId !== workspaces.openScanId) return null;
  const comps = data.allComponentsIndex, files = data.fileComponentIndex;
  for (let i = 0; i < r.columns.length; i++) {
    const vals = r.rows.slice(0, 200).map(row => row[i]).filter(v => typeof v === "string") as string[];
    if (vals.length < Math.min(r.rows.length, 200) * 0.8) continue;
    if (vals.filter(v => comps.has(v)).length >= vals.length * 0.8) return { index: i, kind: "component" };
    if (vals.filter(v => files.has(v)).length >= vals.length * 0.8) return { index: i, kind: "file" };
  }
  return null;
});
const selectedUnits = ref(new Set<string>());
function toggleUnit(v: string) { const n = new Set(selectedUnits.value); if (n.has(v)) n.delete(v); else n.add(v); selectedUnits.value = n; }
function openUnit(kind: "component" | "file", name: string) {
  const to = detailRoute(kind, name);
  if (to) void router.push(to);
}
watch(() => tab.value?.id, () => { rowFilter.value = ""; sort.value = null; selectedUnits.value = new Set(); savingName.value = null; missing.value = []; changesOnly.value = false; });

// ── Metric definitions ────────────────────────────────────────────────
const { define, referenceRoute } = useMetricDocs();
function describeColumn(column: string) {
  const d = define(column);
  return d ? { name: d.name, short: d.short, long: d.long, category: d.category } : null;
}
const hasMetrics = computed(() => !!result.value?.columns.some(c => define(c)));
function openReference(id: string) { void router.push(referenceRoute(id)); }

// ── Layout: explorer width and the editor/output split ─────────────────
const rootEl = ref<HTMLElement | null>(null);
const stackEl = ref<HTMLElement | null>(null);
const remember = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; } };
const keep = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* per-viewer convenience only */ } };
const explorerW = ref(remember("console.explorerW", 272));
const editorPct = ref(remember("console.editorPct", 42));
const resultsOpen = ref(remember("console.resultsOpen", true));
watch(explorerW, v => keep("console.explorerW", v));
watch(editorPct, v => keep("console.editorPct", v));
watch(resultsOpen, v => keep("console.resultsOpen", v));
const metricNames = ref(remember("console.metricNames", false));
watch(metricNames, v => keep("console.metricNames", v));
function drag(move: (e: MouseEvent) => void, cursor: string) {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  const up = () => { document.body.style.cursor = ""; document.body.style.userSelect = ""; window.removeEventListener("mousemove", move); };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up, { once: true });
}
function dragExplorer() {
  const left = rootEl.value?.getBoundingClientRect().left ?? 0;
  drag(ev => { explorerW.value = Math.round(Math.max(200, Math.min(520, ev.clientX - left))); }, "col-resize");
}
function dragResults() {
  const box = stackEl.value?.getBoundingClientRect();
  if (!box) return;
  drag(ev => { editorPct.value = Math.round(Math.max(18, Math.min(82, ((ev.clientY - box.top) / box.height) * 100))); }, "row-resize");
}

// ── Keys ──────────────────────────────────────────────────────────────
function onKey(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  if (e.key.toLowerCase() === "t" && !e.shiftKey) { e.preventDefault(); newTab(); }
  else if (e.key.toLowerCase() === "s" && !e.shiftKey) { e.preventDefault(); save(); }
  else if (e.shiftKey && (e.key === "[" || e.key === "{")) { e.preventDefault(); cycle(-1); }
  else if (e.shiftKey && (e.key === "]" || e.key === "}")) { e.preventDefault(); cycle(1); }
}

const notice = ref("");
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
function flash(text: string) {
  notice.value = text;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.value = ""; }, 3200);
}
onBeforeUnmount(() => { if (noticeTimer) clearTimeout(noticeTimer); });

// The result is the view's table: the share button in the output header copies
// and saves it, and adds it to a report as its query (a live cell), not as a copy.
const resultTable = useTable({
  get title() { return tab.value && !/^Query \d+$/.test(tab.value.name) ? tab.value.name : "SQL console result"; },
  rows: () => (result.value ? viewEntries.value.map(e => ({ ...(diff.value ? { change: e.status } : {}), ...Object.fromEntries(result.value!.columns.map((c, i) => [c, e.row[i]])) })) : []),
  columns: () => [...(diff.value ? [{ id: "change", label: "Change" }] : []), ...(result.value?.columns ?? []).map(c => ({ id: c, label: c }))],
  notes: () => (result.value ? [["Query", oneLine(result.value.sql)], ["Snapshot", result.value.scan], ...(diff.value ? [["Compared with", compareName.value] as [string, string]] : [])] : []),
  disabledReason: () => (result.value ? null : "Run a query first."),
  addToReport,
} as any);
</script>

<style scoped>
.qc-split { flex-shrink: 0; background: rgb(var(--c-neutral-200)); position: relative; z-index: 5; transition: background-color 150ms; }
.qc-split:hover, .qc-split:active { background: rgb(var(--c-accent-400)); }
.qc-split-v { width: 1px; cursor: col-resize; }
.qc-split-v::before { content: ""; position: absolute; inset: 0 -3px; }
.qc-split-h { height: 1px; cursor: row-resize; }
.qc-split-h::before { content: ""; position: absolute; inset: -3px 0; }

.qc-tabs { display: flex; height: 34px; flex-shrink: 0; align-items: stretch; background: rgb(var(--c-neutral-50)); }
.qc-tabs > div::-webkit-scrollbar { height: 0; }
.qc-tab { position: relative; display: flex; max-width: 220px; min-width: 0; flex-shrink: 0; align-items: center; gap: 6px; padding: 0 6px 0 12px; font-size: 12.5px; color: rgb(var(--c-neutral-600)); cursor: default; user-select: none; box-shadow: inset -1px 0 0 rgb(var(--c-neutral-200)); }
.qc-tab:hover { background: rgb(var(--c-neutral-100)); color: rgb(var(--c-neutral-900)); }
.qc-tab-on, .qc-tab-on:hover { background: rgb(var(--c-surface)); color: rgb(var(--c-neutral-950)); box-shadow: inset -1px 0 0 rgb(var(--c-neutral-200)), inset 0 -2px 0 rgb(var(--c-accent-500)); }
.qc-tab-drop { box-shadow: inset 2px 0 0 rgb(var(--c-accent-400)); }
.qc-tab-x { display: inline-flex; width: 18px; height: 18px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 3px; color: rgb(var(--c-neutral-400)); opacity: 0; }
.qc-tab:hover .qc-tab-x, .qc-tab-on .qc-tab-x, .qc-tab-x:focus-visible { opacity: 1; }
.qc-tab-x:hover { background: rgb(var(--c-neutral-200)); color: rgb(var(--c-neutral-900)); }
.qc-dirty { width: 6px; height: 6px; flex-shrink: 0; border-radius: 9999px; background: rgb(var(--c-neutral-500)); }
.qc-rename { width: 130px; min-width: 0; height: 20px; padding: 0 4px; border-radius: 3px; font-size: 12.5px; background: rgb(var(--c-surface)); color: rgb(var(--c-neutral-950)); box-shadow: 0 0 0 1px rgb(var(--c-accent-400)); outline: none; }
.qc-tab-add { display: inline-flex; width: 34px; flex-shrink: 0; align-items: center; justify-content: center; color: rgb(var(--c-neutral-500)); box-shadow: inset 1px 0 0 rgb(var(--c-neutral-200)); }
.qc-tab-add:hover { background: rgb(var(--c-neutral-100)); color: rgb(var(--c-neutral-900)); }

.qc-bar { display: flex; height: 36px; flex-shrink: 0; align-items: center; gap: 4px; padding: 0 10px; }
.qc-sep { width: 1px; height: 16px; margin: 0 4px; background: rgb(var(--c-neutral-200)); }
.qc-link { display: flex; height: 34px; flex-shrink: 0; align-items: center; gap: 8px; padding: 0 12px; font-size: 12.5px; color: rgb(var(--c-neutral-700)); background: rgb(var(--c-neutral-50)); }

.qc-params { display: flex; min-height: 38px; flex-shrink: 0; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 6px 12px; background: rgb(var(--c-neutral-50)); }
.qc-param { display: inline-flex; align-items: center; gap: 6px; }
.qc-param-missing input { box-shadow: 0 0 0 1px rgb(var(--c-red-500)); }
.qc-compare { display: inline-flex; height: 24px; align-items: center; gap: 6px; padding: 0 4px 0 8px; border-radius: 4px; font-size: 12px; color: rgb(var(--c-neutral-600)); white-space: nowrap; }
.qc-compare-on { background: rgb(var(--c-accent-50)); color: rgb(var(--c-neutral-900)); }
.qc-compare-select { height: 22px; max-width: 190px; padding: 0 4px; border-radius: 3px; background: transparent; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; color: rgb(var(--c-neutral-900)); outline: none; cursor: default; }
.qc-compare-select:focus-visible { box-shadow: 0 0 0 2px rgb(var(--c-accent-400)); }
.qc-diff { display: inline-flex; flex-shrink: 0; gap: 8px; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.qc-diff-add { color: rgb(var(--c-green-700)); }
.qc-diff-del { color: rgb(var(--c-red-700)); }
.qc-diff-chg { color: rgb(var(--c-amber-800)); }
.qc-check { display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px; font-size: 12px; color: rgb(var(--c-neutral-700)); white-space: nowrap; }
.qc-warn { display: flex; align-items: center; gap: 8px; height: 28px; flex-shrink: 0; padding: 0 12px; font-size: 12px; color: rgb(var(--c-amber-900)); background: rgb(var(--c-amber-50)); box-shadow: inset 0 -1px 0 rgb(var(--c-amber-200)); }
.qc-out-head .ui-segmented button { white-space: nowrap; }
.qc-out-head { position: relative; display: flex; height: 34px; flex-shrink: 0; align-items: center; gap: 8px; padding: 0 8px; background: rgb(var(--c-neutral-50)); box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-200)); }
.qc-meta { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: rgb(var(--c-neutral-600)); font-variant-numeric: tabular-nums; }
.qc-on { background: rgb(var(--c-accent-50)); color: rgb(var(--c-neutral-900)); }
.qc-error { display: flex; gap: 10px; margin: 12px 16px; padding: 10px 12px; border-radius: 6px; color: rgb(var(--c-red-800)); background: rgb(var(--c-red-50)); }
.qc-example { display: block; width: 100%; padding: 6px 8px; margin: 0 -8px; border-radius: 4px; text-align: left; }
.qc-example:hover { background: rgb(var(--c-neutral-50)); }
.qc-keys { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin-top: 6px; font-size: 12.5px; color: rgb(var(--c-neutral-700)); }
.qc-keys dt { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; color: rgb(var(--c-neutral-900)); }
.qc-kbd { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; padding: 1px 4px; border-radius: 3px; background: rgb(var(--c-neutral-100)); color: rgb(var(--c-neutral-900)); }

.qc-plan li { display: flex; align-items: center; gap: 8px; min-height: 26px; font-size: 12px; color: rgb(var(--c-neutral-800)); }
.qc-plan-mark { width: 8px; height: 8px; flex-shrink: 0; border-radius: 2px; background: rgb(var(--c-neutral-300)); }
.qc-plan-mark.scan { background: rgb(var(--c-amber-500)); }
.qc-plan-mark.search { background: rgb(var(--c-green-500)); }

.qc-hist { display: flex; align-items: center; gap: 12px; height: 30px; padding: 0 12px; font-size: 12px; box-shadow: inset 0 -1px 0 rgb(var(--c-neutral-100)); cursor: default; }
.qc-hist:hover { background: rgb(var(--c-neutral-50)); }
.qc-hist-time { width: 44px; flex-shrink: 0; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; color: rgb(var(--c-neutral-500)); font-variant-numeric: tabular-nums; }
.qc-hist-stat { width: 76px; flex-shrink: 0; text-align: right; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px; color: rgb(var(--c-neutral-600)); font-variant-numeric: tabular-nums; }
.qc-hist-sql { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11.5px; color: rgb(var(--c-neutral-800)); }
.qc-hist-scan { max-width: 160px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: rgb(var(--c-neutral-500)); }

.qc-notice { position: fixed; bottom: 20px; left: 50%; z-index: 60; transform: translateX(-50%); max-width: 560px; padding: 6px 12px; border-radius: 4px; font-size: 12px; line-height: 16px; color: rgb(var(--c-surface)); background: rgb(var(--c-neutral-900)); box-shadow: 0 8px 24px -8px rgb(15 18 28 / 0.24); animation: qc-in 160ms cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes qc-in { from { opacity: 0; transform: translate(-50%, 4px); } to { opacity: 1; transform: translate(-50%, 0); } }
@media (prefers-reduced-motion: reduce) { .qc-notice { animation: none; } }
</style>
