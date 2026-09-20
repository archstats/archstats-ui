import { computed, type Ref } from "vue";
import { useDataStore } from "~/stores/data";
import { generalise } from "~/utils/query";
import { detectSeparator } from "~/utils/studio";

// The selection, offered back as the thing it appears to be.
//
// Written twice — once in the selection tray every view shares, once in the
// builder's own tray — with the same threshold, the same "is it actually
// shorter" test and two different ways of saying the result. One answer now,
// so the offer reads the same wherever the selecting happened.

export interface PatternOffer {
  /** The full query text: patterns, then literals, then exclusions. */
  text: string
  /** The first pattern, which is what the chip has room to show. */
  lead: string
  /** Lines beyond the first, so the chip can say what it is not showing. */
  extra: number
  /** The whole thing, for a tooltip that has room to explain. */
  title: string
}

/**
 * Only offered when it genuinely says something shorter than the list it
 * replaces: a "pattern" that is the same twelve names with punctuation is a
 * worse list, not a better one.
 *
 * Two picked things is enough to ask, because `generalise` will only answer
 * with a term that covers both and catches nothing else — so at two it is a
 * clean one-liner or it is nothing. Waiting for a third meant a person could
 * select, look, and see no sign the offer existed.
 */
export function usePatternOffer(ids: Ref<string[]>, kind: Ref<"component" | "file"> | { value: "component" | "file" } = { value: "component" }) {
  const data = useDataStore();

  return computed<PatternOffer | null>(() => {
    const picked = ids.value;
    if (picked.length < 2) return null;

    const universe = kind.value === "file"
      ? Array.from(data.fileComponentIndex.keys())
      : Array.from(data.componentFilesIndex.keys());
    if (universe.length === 0) return null;

    const sep = kind.value === "file" ? "/" : detectSeparator(universe);
    const out = generalise(picked, universe, sep);
    const lines = out.terms.length + out.literals.length + out.exclusions.length;
    if (!out.terms.length || lines >= picked.length) return null;

    return {
      text: out.text,
      lead: out.terms[0],
      extra: lines - 1,
      title: `Say it instead of listing ${picked.length} names:\n\n${out.text}\n\nIt keeps matching as the code moves, and says so when it stops.`,
    };
  });
}
