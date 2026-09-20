import { acceptHMRUpdate, defineStore } from "pinia";
import { useDataStore } from "~/stores/data";
import { componentMembers, fileMembers, useGroupsStore, type GroupMode, type Member } from "~/stores/groups";
import { generalise } from "~/utils/query";
import { detectSeparator } from "~/utils/studio";
import type { Suggestion } from "~/utils/suggest";
import type { Grain, Way } from "~/utils/studio";

// A draft of one dimension: groups being built before they exist. Suggest
// fills it, "Edit dimension" loads real groups into it, and the architect
// renames, moves, adds, locks and reshuffles until "Save dimension" turns it
// into saved groups in one step. Session-local per workspace: a draft is
// work in progress, not a setting.

/** Whose decision this was: the engine proposes, a person confirms. */
export type Standing = "confirmed" | "proposed"

export interface DraftPart { component: string; files: string[] | null; standing?: Standing }
export interface DraftGroup {
  key: string
  name: string
  parts: DraftPart[]
  /**
   * What belongs in this group, said rather than listed.
   *
   * A draft carries it so the decision survives being saved: the parts are
   * what the architect is looking at right now, the query is what they meant.
   * Kept even while the group is fixed, where it becomes the watchlist that
   * reports drift instead of absorbing it.
   */
  query?: string
  /** Whether the saved group will BE the query or BE these parts. */
  mode?: GroupMode
  locked: boolean
  reasons: string[]
  /** The saved group this was loaded from, if any. */
  sourceId: string | null
}

interface DraftState {
  dimension: string
  /** Components parked for later, and ones declared outside this dimension. */
  later: string[]
  out: string[]
  /** Per group, the components refused for it; they are never offered again. */
  refused: Record<string, string[]>
  /** Which lap of the queue this is: Later turns it over rather than piling up. */
  round: number
  /** Snapshots for undo, newest last. */
  past: string[]
  /** The cut the draft was suggested with; the saved dimension records it. */
  cut: "vertical" | "horizontal" | "free"
  /**
   * What this dimension is made of. While it is "component" nothing can be
   * divided: `move` ignores a file list, so no part can exist and every count,
   * marker and drawing that speaks of parts has nothing to say. Most cuts want
   * it that way, so it is the default and only a layer changes it.
   */
  grain: Grain
  /** True once the architect set the grain themselves; the way stops deciding it. */
  grainByHand: boolean
  groups: DraftGroup[]
  origin: "suggest" | "dimension" | null
  /** Saved groups of the loaded dimension that were dropped; deleted on save. */
  removedIds: string[]
  /** True once the architect changed something by hand; live re-suggest then stops overwriting. */
  dirty: boolean
  storageKey: string | null
  /** The group the query bar just made, for the view hosting the draft to open. */
  justMade: string | null
}

const PREFIX = "archstats.draft.";
let nextKey = 1;

/**
 * A name the engine reached for because it had nothing to say — the
 * suggester's "Group A", "Group B" fallback, and the blank one the builder
 * starts a group with. Worth knowing, because such a name should never win
 * against one a person chose.
 */
export function isPlaceholderName(name: string): boolean {
  return /^(New group|Group [A-Z]\d*)( \d+)?$/.test(name.trim());
}

