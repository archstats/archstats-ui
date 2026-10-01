// A message with markup inside it. The message names its parts, and the
// slots of the same names fill them, so a sentence keeps its bold number or
// its link while the words around them move as the language needs:
//
//   <I18nT k="git.changeBreadth.lastYear">
//     <template #share><strong>{{ pct }}</strong></template>
//   </I18nT>
//
// with "In the last year, {share} of the commits touched one component."

import { defineComponent, Fragment, h, type VNodeChild } from "vue"
import { t } from "~/shared/i18n"

export default defineComponent({
    name: "I18nT",
    props: {
        k: { type: String, required: true },
        /** Chooses the plural form, and fills {count}. */
        count: { type: Number, default: undefined },
    },
    setup(props, { slots }) {
        return () => {
            const message = t(props.k, props.count === undefined ? undefined : { count: props.count })
            const parts: VNodeChild[] = message.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? (slots[part]?.() ?? `{${part}}`) : part))
            return h(Fragment, parts)
        }
    },
})
