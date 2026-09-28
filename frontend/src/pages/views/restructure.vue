<template>
  <ViewWorkspaceLayout title="Restructure planner" :queryable="false">
    <template #stats>
      <template v-if="plan.modules.length">
        <span>Modules <span class="text-neutral-800">{{ plan.modules.length }}</span></span>
        <span class="text-neutral-300">·</span>
        <span>Placed <span class="text-neutral-800">{{ fmt(placedCount) }}</span> of {{ fmt(production.size) }}</span>
      </template>
    </template>
    <template #actions>
      <button v-if="plan.modules.length" type="button" class="ui-btn ui-btn-sm" title="Replay the plan as what-if moves on the component graph: tangles, coupling and the weakest links, drawn" @click="toSandbox">
        <Icon icon="flask" :size="13" class="text-neutral-500"/><span>Try in Sandbox</span>
      </button>
      <div v-if="plan.modules.length" class="relative" @keydown.esc.stop="exportOpen = false">
        <button ref="exportBtn" type="button" class="ui-btn ui-btn-sm" :aria-expanded="exportOpen" @click="exportOpen = !exportOpen">
          <Icon icon="file-down" :size="13" class="text-neutral-500"/><span>Carry it out</span>
        </button>
        <div v-if="exportOpen" class="fixed inset-0 z-40" @click="exportOpen = false"></div>
        <div v-if="exportOpen" ref="exportPanel" tabindex="-1" class="ui-popover absolute right-0 z-50 mt-1 flex w-[380px] flex-col gap-3 p-3 text-sm text-neutral-700 animate-in outline-none">
          <p>A bundle to run in the repository: the move map, a <code class="font-mono text-xs">git mv</code> script, a Node script that rewrites every JS, TS and Vue import naming a moved file, and the plan as Markdown for the decision record.</p>
          <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <label class="ui-label" for="alias-tilde">~/ stands for</label>
            <input id="alias-tilde" ref="firstField" v-model="aliasTilde" class="ui-input ui-input-sm font-mono" placeholder="frontend/src" spellcheck="false">
            <label class="ui-label" for="alias-at">@/ stands for</label>
            <input id="alias-at" v-model="aliasAt" class="ui-input ui-input-sm font-mono" placeholder="frontend/src" spellcheck="false">
          </div>
          <p v-if="autoImportMoves" class="text-xs text-neutral-600"><span class="font-medium text-neutral-800">Nuxt auto-imports.</span> {{ fmt(autoImportMoves) }} moving files leave composables/, utils/ or components/. Add explicit imports, or list the new folders under <code class="font-mono">imports.dirs</code> and <code class="font-mono">components.dirs</code>.</p>
          <p v-if="nonJs" class="text-xs text-neutral-500">{{ fmt(nonJs) }} moving files are not JS, TS or Vue: the script moves them, their imports need your IDE.</p>
          <p class="text-xs text-neutral-500">Paths built at run time (<code class="font-mono">readFileSync(join(__dirname, …))</code>) are not imports; check those by hand. Then run <code class="font-mono">node restructure.mjs --dry</code>, the script, the tests, and rescan: the plan stays, so the rescan reads against it.</p>
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!mv.moves.length || mv.collisions.length > 0" :title="mv.collisions.length ? 'Two files would land on one path: resolve that first' : !mv.moves.length ? 'Give a module a folder to move to first' : ''" @click="exportBundle">Save bundle…</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :disabled="!mv.moves.length" @click="saveText('moves.json', moveMapJson(mv.moves, names), [FILTERS.json])">Move map</button>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="saveText('restructure-plan.md', markdown, [FILTERS.md])">Plan as Markdown</button>
          </div>
        </div>
      </div>
    </template>

    <template #visualizer>
      <LoadingState v-if="loading" text="Reading the import graph…"/>
      <EmptyState v-else-if="error" icon="alert" title="Could not read the snapshot" :text="error"/>
      <div v-else class="grid h-full min-h-0 w-full grid-cols-[288px_1fr]">
        <!-- ── The plan: target modules ── -->
        <aside class="flex min-h-0 flex-col bg-ground hairline-r" aria-label="Target modules">
          <div class="flex h-9 shrink-0 items-center gap-2 px-3 hairline-b">
            <h2 class="ui-section-title">Target modules</h2>
            <span v-if="plan.modules.length" class="font-mono text-xs text-neutral-500">{{ plan.modules.length }}</span>
            <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" title="Add an empty module" @click="addEmpty"><Icon icon="plus" :size="13"/><span>Module</span></button>
            <button v-if="plan.modules.length" type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" title="Start over" aria-label="Start over" @click="confirmClear"><Icon icon="trash" :size="13"/></button>
          </div>

          <div class="min-h-0 grow overflow-y-auto">
            <div v-if="!plan.modules.length" class="flex flex-col gap-4 p-3 text-sm text-neutral-600">
              <p>Draw the structure you want. Each module takes files by folder or by hand, and every picture on the right re-reads this snapshot's imports as you draw.</p>
              <div>
                <label class="ui-label" for="seed-root">One module per folder under</label>
                <div class="mt-1 flex gap-2">
                  <input id="seed-root" v-model="seedRoot" list="seed-dirs" class="ui-input ui-input-sm min-w-0 flex-1 font-mono" :placeholder="guessRoot || 'src'" spellcheck="false" @keydown.enter="seedFolders">
                  <datalist id="seed-dirs"><option v-for="d in dirOptions" :key="d" :value="d"/></datalist>
                  <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" :disabled="!(seedRoot.trim() || guessRoot)" @click="seedFolders">Start</button>
                </div>
              </div>
              <p>Or pick a folder on the map and make it a module. Folder X-ray topics, Units findings and any file selection can be sent here too (<span class="font-medium text-neutral-800">To planner</span> in the selection tray).</p>
            </div>

            <template v-else>
              <div class="flex items-center gap-2 px-3 pb-1 pt-3">
                <div class="ui-segmented" role="group" aria-label="Direction">
                  <button type="button" :aria-pressed="!plan.ordered" title="Modules may use each other either way; only pairs that use each other are flagged" @click="plan.ordered && restructure.setOrdered(false)">Any way</button>
                  <button type="button" :aria-pressed="plan.ordered" title="A module may use the ones listed below it, never above" @click="!plan.ordered && restructure.setOrdered(true)">Top uses bottom</button>
                </div>
              </div>
              <ul class="flex flex-col py-1" role="listbox" aria-label="Modules">
                <li v-for="(m, i) in plan.modules" :key="m.id" role="option" :aria-selected="focus === m.id">
                  <div
                    class="group relative mx-1.5 flex cursor-default flex-col gap-1 rounded px-2.5 py-2"
                    :class="focus === m.id ? 'bg-accent-50 shadow-[inset_2px_0_0_rgb(var(--c-accent-500))]' : 'hover:bg-neutral-200/60'"
                    @click="setFocus(m.id)" @mouseenter="hoverModule = m.id" @mouseleave="hoverModule = null"
                  >
                    <div class="flex items-center gap-2">
                      <span class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ background: colorOf(m.id) }"/>
                      <span class="min-w-0 truncate text-sm font-medium text-neutral-900">{{ m.name }}</span>
                      <span class="ml-auto shrink-0 font-mono text-xs text-neutral-600">{{ fmt(mod(m.id).files) }}</span>
                    </div>
                    <div class="flex items-center gap-2 pl-[18px]" :title="`${fmt(mod(m.id).internal)} imports stay inside, ${fmt(mod(m.id).external)} cross its edge`">
                      <span class="relative h-1 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-200"><span class="absolute inset-y-0 left-0 rounded-full bg-neutral-500" :style="{ width: Math.round(mod(m.id).cohesion * 100) + '%' }"/></span>
                      <span class="truncate text-[11px] text-neutral-500">{{ Math.round(mod(m.id).cohesion * 100) }}% of its imports stay inside<template v-if="handCount(m)"> · {{ fmt(handCount(m)) }} by hand</template></span>
                    </div>

                    <!-- The active module opens in place: its name, where it goes, what it takes. -->
                    <div v-if="focus === m.id" class="mt-2 flex flex-col gap-2" @click.stop>
                      <input :value="m.name" class="ui-input ui-input-sm w-full font-medium" aria-label="Module name" @change="restructure.update(m.id, { name: ($event.target as HTMLInputElement).value.trim() || m.name })">
                      <label class="flex flex-col gap-1">
                        <span class="ui-label">Moves to</span>
                        <input :value="m.dir" class="ui-input ui-input-sm w-full font-mono text-xs" placeholder="stays where it is" spellcheck="false" @change="restructure.update(m.id, { dir: ($event.target as HTMLInputElement).value.trim() })">
                      </label>
                      <label class="flex flex-col gap-1">
                        <span class="ui-label" title="One glob a line; a line starting with ! leaves files out">Takes files matching</span>
                        <textarea :value="m.patterns" rows="3" class="ui-input h-auto min-h-[56px] w-full py-1 font-mono text-xs" placeholder="frontend/src/features/report/**&#10;!**/pages/**" spellcheck="false" @change="restructure.update(m.id, { patterns: ($event.target as HTMLTextAreaElement).value })"/>
                      </label>
                      <div class="flex items-center gap-1">
                        <button v-if="handCount(m)" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" :title="`Return ${handCount(m)} hand-placed files to what the patterns say`" @click="restructure.update(m.id, { files: [] })">Release {{ fmt(handCount(m)) }} by hand</button>
                        <template v-if="plan.ordered">
                          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="i === 0" aria-label="Move up" title="Higher: may use more" @click="restructure.shift(m.id, -1)"><Icon icon="chevron-up" :size="13"/></button>
                          <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" :disabled="i === plan.modules.length - 1" aria-label="Move down" title="Lower: used by more" @click="restructure.shift(m.id, 1)"><Icon icon="chevron-down" :size="13"/></button>
                        </template>
                        <button type="button" class="ui-btn ui-btn-sm ui-btn-danger ml-auto" @click="removeModule(m.id)">Remove</button>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
              <button
                v-if="placement.unplaced.length" type="button"
                class="mx-1.5 mb-3 flex w-[calc(100%-12px)] items-center gap-2 rounded px-2.5 py-2 text-left hover:bg-neutral-200/60"
                title="Production files no module takes yet" @click="findings = 'unplaced'"
              >
                <span class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ background: HATCH_SWATCH }"/>
                <span class="text-sm text-neutral-700">Not placed yet</span>
                <span class="ml-auto font-mono text-xs text-neutral-600">{{ fmt(placement.unplaced.length) }}</span>
              </button>
            </template>
          </div>
        </aside>

        <!-- ── What the plan does ── -->
        <main class="flex min-h-0 min-w-0 flex-col overflow-y-auto">
          <!-- Today against the plan, one number each. -->
          <dl v-if="plan.modules.length" class="mx-4 mt-4 grid shrink-0 grid-cols-6 overflow-hidden rounded-md ring-1 ring-neutral-200">
            <button
              v-for="c in strip" :key="c.label" type="button"
              class="flex flex-col items-start gap-1 px-3 py-2.5 text-left hairline-r last:border-r-0 hover:bg-neutral-50"
              :class="{ 'bg-neutral-50': c.tab && findings === c.tab }"
              :title="c.why" @click="c.tab && (findings = c.tab)"
            >
              <dt class="truncate text-xs text-neutral-600">{{ c.label }}</dt>
              <dd class="flex items-baseline gap-1.5">
                <template v-if="c.today != null"><span class="font-mono text-xs text-neutral-500">{{ fmt(c.today) }}</span><span class="text-xs text-neutral-400">→</span></template>
                <span class="text-[22px] font-medium leading-7 tabular-nums" :class="c.bad ? 'text-red-700' : 'text-neutral-900'">{{ fmt(c.plan) }}</span>
              </dd>
            </button>
          </dl>
          <p v-if="mv.collisions.length" class="mx-4 mt-2 text-sm text-red-700">
            {{ plural(mv.collisions.length, "target path") }} taken twice: {{ mv.collisions.slice(0, 3).map(c => c.to).join(", ") }}{{ mv.collisions.length > 3 ? "…" : "" }}. Rename a file or give the module sub-folders.
          </p>

          <!-- The two pictures: what the modules do to each other, and where their files are today. -->
          <div class="mx-4 mt-4 flex overflow-hidden rounded-md ring-1 ring-neutral-200" :class="plan.modules.length ? 'shrink-0' : 'mb-4 min-h-[380px] grow'" :style="plan.modules.length ? { height: pictureH + 'px' } : undefined">
            <section v-if="plan.modules.length" class="flex w-[400px] shrink-0 flex-col hairline-r" aria-label="How the modules depend">
              <div class="flex h-9 shrink-0 items-center gap-2 px-3 hairline-b">
                <h3 class="ui-section-title">How the modules depend</h3>
                <span class="ml-auto truncate text-[11px] text-neutral-500">{{ plan.ordered ? "in your order" : "most imports run down" }}</span>
              </div>
              <div class="min-h-0 grow overflow-y-auto px-3 pb-3 pt-2">
                <StackDiagram
                  :floors="floors" :flows="flows" :selected="stackSel"
                  :up-label="plan.ordered ? 'against the order' : 'points up'"
                  aria-label="Target modules as floors, with the imports between them"
                  @select="onStackSelect"
                />
                <p v-if="!flows.length" class="mt-2 text-xs text-neutral-500">No module imports another yet.</p>
              </div>
            </section>
            <section class="flex min-w-0 grow flex-col" aria-label="Where each module's files are today">
              <div class="flex h-9 shrink-0 items-center gap-2 px-3 hairline-b">
                <h3 class="ui-section-title shrink-0">{{ plan.modules.length ? "Where its files are today" : "Today's folders" }}</h3>
                <template v-if="mapSel">
                  <span class="ml-2 min-w-0 truncate font-mono text-xs text-neutral-800" :title="mapSel.path">{{ mapSel.path }}</span>
                  <span class="shrink-0 font-mono text-xs text-neutral-500">{{ plural(mapSelFiles.length, "file") }}<template v-if="mapSelNow"> · {{ mapSelNow }}</template></span>
                  <div class="ml-auto flex shrink-0 items-center gap-1.5">
                    <button v-if="focusModule" type="button" class="ui-btn ui-btn-sm" :title="`Put ${mapSel.path} in ${focusModule.name}`" @click="putIn(focusModule.id)">
                      <span class="h-2 w-2 rounded-sm" :style="{ background: colorOf(focusModule.id) }"/><span>Put in {{ focusModule.name }}</span>
                    </button>
                    <select v-if="plan.modules.length > 1 || (plan.modules.length && !focusModule)" class="ui-input ui-input-sm w-32" aria-label="Put in another module" value="" @change="putIn(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
                      <option value="" disabled>Put in…</option>
                      <option v-for="m in plan.modules" :key="m.id" :value="m.id">{{ m.name }}</option>
                    </select>
                    <button type="button" class="ui-btn ui-btn-sm" :class="{ 'ui-btn-primary': !plan.modules.length }" @click="newFromSel">New module</button>
                    <button type="button" class="ui-btn ui-btn-sm ui-btn-icon ui-btn-quiet" aria-label="Clear the selection" @click="mapSel = null"><Icon icon="x" :size="12"/></button>
                  </div>
                </template>
                <span v-else class="ml-auto truncate text-[11px] text-neutral-500">{{ plan.modules.length ? "Pick a folder to move it into a module" : "Pick a folder to start a module from it" }}</span>
              </div>
              <div class="min-h-0 grow p-2">
                <FolderMap
                  :files="prodList" :lines="data.lines" :paint="modulePaint" :highlight="mapHighlight" :selected="mapSel?.path ?? null"
                  :describe="f => { const m = placement.of.get(f); return m ? `in ${restructure.name(m)}` : 'not placed yet' }"
                  aria-label="Production files by today's folders, coloured by the module the plan puts them in"
                  @select="onMapSelect" @open="f => router.push(filePath(f))"
                />
              </div>
            </section>
          </div>

          <!-- The findings behind the pictures. -->
          <section v-if="plan.modules.length" class="mx-4 mb-8 mt-5 flex flex-col" aria-label="Findings">
            <div class="flex items-center gap-3">
              <div class="ui-segmented" role="group" aria-label="Findings">
                <button v-for="t in FINDINGS" :key="t.id" type="button" :aria-pressed="findings === t.id" :title="t.title" @click="findings = t.id">
                  {{ t.label }}<span class="ml-1.5 font-mono text-neutral-500">{{ fmt(t.count()) }}</span>
                </button>
              </div>
              <span v-if="stackSel" class="ui-chip is-active max-w-[320px]">
                <span class="truncate">{{ stackSelLabel }}</span>
                <button type="button" class="ml-1 text-neutral-500 hover:text-neutral-900" aria-label="Show every finding" @click="stackSel = null"><Icon icon="x" :size="11"/></button>
              </span>
            </div>

            <!-- Problems -->
            <div v-if="findings === 'problems'" class="mt-3">
              <template v-if="pickedPair">
                <Why :edges="ev.pairs.get(`${pickedPair.a}>${pickedPair.b}`) ?? []" :title="`${restructure.name(pickedPair.a)} uses ${restructure.name(pickedPair.b)}`" @place="onPlace"/>
                <Why v-if="ev.pairs.get(`${pickedPair.b}>${pickedPair.a}`)" :edges="ev.pairs.get(`${pickedPair.b}>${pickedPair.a}`) ?? []" :title="`${restructure.name(pickedPair.b)} uses ${restructure.name(pickedPair.a)}`" @place="onPlace"/>
              </template>
              <template v-else>
                <EmptyState v-if="!problemCount" icon="check" title="Every module depends one way" text="No pair uses each other, nothing runs in a cycle, and nothing points against the order."/>
                <template v-if="mutualShown.length">
                  <h4 class="ui-section-title">Modules that use each other</h4>
                  <p class="mt-1 max-w-[72ch] text-sm text-neutral-600">Each pair is one module in two places. Open a pair to see the imports that hold it together: move the file behind the thinner side, or split what it declares.</p>
                  <ul class="mt-2 flex flex-col">
                    <li v-for="p in mutualShown" :key="p.a + p.b">
                      <button type="button" class="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-neutral-100" @click="stackSel = { kind: 'flow', id: `${p.a}>${p.b}` }">
                        <span class="h-2 w-2 rounded-sm" :style="{ background: colorOf(p.a) }"/><span class="text-neutral-900">{{ restructure.name(p.a) }}</span>
                        <span class="text-neutral-400">⇄</span>
                        <span class="h-2 w-2 rounded-sm" :style="{ background: colorOf(p.b) }"/><span class="text-neutral-900">{{ restructure.name(p.b) }}</span>
                        <span class="ml-auto font-mono text-xs text-neutral-600">{{ p.ab }} one way · {{ p.ba }} back</span>
                      </button>
                    </li>
                  </ul>
                </template>
                <template v-if="ev.tangles.length">
                  <h4 class="ui-section-title mt-5">Cycles</h4>
                  <ul class="mt-1 flex flex-col gap-1 text-sm text-neutral-700"><li v-for="t in ev.tangles" :key="t.join()">{{ t.map(restructure.name).join(" → ") }} → …</li></ul>
                </template>
                <template v-if="plan.ordered && upwardShown.length">
                  <h4 class="ui-section-title mt-5">Imports against the order</h4>
                  <Why :edges="upwardShown" title="" @place="onPlace"/>
                </template>
              </template>
            </div>

            <!-- Unplaced -->
            <div v-else-if="findings === 'unplaced'" class="mt-3">
              <EmptyState v-if="!placement.unplaced.length" icon="check" title="Every file has a module"/>
              <template v-else>
                <div class="flex h-8 items-center gap-2">
                  <p v-if="!picked.size" class="text-sm text-neutral-600">Files no module takes, with the module their imports tie them to most. Click rows to place several at once.</p>
                  <template v-else>
                    <span class="text-sm text-neutral-800">{{ plural(picked.size, "file") }} picked</span>
                    <select class="ui-input ui-input-sm w-44" aria-label="Module" :value="pickTarget" @change="pickTarget = ($event.target as HTMLSelectElement).value">
                      <option value="">Place in…</option>
                      <option v-for="m in plan.modules" :key="m.id" :value="m.id">{{ m.name }}</option>
                    </select>
                    <button type="button" class="ui-btn ui-btn-sm" :disabled="!pickTarget" @click="placePicked">Place</button>
                    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="newFromPicked">New module from these</button>
                    <button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="picked = new Set()">Clear</button>
                  </template>
                  <button v-if="!picked.size" type="button" class="ui-btn ui-btn-sm ui-btn-quiet ml-auto" @click="picked = new Set(placement.unplaced)">Pick all</button>
                </div>
                <table class="ui-table mt-1">
                  <thead><tr><th>File</th><th>Most tied to</th><th class="w-20 text-right">Lines</th><th class="w-28"></th></tr></thead>
                  <tbody>
                    <tr v-for="f in placement.unplaced.slice(0, unplacedLimit)" :key="f" class="cursor-default" :class="{ 'is-selected': picked.has(f) }" @click="togglePick(f)" @mouseenter="hoverFile = f" @mouseleave="hoverFile = null">
                      <td class="max-w-[420px]"><span class="block truncate font-mono text-xs text-neutral-900" :title="f">{{ f }}</span></td>
                      <td class="text-sm text-neutral-700"><PullText :file="f"/></td>
                      <td class="is-num text-right">{{ fmt(data.lines.get(f) ?? 0) }}</td>
                      <td class="text-right"><button v-if="bestPull(f)" type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click.stop="restructure.place([f], bestPull(f)!.module)">Place there</button></td>
                    </tr>
                  </tbody>
                </table>
                <button v-if="placement.unplaced.length > unplacedLimit" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="unplacedLimit += 100">Show more · {{ fmt(placement.unplaced.length - unplacedLimit) }} left</button>
              </template>
            </div>

            <!-- Misfits -->
            <div v-else-if="findings === 'misfits'" class="mt-3">
              <EmptyState v-if="!misfitShown.length" icon="check" title="Every file is most tied to its own module"/>
              <template v-else>
                <p class="text-sm text-neutral-600">Files with more imports to or from another module than their own: the next moves to try. A move re-reads everything above.</p>
                <table class="ui-table mt-2">
                  <thead><tr><th>File</th><th>In</th><th>Pulled to</th><th class="w-28 text-right" title="Imports either way with its own module / with the other">Here / there</th><th class="w-20"></th></tr></thead>
                  <tbody>
                    <tr v-for="m in misfitShown.slice(0, 200)" :key="m.file" @mouseenter="hoverFile = m.file" @mouseleave="hoverFile = null">
                      <td class="max-w-[380px]"><router-link :to="filePath(m.file)" class="block truncate font-mono text-xs hover:underline" :title="m.file">{{ m.file }}</router-link></td>
                      <td class="text-sm"><span class="mr-1.5 inline-block h-2 w-2 rounded-sm" :style="{ background: colorOf(m.module) }"/>{{ restructure.name(m.module) }}</td>
                      <td class="text-sm"><span class="mr-1.5 inline-block h-2 w-2 rounded-sm" :style="{ background: colorOf(m.to) }"/>{{ restructure.name(m.to) }}</td>
                      <td class="is-num text-right">{{ m.here }} / {{ m.there }}</td>
                      <td class="text-right"><button type="button" class="ui-btn ui-btn-sm ui-btn-quiet" @click="restructure.place([m.file], m.to)">Move</button></td>
                    </tr>
                  </tbody>
                </table>
              </template>
            </div>

            <!-- Moves -->
            <div v-else class="mt-3">
              <EmptyState v-if="!movesShown.length" icon="folder" title="Nothing moves yet" text="Give a module a folder under Moves to, and its files move there."/>
              <template v-else>
                <p class="text-sm text-neutral-600">{{ plural(mv.moves.length, "file") }} move; {{ plural(sites.sites, "import line") }} across {{ plural(sites.files, "file") }} name a moved file and are rewritten by the bundle.</p>
                <table class="ui-table mt-2">
                  <thead><tr><th>From</th><th>To</th><th>Module</th></tr></thead>
                  <tbody>
                    <tr v-for="m in movesShown.slice(0, movesLimit)" :key="m.from">
                      <td class="max-w-[340px] truncate font-mono text-xs" :title="m.from">{{ m.from }}</td>
                      <td class="max-w-[340px] truncate font-mono text-xs" :class="{ 'text-red-700': collided.has(m.to) }" :title="m.to">{{ m.to }}</td>
                      <td class="text-sm"><span class="mr-1.5 inline-block h-2 w-2 rounded-sm" :style="{ background: colorOf(m.module) }"/>{{ restructure.name(m.module) }}</td>
                    </tr>
                  </tbody>
                </table>
                <button v-if="movesShown.length > movesLimit" type="button" class="ui-btn ui-btn-sm ui-btn-quiet mt-1" @click="movesLimit += 200">Show more · {{ fmt(movesShown.length - movesLimit) }} left</button>
              </template>
            </div>
          </section>
        </main>
      </div>
    </template>
  </ViewWorkspaceLayout>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, ref, watch, type PropType } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useSandboxStore } from "~/features/sandbox/sandbox.store";
