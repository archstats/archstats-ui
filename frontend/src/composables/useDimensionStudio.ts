import { computed, ref, watch } from "vue";
import { useDataStore } from "~/stores/data";
import { useDraftStore } from "~/stores/draft";
import { GROUP_COLOR_PALETTE } from "~/stores/groups";
import { useSuggestModel } from "~/composables/useSuggestModel";
import { buildSuggestInput, type SuggestInput } from "~/utils/suggest";
import { affinityTo, affinityIndex, bundleFor, domainBasisOf, fitnessOf, type Way, packageTree, pathStyle, rankCandidates, rankGroups, splitBundle, underPath, wayById, type AffinityIndex, type Bundle, type GroupRef, type WayId } from "~/utils/studio";
import { directedReferenceEdges, normalizeEdges, type CEdge, type CNode } from "~/utils/connections";
import { bandBonds, bondBreakdown, bondsTo, buildCouplings, cohesionOf, elsewhere } from "~/utils/bond";
import { measureCut, readModularity } from "~/utils/cutQuality";
import { proposeTear, tearsAmong, type Tear, type TearInput } from "~/utils/tear";

// Everything the dimension studio needs to ask its next question: the pool
// still unplaced, the bundles it falls into, what each bundle is closest to,
// and the map that shows where any of it sits. The heavy tables load once
// per snapshot through the suggester; the rest is derivation.

/** How hard a whole bundle leans towards a set of components. */
function affinityTo2(members: string[], into: string[], index: AffinityIndex): number {
  let weight = 0;
  for (const id of members) weight += affinityTo(id, into, index).weight;
  return weight;
}

