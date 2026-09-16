
// @ts-ignore
import mitt from "mitt";


export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.vueApp.config.globalProperties.emitter = mitt();
})