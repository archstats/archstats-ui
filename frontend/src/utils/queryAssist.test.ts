import { describe, expect, it } from "vitest"
import { applySuggestion, assist, coveredBy, highlight, type AssistWorld } from "~/utils/queryAssist"

const COMPONENTS = [
  "com.fedex.qp.shipdoc",
  "com.fedex.qp.shipdoc.controller",
  "com.fedex.qp.shipdoc.processor",
  "com.fedex.qp.shipdoc.processor.reader",
  "com.fedex.qp.booking.controller",
  "com.fedex.qp.booking.dao",
  "com.fedex.qp.mail.dao.impl",
]
const FILES = [
  "repos/qp-shipdoc/src/main/java/Ship.java",
  "repos/qp-mss/src/main/java/Async.java",
]

const world = (over: Partial<AssistWorld> = {}): AssistWorld => ({
  components: COMPONENTS,
  files: FILES,
  sep: ".",
  metrics: [
    { id: "lines", label: "Line Count", hint: "Lines of code" },
    { id: "efferent", label: "Efferent Coupling", hint: "Things it depends on" },
  ],
  valuesOf: () => [10, 20, 30, 40, 100, 400, 900, 5100],
  ...over,
})

const kinds = (line: string, sep = ".") => highlight(line, sep).filter(t => t.text.trim()).map(t => `${t.kind}:${t.text}`)

describe("colour", () => {
  it("separates the two wildcards, because they differ by one character and mean different things", () => {
    expect(kinds("a.*")).toEqual(["text:a", "sep:.", "glob:*"])
    expect(kinds("a.**")).toEqual(["text:a", "sep:.", "glob:**"])
  })

  it("marks the ! that reverses a line and the # that switches it off", () => {
    expect(kinds("!**.dto.**")).toEqual(["bang:!", "glob:**", "sep:.", "text:dto", "sep:.", "glob:**"])
    expect(kinds("# com.example.order.**")).toEqual(["comment:# com.example.order.**"])
  })

  it("colours a condition into its three parts", () => {
    expect(kinds("components where lines > 2000")).toEqual([
      "keyword:components", "keyword:where", "metric:lines", "op:>", "number:2000",
    ])
  })

  it("reads a condition written without spaces", () => {
    expect(kinds("components where lines>2000")).toEqual([
      "keyword:components", "keyword:where", "metric:lines", "op:>", "number:2000",
    ])
  })

  it("does not mistake a word inside a name for a keyword", () => {
    expect(kinds("com.example.warehouse")).toEqual(["text:com", "sep:.", "text:example", "sep:.", "text:warehouse"])
  })

  it("uses the codebase's own delimiter", () => {
    expect(kinds("Acme::Order::*", "::")).toEqual(["text:Acme", "sep:::", "text:Order", "sep:::", "glob:*"])
  })

  it("puts every character back, so what is drawn is what was typed", () => {
    for (const line of ["  !a.**  ", "components where lines > 10 and efferent >= 2", "# off", ""]) {
      expect(highlight(line).map(t => t.text).join("")).toBe(line)
    }
  })
})

