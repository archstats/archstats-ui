import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const stored: Record<string, string> = { lens: '"layers"' };
let answer: ((v: Record<string, string>) => void) | null = null;
const putMany = vi.fn();

vi.mock("wailsjs/go/app/StateService", () => ({
    Workspace: () => new Promise(r => { answer = r; }),
    PutMany: (ws: string, batch: Record<string, string>) => putMany(ws, batch),
    PutSetting: () => Promise.resolve(),
    Settings: () => Promise.resolve({}),
}));

import { useStateStore } from "./state.store";

describe("state store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        putMany.mockReset();
        answer = null;
    });
    const asked = () => vi.waitFor(() => { if (!answer) throw new Error("not asked yet"); });

    it("keeps a value set while the workspace's values were still loading", async () => {
        const state = useStateStore();
        const loading = state.hydrate("ws");
        await asked();
        state.set("lens", "domains");
        answer!(stored);
        await loading;
        expect(state.get("lens", "")).toBe("domains");
    });

    it("keeps a write that failed to save for the next flush", async () => {
        const state = useStateStore();
        const loading = state.hydrate("ws");
        await asked();
        answer!({});
        await loading;
        state.set("facet", "tests");
        putMany.mockRejectedValueOnce(new Error("busy"));
        await state.flush();
        putMany.mockResolvedValueOnce(undefined);
        await state.flush();
        expect(putMany).toHaveBeenLastCalledWith("ws", { facet: '"tests"' });
    });
});
