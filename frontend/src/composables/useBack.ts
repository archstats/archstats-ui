import { useRouter } from "vue-router";

// History back when the user got here from inside the app; otherwise the
// family root, so a detail page opened first thing still has somewhere to go.
export function useBack(fallback: string): () => void {
    const router = useRouter();
    return () => {
        const state = typeof window !== "undefined" ? (window.history.state as { back?: string | null } | null) : null;
        if (state && state.back) {
            router.back();
        } else {
            void router.push(fallback);
        }
    };
}
