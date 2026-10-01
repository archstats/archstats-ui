<template>
  <LoadingState :text="t('pages.checks.openingUnits')"/>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import LoadingState from "~/shared/ui/LoadingState.vue"
import { t } from "~/shared/i18n"
// The structure checks became findings in Units: layers are its lanes, and
// reachability and repeated names open on its folder map. Old links land there.
const route = useRoute()
const router = useRouter()
const FINDING: Record<string, string> = { reach: "unreached", dupes: "twice" }
onMounted(() => {
  const finding = FINDING[String(route.query.tab ?? "")]
  const roots = route.query.roots ? { roots: String(route.query.roots) } : {}
  router.replace({ path: "/views/units", query: finding ? { finding, ...roots } : roots })
})
</script>
