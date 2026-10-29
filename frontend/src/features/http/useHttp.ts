import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { EMPTY_MODEL, loadModel, type HttpModel } from "./http"

/** The open snapshot's routes, contracts, traces and outbound calls, re-read whenever another snapshot opens. */
export function useHttp() {
  const data = useDataStore()
  const { data: model, loading } = useAsyncQuery<HttpModel>(
    () => loadModel(sql => data.query(sql), v => data.hasView(v)),
    [() => data.datasetKey],
    { initial: EMPTY_MODEL },
  )
  return { model, loading }
}
