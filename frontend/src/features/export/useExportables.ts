import { computed, getCurrentInstance, onBeforeUnmount, shallowReactive } from "vue";
import type { ExportColumn, ExportRow } from "./export";
import type { FigureLegend, FigureOptions, FigureOutput } from "./figure";

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
    /** How the numbers were made, written into the CSV preamble. */
    notes?: () => Array<[string, string]>;
    /** Why there is nothing to export, when there is not. */
    disabledReason?: () => string | null;
    /** False while columns still load after the rows appear; a take waits for it. */
    ready?: () => boolean;
    /**
     * Adds the table to a report its own way (the SQL console adds its query,
     * which the report runs again), in place of a copy of the rows.
     */
    addToReport?: () => void | Promise<void>;
}

export interface FigureExportable {
    kind: "figure";
    title: string;
    ready: () => boolean;
    render: (opts: FigureOptions) => FigureOutput | null | Promise<FigureOutput | null>;
    /** A canvas figure has no SVG form. */
    svg?: boolean;
    /** What the marks mean, in the window's colours. Every export draws it under the figure unless the reader leaves it out. */
    legend: () => FigureLegend;
    /** Whether the figure's frame shows the legend in the app, before the reader says otherwise. */
    legendInUi: () => boolean;
}

/**
 * What every figure declares besides its drawing. The legend is required:
 * a figure pasted into a report has no view around it, so it must say what
 * its colours, lines and sizes mean. Where the view already says so (labels
 * on the marks, a legend that is also a set of filters), `legendInUi: false`
 * keeps the frame from saying it twice; the export still carries it.
 */
export interface FigureSpec {
    title: string | (() => string);
    legend: () => FigureLegend;
    /** Default true. */
    legendInUi?: boolean | (() => boolean);
}

const specFields = (spec: FigureSpec) => ({
    legend: spec.legend,
    legendInUi: typeof spec.legendInUi === "function" ? spec.legendInUi : () => spec.legendInUi !== false,
});

export interface DocumentExportable {
    kind: "document";
    title: string;
    /** The menu item, e.g. "Copy methodology". */
    label: string;
    markdown: () => string | Promise<string>;
    /** Also offer "Save Markdown…". */
    savable?: boolean;
    /** A save of its own (a report with its figures); resolves to the path, or null when cancelled. */
    save?: () => Promise<string | null>;
    /** The label of that save, e.g. "Report as Markdown…". */
    saveLabel?: string;
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

/** Whether an item has something to hand over now: a drawn figure, a table with rows. */
export function usable(i: Exportable): boolean {
    if (i.kind === "figure") return i.ready();
    if (i.disabledReason?.()) return false;
    if (i.kind === "table" && i.ready && !i.ready()) return false;
    return i.kind !== "table" || i.rows().length > 0;
}

/**
 * What the view hands a report's slot of this kind: the usable item of that
 * kind registered last, which is the most specific (a grain's own table
 * mounts after the page's), else any usable item.
 */
export function pickFor(kind: Exportable["kind"] | undefined, take?: string): Exportable | null {
    const ok = [...registry.values()].sort((a, b) => a.order - b.order).map(e => e.item).filter(usable);
    // A slot that names what it wants gets that or nothing: on the Authors page
    // the leaderboard (names, emails) is ready before the knowledge table, and
    // "any table" took it.
    // Alternatives are separated by "|", first choice first: "Boundary flow|How the layers lean".
    if (take) {
        for (const want of take.toLowerCase().split("|").map(w => w.trim()).filter(Boolean)) {
            const hit = [...ok].reverse().find(i => (!kind || i.kind === kind) && i.title.toLowerCase().startsWith(want));
            if (hit) return hit;
        }
        return null;
    }
    return [...ok].reverse().find(i => i.kind === kind) ?? ok.find(i => i.kind !== "document") ?? ok[0] ?? null;
}

// For scripts/figure-check.mjs: the live registry, in development only. Importing the module
// from outside can load a second copy (after a reload) with a registry of its own.
if (import.meta.env?.DEV && typeof window !== "undefined") (window as any).__archstatsExportables = () => exportables.value;

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
 * Registers a table and returns the handle an <ExhibitFrame> takes. The spec
 * object itself is registered, so getters on it (a title that follows the
 * view's state) stay live.
 */
export function useTable(spec: Omit<TableExportable, "kind">): TableExportable {
    const item = Object.assign(spec, { kind: "table" as const }) as TableExportable;
    useExportables().register(item);
    return item;
}

/**
 * Registers a figure with its own ready and render, for charts that are not
 * one live <svg> or <canvas> (a drawing made for export, a grid of divs).
 * Returns the handle an <ExhibitFrame> takes.
 */
export function useFigure(spec: FigureSpec & { ready: () => boolean; render: FigureExportable["render"]; svg?: boolean }): FigureExportable {
    const { register } = useExportables();
    const item: FigureExportable = {
        kind: "figure",
        get title() { return typeof spec.title === "function" ? spec.title() : spec.title; },
        ready: spec.ready,
        render: spec.render,
        svg: spec.svg,
        ...specFields(spec),
    };
    register(item);
    return item;
}

/**
 * Registers an SVG chart as a figure: the element when it is drawn, at the
 * size it is drawn. Every chart made of one <svg> exports this way.
 */
export function useSvgFigure(spec: FigureSpec & {
    svg: () => SVGSVGElement | null | undefined;
    /** The chart covers its area with data colours (a map of tiles), so its most common colour is not its ground. */
    filled?: boolean;
}): FigureExportable {
    return useFigure({
        ...spec,
        // Drawn, on screen, and the element this component shows now: a stale reference
        // (an svg swapped out by v-if or a reload) measures nothing and is not ready.
        ready: () => {
            const el = spec.svg();
            if (!el || !el.isConnected || !el.querySelector("path, rect, circle, line, text, polygon, polyline, ellipse")) return false;
            const box = el.getBoundingClientRect();
            return box.width > 1 && box.height > 1;
        },
        svg: true,
        render: () => {
            const el = spec.svg();
            if (!el || !el.firstChild) return null;
            const box = el.getBoundingClientRect();
            return { kind: "svg", svg: el, width: Math.round(box.width), height: Math.round(box.height), ...(spec.filled ? { filled: true } : {}) };
        },
    });
}

/** A canvas drawing as an exportable figure: PNG only, at the canvas's own pixel density. */
export function useCanvasFigure(spec: FigureSpec & { canvas: () => HTMLCanvasElement | null | undefined }): FigureExportable {
    return useFigure({
        ...spec,
        svg: false,
        ready: () => {
            const el = spec.canvas();
            if (!el || !el.isConnected) return false;
            const box = el.getBoundingClientRect();
            return box.width > 1 && box.height > 1;
        },
        render: () => {
            const el = spec.canvas();
            if (!el) return null;
            const box = el.getBoundingClientRect();
            return { kind: "canvas", canvas: el, width: Math.round(box.width), height: Math.round(box.height), scale: el.width / Math.max(1, box.width) };
        },
    });
}
