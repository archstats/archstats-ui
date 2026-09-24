import { describe, expect, it } from "vitest";
import { findTears, keptInside, ownersOf, proposeTear, scoreTear, tearsAmong, type TearInput } from "./tear";

// Tests for the split detector, written the way the detector has to be judged:
// not "does it find something" — anything finds something — but does it find
// the right line, and does it REFUSE the rest. A detector that splits whenever
// it can is worse than no detector, because every bad split costs an architect
// the time to undo it and a little of their trust.
//
// The first fixture is real. It is org.broadleafcommerce.common.time as the
// snapshot actually records it: nine files, five of them BroadleafEnumerationType
// implementations that import the common module, four of them the TimeSource
// machinery that imports almost nothing, and the real inbound imports from the
// admin rule builder and common that a split has to pay for.

const time = "org.broadleafcommerce.common.time";
const common = "org.broadleafcommerce.common";
const release = "org.broadleafcommerce.common.classloader.release";
const options = "org.broadleafcommerce.admin.web.rulebuilder.service.options";

/** The five enums, which import the common module. */
const ENUMS = ["MonthType", "HourOfDayType", "MinuteType", "DayOfWeekType", "DayOfMonthType"];
/** The clock, which does not. SystemTime reaches for the classloader instead. */
const CLOCK = ["SystemTime", "TimeSource", "DefaultTimeSource", "FixedTimeSource"];

function broadleaf(): TearInput {
  const filesOf = new Map<string, string[]>([
    [time, [...ENUMS, ...CLOCK].map(n => `time/${n}.java`)],
    [common, Array.from({ length: 5 }, (_, i) => `common/C${i}.java`)],
    [release, ["release/Release.java"]],
    [options, Array.from({ length: 7 }, (_, i) => `options/O${i}.java`)],
  ]);
  const importsOf = new Map<string, Map<string, number>>();
  for (const n of ENUMS) importsOf.set(`time/${n}.java`, new Map([[common, 1]]));
  importsOf.set("time/SystemTime.java", new Map([[release, 1]]));
  // What it costs to split: everything importing the component as a whole.
  for (let i = 0; i < 7; i++) importsOf.set(`options/O${i}.java`, new Map([[time, 1]]));
  for (let i = 0; i < 5; i++) importsOf.set(`common/C${i}.java`, new Map([[time, 1]]));

  const groupOf = new Map<string, string>([
    [time, time],
    [common, common],
    [release, "org.broadleafcommerce.common.classloader"],
    [options, "org.broadleafcommerce.admin.web"],
  ]);
  return { filesOf, importsOf, groupOf };
}

describe("the line a real torn component is cut along", () => {
  it("separates the enums from the clock in org.broadleafcommerce.common.time", () => {
    const line = proposeTear(broadleaf(), time)!;
    expect(line).not.toBeNull();
    expect(line.home).toBe(time);
    // Five files lean at the common module; one reaches for the classloader
    // and is outvoted, which is right — a single file is not a second design.
    expect(line.rival).toBe(common);
    expect(line.leaving.map(f => f.replace(/^time\/|\.java$/g, "")).sort()).toEqual([...ENUMS].sort());
    expect(line.staying.map(f => f.replace(/^time\/|\.java$/g, "")).sort()).toEqual([...CLOCK].sort());
  });

  it("offers it, having paid for the twelve references that point at the whole", () => {
    const { tears } = findTears(broadleaf(), { minPart: 3 });
    expect(tears.map(t => t.component)).toEqual([time]);
    expect(tears[0].gain).toBeGreaterThan(0);
  });

  it("never claims more than it delivers: the gains add up to the measured cut", () => {
    // The invariant that stops a detector quietly reporting a number it did
    // not achieve — every gain is a difference of the same measure.
    const input = broadleaf();
    const before = keptInside(input);
    const { tears } = findTears(input, { minPart: 3 });
    const splits = new Map(tears.map(t => [t.component, new Set(t.leaving)]));
    const rivals = new Map(tears.map(t => [t.component, t.rival]));
    const after = keptInside(input, splits, rivals);
    expect(after - before).toBeCloseTo(tears.reduce((n, t) => n + t.gain, 0), 10);
    expect(after).toBeGreaterThan(before);
  });
});

