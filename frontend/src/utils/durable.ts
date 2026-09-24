import { useStateStore } from "~/stores/state"

// Workspace state that must outlive the webview: lenses, groups, merges,
// arrangements. It lives in app.db (the state store, hydrated when a
// workspace is selected). What earlier versions kept in localStorage is
// carried up once, the first time a key is read with no row in app.db, and a
// flag records that it was, so a later launch never copies a stale browser
// copy over newer rows (or back over a deliberate deletion). The browser copy
// is left in place for one release.
//
// Before the workspace is hydrated (and in tests, which have no app.db) the
// browser copy is read and written as before.

const migratedKey = (key: string) => `migrated:${key}`

function hydratedFor(workspace: string): boolean {
    const state = useStateStore()
    return state.hydrated && state.workspace === workspace
}

function readLegacy(legacyKey: string): string | null {
    try { return localStorage.getItem(legacyKey) } catch { return null }
}

/**
 * The raw string stored for a workspace key: app.db's row, else the legacy
 * copy (carried up on first read). Values are strings, so an opaque blob
 * (the groups' versioned JSON) round-trips untouched.
 */
export function readDurable(workspace: string, key: string, legacyKey: string): string | null {
    if (!hydratedFor(workspace)) return readLegacy(legacyKey)
    const state = useStateStore()
    const v = state.get<unknown>(key, undefined)
    if (v !== undefined && v !== null) return typeof v === "string" ? v : JSON.stringify(v)
    if (state.get<boolean>(migratedKey(key), false)) return null
    const legacy = readLegacy(legacyKey)
    if (legacy !== null) state.set(key, legacy)
    state.set(migratedKey(key), true)
    return legacy
}

/** Writes (null deletes) a workspace key where it is read from. */
export function writeDurable(workspace: string, key: string, legacyKey: string, value: string | null): void {
    if (!hydratedFor(workspace)) {
        try {
            if (value === null) localStorage.removeItem(legacyKey)
            else localStorage.setItem(legacyKey, value)
        } catch { /* private mode */ }
        return
    }
    const state = useStateStore()
    state.set(key, value)
    // A deliberate delete must stay deleted: the flag stops the legacy copy coming back.
    state.set(migratedKey(key), true)
}