import ViewWorkspaceLayout from "~/features/shell/components/ViewWorkspaceLayout.vue";
import EmptyState from "~/shared/ui/EmptyState.vue";
import Icon from "~/shared/ui/Icon.vue";
import LoadingState from "~/shared/ui/LoadingState.vue";
import FolderMap from "~/features/checks/components/FolderMap.vue";
import StackDiagram, { type Floor, type Flow, type StackSelection } from "~/features/checks/components/StackDiagram.vue";
import { filesUnder, stackOrder } from "~/features/checks/folderTree";
import { useFileGraph } from "~/features/checks/useFileGraph";
import type { FileEdge } from "~/features/checks/checks";
import { useWorkspacesStore } from "~/features/workspace/workspaces.store";
import { useRestructureStore } from "~/features/restructure/restructure.store";
import { adjacency, evaluate, fromFolders, importSites, misfits, moves, place, pulls, type PlanModule } from "~/features/restructure/plan";
import { gitMvScript, guessAliases, moveMapJson, planMarkdown, restructureScript } from "~/features/restructure/rewrite";
import { GROUP_COLOR_PALETTE } from "~/features/groups/groups.store";
import { filePath } from "~/features/navigation/routes";
import { FILTERS, saveBundle, saveText } from "~/platform/files";
import { useStateStore } from "~/platform/state.store";

