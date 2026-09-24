// One path for every app command, whether it comes from the native menu, a
// keyboard shortcut or a button: features register a handler by id, and the
// menu and the keyboard only ever run ids. A command nobody registered is a
// no-op, so the menu can list an item before the view that serves it loads.

type Handler = () => void | Promise<void>

const handlers = new Map<string, Handler[]>()

/** Registers a handler; the most recent registration wins. Returns the unregister. */
export function registerCommand(id: string, handler: Handler): () => void {
    const list = handlers.get(id) ?? []
    list.push(handler)
    handlers.set(id, list)
    return () => {
        const l = handlers.get(id) ?? []
        const i = l.lastIndexOf(handler)
        if (i >= 0) l.splice(i, 1)
    }
}

export function hasCommand(id: string): boolean {
    return (handlers.get(id)?.length ?? 0) > 0
}

export async function runCommand(id: string): Promise<boolean> {
    const list = handlers.get(id)
    const h = list?.[list.length - 1]
    if (!h) return false
    await h()
    return true
}
