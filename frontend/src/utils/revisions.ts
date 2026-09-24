// What each analysis revision changed, in the words a reader of an older
// snapshot needs: why a number they see may no longer be what a new scan
// says. Mirrors the log in the engine's core/revision.go; a revision the app
// does not know yet reads as "a newer analysis".

export const REVISION_REASONS: Record<number, string[]> = {
    1: [
        "Rules are scoped by ecosystem, so another language's rule no longer reads as kept.",
        "Vendored, generated and non-code files are counted but no longer scored for health.",
        "Git identities that are one person are merged by email.",
        "PHP and Kotlin declare units; TypeScript workspace packages resolve to their source.",
        "A cycle counts each of its components once; path lengths count hops.",
    ],
    2: [
        "Git history follows renames, so a moved file keeps its commits, age and authors.",
        "Time windows count back from the scanned commit, not from the day of the scan.",
        "Each snapshot records the commit, branch and uncommitted files it read.",
        "Co-change no longer counts a component without commits as sharing all of its partner's.",
        "Files carry a role (production, test, generated, third-party, non-code) and health scores keep their deductions.",
    ],
}

/** Every reason between the revision a snapshot was written with and the current one. */
export function reasonsBetween(from: number, to: number): string[] {
    const out: string[] = []
    for (let r = Math.max(1, from + 1); r <= to; r++) {
        out.push(...(REVISION_REASONS[r] ?? [`Analysis revision ${r} changed how scans are read.`]))
    }
    return out
}
