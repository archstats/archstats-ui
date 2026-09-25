import { watch } from "vue"
import { useRoute } from "vue-router"
import { incomingIds } from "./showIn"

/**
 * A view that can arrive with a selection: `?hl=` hands it the ids, now and
 * whenever the link changes while the view stays open.
 */
export function useIncomingSelection(apply: (ids: string[]) => void) {
  const route = useRoute()
  watch(() => route.query.hl, (value) => {
    const ids = incomingIds(value)
    if (ids && ids.length) apply(ids)
  }, { immediate: true })
}
