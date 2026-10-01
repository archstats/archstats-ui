// Only the app's own drags start. WebKit lets an image, a link or a selection
// be dragged by default; a figure dragged that way carries its data: URL, and
// when it is let go over the window again the Wails shell reads that URL as a
// file path and the app goes down (macOS, Wails 2.12). Every drag the app
// means to offer is marked draggable="true" and starts as before, and text
// still moves by drag inside a field.
export default defineNuxtPlugin(() => {
    window.addEventListener("dragstart", (e) => {
        const t = e.target
        const el = t instanceof Element ? t : (t as Node | null)?.parentElement ?? null
        if (!el?.closest('[draggable="true"], textarea, input, [contenteditable="true"]')) e.preventDefault()
    }, true)
})
