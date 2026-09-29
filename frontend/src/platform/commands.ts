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

// Services: an object one feature offers and another calls, by id, when the
// two may not import each other (reports hands its Add to report and Pin to
// the export buttons). Kept here rather than in either feature because this
// module does not reload with feature code in development, so a long-running
// window never ends up with the caller reading a fresh, empty copy.

const services = new Map<string, unknown[]>()

/** Offers a service; the most recent offer wins. Returns the withdrawal. */
export function provideService<T>(id: string, impl: T): () => void {
    const list = services.get(id) ?? []
    list.push(impl)
    services.set(id, list)
    return () => {
        const l = services.get(id) ?? []
        const i = l.lastIndexOf(impl)
        if (i >= 0) l.splice(i, 1)
    }
}

export function serviceOf<T>(id: string): T | null {
    const list = services.get(id)
    return (list?.[list.length - 1] as T | undefined) ?? null
}