describe("what it refuses, which is most of what it is shown", () => {
  /** A component whose files all want the same thing. */
  function agreed(): TearInput {
    const files = Array.from({ length: 8 }, (_, i) => `a/A${i}.java`);
    return {
      filesOf: new Map([["a", files], ["b", ["b/B.java"]]]),
      importsOf: new Map(files.map(f => [f, new Map([["b", 2]])])),
      groupOf: new Map([["a", "G"], ["b", "G"]]),
    };
  }

  it("draws no line through a component that agrees with itself", () => {
    // Everything here imports the same place, and that place is already in
    // this group. There is no second answer, so there is nothing to offer.
    const { tears, refused } = findTears(agreed(), { minPart: 3 });
    expect(tears).toEqual([]);
    expect(refused.get("a")).toBe("agreed");
  });

  it("calls a single dissenting file an exception, not a structure", () => {
    const files = Array.from({ length: 8 }, (_, i) => `a/A${i}.java`);
    const importsOf = new Map(files.map(f => [f, new Map([["b", 2]])]));
    // One file looks elsewhere. It is right that this is visible; it is wrong
    // that it should carve the component in two.
    importsOf.set(files[0], new Map([["c", 9]]));
    const input: TearInput = {
      filesOf: new Map([["a", files], ["b", ["b/B.java"]], ["c", ["c/C.java"]]]),
      importsOf,
      groupOf: new Map([["a", "A"], ["b", "A"], ["c", "C"]]),
    };
    const { tears, refused } = findTears(input, { minPart: 3 });
    expect(tears).toEqual([]);
    expect(refused.get("a")).toBe("sliver");
    // The line itself is still findable — the guard is about offering it.
    expect(proposeTear(input, "a")!.leaving).toEqual([files[0]]);
  });

  it("calls a component that mostly wants to leave misplaced, not torn", () => {
    // Twenty-two of twenty-six files leaning elsewhere is not a component
    // with two halves; it is a component in the wrong group. Offering to
    // "split" it would be dressing a misplacement up as a design, and the
    // studio already has a one-click Move for this.
    const mine = Array.from({ length: 26 }, (_, i) => `a/F${i}.java`);
    const importsOf = new Map<string, Map<string, number>>();
    mine.forEach((f, i) => importsOf.set(f, new Map([[i < 22 ? "b" : "a", 1]])));
    const input: TearInput = {
      filesOf: new Map([["a", mine], ["b", ["b/B.java"]]]),
      importsOf,
      groupOf: new Map([["a", "A"], ["b", "B"]]),
    };
    expect(proposeTear(input, "a")!.leaving.length).toBe(22);
    expect(scoreTear(input, "a", { minPart: 3 }).refused).toBe("misplaced");
    expect(findTears(input, { minPart: 3 }).tears).toEqual([]);
  });

  it("still offers a near-even split, which is a tear and not a misplacement", () => {
    // The guard is a ratio, not a majority, because the best-validated tear
    // in the Broadleaf snapshot leaves five of nine. A bare majority rule
    // would have thrown it away.
    const { tears } = findTears(broadleaf(), { minPart: 3 });
    expect(tears.map(t => t.component)).toEqual([time]);
    expect(tears[0].leaving.length).toBeGreaterThan(tears[0].staying.length);
  });

  it("refuses to shred a component everything else depends on", () => {
    // This is the guard that matters. `core` is genuinely torn — half its
    // files lean one way, half the other — but forty other files import it as
    // a whole, and dividing it makes every one of those references half-cross
    // a boundary. The cut is worse afterwards, so it is not offered.
    const mine = Array.from({ length: 8 }, (_, i) => `core/F${i}.java`);
    const importsOf = new Map<string, Map<string, number>>();
    mine.forEach((f, i) => importsOf.set(f, new Map([[i < 4 ? "x" : "y", 1]])));
    const dependants: Array<[string, string[]]> = [];
    const dep: string[] = [];
    for (let i = 0; i < 40; i++) { dep.push(`dep/D${i}.java`); importsOf.set(`dep/D${i}.java`, new Map([["core", 3]])); }
    dependants.push(["dep", dep]);

    const input: TearInput = {
      filesOf: new Map([["core", mine], ["x", ["x/X.java"]], ["y", ["y/Y.java"]], ...dependants]),
      importsOf,
      groupOf: new Map([["core", "CORE"], ["x", "X"], ["y", "Y"], ["dep", "CORE"]]),
    };
    // The line is real and both sides are substantial...
    const line = proposeTear(input, "core")!;
    expect(line.leaving.length).toBe(4);
    expect(line.staying.length).toBe(4);
    // ...and it is still refused, because drawing it costs more than it pays.
    const { tears, refused } = findTears(input, { minPart: 3 });
    expect(tears.map(t => t.component)).not.toContain("core");
    expect(refused.get("core")).toBe("no gain");
  });
});

