// Libraries: what the code imports that is not one of its own components,
// as written in the import, rolled up to a depth the architect picks. Nothing
// is hidden; a platform module is tagged by an exact rule per language, and
// an import that shares its first segments with the project's own names is
// tagged as looking internal (a module the scan did not resolve).

export interface ImportRow { content: string; file: string; component: string | null }

export interface Library {
    name: string
    imports: number
    files: number
    components: Map<string, number>
    platform: boolean
    internal: boolean
    language: string | null
}

/** Python's own modules (sys.stdlib_module_names, Python 3.12), private ones left out. */
const PYTHON_STDLIB = new Set(`
    abc aifc antigravity argparse array ast asyncio atexit audioop base64 bdb binascii bisect builtins
    bz2 cProfile calendar cgi cgitb chunk cmath cmd code codecs codeop collections colorsys compileall
    concurrent configparser contextlib contextvars copy copyreg crypt csv ctypes curses dataclasses
    datetime dbm decimal difflib dis doctest email encodings ensurepip enum errno faulthandler fcntl
    filecmp fileinput fnmatch fractions ftplib functools gc genericpath getopt getpass gettext glob
    graphlib grp gzip hashlib heapq hmac html http idlelib imaplib imghdr importlib inspect io ipaddress
    itertools json keyword lib2to3 linecache locale logging lzma mailbox mailcap marshal math mimetypes
    mmap modulefinder msilib msvcrt multiprocessing netrc nis nntplib nt ntpath nturl2path numbers
    opcode operator optparse os ossaudiodev pathlib pdb pickle pickletools pipes pkgutil platform
    plistlib poplib posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc pydoc_data
    pyexpat queue quopri random re readline reprlib resource rlcompleter runpy sched secrets select
    selectors shelve shlex shutil signal site smtplib sndhdr socket socketserver spwd sqlite3
    sre_compile sre_constants sre_parse ssl stat statistics string stringprep struct subprocess sunau
    symtable sys sysconfig syslog tabnanny tarfile telnetlib tempfile termios textwrap this threading
    time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty turtle turtledemo types
    typing unicodedata unittest urllib uu uuid venv warnings wave weakref webbrowser winreg winsound
    wsgiref xdrlib xml xmlrpc zipapp zipfile zipimport zlib zoneinfo
`.trim().split(/\s+/))

/** Node's built-in modules (module.builtinModules). */
const NODE_BUILTINS = new Set(`
    assert async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel
    dns domain events fs http http2 https inspector module net os path perf_hooks process punycode
    querystring readline repl stream string_decoder sys timers tls trace_events tty url util v8 vm wasi
    worker_threads zlib node:sea node:sqlite node:test
`.trim().split(/\s+/))

/** Top-level domains, for Go paths the engine wrote with slashes (github.com/x -> github/com/x). */
const TLDS = new Set(["com", "org", "net", "io", "dev", "in", "co", "cc", "me", "sh", "xyz", "app", "cloud", "tech", "ai", "uk", "de", "fr", "nl", "jp", "cn", "ru", "eu", "us", "info", "biz", "gov", "edu"])

export function separatorOf(content: string): string {
    return content.includes("\\") ? "\\" : "/"
}

/** The language an import is written in, from the importing file. */
export function languageOf(file: string): string | null {
    const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase()
    if (ext === "go") return "go"
    if (ext === "py" || ext === "pyi") return "python"
    if (["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts", "vue", "svelte"].includes(ext)) return "javascript"
    if (ext === "java" || ext === "kt" || ext === "kts" || ext === "scala" || ext === "groovy") return "java"
    if (ext === "php") return "php"
    if (ext === "cs") return "csharp"
    return null
}

/** Exact rules only: a module the language itself ships. */
export function isPlatform(content: string, language: string | null): boolean {
    const segs = content.split(separatorOf(content)).filter(Boolean)
    if (!segs.length) return false
    switch (language) {
        case "go": return !segs[0].includes(".") && !(segs.length > 1 && TLDS.has(segs[1])) && !segs[0].includes("-")
        case "python": return PYTHON_STDLIB.has(segs[0])
        case "javascript": return content.startsWith("node:") || NODE_BUILTINS.has(segs[0])
        case "java": return segs[0] === "java" || segs[0] === "jdk"
        default: return false
    }
}

/** The first `depth` segments; "as written" when depth is null. */
export function rollup(content: string, depth: number | null): string {
    if (depth === null) return content
    const sep = separatorOf(content)
    const segs = content.split(sep)
    // A scoped npm package (@org/pkg) is one name, not two segments, and so is
    // a Go module host the engine wrote with slashes (github/com).
    const take = segs.length > 2 && TLDS.has(segs[1]) ? depth + 2 : content.startsWith("@") ? depth + 1 : depth
    return segs.slice(0, take).join(sep)
}

/**
 * How many of the project's components start with each one- and two-segment
 * prefix, normalised to "/", for "looks internal": an import that starts
 * where several of the project's own names start is more likely one of its
 * modules the scan did not resolve than a library.
 */
export function ownPrefixes(components: string[]): Map<string, number> {
    const out = new Map<string, number>()
    const bump = (k: string) => out.set(k, (out.get(k) ?? 0) + 1)
    for (const c of components) {
        const segs = c.split(/[./\\:]+/).filter(Boolean).map(x => x.toLowerCase())
        if (segs.length >= 1) bump(segs[0])
        if (segs.length >= 2) bump(`${segs[0]}/${segs[1]}`)
    }
    return out
}

/**
 * Several components, not one: Sylius has a single component in Symfony's
 * own namespace (its PHP config files), which does not make Symfony internal.
 */
export const INTERNAL_MIN_COMPONENTS = 3

export function looksInternal(content: string, own: Map<string, number>): boolean {
    const segs = content.split(/[./\\]+/).filter(Boolean).map(s => s.toLowerCase())
    if (!segs.length) return false
    if (segs.length >= 2 && (own.get(`${segs[0]}/${segs[1]}`) ?? 0) >= INTERNAL_MIN_COMPONENTS) return true
    // A single shared first segment only counts for a short import ("api"),
    // or com/org would make every Java library look internal.
    return segs.length === 1 && (own.get(segs[0]) ?? 0) >= INTERNAL_MIN_COMPONENTS
}

export function libraries(rows: ImportRow[], depth: number | null, own: Map<string, number>): Library[] {
    const by = new Map<string, { imports: number; files: Set<string>; components: Map<string, number>; language: string | null; platform: boolean }>()
    for (const r of rows) {
        const name = rollup(r.content, depth)
        let e = by.get(name)
        const language = languageOf(r.file)
        if (!e) { e = { imports: 0, files: new Set(), components: new Map(), language, platform: isPlatform(name, language) }; by.set(name, e) }
        e.imports++
        e.files.add(r.file)
        if (r.component) e.components.set(r.component, (e.components.get(r.component) ?? 0) + 1)
    }
    return [...by].map(([name, e]) => ({
        name, imports: e.imports, files: e.files.size, components: e.components, platform: e.platform,
        internal: !e.platform && looksInternal(name, own), language: e.language,
    })).sort((a, b) => b.imports - a.imports || a.name.localeCompare(b.name))
}
