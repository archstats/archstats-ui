import { acceptHMRUpdate, defineStore } from "pinia";

// Pane widths are a preference, not data: one value per pane for the whole app,
// remembered across launches. `null` for the inspector means "the view's own
// default", so views can still suggest a width until the user drags it.
export const SIDEBAR = { min: 200, max: 360, default: 240 } as const;
export const INSPECTOR = { min: 280, max: 560, default: 340 } as const;

const KEY = "archstats.panes";

// Diagrams size themselves from the window resize event; a pane drag changes
// their box without one, so the store fires a debounced synthetic resize.
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
function notifyResize() {
  if (typeof window === "undefined") return;
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

export const usePanesStore = defineStore("panes", {
  state: () => ({
    sidebarWidth: SIDEBAR.default as number,
    inspectorWidth: null as number | null,
    loaded: false,
  }),
  actions: {
    load() {
      if (this.loaded) return;
      this.loaded = true;
      try {
        const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as { sidebarWidth?: number; inspectorWidth?: number | null };
        if (typeof saved.sidebarWidth === "number") this.sidebarWidth = clamp(saved.sidebarWidth, SIDEBAR.min, SIDEBAR.max);
        if (typeof saved.inspectorWidth === "number") this.inspectorWidth = clamp(saved.inspectorWidth, INSPECTOR.min, INSPECTOR.max);
      } catch {
        // A corrupt or unavailable store just means defaults.
      }
    },
    setSidebar(width: number) {
      this.sidebarWidth = clamp(width, SIDEBAR.min, SIDEBAR.max);
      this.persist();
      notifyResize();
    },
    setInspector(width: number | null) {
      this.inspectorWidth = width === null ? null : clamp(width, INSPECTOR.min, INSPECTOR.max);
      this.persist();
      notifyResize();
    },
    persist() {
      try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(KEY, JSON.stringify({ sidebarWidth: this.sidebarWidth, inspectorWidth: this.inspectorWidth }));
      } catch {
        // Persistence is best effort.
      }
    },
  },
});

// Pinia keeps the store instance it already built when this module is hot
// replaced, so an action added while the dev server runs is missing from the
// live store until a full reload — and fails with "not a function", which
// reads exactly like a bug that is not there.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(usePanesStore, import.meta.hot));
