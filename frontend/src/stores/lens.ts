import { acceptHMRUpdate, defineStore } from "pinia";
import { useGroupsStore } from "~/stores/groups";

// The lens: the one dimension the workspace is currently looked at through.
// Views colour, legend and roll up by it unless their own state says
// otherwise. Remembered per workspace; falls back to the first dimension
// that exists so there is always a lens once there are groups.

const PREFIX = "archstats.lens.";

export const useLensStore = defineStore("lens", {
  state: (): { dimension: string | null; storageKey: string | null } => ({ dimension: null, storageKey: null }),
  getters: {
    /** The chosen dimension when it still exists, else the first one, else null. */
    active(state): string | null {
      const dims = useGroupsStore().dimensions;
      if (state.dimension && dims.includes(state.dimension)) return state.dimension;
      return dims[0] ?? null;
    },
    /** True when the user picked this one, as opposed to the fallback. */
    isChosen(state): boolean {
      return !!state.dimension && useGroupsStore().dimensions.includes(state.dimension);
    },
  },
  actions: {
    load(workspaceKey: string) {
      this.storageKey = PREFIX + workspaceKey;
      try { this.dimension = localStorage.getItem(this.storageKey) || null; } catch { this.dimension = null; }
    },
    set(dimension: string | null) {
      this.dimension = dimension;
      try {
        if (!this.storageKey) return;
        if (dimension) localStorage.setItem(this.storageKey, dimension); else localStorage.removeItem(this.storageKey);
      } catch {}
    },
  },
});

// Pinia keeps the store instance it already built when this module is hot
// replaced, so an action added while the dev server runs is missing from the
// live store until a full reload — and fails with "not a function", which
// reads exactly like a bug that is not there.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useLensStore, import.meta.hot));