export const useDraftStore = defineStore("draft", {
  state: (): DraftState => ({ dimension: "", cut: "free", grain: "component", grainByHand: false, round: 1, later: [], out: [], refused: {}, past: [], groups: [], origin: null, removedIds: [], dirty: false, storageKey: null, justMade: null }),

  getters: {
    isOpen: (state) => state.origin !== null,
    groupByKey: (state) => (key: string) => state.groups.find(g => g.key === key),
    names: (state): Map<string, string> => new Map(state.groups.map(g => [g.key, g.name])),
    lockedKeys: (state): Set<string> => new Set(state.groups.filter(g => g.locked).map(g => g.key)),
    /** component → every part of it in the draft, with the group key. */
    partsOfComponent: (state): Map<string, Array<{ key: string; files: string[] | null }>> => {
      const m = new Map<string, Array<{ key: string; files: string[] | null }>>();
      for (const g of state.groups) for (const p of g.parts) m.set(p.component, [...(m.get(p.component) ?? []), { key: g.key, files: p.files }]);
      return m;
    },
    /** Components drawn inside each group's outline: the group holding most of them. */
    drawComponents(): Map<string, string[]> {
      const data = useDataStore();
      const out = new Map<string, string[]>();
      this.partsOfComponent.forEach((parts, component) => {
        const total = (data.componentFilesIndex.get(component) ?? []).length;
        const best = parts.map(p => ({ key: p.key, n: p.files === null ? Math.max(total, 1) : p.files.length })).sort((a, b) => b.n - a.n)[0];
        if (best) out.set(best.key, [...(out.get(best.key) ?? []), component]);
      });
      return out;
    },
    /** How much of this dimension a person has actually vouched for. */
    /**
     * Counted in components, never in parts. A component split across two
     * groups is one component standing one way, and adding its halves would
     * make the tally disagree with the coverage beside it.
     */
    standingCounts(): { confirmed: number; proposed: number } {
      const standing = new Map<string, Standing>();
      for (const g of this.groups) {
        for (const p of g.parts) {
          // Any part still only proposed leaves the whole component proposed.
          if (p.standing === "proposed" || !standing.has(p.component)) standing.set(p.component, p.standing ?? "confirmed");
        }
      }
      let confirmed = 0, proposed = 0;
      standing.forEach(v => (v === "proposed" ? proposed++ : confirmed++));
      return { confirmed, proposed };
    },
    refusedFor: (state) => (key: string): Set<string> => new Set(state.refused[key] ?? []),
    parked: (state): Set<string> => new Set([...state.later, ...state.out]),
    canUndo: (state): boolean => state.past.length > 0,
    splitCount(): number {
      let n = 0;
      this.partsOfComponent.forEach(parts => { if (parts.some(p => p.files !== null)) n++; });
      return n;
    },
    /**
     * Every component whose files are in more than one group, and where each
     * part sits. Empty by construction while the grain is "component".
     */
    splitComponents(): Map<string, Array<{ key: string; files: string[] | null }>> {
      const m = new Map<string, Array<{ key: string; files: string[] | null }>>();
      this.partsOfComponent.forEach((parts, component) => { if (parts.length > 1) m.set(component, parts); });
      return m;
    },
    /** unit id → group key, at the grain the engine will run on. */
    placedUnits() {
      const data = useDataStore();
      return (grain: Grain): Map<string, string> => {
        const m = new Map<string, string>();
        if (grain === "file") {
          for (const g of this.groups) for (const p of g.parts) for (const f of p.files ?? data.componentFilesIndex.get(p.component) ?? []) m.set(f, g.key);
        } else {
          this.drawComponents.forEach((components, key) => components.forEach(c => m.set(c, key)));
        }
        return m;
      };
    },
  },

  actions: {
    // ── Lifecycle ────────────────────────────────────────
    load(workspaceKey: string) {
      this.storageKey = PREFIX + workspaceKey;
      try {
        const raw = sessionStorage.getItem(this.storageKey);
        if (!raw) { this._reset(); return; }
        const saved = JSON.parse(raw) as Partial<DraftState>;
        this.dimension = saved.dimension ?? "";
        this.cut = saved.cut ?? "free";
        this.round = saved.round ?? 1;
        this.later = saved.later ?? [];
        this.out = saved.out ?? [];
        this.refused = saved.refused ?? {};
        this.past = [];
        this.groups = Array.isArray(saved.groups) ? saved.groups : [];
        this.origin = saved.origin ?? null;
        this.removedIds = saved.removedIds ?? [];
        this.dirty = !!saved.dirty;
        // A draft that already holds parts is a file-grain draft whatever it
        // was saved as: what is on the board decides, never the other way
        // round, or restoring would quietly rejoin someone's work.
        this.grainByHand = !!saved.grainByHand;
        this.grain = this._grainOfBoard() ?? saved.grain ?? "component";
        nextKey = this.groups.length + 1;
      } catch { this._reset(); }
    },
    _reset() { this.dimension = ""; this.cut = "free"; this.grain = "component"; this.grainByHand = false; this.round = 1; this.groups = []; this.later = []; this.out = []; this.refused = {}; this.past = []; this.origin = null; this.removedIds = []; this.dirty = false; this.justMade = null; },
    /** "file" when anything on the board is already divided, else nothing. */
    _grainOfBoard(): Grain | null {
      for (const g of this.groups) for (const p of g.parts) if (p.files !== null) return "file";
      return null;
    },
    _persist() {
      if (!this.storageKey) return;
      try {
        if (this.origin === null) sessionStorage.removeItem(this.storageKey);
        else sessionStorage.setItem(this.storageKey, JSON.stringify({ dimension: this.dimension, cut: this.cut, grain: this.grain, grainByHand: this.grainByHand, round: this.round, groups: this.groups, later: this.later, out: this.out, refused: this.refused, origin: this.origin, removedIds: this.removedIds, dirty: this.dirty }));
      } catch {}
    },
    clear() { this._reset(); this._persist(); },

    /** Start or refresh the draft from suggestions; locks and edits survive when keys match. */
    fromSuggestions(dimension: string, suggestions: Suggestion[], cut?: "vertical" | "horizontal" | "free") {
      if (cut) this.cut = cut;
      const before = new Map(this.groups.map(g => [g.key, g]));
      const seen = new Map<string, number>();
      const once = (name: string) => {
        const n = (seen.get(name) ?? 0) + 1;
        seen.set(name, n);
        return n === 1 ? name : `${name} ${n}`;
      };
      // Every proposal arrives already saying what it is. Measured across
      // both benchmark snapshots, a proposed group describes itself exactly
      // every time; on a codebase whose packages follow its domains it is
      // usually one line, and where it takes forty the engine could not name
      // the group either — the length is a reading of the grouping itself.
      const universe = Array.from(useDataStore().componentFilesIndex.keys());
      const sep = universe.length ? detectSeparator(universe) : ".";
      const describeOf = (ids: string[]): string | undefined => {
        if (!universe.length || ids.length < 2) return undefined;
        const out = generalise(ids, universe, sep);
        return out.terms.length ? out.text : undefined;
      };

      this.groups = suggestions.map(s => {
        const old = before.get(s.key);
        return {
          key: s.key,
          name: once(s.name),
          // Attached, not applied: the group is still the parts on screen
          // until the architect says otherwise.
          query: describeOf(s.components),
          mode: "fixed" as GroupMode,
          // The engine may propose a divided component; at component grain the
          // dimension simply cannot hold one, so it arrives whole.
          parts: s.parts.map(p => ({ component: p.component, files: this.grain === "file" && p.files ? [...p.files] : null, standing: "proposed" as Standing })),
          locked: old?.locked ?? false,
          reasons: s.reasons.map(r => r.text),
          sourceId: old?.sourceId ?? null,
        };
      });
      if (this.origin !== "dimension") { this.dimension = dimension; this.origin = "suggest"; }
      this._persist();
    },

    /** A draft built by a view (lanes, an explored set): groups given outright, nothing saved yet. */
    setGroups(dimension: string, groups: Array<{ name: string; parts: DraftPart[]; reasons?: string[]; locked?: boolean }>, cut: "vertical" | "horizontal" | "free" = "free") {
      this.groups = groups.map(g => ({
        key: "d:" + Date.now().toString(36) + "-" + nextKey++,
        name: g.name,
        parts: this.grain === "file" ? g.parts : g.parts.map(p => ({ ...p, files: null })),
        locked: g.locked ?? false,
        reasons: g.reasons ?? [],
        sourceId: null,
      }));
      this.dimension = dimension;
      this.cut = cut;
      this.origin = "suggest";
      this.removedIds = [];
      this.dirty = true;
      this._persist();
    },

    /** Load the saved groups of one dimension for editing. */
    fromDimension(dimension: string) {
      const groups = useGroupsStore();
      const data = useDataStore();
      this.cut = groups.dimensionOf(dimension)?.cut ?? "free";
      this.groups = groups.groups.filter(g => g.dimension === dimension).map(g => {
        const parts: DraftPart[] = componentMembers(g).map(c => ({ component: c, files: null }));
        const byComponent = new Map<string, string[]>();
        for (const f of fileMembers(g)) { const c = data.fileComponentIndex.get(f); if (c) byComponent.set(c, [...(byComponent.get(c) ?? []), f]); }
        byComponent.forEach((files, component) => { if (!parts.some(p => p.component === component)) parts.push({ component, files: files.sort() }); });
        return { key: "g:" + g.id, name: g.name, parts, locked: false, reasons: [], sourceId: g.id };
      });
      this.dimension = dimension;
      this.origin = "dimension";
      this.removedIds = [];
      this.dirty = false;
      // A saved dimension states its own grain by what it is made of. Opening
      // one made of files in whole-component mode would offer to rejoin work
      // nobody asked about.
      this.grain = this._grainOfBoard() ?? "component";
      this.grainByHand = this.grain === "file";
      this._persist();
    },

    /** An empty draft of a new dimension; the builder's Start from fills it. */
    startNew(dimension = "New dimension") {
      this.groups = []
      this.dimension = dimension
      this.origin = "suggest"
      this.removedIds = []
      this.dirty = false
      this._persist()
    },

    /** A new draft holding copies of a saved dimension's groups. */
    copyDimension(dimension: string) {
      this.fromDimension(dimension)
      this.groups = this.groups.map(g => ({ ...g, key: "d:" + Date.now().toString(36) + "-" + nextKey++, sourceId: null }))
      this.dimension = `${dimension} copy`
      this.origin = "suggest"
      this.removedIds = []
      this.dirty = true
      this._persist()
    },

    /** Every act that changes the draft keeps a way back. */
    _snapshot() {
      this.past.push(JSON.stringify({ groups: this.groups, later: this.later, out: this.out, refused: this.refused, grain: this.grain }));
      if (this.past.length > 60) this.past.shift();
    },
    undo() {
      const last = this.past.pop();
      if (!last) return;
      const state = JSON.parse(last) as Pick<DraftState, "groups" | "later" | "out" | "refused" | "grain">;
      this.groups = state.groups;
      this.later = state.later;
      this.out = state.out;
      this.refused = state.refused;
      // Undoing a rejoin has to bring the grain back with the parts, or the
      // parts would reappear in a dimension that says it cannot hold them.
      this.grain = state.grain ?? this.grain;
      this._persist();
    },

    // ── Grain ────────────────────────────────────────────
    /**
     * What the dimension is made of. Going to "component" cannot silently
     * discard work, so it rejoins first: every divided component goes back
     * whole into the group already holding most of its files. One undo step
     * covers the whole change.
     */
    setGrain(grain: Grain, byHand = true) {
      if (grain !== this.grain) {
        this._snapshot();
        if (grain === "component") this._rejoinAll();
        this.grain = grain;
      }
      // Assigned rather than only set, so the override can be released: asking
      // for what the way already wants is agreement, not an override, and the
      // way goes back to deciding. Without this the first hand-pick would
      // silence the way for the life of the draft, with nothing on screen
      // saying so.
      this.grainByHand = byHand;
      this._persist();
    },

    /**
     * The way asks the question, and the question decides what can answer it:
     * a layer cuts through packages, a domain does not. Only until the
     * architect says otherwise, and never over work already done.
     */
    followWay(way: Way) {
      if (this.grainByHand || this.splitCount > 0) return;
      this.setGrain(way.grain, false);
    },

    /** Each divided component, back in one piece, in the group holding most of it. */
    _rejoinAll() {
      const data = useDataStore();
      this.splitComponents.forEach((parts, component) => {
        const total = (data.componentFilesIndex.get(component) ?? []).length;
        const home = parts
          .map(p => ({ key: p.key, n: p.files === null ? Math.max(total, 1) : p.files.length }))
          .sort((a, b) => b.n - a.n)[0];
        for (const g of this.groups) {
          const idx = g.parts.findIndex(p => p.component === component);
          if (idx === -1) continue;
          if (g.key === home.key) { g.parts[idx].files = null; g.parts[idx].standing = "confirmed"; }
          else g.parts.splice(idx, 1);
        }
      });
      // A part left over from a load is whole from here on, splits or not.
      for (const g of this.groups) for (const p of g.parts) p.files = null;
      this.dirty = true;
    },

    /** Put whole components in a group, taking them out of wherever they were. */
    assign(components: string[], key: string, standing: Standing = "confirmed") {
      const target = this.groupByKey(key);
      if (!target || components.length === 0) return;
      this._snapshot();
      const moving = new Set(components);
      for (const g of this.groups) g.parts = g.parts.filter(p => !moving.has(p.component));
      this.later = this.later.filter(c => !moving.has(c));
      this.out = this.out.filter(c => !moving.has(c));
      for (const c of components) target.parts.push({ component: c, files: null, standing });
      this.dirty = true;
      this._persist();
    },

    /** Refuse components for one group: they never come up for it again. */
    refuse(components: string[], key: string) {
      if (components.length === 0) return;
      this._snapshot();
      const set = new Set([...(this.refused[key] ?? []), ...components]);
      this.refused = { ...this.refused, [key]: Array.from(set) };
      const group = this.groupByKey(key);
      if (group) group.parts = group.parts.filter(p => !components.includes(p.component));
      this.dirty = true;
      this._persist();
    },

    /** Park for later, or declare outside this dimension altogether. */
    park(components: string[], pile: "later" | "out") {
      if (components.length === 0) return;
      this._snapshot();
      const moving = new Set(components);
      for (const g of this.groups) g.parts = g.parts.filter(p => !moving.has(p.component));
      this.later = this.later.filter(c => !moving.has(c));
      this.out = this.out.filter(c => !moving.has(c));
      this[pile] = [...this[pile], ...components];
      this.dirty = true;
      this._persist();
    },

    /**
     * The round is over: everything set aside comes back to be asked again.
     * Not an edit, so it takes no undo step — it is the queue turning over.
     */
    reshuffle(): number {
      const n = this.later.length;
      if (!n) return 0;
      this.later = [];
      this.round++;
      this._persist();
      return n;
    },

    /** Take components back out of the piles and into the unplaced pool. */
    unpark(components: string[]) {
      if (components.length === 0) return;
      this._snapshot();
      const moving = new Set(components);
      this.later = this.later.filter(c => !moving.has(c));
      this.out = this.out.filter(c => !moving.has(c));
      this._persist();
    },

    /** Stand behind what the engine proposed, for one group or for all of them. */
    confirmStanding(key?: string) {
      this._snapshot();
      for (const g of this.groups) {
        if (key && g.key !== key) continue;
        for (const p of g.parts) p.standing = "confirmed";
      }
      this.dirty = true;
      this._persist();
    },

    // ── Editing ──────────────────────────────────────────
    setDimension(name: string) { this.dimension = name.trim() || this.dimension; this.dirty = true; this._persist(); },
    /** Two groups with one name is always a mistake; the second takes a number. */
    uniqueName(name: string, exceptKey?: string): string {
      const base = name.trim() || "New group";
      const taken = new Set(this.groups.filter(g => g.key !== exceptKey).map(g => g.name));
      let label = base;
      let n = 2;
      while (taken.has(label)) label = `${base} ${n++}`;
      return label;
    },
    rename(key: string, name: string) {
      const g = this.groupByKey(key);
      const label = name.trim();
      if (!g || !label || label === g.name) return;
      this._snapshot();
      g.name = this.uniqueName(label, key);
      this.dirty = true;
      this._persist();
    },
    addGroup(name?: string): string {
      const key = "d:" + Date.now().toString(36) + "-" + nextKey++;
      this._snapshot();
      this.groups.push({ key, name: this.uniqueName(name ?? "New group"), parts: [], locked: false, reasons: [], sourceId: null });
      this.dirty = true;
      this._persist();
      return key;
    },
    /**
     * A finding, kept as a group in the lens being built.
     *
     * The query bar's Keep used to open a lens picker and write a saved group
     * into whichever lens was chosen — a question with no good answer while a
     * lens is open on screen, half-built. Here the answer is already known:
     * the one being built. The query comes with it, so the group goes on
     * matching as the code moves.
     */
    keepQuery(name: string, components: string[], query: string): string {
      const key = this.addGroup(name);
      this.assign(components, key);
      this.setQuery(key, query, "live");
      // Read once by the view that hosts the draft, to open what was just
      // made. Nothing else sets it, so nothing else steals the panel.
      this.justMade = key;
      return key;
    },

    /** Undoable: the members simply fall back into the unplaced pool. */
    dropGroup(key: string) {
      const g = this.groupByKey(key);
      if (!g) return;
      this._snapshot();
      if (g.sourceId) this.removedIds.push(g.sourceId);
      this.groups = this.groups.filter(x => x.key !== key);
      this.dirty = true;
      this._persist();
    },
    /** Say what belongs in a group, instead of listing it. */
    setQuery(key: string, query: string, mode: GroupMode = "live") {
      const g = this.groupByKey(key);
      if (!g) return;
      this._snapshot();
      const text = query.trim();
      g.query = text || undefined;
      g.mode = text ? mode : undefined;
      this.dirty = true;
      this._persist();
    },

    /**
     * Make a live group hold exactly what its query answers.
     *
     * `setQuery` writes the text and stops, which is right for a saved group
     * — those compute their membership from the query every time they are
     * read. A draft group holds concrete parts, so there the text alone left
     * a group reading "**.openadmin.** · 74 components" and holding none of
     * them. The query is the definition, not a suggestion laid over a list,
     * so anything it stops claiming goes back to the unplaced pool.
     *
     * The matches come from the caller: the store has no component index and
     * no business growing one.
     */
    setQueryMembers(key: string, components: string[]) {
      const g = this.groupByKey(key);
      if (!g) return;
      const want = new Set(components);
      const held = new Set(g.parts.map(p => p.component));
      const incoming = components.filter(c => !held.has(c));
      const losing = g.parts.some(p => !want.has(p.component));
      if (!incoming.length && !losing) return;
      this._snapshot();
      // Taken from wherever they were, exactly as placing them by hand does.
      const moving = new Set(incoming);
      for (const x of this.groups) x.parts = x.parts.filter(p => !moving.has(p.component));
      this.later = this.later.filter(c => !moving.has(c));
      this.out = this.out.filter(c => !moving.has(c));
      g.parts = g.parts.filter(p => want.has(p.component));
      for (const c of incoming) g.parts.push({ component: c, files: null, standing: "confirmed" });
      this.dirty = true;
      this._persist();
    },

    /**
     * The shortest patterns that describe what a group already holds.
     *
     * Offered, never applied on its own: picking twelve of fourteen things by
     * hand is not the same as meaning "everything under booking", and only
     * the person pointing knows which they meant.
     */
    describe(key: string): string | null {
      const g = this.groupByKey(key);
      if (!g || g.parts.length === 0) return null;
      const universe = Array.from(useDataStore().componentFilesIndex.keys());
      if (universe.length === 0) return null;
      const ids = g.parts.filter(p => p.files === null).map(p => p.component);
      if (ids.length === 0) return null;
      const out = generalise(ids, universe, detectSeparator(universe));
      return out.terms.length ? out.text : null;
    },

    toggleLock(key: string) { const g = this.groupByKey(key); if (g) { g.locked = !g.locked; this.dirty = true; this._persist(); } },

    /**
     * Fold groups into one. This is the commonest edit there is after a first
     * pass, because a first pass routinely returns fragments — six of fifteen
     * groups called "Group A" through "Group G", holding two or three
     * components each. Without it the only route is deleting a group and
     * re-adding its members one at a time, which is why it is here.
     *
     * The name survives rather than the key: a merge of "Group C" into
     * "Authentication" is obviously Authentication, and so is a merge the
     * other way round. A placeholder never wins against a name someone chose.
     */
    merge(keys: string[], into: string) {
      const target = this.groupByKey(into);
      const from = keys.filter(k => k !== into && this.groupByKey(k));
      if (!target || from.length === 0) return;
      this._snapshot();
      const data = useDataStore();

      // The target IS the choice — the caller picked which name to keep — so
      // nothing here may overrule it. An earlier version kept whichever real
      // name had the most members, which quietly answered a question the
      // architect had just been asked and had already answered: picking
      // "Persistence" produced a group called "Payment".
      //
      // The one exception is not an exception to that rule. A placeholder is
      // the absence of a choice, not a choice, so a name someone typed still
      // beats "Group A" whichever side of the merge it is on.
      const sources = from.map(k => this.groupByKey(k)!);
      const keeper = !isPlaceholderName(target.name)
        ? { name: target.name }
        : sources
            .filter(g => !isPlaceholderName(g.name))
            .map(g => ({ name: g.name, size: g.parts.length }))
            .sort((a, b) => b.size - a.size)[0];

      for (const key of from) {
        const g = this.groupByKey(key)!;
        for (const p of g.parts) {
          const existing = target.parts.find(x => x.component === p.component);
          if (!existing) { target.parts.push({ ...p, files: p.files ? [...p.files] : null }); continue; }
          // Two parts of one component landing in the same group make it
          // whole again, and a whole side always swallows a partial one.
          if (existing.files === null || p.files === null) existing.files = null;
          else existing.files = Array.from(new Set([...existing.files, ...p.files])).sort();
          if (p.standing === "confirmed") existing.standing = "confirmed";
        }
        if (g.sourceId) this.removedIds.push(g.sourceId);
        target.locked = target.locked || g.locked;
      }

      // A refusal is evidence and outlives the group that recorded it, except
      // where the merge itself answers it: a component now inside cannot also
      // be refused for the thing it is inside.
      const refused = new Set(this.refused[into] ?? []);
      for (const key of from) for (const c of this.refused[key] ?? []) refused.add(c);
      const inside = new Set(target.parts.map(p => p.component));
      const next = { ...this.refused, [into]: Array.from(refused).filter(c => !inside.has(c)) };
      for (const key of from) delete next[key];
      this.refused = next;

      // A component whose halves both end up here is not split any more.
      for (const p of target.parts) {
        if (p.files === null) continue;
        const all = data.componentFilesIndex.get(p.component) ?? [];
        if (all.length > 0 && all.every(f => p.files!.includes(f))) p.files = null;
      }

      // Dropped first, so the name it keeps is not counted as a clash with
      // the group it is being taken from.
      this.groups = this.groups.filter(g => !from.includes(g.key));
      if (keeper) target.name = this.uniqueName(keeper.name, into);
      this.dirty = true;
      this._persist();
    },

    /**
     * Move a whole component (`files` null) or some of its files into a
     * group, or out of every group when `to` is null. A component whose
     * files end up in two groups is split; one that gets all its files back
     * becomes whole again.
     *
     * At component grain a file list is not refused, it is read as what it
     * plainly means — move the component — so no caller has to know the grain
     * and no path exists that could leave a part behind. This is the lock the
     * hidden buttons only describe.
     */
    move(component: string, files: string[] | null, to: string | null) {
      this._snapshot();
      const data = useDataStore();
      const all = data.componentFilesIndex.get(component) ?? [];
      const moving = this.grain === "component" || files === null ? null : new Set(files);
      for (const g of this.groups) {
        const idx = g.parts.findIndex(p => p.component === component);
        if (idx === -1) continue;
        const part = g.parts[idx];
        if (moving === null) { g.parts.splice(idx, 1); continue; }
        const have = part.files ?? all;
        const left = have.filter(f => !moving.has(f));
        if (left.length === 0) { g.parts.splice(idx, 1); continue; }
        // What is left behind was shaped by hand too, so it stops being a guess.
        part.files = left.length === all.length && all.length > 0 ? null : left;
        part.standing = "confirmed";
      }
      if (to !== null) {
        const target = this.groupByKey(to);
        if (!target) return;
        const existing = target.parts.find(p => p.component === component);
        if (moving === null) {
          if (existing) { existing.files = null; existing.standing = "confirmed"; } else target.parts.push({ component, files: null, standing: "confirmed" });
        } else {
          const merged = new Set([...(existing?.files ?? []), ...moving]);
          const whole = all.length > 0 && all.every(f => merged.has(f));
          const part: DraftPart = { component, files: whole ? null : Array.from(merged).sort(), standing: "confirmed" };
          if (existing) Object.assign(existing, part); else target.parts.push(part);
        }
      }
      this.dirty = true;
      this._persist();
    },

    // ── Save ─────────────────────────────────────────────
    membersOf(key: string): Member[] {
      const g = this.groupByKey(key);
      if (!g) return [];
      return g.parts.flatMap(p => (p.files === null ? [{ kind: "component" as const, name: p.component }] : p.files.map(f => ({ kind: "file" as const, name: f }))));
    },
    /** Save one group and take it out of the draft. */
    commitGroup(key: string) {
      const groups = useGroupsStore();
      const g = this.groupByKey(key);
      if (!g) return;
      const members = this.membersOf(key);
      const id = g.sourceId && groups.getGroupById(g.sourceId)
        ? (groups.updateGroup(g.sourceId, { name: g.name, members, dimension: this.dimension }), g.sourceId)
        : groups.createGroup(g.name, members, this.dimension).id;
      if (g.query) groups.setQuery(id, g.query, g.mode ?? "live");
      this.groups = this.groups.filter(x => x.key !== key);
      if (this.groups.length === 0) this.clear(); else this._persist();
    },
    /** Save every group, delete the dropped ones, close the draft. */
    commit() {
      const groups = useGroupsStore();
      groups.ensureDimension(this.dimension, { cut: this.cut });
      let saved = 0;
      for (const g of this.groups) {
        const members = this.membersOf(g.key);
        if (g.parts.length === 0 && !g.query && !g.sourceId) continue;
        const id = g.sourceId && groups.getGroupById(g.sourceId)
          ? (groups.updateGroup(g.sourceId, { name: g.name, members, dimension: this.dimension }), g.sourceId)
          : groups.createGroup(g.name, members, this.dimension).id;
        // What the architect meant outlives what they were looking at.
        if (g.query) groups.setQuery(id, g.query, g.mode ?? "live");
        saved++;
      }
      for (const id of this.removedIds) groups.deleteGroup(id);
      groups.noteSaved(this.dimension, saved);
      this.clear();
    },
  },
});

// Pinia keeps the store instance it already built when this module is hot
// replaced, so an action added while the dev server runs is missing from the
// live store until a full reload — and fails with "not a function", which
// reads exactly like a bug that is not there.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useDraftStore, import.meta.hot));