describe("scoring one component at a time, which is what the studio does", () => {
  it("gives the same answer as the full sweep when there is one tear to find", () => {
    // Two routes into the same measure, and the cheap one is what ships. It
    // must not quietly disagree with the one that was validated.
    const input = broadleaf();
    const swept = findTears(input, { minPart: 3 }).tears;
    const scoped = tearsAmong(input, input.filesOf.keys(), { minPart: 3 });
    expect(scoped.map(t => t.component)).toEqual(swept.map(t => t.component));
    expect(scoped[0].gain).toBeCloseTo(swept[0].gain, 12);
    expect(scoped[0].leaving.sort()).toEqual(swept[0].leaving.sort());
  });

  it("carries the same refusals, so a scoped view is not a laxer one", () => {
    const files = Array.from({ length: 8 }, (_, i) => `a/A${i}.java`);
    const importsOf = new Map(files.map(f => [f, new Map([["b", 2]])]));
    importsOf.set(files[0], new Map([["c", 9]]));
    const input: TearInput = {
      filesOf: new Map([["a", files], ["b", ["b/B.java"]], ["c", ["c/C.java"]]]),
      importsOf,
      groupOf: new Map([["a", "A"], ["b", "A"], ["c", "C"]]),
    };
    expect(scoreTear(input, "a", { minPart: 3 }).refused).toBe("sliver");
    expect(tearsAmong(input, ["a"], { minPart: 3 })).toEqual([]);
  });

  it("says nothing about a component too small to divide", () => {
    const input: TearInput = {
      filesOf: new Map([["a", ["a/A.java", "a/B.java"]], ["b", ["b/B.java"]]]),
      importsOf: new Map([["a/A.java", new Map([["b", 1]])]]),
      groupOf: new Map([["a", "A"], ["b", "B"]]),
    };
    // Not refused for a reason — there was never a question to answer.
    expect(scoreTear(input, "a", { minPart: 3 })).toEqual({ tear: null, refused: null });
  });
});

describe("the detector, measured against a planted answer", () => {
  // A benchmark rather than an example: plant components that really are two
  // things and components that really are one, hide which is which, and count
  // what comes back. Mirrors the shape of the live Broadleaf run, where the
  // detector split 65 of 154 candidates and the splits it did offer landed on
  // a git co-change boundary 71% of the time against a null of 50%.
  const TORN = 12;
  const WHOLE = 24;
  const PER = 8;

  function planted(): { input: TearInput; torn: Set<string> } {
    const filesOf = new Map<string, string[]>();
    const importsOf = new Map<string, Map<string, number>>();
    const groupOf = new Map<string, string>();
    const torn = new Set<string>();

    // Two poles every component can lean towards, each a group of its own.
    for (const pole of ["north", "south"]) {
      filesOf.set(pole, [`${pole}/P.java`]);
      groupOf.set(pole, pole.toUpperCase());
    }

    for (let i = 0; i < TORN + WHOLE; i++) {
      const c = `c${i}`;
      const files = Array.from({ length: PER }, (_, k) => `${c}/F${k}.java`);
      filesOf.set(c, files);
      groupOf.set(c, "NORTH");
      const isTorn = i < TORN;
      if (isTorn) torn.add(c);
      files.forEach((f, k) => {
        // A torn component's files disagree: half reach north, half south.
        // A whole one's files all reach the same way.
        const pole = isTorn && k >= PER / 2 ? "south" : "north";
        importsOf.set(f, new Map([[pole, 2]]));
      });
    }
    return { input: { filesOf, importsOf, groupOf }, torn };
  }

  it("finds the planted tears and leaves the whole components alone", () => {
    const { input, torn } = planted();
    const { tears } = findTears(input, { minPart: 3, limit: 100 });
    const found = new Set(tears.map(t => t.component));
    const hits = [...found].filter(c => torn.has(c)).length;

    // Recall: every planted tear is offered.
    expect(hits).toBe(TORN);
    // Precision: and nothing else is. This is the half that matters — a
    // detector that also offered the twenty-four whole components would be
    // asking the architect to say no twenty-four times for nothing.
    expect(found.size).toBe(TORN);
    // And it cuts them in the right place.
    for (const t of tears) expect(t.leaving.length).toBe(PER / 2);
  });

  it("splits nothing at all in a codebase that is not torn", () => {
    // The most important case, and the one a detector built to impress would
    // fail: when there is nothing to find, find nothing.
    const { input } = planted();
    for (const [c, files] of input.filesOf) {
      if (c === "north" || c === "south") continue;
      for (const f of files) input.importsOf.set(f, new Map([["north", 2]]));
    }
    const { tears } = findTears(input, { minPart: 3, limit: 100 });
    expect(tears).toEqual([]);
  });

  it("owners are read off the components, not guessed from the path", () => {
    const { input } = planted();
    expect(ownersOf(input).get("c0/F0.java")).toBe("c0");
  });
});
