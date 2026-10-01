// The language the person reads. Prompts to the model stay in English, which
// is what the tools, the playbooks and the checks are written and tuned in;
// only the answer follows the app's language.

import { locale } from "~/shared/i18n"

const NOTES: Record<string, string> = {
    nl: "Language: the person reads Dutch. Write everything they will read in Dutch, the way a Dutch developer writes: je, not u; short sentences; keep English technical terms (component, dependency, import, commit, hotspot, coupling, tangle, cycle, lens, snapshot). Keep names, metric ids, numbers and citations exactly as the tools write them.",
}

/** A closing paragraph for a prompt, or nothing when the app is in English. */
export function answerLanguage(): string {
    const note = NOTES[locale]
    return note ? `\n\n${note}` : ""
}