// Draw the target structure and see, as it is drawn, what it would do to this
// snapshot's imports: the modules as a stack with their imports between them,
// and today's folders painted by the module each file is going to.

const { data, loading, error, codeFiles, production, edges } = useFileGraph();
const workspaces = useWorkspacesStore();
const restructure = useRestructureStore();
const stateStore = useStateStore();
const router = useRouter();
watch([() => workspaces.active?.id, () => stateStore.hydrated], ([id]) => { if (id) restructure.load(id); }, { immediate: true });
const plan = computed(() => restructure.plan);
const prodList = computed(() => [...production.value]);

// Where every file goes, and what that does.
const placement = computed(() => place(plan.value, codeFiles.value, data.value.tests));
const order = computed(() => (plan.value.ordered ? plan.value.modules.map(m => m.id) : undefined));
const ev = computed(() => evaluate(placement.value.of, edges.value, production.value, order.value));
const today = computed(() => {
  const of = new Map<string, string>();
  // A file the scan gave no component (an unparsed type) counts in its folder.
  for (const f of production.value) of.set(f, data.value.component.get(f) || f.slice(0, f.lastIndexOf("/")));
  return evaluate(of, edges.value, production.value);
});
const adj = computed(() => adjacency(edges.value.filter(e => production.value.has(e.from) && production.value.has(e.to))));
const misfitList = computed(() => misfits(placement.value.of, production.value, adj.value.out, adj.value.into));
const mv = computed(() => moves(plan.value, placement.value.of));
const collided = computed(() => new Set(mv.value.collisions.map(c => c.to)));
const sites = computed(() => importSites(mv.value.moves, edges.value));
const placedCount = computed(() => prodList.value.filter(f => placement.value.of.has(f)).length);
const names = computed(() => new Map(plan.value.modules.map(m => [m.id, m.name])));
const mod = (id: string) => ev.value.modules.get(id) ?? { files: 0, internal: 0, external: 0, cohesion: 1 };
const handCount = (m: PlanModule) => m.files.filter(f => production.value.has(f)).length;
const inTangles = (t: string[][]) => t.reduce((n, x) => n + x.length, 0);

