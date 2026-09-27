import { useAsyncQuery } from "~/features/snapshot/useAsyncQuery"
import { useDataStore } from "~/features/snapshot/data.store"
import { EMPTY_MODEL, loadModel, type DeployableModel } from "./deployables"

/** The open snapshot's deployables, re-read whenever another snapshot opens. */
export function useDeployables() {
  const data = useDataStore()
  const { data: model, loading } = useAsyncQuery<DeployableModel>(
    () => (data.hasView("deployables") ? loadModel(sql => data.query(sql), v => data.hasView(v)) : Promise.resolve(EMPTY_MODEL)),
    [() => data.datasetKey],
    { initial: EMPTY_MODEL },
  )
  return { model, loading, available: () => data.hasView("deployables") }
}
