// Every t("<key>", { … }) passes the placeholders its English message names,
// and every <I18nT k="<key>"> fills its slots. A placeholder with no value
// shows as "{name}" to a person.
//   node scripts/i18n-params.mjs
import ts from "typescript"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseSfc } from "@vue/compiler-sfc"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SRC = join(ROOT, "src")
const messages = {}
for (const f of readdirSync(join(SRC, "locales", "en"))) messages[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(SRC, "locales", "en", f), "utf8"))
const lookup = key => { const [ns, ...path] = key.split("."); let n = messages[ns]; for (const p of path) n = n?.[p]; return n }
const placeholders = m => new Set([...(typeof m === "string" ? m : Object.values(m ?? {}).join(" ")).matchAll(/\{(\w+)\}/g)].map(x => x[1]))

const problems = []
function checkCode(code, file, offsetLine = 0) {
    const sf = ts.createSourceFile("x.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const visit = n => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "t" && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
            const key = n.arguments[0].text
            const msg = lookup(key)
            if (msg !== undefined) {
                const want = placeholders(msg)
                const arg = n.arguments[1]
                const given = new Set()
                let opaque = false
                if (arg && ts.isObjectLiteralExpression(arg)) for (const p of arg.properties) { if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) given.add(p.name.text); else opaque = true }
                else if (arg) opaque = true
                if (!opaque) {
                    const missing = [...want].filter(w => !given.has(w) && !(w === "count" && given.has("count")))
                    if (missing.length) problems.push(`${relative(ROOT, file)}:${offsetLine + sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}\t${key}\tmissing {${missing.join("}, {")}} (given ${[...given].join(", ") || "nothing"})`)
                }
            }
        }
        ts.forEachChild(n, visit)
    }
    visit(sf)
}
const walk = d => { for (const name of readdirSync(d)) { const p = join(d, name); if (statSync(p).isDirectory()) { if (!/locales$/.test(p)) walk(p) } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) checkCode(readFileSync(p, "utf8"), p); else if (/\.vue$/.test(name)) {
    const src = readFileSync(p, "utf8"); const { descriptor } = parseSfc(src)
    for (const b of [descriptor.script, descriptor.scriptSetup]) if (b) checkCode(b.content, p, b.loc.start.line - 1)
    if (descriptor.template) {
        // Template expressions: each {{ }} and bound attribute, parsed on its own.
        const visitNode = node => {
            for (const prop of node.props ?? []) if (prop.type === 7 && prop.exp?.content) checkCode(`(${prop.exp.content})`, p, prop.exp.loc.start.line - 1)
            if (node.type === 5 && node.content?.content) checkCode(`(${node.content.content})`, p, node.content.loc.start.line - 1)
            for (const c of node.children ?? []) visitNode(c)
        }
        visitNode(descriptor.template.ast)
        const tpl = descriptor.template.content
        for (const m of tpl.matchAll(/<I18nT k="([\w.\[\]-]+)">([\s\S]*?)<\/I18nT>/g)) {
            const msg = lookup(m[1]); if (msg === undefined) continue
            const slots = new Set([...m[2].matchAll(/<template #(\w+)>/g)].map(x => x[1]))
            const missing = [...placeholders(msg)].filter(w => !slots.has(w) && w !== "count")
            if (missing.length) problems.push(`${relative(ROOT, p)}\t${m[1]}\tslots missing {${missing.join("}, {")}}`)
        }
    }
} } }
walk(SRC)
if (problems.length) { console.log(problems.join("\n")); console.error(`\n${problems.length} messages are called without all their placeholders.`); process.exitCode = 1 }
else console.log("Every message gets its placeholders.")

// And no message is left that nothing asks for: a key the code stopped using is noise for translators.
{
    let src = ""
    const read = d => { for (const name of readdirSync(d)) { const p = join(d, name); if (statSync(p).isDirectory()) { if (!/locales$/.test(p)) read(p) } else if (/\.(ts|vue)$/.test(name)) src += readFileSync(p, "utf8") } }
    read(SRC)
    const used = new Set([...src.matchAll(/["'`]([\w[\]-]+\.[\w.[\]]+)["'`]/g), ...src.matchAll(/k="([\w.[\]-]+)"/g)].map(m => m[1]))
    // Keys built at run time: definitions by metric id, Java roles, native menu items.
    const dynamic = ["definitions.", "java.roles.", "shell.menu."]
    const unused = []
    const leaves = (tree, path) => { for (const [k, v] of Object.entries(tree)) { const key = `${path}.${k}`; if (typeof v === "string" || Object.keys(v).every(x => ["zero", "one", "two", "few", "many", "other"].includes(x))) { if (!used.has(key) && !dynamic.some(d => key.startsWith(d))) unused.push(key) } else leaves(v, key) } }
    for (const [ns, tree] of Object.entries(messages)) leaves(tree, ns)
    if (unused.length) { console.log(unused.join("\n")); console.error(`\n${unused.length} messages are used nowhere. Delete them from en/ and nl/.`); process.exitCode = 1 }
    else console.log("Every message is used.")
}
