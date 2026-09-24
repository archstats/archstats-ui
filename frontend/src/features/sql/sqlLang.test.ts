import { describe, expect, it } from "vitest"
import { analyze, complete, contextAt, lint, locateError, scopeAt, signatureAt, tokenize, type SqlSchema } from "./sqlLang"

const schema: SqlSchema = {
    tables: [
        { name: "components", columns: [{ name: "name", type: "TEXT" }, { name: "complexity__lines", type: "INTEGER" }, { name: "codesmells__code_health", type: "REAL" }] },
        { name: "files", columns: [{ name: "name", type: "TEXT" }, { name: "component", type: "TEXT" }, { name: "role", type: "TEXT" }] },
        { name: "rules", columns: [{ name: "rule", type: "TEXT" }, { name: "from", type: "TEXT" }, { name: "to", type: "TEXT" }] },
    ],
    describe: c => (c === "codesmells__code_health" ? { name: "Code health", short: "1 to 10; higher is simpler to change." } : c === "complexity__lines" ? { name: "Lines", short: "Lines of code." } : null),
}
const at = (s: string) => { const i = s.indexOf("|"); return { src: s.slice(0, i) + s.slice(i + 1), caret: i } }

describe("sql tokens", () => {
    it("reads strings with doubled quotes, quoted names, comments and open strings", () => {
        const t = tokenize(`select "from", 'it''s' -- note\nfrom rules where x = 'open`).filter(x => x.kind !== "space")
        expect(t.map(x => x.kind)).toEqual(["keyword", "quoted", "punct", "string", "comment", "keyword", "ident", "keyword", "ident", "op", "string"])
        expect(t[t.length - 1].open).toBe(true)
    })
})

describe("sql scope", () => {
    it("knows the tables and aliases a query reads from", () => {
        const { src, caret } = at("select | from components c join files f on f.component = c.name")
        const scope = scopeAt(analyze(src, schema), caret)
        expect(scope.map(s => `${s.name}:${s.table}`)).toEqual(["c:components", "f:files"])
    })

    it("names a CTE's columns from its select list", () => {
        const a = analyze("with per as (select component, count(*) as n from files group by 1) select per.n from per", schema)
        expect(a.ctes[0]).toMatchObject({ name: "per", columns: ["component", "n"] })
    })
})

describe("sql completion", () => {
    it("offers tables right after FROM", () => {
        const { src, caret } = at("select name from co|")
        const { context, items } = complete(src, caret, schema)
        expect(context.wantsTable).toBe(true)
        expect(items[0]).toMatchObject({ kind: "table", label: "components" })
    })

    it("offers an alias's columns after its dot", () => {
        const { src, caret } = at("select c.| from components c")
        const { items } = complete(src, caret, schema)
        expect(items.map(i => i.label).sort()).toEqual(["codesmells__code_health", "complexity__lines", "name"])
    })

    it("finds a metric by what it is called, not only by its id", () => {
        const { src, caret } = at("select health| from components")
        const { items } = complete(src, caret, schema)
        expect(items[0]).toMatchObject({ kind: "metric", label: "codesmells__code_health", detail: "Code health" })
    })

    it("quotes a column that is a keyword", () => {
        const { src, caret } = at("select fr| from rules")
        expect(complete(src, caret, schema).items.find(i => i.label === "from")?.insert).toBe(`"from"`)
    })

    it("offers a CTE's columns in the query that reads it", () => {
        const { src, caret } = at("with per as (select component, count(*) as n from files group by 1) select | from per")
        const labels = complete(src, caret, schema).items.map(i => i.label)
        expect(labels).toContain("n")
        expect(labels).toContain("component")
    })

    it("asks for values inside a string compared with a column, and says from which table", () => {
        const { src, caret } = at("select * from components c join files f on f.component = c.name where f.role = 'pro|")
        const ctx = contextAt(src, caret, schema)
        expect(ctx.value).toEqual({ column: "role", table: "files", closeQuote: true })
        expect(ctx.prefix).toBe("pro")
        const inList = at("select * from files where component in ('a', 'b|')")
        expect(contextAt(inList.src, inList.caret, schema).value?.column).toBe("component")
    })

    it("offers output names in ORDER BY", () => {
        const { src, caret } = at("select name, count(*) as n from files group by 1 order by |")
        expect(complete(src, caret, schema).items.map(i => i.label)).toContain("n")
    })
})

describe("sql help", () => {
    it("knows the function and argument the caret is in", () => {
        const { src, caret } = at("select substr(name, 1, |) from files")
        expect(signatureAt(src, caret)).toMatchObject({ fn: { name: "substr" }, arg: 2 })
        expect(signatureAt("select name from files", 10)).toBeNull()
    })

    it("names a missing table with the likely one, and a column a table lacks", () => {
        const d = lint("select name from componets", schema)
        expect(d[0].message).toBe("No table called componets; did you mean components?")
        const c = lint("select f.compnent from files f", schema)
        expect(c[0].message).toBe("files has no column compnent; did you mean component?")
        expect(lint("with x as (select 1 as a) select a from x", schema)).toEqual([])
    })

    it("puts SQLite's error on the token it names", () => {
        const src = "select nme from files"
        expect(locateError(src, "no such column: nme")).toMatchObject({ from: 7, to: 10 })
        expect(locateError(src, `near "files": syntax error`)).toMatchObject({ from: 16 })
    })
})
