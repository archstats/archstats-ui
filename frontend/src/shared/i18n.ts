// The app's language and its words. Every string a person reads comes from
// a message file in src/locales/<locale>/<namespace>.json, looked up by key:
// t("cycles.cutPlan.title"). The key's first segment names the file.
//
// The language is chosen once, at startup, and switching it reloads the app.
// That keeps every string, including the ones modules build at import time,
// in one language without making them reactive.
//
// A message is a string with {named} placeholders, or a plural form chosen
// by the `count` parameter: { "one": "{count} file", "other": "{count} files" }.
// Numbers passed as parameters are formatted for the language (1.234 in Dutch).
// A key missing from the chosen language falls back to English.

export const LOCALES = ["en", "nl"] as const
export type Locale = (typeof LOCALES)[number]

/** What each language is called in itself, for the switch in Settings. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", nl: "Nederlands" }

const STORAGE_KEY = "archstats.locale"

function readLocale(): Locale {
    try {
        const saved = globalThis.localStorage?.getItem(STORAGE_KEY)
        if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale
    } catch { /* no storage: English */ }
    return "en"
}

export const locale: Locale = readLocale()

/** The BCP 47 tag for Intl formatting: numbers, lists, collation. */
export const intlLocale = locale === "nl" ? "nl-NL" : "en-US"

/** The tag for dates: day before month in both languages ("1 Oct 2026", "1 okt 2026"). */
export const dateLocale = locale === "nl" ? "nl-NL" : "en-GB"

// The page says which language it is in, so the browser hyphenates and reads it right.
if (typeof document !== "undefined") document.documentElement.lang = locale

/** Saves the language and reloads the app in it. */
export function setLocale(next: Locale) {
    if (next === locale) return
    try { globalThis.localStorage?.setItem(STORAGE_KEY, next) } catch { /* nothing to save to */ }
    globalThis.location?.reload()
}

type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
type Message = string | Plural
interface Tree { [key: string]: Message | Tree }

const files = import.meta.glob<Tree>("../locales/*/*.json", { eager: true, import: "default" })

/** messages[locale][namespace] */
const messages: Record<string, Record<string, Tree>> = {}
for (const [path, tree] of Object.entries(files)) {
    const m = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
    if (m) (messages[m[1]] ??= {})[m[2]] = tree
}

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"])

/** A plural is an object of plural forms only, `other` among them. */
function isPlural(v: unknown): v is Plural {
    if (!v || typeof v !== "object" || typeof (v as Plural).other !== "string") return false
    return Object.keys(v).every(k => PLURAL_FORMS.has(k))
}

function find(lang: string, key: string): Message | undefined {
    const [ns, ...rest] = key.split(".")
    let node: Message | Tree | undefined = messages[lang]?.[ns]
    for (const part of rest) {
        if (!node || typeof node !== "object" || isPlural(node)) return undefined
        node = (node as Tree)[part]
    }
    return typeof node === "string" || isPlural(node) ? node : undefined
}

const pluralRules = new Intl.PluralRules(intlLocale)
const DECIMAL_COMMA = new Intl.NumberFormat(intlLocale).format(1.5).includes(",")
const numbers = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 })
const warned = new Set<string>()

export type Params = Record<string, string | number | null | undefined>

/** The message for `key` in the app's language, with its placeholders filled. */
export function t(key: string, params?: Params): string {
    const msg = find(locale, key) ?? find("en", key)
    if (msg === undefined) {
        if (import.meta.env?.DEV && !warned.has(key)) { warned.add(key); console.warn(`i18n: no message for ${key}`) }
        return key
    }
    const text = typeof msg === "string" ? msg : (msg[pluralRules.select(Number(params?.count ?? 0))] ?? msg.other)
    if (!params) return text
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const v = params[name]
        if (v === undefined || v === null) return whole
        if (typeof v === "number") return numbers.format(v)
        // A number the caller already wrote with toFixed(1) or (2) ("28.9") takes the language's
        // decimal mark. Three digits after the point is a Dutch thousands group ("541.462"): left alone.
        return DECIMAL_COMMA && /^-?\d+\.\d{1,2}%?$/.test(v) ? v.replace(".", ",") : v
    })
}

/** True when `key` has a message in English (every key does) or the app's language. */
export function has(key: string): boolean {
    return find(locale, key) !== undefined || find("en", key) !== undefined
}

let englishOf: Map<string, string> | null = null
let englishTemplates: Array<[RegExp, string[], string]> = []

/**
 * The English of a message text shown in the app's language, or the text
 * itself. For the places that match on what a title says, like a report slot
 * that takes "the figure titled Dependency matrix" from a view: the slot keeps
 * the English, so a report reads the same in either language.
 */
export function english(text: string): string {
    if (locale === "en") return text
    if (!englishOf) {
        englishOf = new Map()
        const walk = (here: Tree | undefined, there: Tree | undefined) => {
            for (const [k, v] of Object.entries(here ?? {})) {
                const e = there?.[k]
                if (typeof v === "string" && typeof e === "string") {
                    englishOf!.set(v, e)
                    const names = [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1])
                    if (names.length) {
                        const source = v.split(/\{\w+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.*?)")
                        englishTemplates.push([new RegExp(`^${source}$`), names, e])
                    }
                }
                else if (v && typeof v === "object" && !isPlural(v) && e && typeof e === "object") walk(v as Tree, e as Tree)
            }
        }
        for (const [ns, tree] of Object.entries(messages[locale] ?? {})) walk(tree, messages.en?.[ns])
        // The most specific template first: the one with the most fixed text.
        englishTemplates.sort((a, b) => b[0].source.length - a[0].source.length)
    }
    const exact = englishOf.get(text)
    if (exact !== undefined) return exact
    for (const [re, names, en] of englishTemplates) {
        const m = re.exec(text)
        if (m) return names.reduce((out, name, i) => out.replace(`{${name}}`, m[i + 1]), en)
    }
    return text
}

/** A position as the language writes it: "3rd" in English, "3e" in Dutch. */
export function ordinal(n: number): string {
    if (locale === "nl") return `${n}e`
    const v = n % 100
    return `${n}${v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}

/** Items joined the way the language joins them: "a, b and c", "a, b en c". */
export function listOf(items: string[], type: "conjunction" | "disjunction" = "conjunction"): string {
    return new Intl.ListFormat(intlLocale, { style: "long", type }).format(items)
}

/** Every message file, for the consistency test. */
export function allMessages(): Record<string, Record<string, Tree>> {
    return messages
}
