import { describe, expect, it } from "vitest"
import { globToRegExp, isBlankQuery, isLive, isLiteral, literalQuery, parseQuery, runQuery, SEARCH_SEED, type QueryWorld } from "~/utils/query"

// Real names from the qp-visualizer snapshot. A fixture of `a.b.c` proves the
// regex works; these prove it works on the thing it is for — a codebase whose
// packages are `<product>.<domain>.<role>` with a `common` nobody can escape.
const COMPONENTS = [
  "com.fedex.qp.shipdoc",
  "com.fedex.qp.shipdoc.controller",
  "com.fedex.qp.shipdoc.processor",
  "com.fedex.qp.shipdoc.processor.reader",
  "com.fedex.qp.shipdoc.service.impl",
  "com.fedex.qp.shipdoc.dto.timezone.request",
  "com.fedex.qp.booking.controller",
  "com.fedex.qp.booking.dao",
  "com.fedex.qp.mail.dao.impl",
  "com.fedex.qp.common.epic.service",
  "com.fedex.qp.customer.ratc.request",
  "com.fedex.qp.spre",
]

const FILES = [
  "repos/eai-3540597-qp-shipdoc/src/main/java/com/fedex/qp/shipdoc/controller/ShipmentController.java",
  "repos/eai-3540597-qp-shipdoc/src/test/java/com/fedex/qp/shipdoc/controller/ShipmentControllerTest.java",
  "repos/eai-3540597-qp-mss/src/main/java/com/fedex/qp/mss/configuration/AsyncConfiguration.java",
  "repos/eai-3540597-qp-user/src/main/java/com/fedex/qp/user/mapper/BrokerInfoMapper.java",
]

const LINES: Record<string, number> = {
  "com.fedex.qp.shipdoc.processor": 2400,
  "com.fedex.qp.common.epic.service": 5100,
  "com.fedex.qp.booking.controller": 300,
}

const world = (over: Partial<QueryWorld> = {}): QueryWorld => ({
  components: COMPONENTS,
  files: FILES,
  componentSep: ".",
  metric: (kind, id, metric) => (kind === "component" && metric === "lines" ? LINES[id] : undefined),
  ...over,
})

const run = (text: string, over: Partial<QueryWorld> = {}) => runQuery(parseQuery(text), world(over))
const comps = (text: string, over: Partial<QueryWorld> = {}) => run(text, over).components.sort()

describe("globs", () => {
  it("keeps `*` inside a segment and lets `**` cross them", () => {
    expect(globToRegExp("com.fedex.qp.*", ".").test("com.fedex.qp.spre")).toBe(true)
    expect(globToRegExp("com.fedex.qp.*", ".").test("com.fedex.qp.booking.dao")).toBe(false)
    expect(globToRegExp("com.fedex.qp.**", ".").test("com.fedex.qp.booking.dao")).toBe(true)
  })

  it("includes the stem: everything under shipdoc includes shipdoc", () => {
    const rx = globToRegExp("com.fedex.qp.shipdoc.**", ".")
    expect(rx.test("com.fedex.qp.shipdoc")).toBe(true)
    expect(rx.test("com.fedex.qp.shipdoc.processor.reader")).toBe(true)
    // and does not reach a sibling that merely starts with the same letters
    expect(rx.test("com.fedex.qp.shipdocs")).toBe(false)
  })

  it("matches a trailing role across any number of segments", () => {
    const rx = globToRegExp("**.controller", ".")
    expect(rx.test("com.fedex.qp.booking.controller")).toBe(true)
    expect(rx.test("controller")).toBe(true)
    expect(rx.test("com.fedex.qp.booking.controller.advice")).toBe(false)
  })

  it("spans the middle, and still matches with nothing in between", () => {
    const rx = globToRegExp("com.**.dao", ".")
    expect(rx.test("com.fedex.qp.booking.dao")).toBe(true)
    expect(rx.test("com.dao")).toBe(true)
    expect(rx.test("com.fedex.qp.mail.dao.impl")).toBe(false)
  })

  it("reads `**` with no separator around it as `contains`", () => {
    expect(globToRegExp("**shipdoc**", ".").test("com.fedex.qp.shipdoc.controller")).toBe(true)
  })

  it("treats a multi-character separator as one break, not a set of letters", () => {
    const rx = globToRegExp("Acme::*", "::")
    expect(rx.test("Acme::Order")).toBe(true)
    expect(rx.test("Acme::Order::Line")).toBe(false)
    // `[^::]` would have excluded a bare colon and let the second segment through
    expect(globToRegExp("Acme::**", "::").test("Acme::Order::Line")).toBe(true)
  })

  it("uses `/` for files without being told", () => {
    const rx = globToRegExp("repos/*/src/**", "/")
    expect(rx.test("repos/eai-3540597-qp-mss/src/main/java/Foo.java")).toBe(true)
    expect(rx.test("repos/a/b/src/main/Foo.java")).toBe(false)
  })
})

