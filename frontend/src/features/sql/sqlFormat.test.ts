import { describe, expect, it } from "vitest"
import { formatSql, statementAt, statements } from "./sqlFormat"

describe("sql statements", () => {
    it("splits on semicolons outside strings, comments and brackets", () => {
        const src = "select ';' from a; -- one; two\nselect 2;\n\n  select (1);"
        expect(statements(src).map(s => s.text)).toEqual(["select ';' from a", "-- one; two\nselect 2", "select (1)"])
    })

    it("finds the statement under the caret, or the one just written", () => {
        const src = "select 1;\n\nselect 2 from files;\n"
        expect(statementAt(src, 3)?.text).toBe("select 1")
        expect(statementAt(src, src.indexOf("files"))?.text).toBe("select 2 from files")
        expect(statementAt(src, src.length)?.text).toBe("select 2 from files")
        expect(statementAt(src, 10)?.text).toBe("select 1")
        expect(statementAt("  ", 1)).toBeNull()
    })
})

describe("sql format", () => {
    it("puts each clause on its own line and keeps short lists together", () => {
        expect(formatSql("select name, complexity__lines from components where x = 1 order by 2 desc limit 20")).toBe(
            "select name, complexity__lines\nfrom components\nwhere x = 1\norder by 2 desc\nlimit 20",
        )
    })

    it("lays a long select list out one column per line, aligned", () => {
        expect(formatSql("SELECT name, complexity__lines, codesmells__code_health FROM components")).toBe(
            "SELECT name,\n       complexity__lines,\n       codesmells__code_health\nFROM components",
        )
    })

    it("breaks AND and OR under WHERE, but not BETWEEN's AND or a function's commas", () => {
        expect(formatSql("select count(*), max(a, b) from t where a between 1 and 2 and b = -1 or c like 'x%'")).toBe(
            "select count(*), max(a, b)\nfrom t\nwhere a between 1 and 2\n  and b = -1\n  or c like 'x%'",
        )
    })

    it("indents subqueries and CTEs, and joins start their own line", () => {
        expect(formatSql("with per as (select component, count(*) as n from files group by 1) select c.name, per.n from components c left join per on per.component = c.name and per.n > 0")).toBe([
            "with per as (",
            "  select component, count(*) as n",
            "  from files",
            "  group by 1",
            ")",
            "select c.name, per.n",
            "from components c",
            "left join per on per.component = c.name",
            "  and per.n > 0",
        ].join("\n"))
    })

    it("follows the case most keywords were written in, and keeps comments", () => {
        expect(formatSql("-- biggest\nSELECT name FROM components where x IN (1,2)")).toBe("-- biggest\nSELECT name\nFROM components\nWHERE x IN (1, 2)")
    })

    it("separates statements with a blank line and is stable when run twice", () => {
        const once = formatSql("select a,b,c from t;select 1")
        expect(once).toBe("select a,\n       b,\n       c\nfrom t;\n\nselect 1")
        expect(formatSql(once)).toBe(once)
    })
})
