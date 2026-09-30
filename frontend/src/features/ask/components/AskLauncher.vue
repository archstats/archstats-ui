<template>
  <span hidden/>
</template>

<script setup lang="ts">
// ⌘J from any view: take what the view shows (its route, subject, focus,
// selection, tables and figures) and bring it to Ask as the next question's
// context. From Ask itself, ⌘J goes back to the view.

import { onBeforeUnmount, onMounted } from "vue"
import { registerCommand } from "~/platform/commands"
import { useScopeStore } from "~/features/groups/scope.store"
import { useAskStore } from "../app/ask.store"
import { captureImages, captureView } from "../app/viewContext"
import { STAGE_SCAN } from "~/platform/stage"
import { useDataStore } from "~/features/snapshot/data.store"
import { stageTake } from "../app/stageHost"

const router = useRouter()
const route = useRoute()
const ask = useAskStore()
const scope = useScopeStore()

let off: (() => void) | null = null
let offGuard: (() => void) | null = null
onMounted(() => {
  // In the stage, this is the door the window uses to draw views; ⌘J means nothing here.
  if (STAGE_SCAN) {
    const data = useDataStore()
    ;(window as any).__askStage = { ready: () => data.hasData, take: (route: string, opts: any) => stageTake(router, route, opts) }
    return
  }
  off = registerCommand("ask:open", async () => {
    if (route.path === "/views/ask") { router.back(); return }
    const context = captureView(route, { focus: scope.focus })
    // Pictures of the figures, while they are still mounted: a model that can see gets them.
    context.images = await captureImages()
    ask.pendingContext = context
    await router.push("/views/ask")
  })
  // Any other way into Ask (the sidebar, a link, go-to-anything): the view left behind is
  // taken while it is still mounted, and offered; "this" in a first question takes it.
  offGuard = router.beforeEach((to, from) => {
    if (to.path !== "/views/ask" || from.path === "/views/ask" || !from.matched.length) return
    ask.lastView = ask.pendingContext ? null : captureView(from as any, { focus: scope.focus })
  })
})
onBeforeUnmount(() => { off?.(); offGuard?.() })
</script>
