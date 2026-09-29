import { describe, expect, it } from "vitest"
import { bindParams, paramColumn, paramsIn } from "./sqlParams"
import type { SqlSchema } from "./sqlLang"

const schema: SqlSchema = {
    tables: [
        { name: "files", columns: [{ name: "name", type: "TEXT" }, { name: "component", type: "TEXT" }] },
        { name: "git_commits", columns: [{ name: "author_name", type: "TEXT" }, { name: "component", type: "TEXT" }] },
    ],
}

describe("sql params", () => {
    it("lists named parameters once, in order, and ignores strings and ?", () => {
        expect(paramsIn("select * from f where a = :comp and b = ':nope' and c = ? and d = :COMP or e > @since").map(p => p.name)).toEqual(["comp", "since"])
    })

    it("writes values in as literals and names the empty ones", () => {
        expect(bindParams("select * from f where a = :c and n > :n limit :n", { c: "it's", n: "10" })).toEqual({ sql: "select * from f where a = 'it''s' and n > 10 limit 10", missing: [] })
        expect(bindParams("where a = :a and b = :b", { a: "x" }).missing).toEqual(["b"])
    })

    it("finds the column a parameter is compared with", () => {
        const sql = "select author_name from git_commits g where g.component = :component and :who = author_name"
        const [c, w] = paramsIn(sql)
        expect(paramColumn(sql, c, schema)).toEqual({ table: "git_commits", column: "component" })
        expect(paramColumn(sql, w, schema)).toEqual({ table: "git_commits", column: "author_name" })
        const inList = "select name from files where component in (:a, :b)"
        expect(paramColumn(inList, paramsIn(inList)[1], schema)).toEqual({ table: "files", column: "component" })
        expect(paramColumn("select :x", paramsIn("select :x")[0], schema)).toBeNull()
    })
})
