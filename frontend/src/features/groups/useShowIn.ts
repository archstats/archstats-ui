import { useRouter } from "vue-router"
import { useScopeStore } from "./scope.store"
import type { ShowInTarget } from "~/features/navigation/showIn"

/** Going somewhere from a Show in list: set the focus it asks for, then push. */
export function useShowIn() {
  const router = useRouter()
  const scope = useScopeStore()
  return (target: ShowInTarget) => {
    if (target.focus !== undefined) scope.setFocus(target.focus)
    void router.push(target.to)
  }
}