export function useDimensionStudio() {
  const store = useDataStore();
  const draft = useDraftStore();
  const suggest = useSuggestModel();

  const input = ref<SuggestInput | null>(null);
  const lines = ref(new Map<string, number>());
  const rawEdges = ref<CEdge[]>([]);
  const loading = ref(false);
  let loadedFor: string | null = null;

  /**
   * Lines of the project's own code per component. "The biggest thing still
   * unsorted" was measured with vendored files in, so Broadleaf's first
   * question was about a folder of admin-theme JavaScript. Snapshots that
   * mark third-party and generated files let those drop out; older ones fall
   * back to every line.
   */
  async function ownLines(): Promise<Map<string, number>> {
    try {
      const own = await store.query<{ name: string; lines: number | null }>(
        "select component as name, sum(complexity__lines) as lines from files where component is not null and coalesce(complexity__files__third_party, 0) = 0 and coalesce(complexity__files__generated, 0) = 0 group by component");
      const all = await store.query<{ name: string }>("select name from components");
      const m = new Map(own.map(r => [r.name, r.lines ?? 0]));
      return new Map(all.map(r => [r.name, m.get(r.name) ?? 0]));
    } catch {
      const rows = await store.query<{ name: string; lines: number | null }>("select name, complexity__lines as lines from components");
      return new Map(rows.map(r => [r.name, r.lines ?? 0]));
    }
  }

  async function load() {
    const key = store.datasetKey ?? "";
    if (loadedFor === key && input.value) return;
    loading.value = true;
    try {
      const src = await suggest.load();
      input.value = buildSuggestInput(src, "component");
      lines.value = await ownLines();
      rawEdges.value = normalizeEdges("static", directedReferenceEdges(src.componentRefs.map(e => ({ from: e.from, to: e.to, references: e.references }))));
      loadedFor = key;
    } finally {
      loading.value = false;
    }
  }

  // ── The way this dimension is being cut ────────────────────────────────
  // It decides what a question is, what "close" means, and what a first pass
  // would run. Everything downstream reads it rather than assuming a domain.
  // It opens on the subject reading and the page moves it to whichever name
  // reading this codebase suits; "domain" stood here until the readings were
  // named for their evidence, and named an id that no longer exists.
  const wayId = ref<WayId>("subject");
  const way = computed(() => wayById(wayId.value));
  function setWay(id: WayId) { wayId.value = id; finer.value = new Set(); }

  const index = computed<AffinityIndex>(() => (input.value ? affinityIndex(input.value, way.value.weights) : new Map()));
  const unitsById = computed(() => new Map((input.value?.units ?? []).map(u => [u.id, u])));
  const hasCochange = computed(() => (input.value?.pairs ?? []).some(p => (p.v.cochange ?? 0) > 0));
  const fitness = computed(() => fitnessOf(way.value, unitsById.value, hasCochange.value, bundleCtx.value));
  /** What any way would have to go on here, so the picker can say so up front. */
  function fitnessFor(w: Way) { return fitnessOf(w, unitsById.value, hasCochange.value, bundleCtx.value); }
  const linesOf = (id: string) => lines.value.get(id) ?? 0;

  const allComponents = computed(() => input.value?.units.map(u => u.id) ?? []);
  /** Java's dot, PHP's backslash, a file tree's slash: read off the names. */
  const style = computed(() => pathStyle(allComponents.value));

  /** Everything the bundlers read, in one place. */
  /**
   * References and co-change kept apart from the blend, because the domain
   * cut confirms a subject against those two alone and the blended index has
   * already mixed in names and paths — the very things it is checking.
   */
  const refs = computed(() => (input.value ? affinityIndex(input.value, { references: 1 }) : new Map()));
  const moves = computed(() => (input.value ? affinityIndex(input.value, { cochange: 1 }) : new Map()));

  /**
   * Which name reading this codebase suits, for the default the picker opens
   * on. Detection did not go away when the architect got the choice -- it
   * stopped being the answer and became the opening offer.
   */
  const suggestedNameReading = computed<WayId>(() =>
    allComponents.value.length ? domainBasisOf(allComponents.value, bundleCtx.value).basis === "tree" ? "tree" : "subject" : "subject",
  );

  const bundleCtx = computed(() => ({ units: unitsById.value, laneLabels: input.value?.laneLabels ?? {}, index: index.value, linesOf, style: style.value, refs: refs.value, moves: moves.value }));

  /** Every file of a component, so a split can be reasoned about. */
  const filesOf = (id: string) => store.componentFilesIndex.get(id) ?? [];

  /**
   * Where each component sits. A component split across groups has a share in
   * each, and is whole in none of them — which is the distinction every count,
   * mark and colour downstream has to keep straight.
   */
  const shares = computed(() => {
    const m = new Map<string, Array<{ key: string; files: number; whole: boolean }>>();
    for (const g of draft.groups) {
      for (const p of g.parts) {
        const all = filesOf(p.component).length;
        const held = p.files === null ? all : p.files.length;
        m.set(p.component, [...(m.get(p.component) ?? []), { key: g.key, files: held || 1, whole: p.files === null }]);
      }
    }
    return m;
  });
  const placedIn = computed(() => {
    const m = new Map<string, string>();
    for (const [id, parts] of shares.value) {
      // The group holding most of it is the one that speaks for it.
      m.set(id, parts.slice().sort((a, b) => b.files - a.files)[0].key);
    }
    return m;
  });
  /** Split across more than one group: neither wholly here nor wholly there. */
  const splitOf = computed(() => {
    const m = new Map<string, Array<{ key: string; files: number; whole: boolean }>>();
    for (const [id, parts] of shares.value) if (parts.length > 1) m.set(id, parts);
    return m;
  });
  /** Still to sort: nothing has claimed it and it has not been parked. */
  const unplaced = computed(() => allComponents.value.filter(c => !placedIn.value.has(c) && !draft.parked.has(c)));

  // ── Components whose files disagree ────────────────────────────────────
  // The detector's two halves, kept apart deliberately. Scoring a tear means
  // re-measuring the whole cut once per candidate, which is far too much to
  // spend on every click of a dimension that cannot divide anything anyway.
  // So a whole-component dimension pays only for the cheap half — the line,
  // with nothing attached about what drawing it would be worth, which is all
  // it is entitled to say.

  /** file → the components it imports; the snapshot records imports this way. */
  const importsOf = computed(() => {
    const m = new Map<string, Map<string, number>>();
    for (const e of suggest.sources.value?.fileRefs ?? []) {
      const row = m.get(e.from) ?? new Map<string, number>();
      row.set(e.to, (row.get(e.to) ?? 0) + e.references);
      m.set(e.from, row);
    }
    return m;
  });

  const tearInput = computed<TearInput>(() => {
    const files = new Map<string, string[]>();
    for (const c of allComponents.value) files.set(c, filesOf(c));
    return { filesOf: files, importsOf: importsOf.value, groupOf: placedIn.value };
  });

  /**
   * Scored offers, for the members of one group only. Scoring a tear means
   * re-measuring the whole cut, so doing it for all four hundred components
   * costs about 70ms on the Broadleaf snapshot — far too much to spend again
   * on every click. The marker only ever appears in the group you have open,
   * so that is the set worth scoring, and it costs a twentieth of that.
   */
  function tearsFor(components: string[]): Map<string, Tear> {
    if (draft.grain !== "file" || components.length === 0) return new Map();
    return new Map(tearsAmong(tearInput.value, components).map(t => [t.component, t]));
  }

  /**
   * How many placed components have files that disagree. The cheap half of
   * the detector: the line only, with no claim about what splitting would
   * buy, so it stays affordable over the whole codebase. A fact about the
   * cut rather than an offer, which is why a whole-component dimension is
   * allowed to say it — at the grain control, the one place it could be
   * acted on, and nowhere else.
   */
  const tornCount = computed(() => {
    const ti = tearInput.value;
    let n = 0;
    for (const c of ti.groupOf.keys()) {
      if ((ti.filesOf.get(c)?.length ?? 0) < 6) continue;
      const line = proposeTear(ti, c);
      if (line && Math.min(line.leaving.length, line.staying.length) >= 3) n++;
    }
    return n;
  });

  // ── The queue of questions ─────────────────────────────────────────────
  // One piece of memory shapes it: the bundles the user asked to be cut finer.
  const finer = ref(new Set<string>());

  /**
   * Later is a lap, not a pile. When nothing unparked is left, everything set
   * aside comes back and the round starts again, so a deferral can never
   * strand anything and there is no second place to go and finish up.
   */
  const reshuffled = ref(0);
  /** How much was placed when the lap last turned over. */
  let placedAtTurn = -1;
  watch(
    () => [unplaced.value.length, draft.later.length, placedIn.value.size] as const,
    ([free, later, placed]) => {
      // Before the snapshot is read the pool is empty for an innocent reason,
      // and a lap turned over then would silently empty a restored draft.
      if (allComponents.value.length === 0) return;
      if (free > 0 || later === 0) return;
      // Turning over without having placed anything since the last turn would
      // hand back the same question that was just set aside. Wait instead.
      if (placed === placedAtTurn) return;
      placedAtTurn = placed;
      reshuffled.value = draft.reshuffle();
    },
    { immediate: true },
  );

  /**
   * What the sort is near right now: the group last added to. The queue leans
   * towards whatever leans towards it, so a domain gets finished in a run
   * instead of arriving in pieces between everything else.
   */
  const near = ref<string | null>(null);
  function noteTouched(key: string | null) { near.value = key; }

  const bundles = computed<Bundle[]>(() => {
    const base = bundleFor(way.value, unplaced.value, bundleCtx.value);
    // A bundle with nothing left in it is not a question: splitting one, or
    // placing its last member elsewhere, can leave the husk behind.
    const expanded = base.flatMap(b => {
      if (!finer.value.has(b.groupKey)) return [b];
      const parts = splitBundle(b, linesOf, style.value);
      return parts.length ? parts : [b];
    }).filter(b => b.members.length > 0);
    const group = near.value ? draft.groupByKey(near.value) : null;
    if (!group || group.parts.length === 0) return expanded;
    // Re-read after every placement: what was distant can now be adjacent.
    const members = group.parts.map(p => p.component);
    const pull = new Map(expanded.map(b => [b.key, affinityTo2(b.members, members, index.value)]));
    return expanded.slice().sort((a, b) => (pull.get(b.key) ?? 0) - (pull.get(a.key) ?? 0));
  });
  const question = computed<Bundle | null>(() => bundles.value[0] ?? null);
  /** What comes after this one, so the queue feels finite. */
  const upNext = computed(() => bundles.value.slice(1, 4));

  function splitHere(bundle: Bundle) {
    finer.value = new Set([...finer.value, bundle.groupKey]);
  }
  function canSplit(bundle: Bundle | null) {
    return !!bundle && bundle.members.length > 1 && splitBundle(bundle, linesOf, style.value).length > 1;
  }

  /** Association strengths for the two couplings, under the current way. */
  const couplings = computed(() => (input.value ? buildCouplings(input.value, way.value.weights, way.value.structure) : null));

  const groupRefs = computed<GroupRef[]>(() => draft.groups.map(g => ({ key: g.key, name: g.name, members: g.parts.map(p => p.component) })));
  const colorOf = (key: string) => GROUP_COLOR_PALETTE[Math.max(0, draft.groups.findIndex(g => g.key === key)) % GROUP_COLOR_PALETTE.length];
  /**
   * Where a set of components could go, best first. Scored by the same bonds
   * the group board uses, so the guess under Enter and the list inside a group
   * can never disagree, and divided by the square root of the group's size:
   * weight alone would hand everything to the biggest group.
   */
  function guessesFor(members: string[], limit = 3) {
    const c = couplings.value;
    if (!c) return [];
    const out = [];
    for (const group of groupRefs.value) {
      if (group.members.length === 0) continue;
      const bonds = bondsTo(group.members, members, c, draft.refusedFor(group.key));
      if (bonds.length === 0) continue;
      const weight = bonds.reduce((n, b) => n + b.value, 0);
      if (weight <= 0) continue;
      const lead = bonds.reduce((a, b) => (b.value > a.value ? b : a));
      out.push({ group, channel: lead.channel, detail: bondBreakdown(lead), score: weight / Math.sqrt(group.members.length) });
    }
    return out.sort((a, b) => b.score - a.score || a.group.name.localeCompare(b.group.name)).slice(0, limit);
  }
  const closest = computed(() => (question.value ? guessesFor(question.value.members, 1)[0] ?? null : null));

  function candidatesFor(key: string, limit = 12) {
    const group = draft.groupByKey(key);
    if (!group) return [];
    return rankCandidates(group.parts.map(p => p.component), unplaced.value, index.value, draft.refusedFor(key), limit);
  }
  /**
   * Everything the pool has to offer this group, not just what the next
   * question happens to contain: the whole unplaced set scored by reference
   * and co-change association, banded against the group's own cohesion.
   */
  function bandsFor(key: string) {
    const group = draft.groupByKey(key);
    const c = couplings.value;
    if (!group || !c) return [];
    const members = group.parts.map(p => p.component);
    const refused = draft.refusedFor(key);
    const pool = grabPool.value.filter(id => !refused.has(id));
    const bonds = bondsTo(members, pool, c, refused);
    // Measured against the other groups too: a component that leans harder
    // somewhere else is not this group's, however hard it leans here.
    const rivals = draft.groups
      .filter(g => g.key !== key && g.parts.length > 0)
      .map(g => ({ name: g.name, size: g.parts.length, bonds: bondsTo(g.parts.map(p => p.component), pool, c, draft.refusedFor(g.key)) }));
    return bandBonds(bonds, cohesionOf(members, c), elsewhere({ size: members.length, bonds }, rivals));
  }
  /** Which group each candidate would rather be in, when it is not this one. */
  function leaningFor(key: string) {
    const group = draft.groupByKey(key);
    const c = couplings.value;
    if (!group || !c) return new Map<string, { name: string; value: number }>();
    const members = group.parts.map(p => p.component);
    const pool = grabPool.value;
    const bonds = bondsTo(members, pool, c, draft.refusedFor(key));
    return elsewhere(
      { size: members.length, bonds },
      draft.groups.filter(g => g.key !== key && g.parts.length > 0).map(g => ({ name: g.name, size: g.parts.length, bonds: bondsTo(g.parts.map(p => p.component), pool, c) })),
    );
  }

  /**
   * Grab reaches further than the queue does: everything that has not landed
   * in a group, including what was set aside, and on request what is already
   * grouped, so a branch can be taken away from where it sits.
   */
  const withPlaced = ref(false);
  const grabPool = computed(() => {
    const out = new Set(draft.out);
    return allComponents.value.filter(c => !out.has(c) && (withPlaced.value || !placedIn.value.has(c)));
  });

  const tree = computed(() => packageTree(grabPool.value, linesOf, style.value));
  function take(path: string) { return underPath(path, grabPool.value, style.value); }
  function search(term: string, limit = 400) {
    const q = term.trim().toLowerCase();
    if (q.length < 2) return [];
    return grabPool.value.filter(id => id.toLowerCase().includes(q)).slice(0, limit);
  }
  /**
   * Matches keep their shape. Searching "controller" in a codebase that
   * slices by domain finds one branch per domain, each takeable on its own.
   */
  function searchTree(term: string) {
    const hits = search(term);
    return hits.length ? packageTree(hits, linesOf, style.value) : [];
  }

  const coverage = computed(() => {
    const total = allComponents.value.length;
    const standing = draft.standingCounts;
    let linesTotal = 0;
    let linesPlaced = 0;
    for (const id of allComponents.value) {
      const n = linesOf(id);
      linesTotal += n;
      if (placedIn.value.has(id)) linesPlaced += n;
    }
    return {
      total, placed: placedIn.value.size, unplaced: unplaced.value.length,
      later: draft.later.length, out: draft.out.length, linesTotal, linesPlaced,
      split: splitOf.value.size,
      ...standing,
    };
  });

  /**
   * How good the cut is, not how far along it is. Measured on the reference
   * graph, so it says the same thing however the groups were arrived at.
   */
  /** The reference graph a cut is measured on, so a preview and the rail
   *  can never disagree about what they are measuring. */
  const qualityEdges = computed(() => rawEdges.value.map(e => ({ from: e.from, to: e.to, weight: e.weight ?? 1 })));

  const quality = computed(() => {
    const groups = draft.groups.map(g => ({ key: g.key, name: g.name, members: g.parts.map(p => p.component) }));
    const measured = measureCut(groups, qualityEdges.value, allComponents.value.length);
    return { ...measured, reading: readModularity(measured.modularity, groups.filter(g => g.members.length > 0).length) };
  });

  // ── The map ────────────────────────────────────────────────────────────
  const nodes = computed<CNode[]>(() =>
    allComponents.value.map(id => {
      const key = placedIn.value.get(id);
      const parts = splitOf.value.get(id);
      return {
        id,
        label: id,
        kind: "component" as const,
        group: key ? draft.groupByKey(key)?.name : undefined,
        color: key ? colorOf(key) : undefined,
        lines: linesOf(id),
        // A split component is drawn as the groups that hold it, in the shares
        // they hold: one slice each, so no node can look whole when it is not.
        slices: parts ? parts.map(p => ({ color: colorOf(p.key), share: p.files })) : undefined,
      };
    }),
  );
  const hulls = computed(() =>
    draft.groups
      .map(g => ({ key: g.key, name: g.name, color: colorOf(g.key), members: g.parts.map(p => p.component) }))
      .filter(h => h.members.length >= 2),
  );

  return {
    loading, load, input, index, linesOf, style,
    way, wayId, setWay, fitness, fitnessFor, suggestedNameReading,
    allComponents, unplaced, bundles, filesOf, shares, splitOf, question, upNext, closest, guessesFor, groupRefs, colorOf,
    splitHere, canSplit, reshuffled, near, noteTouched, tearsFor, tornCount,
    candidatesFor, bandsFor, leaningFor, couplings, tree, take, search, searchTree, coverage, grabPool, withPlaced,
    quality, qualityEdges,
    nodes, edges: rawEdges, hulls,
  };
}