// The map's stripe for files no module takes, as a swatch.
const HATCH_SWATCH = "repeating-linear-gradient(45deg, rgb(var(--c-neutral-300)) 0 1.5px, rgb(var(--c-neutral-100)) 1.5px 3.5px)";
const colorOf = (id: string) => GROUP_COLOR_PALETTE[Math.max(0, plan.value.modules.findIndex(m => m.id === id)) % GROUP_COLOR_PALETTE.length];

// ── The active module: the one a picked folder goes into ──
const focus = ref<string | null>(null);
const focusModule = computed(() => plan.value.modules.find(m => m.id === focus.value) ?? null);
function setFocus(id: string) { focus.value = focus.value === id ? focus.value : id; }
const hoverModule = ref<string | null>(null);
const hoverFile = ref<string | null>(null);

// ── The stack ──
const tangled = computed(() => {
  const s = new Map<string, number>();
  ev.value.tangles.forEach((t, i) => t.forEach(id => s.set(id, i)));
  return s;
});
const mutualKeys = computed(() => new Set(ev.value.mutual.flatMap(p => [`${p.a}>${p.b}`, `${p.b}>${p.a}`])));
const flows = computed<Flow[]>(() => [...ev.value.pairs].map(([key, es]) => {
  const [a, b] = key.split(">");
  const inCycle = tangled.value.has(a) && tangled.value.get(a) === tangled.value.get(b);
  const upward = !!order.value && order.value.indexOf(b) < order.value.indexOf(a);
  return { key, from: a, to: b, count: es.length, bad: mutualKeys.value.has(key) || inCycle || upward, title: `${restructure.name(a)} uses ${restructure.name(b)}: ${plural(es.length, "import")}` };
}));
const floorOrder = computed(() => (plan.value.ordered ? plan.value.modules.map(m => m.id) : stackOrder(plan.value.modules.map(m => m.id), flows.value)));
const floors = computed<Floor[]>(() => floorOrder.value.map(id => ({
  id, label: restructure.name(id), weight: mod(id).files, color: colorOf(id),
  sub: plan.value.modules.length > 9 ? `${fmt(mod(id).files)} · ${Math.round(mod(id).cohesion * 100)}%` : `${fmt(mod(id).files)} files · ${Math.round(mod(id).cohesion * 100)}% inside`,
})));
const stackSel = ref<StackSelection>(null);
function onStackSelect(s: StackSelection) {
  stackSel.value = s && stackSel.value?.kind === s.kind && stackSel.value.id === s.id ? null : s;
  if (s?.kind === "floor") focus.value = s.id;
  if (s?.kind === "flow") findings.value = "problems";
}
const pickedPair = computed(() => {
  const s = stackSel.value;
  if (s?.kind !== "flow") return null;
  const [a, b] = s.id.split(">");
  return { a, b };
});
const stackSelLabel = computed(() => {
  const s = stackSel.value;
  if (!s) return "";
  if (s.kind === "floor") return `Only ${restructure.name(s.id)}`;
  const [a, b] = s.id.split(">");
  return `${restructure.name(a)} uses ${restructure.name(b)}`;
});
const selModule = computed(() => (stackSel.value?.kind === "floor" ? stackSel.value.id : null));
watch(() => plan.value.modules.map(m => m.id).join(), ids => {
  const have = new Set(ids.split(","));
  if (focus.value && !have.has(focus.value)) focus.value = null;
  const s = stackSel.value;
  if (s && !s.id.split(">").every(x => have.has(x))) stackSel.value = null;
});

