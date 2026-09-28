# M7 · nopCommerce (.NET, r0) — port 4407 — Run 4, group B

Sandbox check: Reports = 0 before first report. OK.

Report created: "Architecture review" -> "Architecture review: nopCommerce" (14 cells; checked
on screen, not exported to PDF for this run).

## Checks

B4 ✓ `lib_npm/…` (elfinder) is not in "Least healthy components", and the table's note explains
production-code recognition on this old scan. Table 4 "Least healthy components": Nop.Web.
Framework.Menu (2.68), Nop.Services.ExportImport (2.82), Nop.Plugin.Misc.Forums.Public.
Controllers (2.97), Nop.Plugin.Payments.PayPalCommerce.Services (3.53), Nop.Plugin.Shipping.UPS.
API.Track (3.66), Nop.Services.Installation (3.94), Nop.Plugin.Shipping.UPS.API.Rates (4.19),
Nop.Web.Controllers (4.3) — no `lib_npm/elfinder` row. The lead-in sentence matches: "Among
components of 200 lines or more, the lowest rated are Nop.Web.Framework.Menu (2.7), Nop.
Services.ExportImport (2.8) and Nop.Plugin.Misc.Forums.Public.Controllers (3.0)." The table's
caption reads: "8 of 606. Production code only. This scan did not sort its files, so tests,
vendored libraries and files that are not code are recognised by their path, as the Overview
does." — the note now explicitly names "vendored libraries" as a path-recognised category, which
is what excludes `lib_npm/elfinder`. (Screenshots: shots/M7_B4_table4_health.png, shots/
M7_B4_table4_health2.png.) This directly fixes run 3's M7-3 [P1] finding, where elfinder was the
#1 lowest-health row and the caption's pattern list did not mention nopCommerce's `lib_npm`
vendoring convention.

## NEW findings

None.

## Summary

The one check in scope for this mission (B4) is fixed: the third-party vendored `lib_npm/
elfinder` JS bundle no longer appears in the Architecture review's "Least healthy components"
table or its lead-in sentence, and the table's caption now explains, in plain words, that this
old scan recognises tests, vendored libraries and non-code files by their path — closing the gap
that let elfinder through as "production" code in run 3.
