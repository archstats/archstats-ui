# Messages

Every string a person reads in the app is stored here, once per language:

```
locales/
  README.md            this file
  GLOSSARY.md          Dutch terms, view names and voice; read it before translating
  TRANSLATING.md       how a namespace gets its Dutch file
  keep-english.json    text in code that stays English on purpose, and why
  en/<namespace>.json  the source text
  nl/<namespace>.json  the Dutch text, the same keys
```

## Namespaces

A namespace is a feature from `src/features/` (`cycles.json`, `reports.json`),
or one of these:

| Namespace | Holds |
| --- | --- |
| `common` | `count.*`: a number with its noun ("{count} file" / "{count} files"); `noun.*`: the noun alone, chosen by a count |
| `pages` | Text in `src/pages/`, `src/layouts/` and `app.vue`; one area per page |
| `ui` | The UI kit in `src/shared/ui/` and the formatters in `src/shared/` |
| `platform` | `src/platform/`, `src/plugins/`, `src/workers/` |
| `definitions` | The engine's metric definitions by metric id (`name`, `short`, `long`), the app's own (`app__*`), and their categories. `npm run i18n:definitions` refreshes the English from the engine's YAML |

## Keys

`<namespace>.<area>.<name>` in camelCase. The area is the file that owns the text
(`TangleGraph.vue` → `tangleGraph`; two files of one name get their folder in front:
`exhibitsDeployables`). The name comes from the first words of the English text.

```json
{
  "tangleGraph": {
    "zoom": "Zoom in",
    "tangleComponentsLevels": "Tangle of {orderLength} components in {layersLength} levels"
  }
}
```

- `{name}` is filled from the call: `t("cycles.tangleGraph.tangleComponentsLevels", { orderLength, layersLength })`.
  Numbers are formatted for the language (1.234 in Dutch).
- A plural is an object with `one` and `other`, chosen by `count`:
  `t("common.count.file", { count: n })`.
- A sentence is one message. When part of it is markup (a bold number, a link), use `<I18nT>`
  with a slot per part:
  ```vue
  <I18nT k="git.changeBreadth.lastYearCommitsTouched">
    <template #wider><strong>{{ pct(cmp.recent.wider) }}</strong></template>
  </I18nT>
  ```
- Lists go through `listOf(items)` from `~/shared/i18n` ("a, b and c" / "a, b en c"), never `.join(" and ")`.
- Numbers and dates go through `intlLocale` / `dateLocale`, `formatNumber`, `fixed()` and
  `formatDate`, never `"en-US"` or `toFixed()` for display.

## Ask

Prompts, tool descriptions and playbooks for the model stay English (see
`keep-english.json`); `features/ask/engine/language.ts` tells the model which
language to answer in. What people see in Ask is messages like everywhere else.

## Checks

- `src/shared/i18n.test.ts` (on every test run): every key the code uses exists in English;
  every Dutch file has exactly the keys of its English file, with the same placeholders
  and plural forms; every English file has a Dutch file.
- `npm run i18n:check`: no text for people is left in the code outside a message and
  outside `keep-english.json`; every `t()` call and `<I18nT>` fills all of its message's
  placeholders; no message is left that nothing uses.

## Adding text

1. Write it as a message: add the key to `en/<namespace>.json` and call `t()`. For a lot of
   new code at once, `node scripts/i18n-extract.mjs plan <namespace> <files…>` lists the
   candidates; delete the lines that are not text for people and run `apply`.
2. Translate the new keys into `nl/<namespace>.json` (see `TRANSLATING.md`).
3. `npm test` and `npm run i18n:check`.

The language is chosen in Settings and saved per machine. Changing it reloads the app.
