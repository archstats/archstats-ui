import { chartTheme } from "~/composables/useChartTheme";

// Shared vocabulary for the Java detail tabs: which snippet types name a
// role, how roles rank when a class has several, which data hue draws each
// one, and the layering rules both tabs flag. Nothing here runs SQL.

export type JavaRole =
    | "Controller" | "Service" | "Repository" | "Component" | "Configuration"
    | "Entity" | "Interface" | "Record" | "Class";

export const ROLE_SNIPPET_TYPES: Record<string, JavaRole> = {
    java__spring__controller: "Controller",
    java__spring__service: "Service",
    java__spring__repository: "Repository",
    java__spring__component: "Component",
    java__spring__configuration: "Configuration",
    java__jpa__entity: "Entity",
    java__interface__declaration: "Interface",
    java__record__declaration: "Record",
    java__class__declaration: "Class",
};

export const ROLE_SNIPPET_TYPE_LIST = Object.keys(ROLE_SNIPPET_TYPES);
export const IMPORT_SNIPPET_TYPE = "java__import__declaration";

// The roles that make a file a Spring bean.
export const BEAN_ROLES: ReadonlySet<JavaRole> = new Set(["Controller", "Service", "Repository", "Component", "Configuration"]);

// Rank for picking a single role to show or colour: the most specific wins.
const ROLE_RANK: JavaRole[] = ["Controller", "Service", "Repository", "Entity", "Configuration", "Component", "Interface", "Record", "Class"];

export const ROLE_OPTIONS: JavaRole[] = [...ROLE_RANK];

export function primaryRole(roles: Iterable<JavaRole>): JavaRole | null {
    const set = new Set(roles);
    for (const r of ROLE_RANK) if (set.has(r)) return r;
    return null;
}

export function addRoleFromSnippet(roles: Set<JavaRole>, snippetType: string): void {
    const role = ROLE_SNIPPET_TYPES[snippetType];
    if (role) roles.add(role);
}

// Sorted, de-duplicated roles for a tag row.
export function sortedRoles(roles: Iterable<JavaRole>): JavaRole[] {
    const set = new Set(roles);
    return ROLE_RANK.filter(r => set.has(r));
}

export function isBean(roles: Iterable<JavaRole>): boolean {
    for (const r of roles) if (BEAN_ROLES.has(r)) return true;
    return false;
}

// Data hue for a role in an SVG, from the live theme.
export function roleColor(role: JavaRole | null | undefined): string {
    const t = chartTheme();
    switch (role) {
        case "Controller": return t.blue;
        case "Service": return t.green;
        case "Repository": return t.amber;
        case "Entity": return t.violet;
        default: return t.inkMuted;
    }
}

// Tailwind class for the same hue, for legends and dots in templates.
export function roleDotClass(role: JavaRole | null | undefined): string {
    switch (role) {
        case "Controller": return "bg-blue-500";
        case "Service": return "bg-green-500";
        case "Repository": return "bg-amber-500";
        case "Entity": return "bg-violet-500";
        default: return "bg-neutral-400";
    }
}

export function basename(path: string): string {
    const i = path.lastIndexOf("/");
    return i === -1 ? path : path.slice(i + 1);
}

export function classLabel(path: string): string {
    return basename(path).replace(/\.java$/, "");
}

export function simpleClassName(fullClass: string): string {
    const i = fullClass.lastIndexOf(".");
    return i === -1 ? fullClass : fullClass.slice(i + 1);
}

// One end of a class reference as the rule checker sees it.
export interface FlagEnd { label: string; file: string; roles: ReadonlySet<JavaRole> }
export interface FlagEdge { from: FlagEnd; to: FlagEnd; references: number }
export interface FlagBean { label: string; file: string; roles: ReadonlySet<JavaRole>; fields: number }

export interface StructuralFlag {
    key: string;
    rule: string;
    from: { label: string; file: string };
    to: { label: string; file: string } | null;
    detail: string;
}

export const STATEFUL_FIELD_THRESHOLD = 5;

// The layering rules: a controller reaching past its service into a
// repository, a service or repository reaching back up to the web layer,
// and a singleton bean that carries many fields. Each flag comes from a
// recorded import edge or a recorded field count, never from a name guess.
export function structuralFlags(edges: FlagEdge[], beans: FlagBean[]): StructuralFlag[] {
    const out: StructuralFlag[] = [];
    for (const e of edges) {
        const from = { label: e.from.label, file: e.from.file };
        const to = { label: e.to.label, file: e.to.file };
        const refs = e.references === 1 ? "1 import" : `${e.references} imports`;
        if (e.from.roles.has("Controller") && e.to.roles.has("Repository")) {
            out.push({ key: `c-r:${e.from.file}:${e.to.file}`, rule: "Controller imports repository", from, to, detail: `${refs}; bypasses the service layer` });
        }
        if (e.from.roles.has("Service") && e.to.roles.has("Controller")) {
            out.push({ key: `s-c:${e.from.file}:${e.to.file}`, rule: "Service imports controller", from, to, detail: `${refs}; reaches back into the web layer` });
        }
        if (e.from.roles.has("Repository") && (e.to.roles.has("Controller") || e.to.roles.has("Service"))) {
            const layer = e.to.roles.has("Controller") ? "controller" : "service";
            out.push({ key: `r-up:${e.from.file}:${e.to.file}`, rule: `Repository imports ${layer}`, from, to, detail: `${refs}; persistence depends on a layer above it` });
        }
    }
    for (const b of beans) {
        const singleton = b.roles.has("Controller") || b.roles.has("Service") || b.roles.has("Component");
        if (singleton && b.fields >= STATEFUL_FIELD_THRESHOLD) {
            out.push({ key: `fields:${b.file}`, rule: "Singleton with many fields", from: { label: b.label, file: b.file }, to: null, detail: `declares ${b.fields} fields` });
        }
    }
    return out.sort((a, b) => a.rule.localeCompare(b.rule) || a.from.label.localeCompare(b.from.label) || (a.to?.label ?? "").localeCompare(b.to?.label ?? ""));
}
