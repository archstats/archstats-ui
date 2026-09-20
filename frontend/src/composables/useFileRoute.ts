import { computed } from "vue";
import { useRoute } from "vue-router";
import { sqlLiteral } from "~/utils/sql";

// The file detail routes are `/views/files/<path...>` with an optional tab
// segment on the end. This is the one place that knows which trailing
// segments are tabs and not part of the path; the frame and every tab page
// resolve the file through it.
const TAB_SEGMENTS = new Set(["source", "imports", "history", "java"]);

export function useFileRoute() {
    const route = useRoute();

    const filePath = computed(() => {
        const raw = route.params.name;
        const parts = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
        if (parts.length > 1 && TAB_SEGMENTS.has(parts[parts.length - 1])) parts.pop();
        return parts.join("/");
    });

    // The path as a quoted SQL literal, ready to drop into a predicate.
    const escapedPath = computed(() => sqlLiteral(filePath.value));

    const fileBasename = computed(() => {
        const parts = filePath.value.split("/");
        return parts[parts.length - 1] || filePath.value;
    });

    return { filePath, escapedPath, fileBasename };
}