// ── The map ──
const modulePaint = (f: string) => { const m = placement.value.of.get(f); return m ? colorOf(m) : "hatch"; };
const mapHighlight = computed<Set<string> | null>(() => {
  if (hoverFile.value) return new Set([hoverFile.value]);
  const onlyIn = (id: string) => new Set(prodList.value.filter(f => placement.value.of.get(f) === id));
  if (hoverModule.value) return onlyIn(hoverModule.value);
  if (pickedPair.value) {
    const es = [...(ev.value.pairs.get(`${pickedPair.value.a}>${pickedPair.value.b}`) ?? []), ...(ev.value.pairs.get(`${pickedPair.value.b}>${pickedPair.value.a}`) ?? [])];
    return new Set(es.flatMap(e => [e.from, e.to]));
  }
  if (selModule.value) return onlyIn(selModule.value);
  return null;
});
const mapSel = ref<{ path: string; kind: "file" | "folder" } | null>(null);
function onMapSelect(path: string | null, kind: "file" | "folder") { mapSel.value = !path || mapSel.value?.path === path ? null : { path, kind }; }
const mapSelFiles = computed(() => (mapSel.value ? filesUnder(mapSel.value.path, prodList.value) : []));
const mapSelNow = computed(() => {
  const by = new Map<string, number>();
  for (const f of mapSelFiles.value) { const m = placement.value.of.get(f) ?? ""; by.set(m, (by.get(m) ?? 0) + 1); }
  if (!plan.value.modules.length) return "";
  const parts = [...by].sort((a, b) => b[1] - a[1]).map(([m, n]) => (m ? `${n} in ${restructure.name(m)}` : `${n} not placed`));
  return parts.length > 2 ? `${parts.slice(0, 2).join(", ")}, …` : parts.join(", ");
});

