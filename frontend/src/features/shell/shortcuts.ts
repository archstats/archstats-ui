// Every keyboard shortcut the app answers to, in one list: the "?" sheet
// reads it, and the global handler binds the ones that name a command.
// "Mod" is ⌘ on macOS and Ctrl elsewhere.

import { t } from "~/shared/i18n"

export interface Shortcut {
    keys: string[]
    label: string
    area: "App" | "Views" | "Focus" | "Selection" | "Lens builder"
    /** A command id from utils/commands, for shortcuts the shell binds itself. */
    command?: string
}

export const SHORTCUTS: Shortcut[] = [
    { area: t("shell.shortcuts.app"), keys: ["Mod", "R"], label: t("shell.shortcuts.scanAgain"), command: "scan:again" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", "P"], label: t("shell.shortcuts.goAnything"), command: "goto" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", "E"], label: t("shell.shortcuts.exportCurrentView"), command: "export" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", "O"], label: t("shell.shortcuts.importSnapshotFile"), command: "snapshot:import" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", "N"], label: t("shell.shortcuts.addFolderWorkspace"), command: "workspace:new" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", "Shift", "N"], label: t("shell.shortcuts.cloneRepository"), command: "workspace:clone" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", "["], label: t("shell.shortcuts.back"), command: "nav:back" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", "]"], label: t("shell.shortcuts.forward"), command: "nav:forward" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", "J"], label: t("shell.shortcuts.askAboutWhatScreen"), command: "ask:open" },
    { area: t("shell.shortcuts.app"), keys: ["Mod", ","], label: t("shell.shortcuts.settings"), command: "settings:open" },
    { area: t("shell.shortcuts.app"), keys: ["?"], label: t("shell.shortcuts.showTheseShortcuts"), command: "help:shortcuts" },
    { area: t("shell.shortcuts.views"), keys: ["Mod", "K"], label: t("shell.shortcuts.queryFindComponentsFiles") },
    { area: t("shell.shortcuts.views"), keys: ["Esc"], label: t("shell.shortcuts.clearSelectionCloseMenu") },
    { area: t("shell.shortcuts.views"), keys: ["Enter"], label: t("shell.shortcuts.openSelectedNode") },
    { area: t("shell.shortcuts.focus"), keys: ["F"], label: t("shell.shortcuts.focusSelectionNeighboursConnections") },
    { area: t("shell.shortcuts.focus"), keys: ["+"], label: t("shell.shortcuts.oneHopMore") },
    { area: t("shell.shortcuts.focus"), keys: ["−"], label: t("shell.shortcuts.oneHopLess") },
    { area: t("shell.shortcuts.focus"), keys: ["⌥", "←"], label: t("shell.shortcuts.backPreviousFocus") },
    { area: t("shell.shortcuts.focus"), keys: ["⌥", "→"], label: t("shell.shortcuts.forwardAgain") },
    { area: t("shell.shortcuts.focus"), keys: ["]"], label: t("shell.shortcuts.walkStrongestDependencyConnections") },
    { area: t("shell.shortcuts.focus"), keys: ["["], label: t("shell.shortcuts.walkStrongestDependentConnections") },
    { area: t("shell.shortcuts.selection"), keys: ["Shift", "Click"], label: t("shell.shortcuts.addSelection") },
    { area: t("shell.shortcuts.selection"), keys: ["Shift", "Drag"], label: t("shell.shortcuts.selectArea") },
    { area: t("shell.shortcuts.selection"), keys: ["Mod", "G"], label: t("shell.shortcuts.createGroupSelection") },
    { area: t("shell.shortcuts.lensBuilder"), keys: ["1–9"], label: t("shell.shortcuts.putQuestionGroup1") },
    { area: t("shell.shortcuts.lensBuilder"), keys: ["N"], label: t("shell.shortcuts.newGroupQuestion") },
    { area: t("shell.shortcuts.lensBuilder"), keys: ["X"], label: t("shell.shortcuts.notCut") },
    { area: t("shell.shortcuts.lensBuilder"), keys: ["Mod", "Z"], label: t("shell.shortcuts.undo") },
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
    if (key === "Mod") return mac ? "⌘" : t("shell.shortcuts.ctrl")
    if (key === "Shift") return mac ? "⇧" : t("shell.shortcuts.shift")
    if (key === "Enter") return mac ? "↵" : t("shell.shortcuts.enter")
    return key
}
