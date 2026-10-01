// What each analysis revision changed, in the words a reader of an older
// snapshot needs: why a number they see may no longer be what a new scan
// says. Mirrors the log in the engine's core/revision.go; a revision the app
// does not know yet reads as "a newer analysis".

import { t } from "~/shared/i18n"

export const REVISION_REASONS: Record<number, string[]> = {
    1: [
        t("snapshot.revisions.rulesScopedEcosystemSo"),
        t("snapshot.revisions.vendoredGeneratedNonCode"),
        t("snapshot.revisions.gitIdentitiesOnePerson"),
        t("snapshot.revisions.phpKotlinDeclareUnits"),
        t("snapshot.revisions.cycleCountsEachComponents"),
    ],
    2: [
        t("snapshot.revisions.gitHistoryFollowsRenames"),
        t("snapshot.revisions.timeWindowsCountBack"),
        t("snapshot.revisions.eachSnapshotRecordsCommit"),
        t("snapshot.revisions.coChangeNoLonger"),
        t("snapshot.revisions.filesCarryRoleProduction"),
        t("snapshot.revisions.snapshotsSayWhatWalker"),
    ],
    3: [
        t("snapshot.revisions.snapshotsSmallerPairsFiles"),
        t("snapshot.revisions.workspaceSOwnIgnore"),
        t("snapshot.revisions.filePairsChangeTogether"),
        t("snapshot.revisions.ambiguousRuntimeLookupResolves"),
    ],
    6: [
        t("snapshot.revisions.indentationMeasuredWidthEach"),
    ],
    7: [
        t("snapshot.revisions.swiftObjectiveCDart"),
        t("snapshot.revisions.swiftPackagesXcodeTargets"),
        t("snapshot.revisions.kotlinAnnotationsMarkDeclaration"),
        t("snapshot.revisions.whatAppDeclaresPlatform"),
    ],
}

/** Every reason between the revision a snapshot was written with and the current one. */
export function reasonsBetween(from: number, to: number): string[] {
    const out: string[] = []
    for (let r = Math.max(1, from + 1); r <= to; r++) {
        out.push(...(REVISION_REASONS[r] ?? [t("snapshot.revisions.analysisRevisionChangedHow", { r })]))
    }
    return out
}