/** Puts the picked folder (by a glob, so new files follow) or file (by hand) in a module. */
function putIn(id: string) {
  const sel = mapSel.value;
  if (!sel || !id) return;
  if (sel.kind === "file") { restructure.place([sel.path], id); return; }
  const line = `${sel.path}/**`;
  for (const m of plan.value.modules) {
    const lines = m.patterns.split("\n");
    if (m.id !== id && lines.some(l => l.trim() === line)) restructure.update(m.id, { patterns: lines.filter(l => l.trim() !== line).join("\n") });
  }
  const target = plan.value.modules.find(m => m.id === id);
  if (target && !target.patterns.split("\n").some(l => l.trim() === line)) restructure.update(id, { patterns: [target.patterns.trim(), line].filter(Boolean).join("\n") });
  const files = filesUnder(sel.path, codeFiles.value);
  restructure.unplace(files);
  // An earlier module's wider glob would still win; what does not land here is placed by hand.
  const after = place(plan.value, codeFiles.value, data.value.tests);
  const stray = files.filter(f => !data.value.tests.has(f) && after.of.get(f) !== id);
  if (stray.length) restructure.place(stray, id);
  focus.value = id;
}
function newFromSel() {
  const sel = mapSel.value;
  if (!sel) return;
  const name = sel.path.slice(sel.path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "") || "Module";
  const id = restructure.add({ name: name.charAt(0).toUpperCase() + name.slice(1) });
  putIn(id);
  mapSel.value = null;
}

