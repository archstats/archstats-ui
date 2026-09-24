import { acceptHMRUpdate, defineStore } from "pinia";
import { useGroupsStore } from "~/stores/groups";
import { readDurable, writeDurable } from "~/utils/durable";

// The lens: the one dimension the workspace is currently looked at through.
// Views colour, legend and roll up by it unless their own state says
// otherwise. Remembered per workspace; falls back to the first dimension
// that exists so there is always a lens once there are groups.

const PREFIX = "archstats.lens.";

export const useLensStore = defineStore("lens", {
  state: (): { dimension: string | null; storageKey: string | null; workspace: string } => ({ dimension: null, storageKey: null, workspace: "" }),
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
      this.workspace = workspaceKey;
      this.dimension = readDurable(workspaceKey, "lens.active", this.storageKey) || null;
    },
    set(dimension: string | null) {
      this.dimension = dimension;
      if (!this.storageKey) return;
      writeDurable(this.workspace, "lens.active", this.storageKey, dimension || null);
    },
  },
});

// Pinia keeps the store instance it already built when this module is hot
// replaced, so an action added while the dev server runs is missing from the
// live store until a full reload — and fails with "not a function", which
// reads exactly like a bug that is not there.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useLensStore, import.meta.hot));
