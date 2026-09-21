<template>
  <!-- One band of the reading: a question's answer in a headline sentence, the
       evidence under it, and the route to the tab that owns the depth. Bands
       are hairline-separated strips down one column, never cards. -->
  <section class="mt-9 pt-5 first:mt-0 first:pt-0 hairline-t first:border-t-0">
    <div class="flex items-baseline justify-between gap-4">
      <h3 class="ui-section-title">{{ title }}</h3>
      <router-link v-if="to" :to="to" class="flex shrink-0 items-center gap-1 text-sm text-neutral-500 transition-colors hover:text-neutral-900">
        <span>{{ linkLabel }}</span>
        <Icon icon="arrow-right" :size="12"/>
      </router-link>
    </div>
    <p v-if="lede" class="mt-1.5 max-w-[68ch] text-base text-neutral-700">{{ lede }}</p>
    <div class="mt-4">
      <slot></slot>
    </div>
  </section>
</template>

<script setup lang="ts">
import Icon from "~/components/ui/common/Icon.vue"

defineProps<{
  title: string
  /** The one fact this band exists to state, in the product's own words. */
  lede?: string
  to?: string
  linkLabel?: string
}>()
</script>