// ── Today against the plan ──
type Findings = "problems" | "unplaced" | "misfits" | "moves";
const findings = ref<Findings>("problems");
const problemCount = computed(() => ev.value.mutual.length + ev.value.tangles.length + (plan.value.ordered ? ev.value.upward.length : 0));
const strip = computed(() => [
  { label: "Imports across modules", why: "File imports whose two ends sit in different modules. Today counts the components the scan found.", today: today.value.crossing, plan: ev.value.crossing, bad: false, tab: null },
  { label: "Pairs using each other", why: "Two modules each importing the other: one module in two places", today: today.value.mutual.length, plan: ev.value.mutual.length, bad: ev.value.mutual.length > 0, tab: "problems" as Findings },
  { label: "Modules in a cycle", why: "Modules in a strongly connected set", today: inTangles(today.value.tangles), plan: inTangles(ev.value.tangles), bad: ev.value.tangles.length > 0, tab: "problems" as Findings },
  { label: "Not placed yet", why: "Production code files no module takes", today: null, plan: placement.value.unplaced.length, bad: false, tab: "unplaced" as Findings },
  { label: "Pulled elsewhere", why: "Files with more imports either way with another module than their own", today: null, plan: misfitList.value.length, bad: false, tab: "misfits" as Findings },
  { label: "Files that move", why: `Files whose module has a folder they are not in yet; ${sites.value.sites} import lines to rewrite`, today: null, plan: mv.value.moves.length, bad: mv.value.collisions.length > 0, tab: "moves" as Findings },
]);
const FINDINGS: Array<{ id: Findings; label: string; title: string; count: () => number }> = [
  { id: "problems", label: "Problems", title: "Pairs that use each other, cycles, and imports against the order", count: () => problemCount.value },
  { id: "unplaced", label: "Not placed", title: "Production files no module takes", count: () => placement.value.unplaced.length },
  { id: "misfits", label: "Pulled elsewhere", title: "Files more tied to another module than their own", count: () => misfitList.value.length },
  { id: "moves", label: "Moves", title: "Every file that changes folder", count: () => mv.value.moves.length },
];
const touches = (ids: string[]) => !selModule.value || ids.includes(selModule.value);
const mutualShown = computed(() => ev.value.mutual.filter(p => touches([p.a, p.b])));
const upwardShown = computed(() => ev.value.upward.filter(e => touches([placement.value.of.get(e.from) ?? "", placement.value.of.get(e.to) ?? ""])));
const misfitShown = computed(() => misfitList.value.filter(m => touches([m.module, m.to])));
const movesShown = computed(() => mv.value.moves.filter(m => touches([m.module])));

// The pictures take what the window can spare, never less than a readable map.
const pictureH = computed(() => Math.max(400, Math.min(640, 90 + floors.value.length * (floors.value.length > 9 ? 38 : 62))));

// ── Starting points ──
const seedRoot = ref("");
const dirOptions = computed(() => {
  const dirs = new Set<string>();
  for (const f of codeFiles.value) { const p = f.split("/"); for (let i = 1; i < p.length; i++) dirs.add(p.slice(0, i).join("/")); }
  return [...dirs].sort();
});
// Where a plan most likely starts: walk down while one folder holds most of
// the code (frontend/ → src/), and stop where the code divides.
const guessRoot = computed(() => {
  let root = "", files = prodList.value;
  for (let depth = 0; depth < 8 && files.length; depth++) {
    const by = new Map<string, string[]>();
    for (const f of files) { const rest = root ? f.slice(root.length + 1) : f; const i = rest.indexOf("/"); if (i > 0) { const k = rest.slice(0, i); by.set(k, [...(by.get(k) ?? []), f]); } }
    const [top, held] = [...by].sort((a, b) => b[1].length - a[1].length)[0] ?? ["", []];
    if (!top || held.length < files.length * 0.7) break;
    root = root ? `${root}/${top}` : top;
    files = held;
  }
  return root;
});
function seedFolders() {
  const ms = fromFolders(seedRoot.value.trim() || guessRoot.value, codeFiles.value);
  if (ms.length) restructure.set(ms);
}
function addEmpty() { focus.value = restructure.add({ name: `Module ${plan.value.modules.length + 1}` }); }
function removeModule(id: string) { restructure.remove(id); if (focus.value === id) focus.value = null; }
function confirmClear() { if (window.confirm("Clear the whole plan? This cannot be undone.")) { restructure.clear(); focus.value = null; stackSel.value = null; } }

// ── Placement ──
const bestPull = (f: string) => pulls(f, placement.value.of, adj.value.out, adj.value.into)[0];
function onPlace(file: string, module: string) { restructure.place([file], module); }
const picked = ref(new Set<string>());
const pickTarget = ref("");
const unplacedLimit = ref(100);
const movesLimit = ref(200);
function togglePick(f: string) { const s = new Set(picked.value); s.has(f) ? s.delete(f) : s.add(f); picked.value = s; }
function placePicked() { restructure.place([...picked.value], pickTarget.value); picked.value = new Set(); }
function newFromPicked() { focus.value = restructure.add({ name: `Module ${plan.value.modules.length + 1}`, files: [...picked.value] }); picked.value = new Set(); }

