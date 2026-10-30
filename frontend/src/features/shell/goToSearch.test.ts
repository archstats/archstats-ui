import { describe, expect, it } from "vitest"
import { GoIndex, highlightRuns, labelOffset, parseQuery, type GoItem } from "./goToSearch"
import { fuzzyMatch } from "~/shared/fuzzy"

const file = (path: string): GoItem => {
    const slash = path.lastIndexOf("/")
    return { kind: "file", key: path, label: path.slice(slash + 1), text: path, detail: path.slice(0, slash), file: path }
}

describe("parseQuery", () => {
    it("reads a tab prefix and a line suffix", () => {
        expect(parseQuery(">scan")).toEqual({ text: "scan", tab: "actions", line: null })
        expect(parseQuery("@ getCity")).toEqual({ text: "getCity", tab: "symbols", line: null })
        expect(parseQuery("#core")).toEqual({ text: "core", tab: "components", line: null })
        expect(parseQuery("OrderService.java:120")).toEqual({ text: "OrderService.java", tab: null, line: 120 })
        expect(parseQuery("Order:12:4")).toEqual({ text: "Order", tab: null, line: 12 })
        expect(parseQuery("  plain  ")).toEqual({ text: "plain", tab: null, line: null })
    })
    it("leaves a colon that is not a line alone", () => {
        expect(parseQuery("std::vector")).toEqual({ text: "std::vector", tab: null, line: null })
    })
})

describe("GoIndex", () => {
    const items: GoItem[] = [
        { kind: "view", key: "/views/connections", label: "Connections", text: "Connections graph dependencies", tail: -1 },
        { kind: "component", key: "core.order", label: "core.order", tail: 4 },
        file("core/order/service/OrderServiceImpl.java"),
        file("core/order/service/OrderServiceImplTest.java"),
        { kind: "function", key: "f1", label: "OrderServiceImpl.save", tail: 16, file: "core/order/service/OrderServiceImpl.java" },
        { kind: "action", key: "scan:again", label: "Scan again", tail: -1 },
    ]

    it("counts matches per tab and filters hits to the tab", () => {
        const index = new GoIndex(items)
        const all = index.search("ordsvcimpl")
        expect(all.counts.files).toBe(2)
        expect(all.counts.symbols).toBe(1)
        expect(all.counts.all).toBe(3)
        expect(index.search("ordsvcimpl", "symbols").hits.map(h => h.item.key)).toEqual(["f1"])
        expect(index.search("ordsvcimpl", "actions").hits).toEqual([])
    })

    it("gives the same answer narrowing as searching afresh", () => {
        const narrowing = new GoIndex(items)
        for (const q of ["o", "or", "ord", "ords", "ordsvc"]) narrowing.search(q)
        const fresh = new GoIndex(items)
        expect(narrowing.search("ordsvci").hits).toEqual(fresh.search("ordsvci").hits)
        // Backspacing past the narrowed query widens again.
        expect(narrowing.search("con").counts.all).toBe(fresh.search("con").counts.all)
    })

    it("ranks the code above its test", () => {
        const hits = new GoIndex(items).search("OrderServiceImpl", "files").hits
        expect(hits[0].item.key).toBe("core/order/service/OrderServiceImpl.java")
    })

    it("puts the file named exactly above a function that ends in the same letters", () => {
        const index = new GoIndex([
            { kind: "function", key: "f", label: "Quote.addQuoteCom", tail: 5, file: "a/Quote.java" },
            { kind: "function", key: "c", label: "QuoteCom.QuoteCom", tail: 8, file: "repos/qp-common/src/main/java/com/fedex/qp/common/entity/user/QuoteCom.java" },
            file("repos/qp-common/src/main/java/com/fedex/qp/common/entity/user/QuoteCom.java"),
        ])
        expect(index.search("Quotecom").hits[0].item.kind).toBe("file")
        expect(index.search("quotecom", "symbols").hits[0].item.key).toBe("c")
    })

    it("answers a large index within a keystroke", () => {
        // The size of the largest snapshot here: 5.5k files, 5.8k units, 68k functions.
        const big: GoItem[] = []
        const words = ["order", "service", "impl", "address", "country", "dto", "controller", "repository", "payment", "invoice", "customer", "mapper", "config", "util", "handler"]
        let seed = 7
        const pick = () => words[(seed = (seed * 1103515245 + 12345) & 0x7fffffff) % words.length]
        const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
        for (let i = 0; i < 80000; i++) {
            const cls = cap(pick()) + cap(pick()) + cap(pick())
            const path = `module-${i % 40}/src/main/java/com/acme/${pick()}/${pick()}/${cls}.java`
            big.push(i % 8 === 0 ? file(path) : { kind: "function", key: `f${i}`, label: `${cls}.${pick()}${cap(pick())}`, tail: cls.length, file: path })
        }
        const index = new GoIndex(big)
        const t0 = performance.now()
        for (const q of ["o", "or", "ord", "ords", "ordsv", "ordsvc", "ordsvci", "ordsvcim"]) index.search(q)
        const typing = performance.now() - t0
        const t1 = performance.now()
        index.search("custctrl")
        index.search("payinv")
        index.search("x")
        const cold = (performance.now() - t1) / 3
        // Generous bounds for a loaded CI machine; measured ~15–40 ms per keystroke here.
        expect(typing / 8).toBeLessThan(120)
        expect(cold).toBeLessThan(200)
    })
})

describe("highlighting", () => {
    it("places matched letters on the label inside a longer text", () => {
        const item = file("core/order/OrderServiceImpl.java")
        const m = fuzzyMatch("osi", item.text!, item.text!.lastIndexOf("/"))!
        const off = labelOffset(item)
        expect(off).toBe("core/order/".length)
        const runs = highlightRuns(item.label, m.at, off)
        expect(runs.filter(r => r.hit).map(r => r.text).join("")).toBe("OSI")
    })
    it("leaves a label whole when it is not in the text", () => {
        expect(highlightRuns("abc", [0], -1)).toEqual([{ text: "abc", hit: false }])
    })
})
