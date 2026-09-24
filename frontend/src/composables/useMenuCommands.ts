import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { EventsOn, OnFileDrop, OnFileDropOff } from "wailsjs/runtime/runtime";
import { TakePendingSnapshots } from "wailsjs/go/app/AppService";
import { SetState } from "wailsjs/go/app/MenuService";
import { PickSnapshot, RevealSnapshot, SaveSnapshotCopy } from "wailsjs/go/app/WorkspaceService";
import { useDataStore } from "~/stores/data";
import { useWorkspacesStore } from "~/stores/workspaces";
import { hasCommand, registerCommand, runCommand } from "~/utils/commands";
import { SHORTCUTS, matches } from "~/utils/shortcuts";

// The shell's commands: registered once in the layout, run from the native
// menu (macOS) or the keyboard (everywhere). Keeps the menu's enabled items
// in step with the app.
export function useMenuCommands() {
    const router = useRouter();
    const workspaces = useWorkspacesStore();
    const data = useDataStore();
    const shortcutsOpen = ref(false);
    const off: Array<() => void> = [];

    off.push(registerCommand("scan:again", () => { void workspaces.startScan(); }));
    off.push(registerCommand("workspace:new", () => { void workspaces.addWorkspace(); }));
    off.push(registerCommand("nav:back", () => router.back()));
    off.push(registerCommand("nav:forward", () => router.forward()));
    off.push(registerCommand("help:shortcuts", () => { shortcutsOpen.value = true; }));
    off.push(registerCommand("help:metrics", () => { void router.push("/views/reference"); }));
    // The open snapshot's file: shown, or copied out with its source.
    off.push(registerCommand("snapshot:reveal", async () => { if (workspaces.openScanId) await RevealSnapshot(workspaces.openScanId); }));
    off.push(registerCommand("snapshot:save", async () => { if (workspaces.openScanId) await SaveSnapshotCopy(workspaces.openScanId, true); }));
    // A snapshot from elsewhere: picked (⌘O), dropped on the window, or
    // named on the command line (at launch or to the running app).
    off.push(registerCommand("snapshot:import", async () => { const p = await PickSnapshot(); if (p) workspaces.importPath = p; }));
    async function takePending() {
        try { const paths = (await TakePendingSnapshots()) ?? []; if (paths.length) workspaces.importPath = paths[0]; } catch { /* not in the desktop shell */ }
    }

    function onKey(event: KeyboardEvent) {
        const t = event.target as HTMLElement | null;
        const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
        for (const s of SHORTCUTS) {
            if (!s.command || !matches(event, s)) continue;
            // A bare key ("?") types into a field; a Mod combo is always a command.
            if (typing && s.keys.length === 1) return;
            if (!hasCommand(s.command)) return;
            event.preventDefault();
            void runCommand(s.command);
            return;
        }
    }

    let unlisten: (() => void) | null = null;
    let unlistenImport: (() => void) | null = null;
    onMounted(() => {
        window.addEventListener("keydown", onKey);
        try { unlisten = EventsOn("menu", (id: string) => { void runCommand(id); }); } catch { unlisten = null; }
        try { unlistenImport = EventsOn("import:pending", () => { void takePending(); }); } catch { unlistenImport = null; }
        try {
            OnFileDrop((_x: number, _y: number, paths: string[]) => {
                const db = paths.find(p => p.toLowerCase().endsWith(".db"));
                if (db) workspaces.importPath = db;
            }, false);
        } catch { /* not in the desktop shell */ }
        // Wait for the workspace list so the sheet can suggest one.
        let taken = false;
        watch(() => workspaces.loaded, (l) => { if (l && !taken) { taken = true; void takePending(); } }, { immediate: true });
    });
    onBeforeUnmount(() => {
        window.removeEventListener("keydown", onKey);
        unlisten?.();
        unlistenImport?.();
        try { OnFileDropOff(); } catch { /* not in the desktop shell */ }
        off.forEach(f => f());
    });

    watch(
        () => ({ hasWorkspace: !!workspaces.active, hasSnapshot: !!data.hasData, scanning: !!workspaces.isScanning, canExport: !!data.hasData }),
        (state) => { try { void SetState(state as any); } catch { /* no native menu here */ } },
        { immediate: true, deep: true },
    );

    return { shortcutsOpen };
}
