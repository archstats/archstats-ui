# Translating a message file

This is how a namespace gets its Dutch file. It applies to people and to agents alike.

1. Read `GLOSSARY.md` and follow it. Developer Dutch, je-form, English jargon kept.
2. Translate `en/<namespace>.json` into `nl/<namespace>.json`. Keep the same keys in the
   same order, and keep the nesting. Translate only the values.
3. Keep every `{placeholder}` exactly as written. You may move it within the sentence,
   because Dutch word order differs. Never add, drop or rename a placeholder.
4. A plural (`{ "one": …, "other": … }`) stays a plural, with both forms in Dutch.
5. Find the code a message belongs to before translating anything short or partial.
   The key says where: `cycles.tangleGraph.zoom` lives in a file named `TangleGraph.vue`
   under `src/features/cycles/`, and `pages.componentsConnections.*` lives in
   `src/pages/views/components/[name]/connections.vue`. Some messages are fragments of a
   sentence (they start with `, ` or a space, or a placeholder holds another message).
   Read how the code puts them together, then translate so the assembled Dutch sentence
   reads naturally. Keep any leading or trailing space or punctuation the code relies on.
6. `{count}` messages in `common.count.*` read "{count} bestand" / "{count} bestanden".
   Other messages put them inside sentences through placeholders such as `{files}`.
7. Search keywords (a view's `also`) are space-separated words. Keep the English ones
   and add the Dutch ones.
8. Text that only makes sense in English, such as code, file names, product names and
   metric ids, stays as it is.
9. Check your work:
   ```bash
   cd frontend && npx vitest run src/shared/i18n.test.ts
   ```
   The test for your file must pass. Other namespaces may still be missing; that is fine.
