// Every keyboard shortcut the app answers to, in one list: the "?" sheet
// reads it, and the global handler binds the ones that name a command.
// "Mod" is ⌘ on macOS and Ctrl elsewhere.

export interface Shortcut {
    keys: string[]
    label: string
    area: "App" | "Views" | "Focus" | "Selection" | "Lens builder"
    /** A command id from utils/commands, for shortcuts the shell binds itself. */
    command?: string
}

export const SHORTCUTS: Shortcut[] = [
    { area: "App", keys: ["Mod", "R"], label: "Scan again", command: "scan:again" },
    { area: "App", keys: ["Mod", "P"], label: "Go to anything", command: "goto" },
    { area: "App", keys: ["Mod", "E"], label: "Export the current view", command: "export" },
    { area: "App", keys: ["Mod", "O"], label: "Import a snapshot file", command: "snapshot:import" },
    { area: "App", keys: ["Mod", "N"], label: "Add a folder as a workspace", command: "workspace:new" },
    { area: "App", keys: ["Mod", "Shift", "N"], label: "Clone a repository", command: "workspace:clone" },
    { area: "App", keys: ["Mod", "["], label: "Back", command: "nav:back" },
    { area: "App", keys: ["Mod", "]"], label: "Forward", command: "nav:forward" },
    { area: "App", keys: ["Mod", "J"], label: "Ask about what is on screen (again to go back)", command: "ask:open" },
    { area: "App", keys: ["?"], label: "Show these shortcuts", command: "help:shortcuts" },
    { area: "Views", keys: ["Mod", "K"], label: "Query: find components and files by pattern" },
    { area: "Views", keys: ["Esc"], label: "Clear the selection, close a menu" },
    { area: "Views", keys: ["Enter"], label: "Open the selected node" },
    { area: "Focus", keys: ["F"], label: "Focus on the selection and its neighbours (Connections)" },
    { area: "Focus", keys: ["+"], label: "One hop more" },
    { area: "Focus", keys: ["−"], label: "One hop less" },
    { area: "Focus", keys: ["⌥", "←"], label: "Back to the previous focus" },
    { area: "Focus", keys: ["⌥", "→"], label: "Forward again" },
    { area: "Focus", keys: ["]"], label: "Walk to the strongest dependency (Connections)" },
    { area: "Focus", keys: ["["], label: "Walk to the strongest dependent (Connections)" },
    { area: "Selection", keys: ["Shift", "Click"], label: "Add to the selection" },
    { area: "Selection", keys: ["Shift", "Drag"], label: "Select an area" },
    { area: "Selection", keys: ["Mod", "G"], label: "Create a group from the selection" },
    { area: "Lens builder", keys: ["1–9"], label: "Put the question into group 1 to 9" },
    { area: "Lens builder", keys: ["N"], label: "New group from the question" },
    { area: "Lens builder", keys: ["X"], label: "Not in this cut" },
    { area: "Lens builder", keys: ["Mod", "Z"], label: "Undo" },
]

/** Whether a keydown matches a shortcut's keys (single keys, Mod+key and Mod+Shift+key). */
export function matches(event: KeyboardEvent, s: Shortcut): boolean {
    if (s.keys.length === 1) {
        return !event.metaKey && !event.ctrlKey && !event.altKey && event.key === s.keys[0]
    }
    const mod = event.metaKey || event.ctrlKey
    if (s.keys.length === 2 && s.keys[0] === "Mod") {
        return mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === s.keys[1].toLowerCase()
    }
    if (s.keys.length === 3 && s.keys[0] === "Mod" && s.keys[1] === "Shift") {
        return mod && !event.altKey && event.shiftKey && event.key.toLowerCase() === s.keys[2].toLowerCase()
    }
    return false
}

export function keyLabel(key: string, mac: boolean): string {
    if (key === "Mod") return mac ? "⌘" : "Ctrl"
    if (key === "Shift") return mac ? "⇧" : "Shift"
    if (key === "Enter") return mac ? "↵" : "Enter"
    return key
}
