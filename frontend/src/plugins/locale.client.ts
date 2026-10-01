// The Go side writes a few strings itself (native dialog titles, provider
// checks); it learns the app's language here, once, at startup.
import { SetLocale } from "wailsjs/go/app/AppService"
import { locale } from "~/shared/i18n"

export default defineNuxtPlugin(() => {
    try { void SetLocale(locale)?.catch?.(() => {}) } catch { /* no Go side (tests, plain browser) */ }
})
