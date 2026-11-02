import { describe, expect, it } from "vitest"
import { compactSignature, declaredKind, definitionPreview } from "~/features/files/definitionPreview"

describe("definitionPreview", () => {
    it("takes the doc comment and annotations apart from the code", () => {
        const lines = [
            "/**",                                              // 1
            " * Retrieves {@link Loan}s for a client.",         // 2
            " * <p>Paged.",                                     // 3
            " * @param clientId the client",                    // 4
            " */",                                              // 5
            "@GET",                                             // 6
            "@Path(\"/loans\")",                                // 7
            "@Operation(summary = \"List\",",                   // 8
            "    description = \"(long)\")",                    // 9
            "public String retrieveAll(",                       // 10
            "        final Long clientId) {",                   // 11
            "    context.check();",                             // 12
            "    return list(clientId);",                       // 13
            "}",                                                // 14
        ]
        const p = definitionPreview(lines, 1, "retrieveAll")!
        expect(p.doc).toBe("Retrieves Loans for a client. Paged.")
        expect(p.annotations).toEqual(["@GET", "@Path", "@Operation"])
        expect(p.declaration).toBe("public String retrieveAll(final Long clientId) {")
        expect(p.bodyStart).toBe(12)
        expect(p.body).toEqual(["    context.check();", "    return list(clientId);"])
        expect(p.more).toBe(false)
    })

    it("reads a type with no doc and shows its members", () => {
        const lines = ["package a;", "", "public abstract class Expression {", "", "    public boolean canBeIgnored() {", "        return false;", "    }"]
        const p = definitionPreview(lines, 3, "Expression")!
        expect(p.doc).toBe("")
        expect(p.declaration).toBe("public abstract class Expression {")
        expect(p.body[0]).toBe("    public boolean canBeIgnored() {")
        expect(p.bodyStart).toBe(5)
        expect(declaredKind(p.declaration)).toBe("abstract class")
    })

    it("reads C# attributes and triple-slash docs", () => {
        const lines = ["/// <summary>", "/// Sends the <see cref=\"Mail\"/> out.", "/// </summary>", "[HttpPost]", "public async Task SendAsync() {", "  await Go();", "}"]
        const p = definitionPreview(lines, 1, "SendAsync")!
        expect(p.doc).toBe("Sends the Mail out.")
        expect(p.annotations).toEqual(["[HttpPost]"])
        expect(p.body).toEqual(["  await Go();"])
    })

    it("reads a doc comment and annotations above where the definition starts", () => {
        const lines = ["/**", " * Lookup by name.", " */", "@Deprecated", "public enum LookupMode {", "    NAME,", "}"]
        const p = definitionPreview(lines, 5, "LookupMode")!
        expect(p.doc).toBe("Lookup by name.")
        expect(p.annotations).toEqual(["@Deprecated"])
        expect(p.body).toEqual(["    NAME,"])
    })

    it("reads Go comments and Python docstrings as docs", () => {
        const go = ["// Run starts the scan.", "// It blocks.", "func Run() {", "\tgo()", "}"]
        expect(definitionPreview(go, 3, "Run")!.doc).toBe("Run starts the scan. It blocks.")
        const py = ["def scan(path):", "    \"\"\"Scan a path.", "", "    Slowly.\"\"\"", "    return walk(path)"]
        const p = definitionPreview(py, 1, "scan")!
        expect(p.doc).toBe("Scan a path. Slowly.")
        expect(p.body).toEqual(["    return walk(path)"])
    })

    it("takes the declaration's own annotations from a decorated block above it", () => {
        const lines = [
            "    }",
            "",
            "    @GET",
            "    @Operation(summary = \"List\", description = \"Loans\"",
            "            + \"more\")",
            "    @ApiResponses({",
            "            @ApiResponse(responseCode = \"200\") })",
            "    public String retrieveAll(@Context final UriInfo uriInfo,",
            "            // @QueryParam(\"x\") final String x,",
            "            @QueryParam(\"offset\") @Parameter(description = \"offset\") final Integer offset) {",
            "        return list();",
            "    }",
        ]
        const p = definitionPreview(lines, 8, "retrieveAll")!
        expect(p.annotations).toEqual(["@GET", "@Operation", "@ApiResponses"])
        expect(p.declaration).toBe("public String retrieveAll(final UriInfo uriInfo, final Integer offset) {")
        expect(p.body).toEqual(["    return list();"])
    })

    it("cuts a long parameter list short", () => {
        const sig = "public LoanAccountData associationsAndTemplate(final LoanScheduleData repaymentSchedule, final Collection<LoanTransactionData> transactions, final Collection<LoanChargeData> charges, final CalendarData calendarData) {"
        expect(compactSignature([sig])).toBe("public LoanAccountData associationsAndTemplate(final LoanScheduleData repaymentSchedule, … +3) {")
    })
})