// The plan as Sandbox moves: every placed file whose module is not its
// component moves into a component named for the module.
const sandbox = useSandboxStore();
async function toSandbox() {
  await sandbox.load();
  const edits = [...placement.value.of]
    .filter(([f]) => production.value.has(f) && sandbox.base?.compOf.has(f))
    .map(([file, id]) => ({ kind: "move" as const, file, to: restructure.name(id) }))
    .filter(e => sandbox.base!.compOf.get(e.file) !== e.to);
  sandbox.clear();
  sandbox.addMany(edits);
  void router.push("/views/connections?sandbox=1");
}

// ── Carrying it out ──
const exportOpen = ref(false);
const firstField = ref<HTMLInputElement | null>(null);
const exportBtn = ref<HTMLButtonElement | null>(null);
watch(exportOpen, async open => { if (open) { await nextTick(); firstField.value?.focus(); } else exportBtn.value?.focus(); });
const guessed = computed(() => guessAliases(codeFiles.value));
const aliasTilde = ref(""), aliasAt = ref("");
watch(guessed, g => { if (!aliasTilde.value) aliasTilde.value = g["~/"] ?? ""; if (!aliasAt.value) aliasAt.value = g["@/"] ?? ""; }, { immediate: true });
const aliases = computed(() => ({ ...(aliasTilde.value.trim() ? { "~/": aliasTilde.value.trim() } : {}), ...(aliasAt.value.trim() ? { "@/": aliasAt.value.trim() } : {}) }));
const isNuxt = computed(() => data.value.files.some(f => /(^|\/)nuxt\.config\.[jt]s$/.test(f)));
const autoImportMoves = computed(() => (isNuxt.value ? mv.value.moves.filter(m => /\/(composables|utils|components)\//.test(m.from) && !/\/(composables|utils|components)\//.test(m.to)).length : 0));
const nonJs = computed(() => mv.value.moves.filter(m => !/\.(m?[jt]sx?|cjs|vue|svelte)$/.test(m.from)).length);
const markdown = computed(() => planMarkdown(plan.value, placement.value, ev.value, today.value, mv.value.moves, names.value));
async function exportBundle() {
  await saveBundle("Save the restructure bundle", [
    { name: "moves.json", text: moveMapJson(mv.value.moves, names.value) },
    { name: "git-mv.sh", text: gitMvScript(mv.value.moves) },
    { name: "restructure.mjs", text: restructureScript(mv.value.moves, aliases.value) },
    { name: "restructure-plan.md", text: markdown.value },
  ]);
}

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, w: string) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;

// "Report (uses 3, used by 1)" for a file's strongest ties.
const PullText = defineComponent({
  props: { file: { type: String, required: true } },
  setup(props) {
    return () => {
      const p = pulls(props.file, placement.value.of, adj.value.out, adj.value.into).slice(0, 2);
      if (!p.length) return h("span", { class: "text-neutral-400" }, "no imports either way");
      return h("span", { class: "flex items-center gap-1.5" }, p.map((x, i) => [
        i ? h("span", { class: "text-neutral-300" }, "·") : null,
        h("span", { class: "inline-block h-2 w-2 shrink-0 rounded-sm", style: { background: colorOf(x.module) } }),
        h("span", { class: i ? "text-neutral-500" : "text-neutral-800" }, restructure.name(x.module)),
        h("span", { class: "font-mono text-[11px] text-neutral-500" }, [x.uses ? `uses ${x.uses}` : "", x.usedBy ? `used by ${x.usedBy}` : ""].filter(Boolean).join(", ")),
      ]));
    };
  },
});

// The imports behind a dependency, with a one-click move for either end.
const Why = defineComponent({
  props: { edges: { type: Array as PropType<FileEdge[]>, required: true }, title: { type: String, required: true } },
  emits: ["place"],
  setup(props, { emit }) {
    const all = ref(false);
    return () => h("div", { class: "mb-4" }, [
      props.title ? h("div", { class: "text-sm font-medium text-neutral-900" }, [props.title, h("span", { class: "ml-2 font-mono text-xs font-normal text-neutral-500" }, plural(props.edges.length, "import"))]) : null,
      h("table", { class: "ui-table mt-1" }, [h("tbody", {}, (all.value ? props.edges : props.edges.slice(0, 8)).map(e => {
        const from = placement.value.of.get(e.from), to = placement.value.of.get(e.to);
        return h("tr", { key: e.from + e.to, onMouseenter: () => { hoverFile.value = e.from; }, onMouseleave: () => { hoverFile.value = null; } }, [
          h("td", { class: "max-w-[300px]" }, h(RouterLink, { to: filePath(e.from), class: "block truncate font-mono text-xs hover:underline", title: e.from }, () => e.from)),
          h("td", { class: "max-w-[300px]" }, h(RouterLink, { to: filePath(e.to), class: "block truncate font-mono text-xs hover:underline", title: e.to }, () => e.to)),
          h("td", { class: "max-w-[200px] truncate font-mono text-xs text-neutral-600", title: e.names.join(", ") }, [e.inferred ? h("span", { class: "ui-tag mr-1 font-sans", title: "Read from the file's text" }, "text") : null, e.names.join(", ") || "—"]),
          h("td", { class: "whitespace-nowrap text-right" }, [
            to ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet", title: `Move ${e.from} into ${restructure.name(to)}`, onClick: () => emit("place", e.from, to) }, "Importer →") : null,
            from ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet", title: `Move ${e.to} into ${restructure.name(from)}`, onClick: () => emit("place", e.to, from) }, "← Imported") : null,
          ]),
        ]);
      }))]),
      props.edges.length > 8 ? h("button", { type: "button", class: "ui-btn ui-btn-sm ui-btn-quiet mt-1", onClick: () => { all.value = !all.value; } }, all.value ? "Show fewer" : `Show all ${props.edges.length}`) : null,
    ]);
  },
});
</script>