describe("parsing", () => {
  it("skips blanks and comments and keeps the line numbers the editor shows", () => {
    const q = parseQuery("# the domain\n\ncom.fedex.qp.shipdoc.**\n!**.dto.**")
    expect(q.lines.map(l => l.no)).toEqual([3, 4])
    expect(q.lines[1].exclude).toBe(true)
    expect(q.errors).toEqual([])
  })

  it("does not mistake a word inside a name for a keyword", () => {
    const q = parseQuery("com.example.warehouse")
    expect(q.errors).toEqual([])
    expect(q.lines[0].source).toEqual({ kind: "glob", pattern: "com.example.warehouse" })
  })

  it("reads a where clause, and an `and` between two of them", () => {
    const q = parseQuery("components where lines > 2000 and efferent >= 20")
    expect(q.lines[0].source).toEqual({ kind: "all", unit: "component" })
    expect(q.lines[0].conds).toEqual([
      { metric: "lines", op: ">", value: 2000 },
      { metric: "efferent", op: ">=", value: 20 },
    ])
  })

  it("reads a bare metric as asking whether there is any at all", () => {
    expect(parseQuery("components where cycles").lines[0].conds).toEqual([{ metric: "cycles", op: ">", value: 0 }])
  })

  it("reports a bad line without losing the good ones", () => {
    const q = parseQuery("com.fedex.qp.shipdoc.**\ncomponents where lines >\n**.controller")
    expect(q.lines.map(l => l.no)).toEqual([1, 3])
    expect(q.errors).toHaveLength(1)
    expect(q.errors[0].no).toBe(2)
  })
})

describe("running", () => {
  it("unions the lines", () => {
    expect(comps("com.fedex.qp.booking.**\ncom.fedex.qp.mail.**")).toEqual([
      "com.fedex.qp.booking.controller",
      "com.fedex.qp.booking.dao",
      "com.fedex.qp.mail.dao.impl",
    ])
  })

  it("subtracts exclusions wherever they sit, so line order never decides the answer", () => {
    const after = comps("com.fedex.qp.shipdoc.**\n!**.dto.**")
    const before = comps("!**.dto.**\ncom.fedex.qp.shipdoc.**")
    expect(after).toEqual(before)
    expect(after).not.toContain("com.fedex.qp.shipdoc.dto.timezone.request")
    expect(after).toContain("com.fedex.qp.shipdoc.controller")
  })

  it("says which line put each unit in, and which took it out", () => {
    const r = run("com.fedex.qp.shipdoc.**\n!**.dto.**")
    expect(r.matchedBy.get("com.fedex.qp.shipdoc.controller")).toBe(1)
    expect(r.excludedBy.get("com.fedex.qp.shipdoc.dto.timezone.request")).toBe(2)
  })

  it("reports a line that matches nothing, which is the whole point of a query", () => {
    // What a rename looks like on the next scan.
    const r = run("com.fedex.qp.shipdoc.**\ncom.fedex.qp.shipping_docs.**")
    expect(r.empty).toEqual([2])
  })

  it("needs no prefix to tell a package from a path", () => {
    const r = run("com.fedex.qp.shipdoc.**\nrepos/*/src/main/**")
    expect(r.components).toContain("com.fedex.qp.shipdoc.controller")
    expect(r.files).toContain(FILES[0])
    expect(r.files).not.toContain(FILES[1]) // src/test, not src/main
  })

  it("intersects inside a line and unions across them", () => {
    // Big shipdoc components, plus all of booking however small.
    expect(comps("com.fedex.qp.shipdoc.** where lines > 2000\ncom.fedex.qp.booking.**")).toEqual([
      "com.fedex.qp.booking.controller",
      "com.fedex.qp.booking.dao",
      "com.fedex.qp.shipdoc.processor",
    ])
  })

  it("excludes by metric as well as by name", () => {
    expect(comps("com.fedex.qp.**\n!components where lines > 5000")).not.toContain("com.fedex.qp.common.epic.service")
  })

  it("fails a condition the snapshot cannot measure rather than passing it", () => {
    // Otherwise a query about size quietly includes everything when nothing
    // was measured, which is the worst way to be wrong.
    expect(comps("components where lines < 10")).toEqual([])
    expect(comps("components where nonsense > 1")).toEqual([])
  })

  it("keeps the two unit kinds apart when asked", () => {
    const r = run("files where lines > 0", { metric: (kind) => (kind === "file" ? 1 : 5) })
    expect(r.components).toEqual([])
    expect(r.files).toHaveLength(FILES.length)
  })

  it("detects the separator when nobody supplies one", () => {
    const r = runQuery(parseQuery("com.fedex.qp.booking.**"), { components: COMPONENTS, files: [] })
    expect(r.components.sort()).toEqual(["com.fedex.qp.booking.controller", "com.fedex.qp.booking.dao"])
  })
})

