import { describe, expect, it } from "vitest";
import { EMPTY_SOURCES, buildSuggestInput, type SignalSources } from "./suggest";
import { bondsTo, buildCouplings } from "./bond";
import { measureCut } from "./cutQuality";
import { STUDIO_WEIGHTS } from "./studio";

// A benchmark, not an example. The relevance engine is a ranking problem, so
// it is judged the way ranking problems are judged: plant a structure, hide
// it from the scorer, seed a group with a few of its members and measure how
// much of the rest comes back in the top ten.
//
// The planted log mirrors what BroadleafCommerce actually looks like: tight
// domains, and a handful of sweeping commits that couple unrelated things
// because someone changed a licence header. The figures these guard were
// measured on the real snapshot:
// association normalisation took precision@10 from 0.088 to 0.325 across 24
// held-out domain packages, and weighting each commit by its size took it from
// 0.325 to 0.354.

const DOMAINS = 6;
const PER = 8;
/**
 * Named so the names say nothing. Every unit is a sibling under one package,
 * so path proximity is uniform and scores nothing, and each leaf is unique so
 * no name token is shared. What is left is the coupling, which is the point.
 */
const id = (i: number) => `com.shop.unit${i}`;
const components = Array.from({ length: DOMAINS * PER }, (_, i) => id(i));
const domainOf = (i: number) => Math.floor(i / PER);
const membersOf = (d: number) => Array.from({ length: PER }, (_, i) => id(d * PER + i));

/**
 * A commit log with the two kinds of commit every repository has. Focused
 * commits touch two units of one domain and are real evidence. Sweeps touch
 * half the codebase — a licence header, a rename, a formatting pass — and are
 * evidence of nothing, but there are enough of them to drown the rest.
 */
function commits(): string[][] {
  const log: string[][] = [];
  for (let d = 0; d < DOMAINS; d++) {
    const mem = membersOf(d);
    for (let i = 0; i < PER; i++) {
      for (let j = i + 1; j < PER; j++) for (let k = 0; k < 5; k++) log.push([mem[i], mem[j]]);
    }
  }
  const swept = components.filter((_, i) => i % 2 === 0);
  for (let s = 0; s < 30; s++) log.push(swept);
  return log;
}

/**
 * The two ways of reading a commit log. Flat counting says a sweep touching
 * half the codebase couples every pair in it as hard as a two-file commit
 * does. Weighting says a commit is evidence in proportion to how focused it
 * was, and a sweep past the cap is no evidence at all.
 */
function cochangeFrom(log: string[][], weighted: boolean) {
  const pair = new Map<string, number>();
  for (const touched of log) {
    const n = touched.length;
    if (n < 2) continue;
    if (weighted && n > 20) continue;
    const w = weighted ? 1 / (n - 1) : 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const k = touched[i] < touched[j] ? `${touched[i]}|${touched[j]}` : `${touched[j]}|${touched[i]}`;
        pair.set(k, (pair.get(k) ?? 0) + w);
      }
    }
  }
  return Array.from(pair, ([k, count]) => { const [from, to] = k.split("|"); return { from, to, count }; });
}

function sources(over: Partial<SignalSources>): SignalSources {
  return { ...EMPTY_SOURCES, components, files: components.map(c => ({ name: c + ".File", component: c })), ...over };
}

/**
 * Precision@10: seed three units of a domain, rank everything else, and count
 * how much of the top ten really belongs. Five of eight are held out, so half
 * is the ceiling.
 */
function precisionAt10(src: SignalSources) {
  const c = buildCouplings(buildSuggestInput(src, "component"), STUDIO_WEIGHTS);
  let total = 0;
  for (let d = 0; d < DOMAINS; d++) {
    const mem = membersOf(d);
    const seed = mem.slice(0, 3);
    const truth = new Set(mem.slice(3));
    const ranked = bondsTo(seed, components, c).map(b => b.id).slice(0, 10);
    total += ranked.filter(x => truth.has(x)).length / 10;
  }
  return total / DOMAINS;
}

