// First of all plugins: in Ask's hidden stage, borrow the window's Wails
// bindings before anything calls Go (see platform/stage.ts). Elsewhere a no-op.
import "~/platform/stage"

export default defineNuxtPlugin(() => {})