describe("what kind of thing a query is", () => {
  it("calls a name-only query stable and a metric query live", () => {
    expect(isLive(parseQuery("com.fedex.qp.shipdoc.**"))).toBe(false)
    expect(isLive(parseQuery("com.fedex.qp.shipdoc.** where lines > 100"))).toBe(true)
  })

  it("recognises a hand-picked selection, which is a query with no wildcards", () => {
    const text = literalQuery(["com.fedex.qp.booking.dao", "com.fedex.qp.mail.dao.impl"])
    expect(isLiteral(parseQuery(text))).toBe(true)
    expect(isLiteral(parseQuery("**.dao"))).toBe(false)
    expect(comps(text)).toEqual(["com.fedex.qp.booking.dao", "com.fedex.qp.mail.dao.impl"])
  })
})

describe("a search that asks nothing", () => {
  it("treats the seed and anything else made only of stars as no filter", () => {
    // Opened and closed without typing, this must not leave a view in a
    // filtered state that matches everything and offers a clear button.
    expect(isBlankQuery(SEARCH_SEED)).toBe(true)
    expect(isBlankQuery("")).toBe(true)
    expect(isBlankQuery("  **  ")).toBe(true)
    expect(isBlankQuery("# just a comment")).toBe(true)
  })

  it("counts anything with a word in it as a real query", () => {
    expect(isBlankQuery("**cms**")).toBe(false)
    expect(isBlankQuery("**\n**.controller")).toBe(false)
  })

  it("becomes a substring search when a word is typed between the stars", () => {
    const typed = SEARCH_SEED.slice(0, 2) + "catalog" + SEARCH_SEED.slice(2)
    expect(typed).toBe("**catalog**")
    const world: QueryWorld = {
      components: ["org.acme.catalog.core", "org.acme.order", "catalogue.tools"],
      files: [],
      componentSep: ".",
    }
    expect(runQuery(parseQuery(typed), world).components).toEqual(["org.acme.catalog.core", "catalogue.tools"])
  })
})

describe("contains", () => {
  const world = {
    components: ["pay", "order", "cart"],
    files: ["pay/Gateway.java", "pay/Refund.java", "order/Order.java"],
    componentSep: ".",
  }
  const found = { components: new Set(["pay"]), files: new Set(["pay/Gateway.java"]) }

  it("reads a quoted text or a single word", () => {
    expect(parseQuery('contains "raw sql"').lines[0].source).toEqual({ kind: "contains", needle: "raw sql" })
    expect(parseQuery("contains gateway").lines[0].source).toEqual({ kind: "contains", needle: "gateway" })
    expect(parseQuery("contains raw sql").errors).toHaveLength(1)
  })

  it("answers from the code search and subtracts like any line", () => {
    const r = runQuery(parseQuery('contains "gateway"\n!pay/Gateway.java'), { ...world, contains: () => found })
    expect(r.components).toEqual(["pay"])
    expect(r.files).toEqual([])
    expect(r.empty).toEqual([])
  })

  it("is pending, not empty, while the search runs", () => {
    const r = runQuery(parseQuery('contains "gateway"'), { ...world, contains: () => undefined })
    expect(r.components).toEqual([])
    expect(r.empty).toEqual([])
    expect(r.pending).toEqual([1])
  })
})