describe("the relevance engine, measured", () => {
  const log = commits();
  const refs: Array<{ from: string; to: string; references: number }> = [];

  it("weighs a focused commit far above a sweep", () => {
    // The mechanism, measured directly. On the real snapshot this is what
    // took the strongest pair in the codebase — a vendor monitor handler and
    // the catalog domain — from 719 shared commits to a weight of 0.75.
    // Both pairs are swept together thirty times; only the first also shares
    // a domain, so only it has focused commits behind it.
    const focusedPair = [id(0), id(2)].sort().join("|");
    const sweptOnly = [id(0), id(PER)].sort().join("|");
    const ratio = (rows: Array<{ from: string; to: string; count: number }>) => {
      const at = (k: string) => rows.find(r => [r.from, r.to].sort().join("|") === k)?.count ?? 0;
      return at(focusedPair) / Math.max(1e-9, at(sweptOnly));
    };
    const flat = ratio(cochangeFrom(log, false));
    const weighted = ratio(cochangeFrom(log, true));
    // Counting flat, a sweep is worth as much per pair as a two-file commit,
    // so the focused pair barely stands out. Weighted, it dominates.
    expect(flat).toBeLessThan(1.5);
    expect(weighted).toBeGreaterThan(flat * 3);
  });

  it("recovers most of a domain from three of its units", () => {
    const p = precisionAt10(sources({ componentRefs: refs, componentCochange: cochangeFrom(log, true) }));
    expect(p).toBeGreaterThan(0.4);
  });

  it("never ranks a stranger above a domain's own member", () => {
    // Association normalisation is what earns this: a unit dragged into
    // thirty sweeps has a large total, so each of those pairings is a small
    // share of it. On the real snapshot this step took precision@10 from
    // 0.088 to 0.325 — by far the largest single gain in the engine.
    const c = buildCouplings(buildSuggestInput(sources({ componentRefs: refs, componentCochange: cochangeFrom(log, true) }), "component"), STUDIO_WEIGHTS);
    for (let d = 0; d < DOMAINS; d++) {
      const ranked = bondsTo(membersOf(d).slice(0, 3), components, c).map(b => b.id);
      const mine = new Set(membersOf(d));
      const lastOwn = ranked.reduce((last, x, i) => (mine.has(x) ? i : last), -1);
      const firstStranger = ranked.findIndex(x => !mine.has(x));
      // A domain whose strangers score nothing at all never lists them, which
      // is the same statement more strongly put.
      if (firstStranger >= 0) expect(firstStranger).toBeGreaterThan(lastOwn);
      else expect(lastOwn).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the cut measure, against known answers", () => {
  // A graph whose structure is known: dense inside each domain, sparse between.
  const edges: Array<{ from: string; to: string; weight: number }> = [];
  for (let d = 0; d < DOMAINS; d++) {
    const mem = membersOf(d);
    for (let i = 0; i < PER; i++) for (let j = i + 1; j < PER; j++) edges.push({ from: mem[i], to: mem[j], weight: 8 });
  }
  for (let d = 0; d < DOMAINS; d++) edges.push({ from: id(d * PER), to: id(((d + 1) % DOMAINS) * PER), weight: 2 });
  const planted = Array.from({ length: DOMAINS }, (_, d) => ({ key: "d" + d, name: "d" + d, members: membersOf(d) }));

  it("scores the planted partition well above a scrambled one", () => {
    const scrambled = Array.from({ length: DOMAINS }, (_, d) => ({
      key: "s" + d, name: "s" + d,
      members: Array.from({ length: PER }, (_, i) => id(((d + i) % DOMAINS) * PER + i)),
    }));
    const good = measureCut(planted, edges, components.length);
    const bad = measureCut(scrambled, edges, components.length);
    expect(good.modularity).toBeGreaterThan(0.7);
    expect(bad.modularity).toBeLessThan(0.1);
    expect(good.kept).toBeGreaterThan(bad.kept * 3);
  });

  it("reads a random partition as no structure at all", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const shuffled = components.slice().sort(() => rnd() - 0.5);
    const random = Array.from({ length: DOMAINS }, (_, d) => ({ key: "r" + d, name: "r" + d, members: shuffled.slice(d * PER, (d + 1) * PER) }));
    expect(measureCut(random, edges, components.length).modularity).toBeLessThan(0.1);
  });
});