describe("suggestions", () => {
  it("offers the three things a line can be when it is empty", () => {
    const a = assist("", 0, world())
    expect(a.items.filter(i => i.kind === "start").map(i => i.label)).toEqual(["a package", "a file path", "a measurement"])
  })

  it("offers recents and saved groups on an empty line, not syntax", () => {
    const a = assist("", 0, world({ recents: ["**.controller"], saved: [{ name: "Shipdoc", query: "com.fedex.qp.shipdoc.**" }] }))
    expect(a.items.find(i => i.kind === "recent")?.label).toBe("**.controller")
    expect(a.items.find(i => i.kind === "group")?.label).toBe("Shipdoc")
  })

  it("offers the next segment with how much of the codebase is under it", () => {
    const a = assist("com.fedex.qp.", 13, world())
    const labels = a.items.map(i => `${i.label} ${i.detail}`)
    // Biggest first: shipdoc has four, booking two, mail one. The exact row
    // says what it alone matches; the ** row carries the count.
    expect(labels[0]).toBe("com.fedex.qp.shipdoc this one")
    expect(labels[1]).toBe("com.fedex.qp.shipdoc.** 4 components")
    expect(labels).toContain("com.fedex.qp.mail.** 1 component")
  })

  it("narrows as the segment is typed", () => {
    const a = assist("com.fedex.qp.book", 17, world())
    expect(a.items.every(i => i.label.startsWith("com.fedex.qp.booking"))).toBe(true)
  })

  it("completes a path against files, using slashes", () => {
    const a = assist("repos/", 6, world())
    expect(a.items.map(i => i.label)).toContain("repos/qp-shipdoc/**")
    expect(a.items[0].detail).toMatch(/file/)
  })

  it("stops completing once the architect has written a wildcard", () => {
    // `com.**` says something we cannot finish for them.
    const a = assist("com.**.x", 8, world())
    expect(a.items).toEqual([])
  })

  it("offers metrics after `where`, with what they are", () => {
    const a = assist("components where li", 19, world())
    expect(a.items.map(i => i.label)).toEqual(["lines"])
    expect(a.items[0].detail).toContain("Line Count")
    // Ready for a threshold, since that is always what comes next.
    expect(a.items[0].insert).toBe("lines > ")
  })

  it("offers where a threshold actually falls, instead of leaving it to a guess", () => {
    const a = assist("components where lines > ", 25, world())
    expect(a.items.map(i => i.label)).toEqual(["40", "400", "900", "5100"])
    expect(a.items[0].detail).toBe("median · 4 above")
    expect(a.items[3].detail).toContain("largest")
  })

  it("replaces only the token being typed", () => {
    const line = "com.fedex.qp.book"
    const a = assist(line, line.length, world())
    const out = applySuggestion(line, a, a.items[0])
    expect(out.line).toBe("com.fedex.qp.booking.**")
    expect(out.caret).toBe(out.line.length)
  })

  it("says nothing inside a switched-off line", () => {
    expect(assist("# com.fedex.", 12, world()).items).toEqual([])
  })
})

describe("a line that adds nothing", () => {
  it("names the line already covering it", () => {
    const lines = ["com.fedex.qp.**", "com.fedex.qp.shipdoc.**"]
    expect(coveredBy(lines[1], lines, COMPONENTS, ".")).toBe(0)
  })

  it("stays quiet when a line pulls its weight", () => {
    const lines = ["com.fedex.qp.booking.**", "com.fedex.qp.shipdoc.**"]
    expect(coveredBy(lines[1], lines, COMPONENTS, ".")).toBeNull()
  })

  it("does not judge a line that matches nothing at all", () => {
    expect(coveredBy("com.nope.**", ["com.nope.**"], COMPONENTS, ".")).toBeNull()
  })

  it("never leaves a fragment behind, whatever is already on the line", () => {
    // A review of the running app saw a line reading
    // `com.fedex.qp.shipdoc.**com.fedex.qp.common.**` and asked whether
    // accepting two suggestions in quick succession could splice them.
    // Accepting always replaces the whole token under the caret, so it
    // cannot: the line is rebuilt, never appended to.
    for (const line of ["com.fedex.qp.book", "!com.fedex.qp.book", "  com.fedex.qp.book"]) {
      const a = assist(line, line.length, world())
      if (!a.items.length) continue
      const out = applySuggestion(line, a, a.items[0])
      expect(out.line).not.toMatch(/\*\*[A-Za-z]/)
      expect(out.line.split("com.fedex").length - 1).toBe(1)
    }
  })

  it("offers nothing once a pattern is already complete, so Enter cannot splice one", () => {
    const done = "com.fedex.qp.shipdoc.**"
    expect(assist(done, done.length, world()).items).toEqual([])
  })
})
