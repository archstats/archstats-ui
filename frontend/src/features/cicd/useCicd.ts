import { computed } from "vue"
import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { EMPTY_MODEL, indexModel, loadModel, snapshotState, type CicdModel } from "./cicd"

/** The open snapshot's CI/CD tables, re-read whenever another snapshot opens. */
export function useCicd() {
  const data = useDataStore()
  const state = computed(() => snapshotState(v => data.hasView(v)))
  const { data: model, loading } = useAsyncQuery<CicdModel>(
    () => (state.value === "ready" ? loadModel(sql => data.query(sql), v => data.hasView(v)) : Promise.resolve(EMPTY_MODEL)),
    [() => data.datasetKey],
    { initial: EMPTY_MODEL },
  )
  const ix = computed(() => indexModel(model.value))
  return { model, ix, loading, state }
}
