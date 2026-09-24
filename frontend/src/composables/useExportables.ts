import { computed, getCurrentInstance, onBeforeUnmount, shallowReactive } from "vue";
import type { ExportColumn, ExportRow } from "~/utils/export";
import type { FigureOptions, FigureOutput } from "~/utils/figure";

// What the current view can hand over. Views, tables and charts register what
// they hold while mounted; the Export menu (⌘E) lists whatever is registered.
// A module-level registry rather than provide/inject: the page, the charts in
// its slots and the inspector all register, and they sit on different
// branches of the component tree.

export interface TableExportable {
    kind: "table";
    title: string;
    /** Every row in scope, after filter and sort: never the page on screen. */
    rows: () => ExportRow[];
    columns: () => ExportColumn[];
    /** Why there is nothing to export, when there is not. */
    disabledReason?: () => string | null;
}

export interface FigureExportable {
    kind: "figure";
    title: string;
    ready: () => boolean;
    render: (opts: FigureOptions) => FigureOutput | null | Promise<FigureOutput | null>;
    /** A canvas figure has no SVG form. */
    svg?: boolean;
}

export interface DocumentExportable {
    kind: "document";
    title: string;
    /** The menu item, e.g. "Copy methodology". */
    label: string;
    markdown: () => string | Promise<string>;
    /** Also offer "Save Markdown…". */
    savable?: boolean;
    disabledReason?: () => string | null;
}

export type Exportable = TableExportable | FigureExportable | DocumentExportable;

interface Entry { key: number; order: number; item: Exportable }

const registry = shallowReactive(new Map<number, Entry>());
let nextKey = 1;

/** Everything registered, figures first, then tables, then documents; in mount order within each. */
export const exportables = computed(() => {
    const rank = { figure: 0, table: 1, document: 2 } as const;
    return [...registry.values()].sort((a, b) => rank[a.item.kind] - rank[b.item.kind] || a.order - b.order).map(e => e.item);
});

/**
 * Registers exportables for as long as the calling component is mounted.
 * Returns an unregister for items that come and go with state.
 */
export function useExportables() {
    const mine: number[] = [];
    function register(item: Exportable): () => void {
        const key = nextKey++;
        registry.set(key, { key, order: key, item });
        mine.push(key);
        return () => { registry.delete(key); };
    }
    if (getCurrentInstance()) onBeforeUnmount(() => mine.forEach(k => registry.delete(k)));
    return { register };
}

/**
 * Registers an SVG chart as a figure: the element when it is drawn, at the
 * size it is drawn. Every chart made of one <svg> exports this way.
 */
export function useSvgFigure(title: string | (() => string), svg: () => SVGSVGElement | null | undefined, legend?: () => import("~/utils/figure").LegendItem[]) {
    const { register } = useExportables();
    register({
        kind: "figure",
        get title() { return typeof title === "function" ? title() : title; },
        ready: () => !!svg()?.firstChild,
        svg: true,
        render: () => {
            const el = svg();
            if (!el || !el.firstChild) return null;
            const box = el.getBoundingClientRect();
            return { kind: "svg", svg: el, width: Math.round(box.width), height: Math.round(box.height), legend: legend?.() };
        },
    });
}
