---
target: the query bar
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/frontend/src/components/groups/QueryBar.vue"
target_fingerprint: "sha256:9381a52e3661c070089d8f47f8e4076677ea4da2cab2a95c3852031081d5082b"
target_path: /Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/frontend/src/components/groups/QueryBar.vue
timestamp: 2026-09-20T13-41-51Z
slug: frontend-src-components-groups-querybar-vue
---
Method: dual-agent (A: design review · B: detector + measured browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | 85px of a typed pattern clipped, no ellipsis, no scroll; field has no focus ring |
| 2 | Match System / Real World | 4 | Glob/!/# idiom and metric vocabulary match how architects think |
| 3 | User Control and Freedom | 2 | No undo or edit path after Keep commits and resets the query |
| 4 | Consistency and Standards | 3 | Every button has an accent focus ring; the field itself has none |
| 5 | Error Prevention | 2 | A malformed pattern and an honest zero-match look identical |
| 6 | Recognition Rather Than Recall | 3 | Strong real-data suggestions; ⌘K and ⌘↵ hover-tooltip only |
| 7 | Flexibility and Efficiency | 3 | Good keyboard paths; no duplicate-line shortcut |
| 8 | Aesthetic and Minimalist Design | 3 | Dense and quiet; five interactive zones in a 28px row |
| 9 | Error Recovery | 2 | Parse error collapses to a bare "?", message hidden in a title attr |
| 10 | Help and Documentation | 1 | Start prompts vanish on first keystroke and never return |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

Highly specific. Threshold suggestions compute median/top-quartile/largest from the actual
snapshot; the grammar is shaped around how architects enumerate and qualify; live/fixed only
means anything for a tool premised on drift across months.

Deterministic scan: impeccable detect --json returned 0 findings on components/groups and on
ViewWorkspaceLayout.vue. No generic-template smells.

Disagreement between assessments: A praised the listbox/option/aria-selected markup as a
strength; B proved it decorative — ArrowDown changes no aria-selected and adds no
aria-activedescendant; the input has no role=combobox, aria-expanded or aria-controls.

False positive from A: the garbled "...**com.fedex.qp.common.**" line. Tested: applySuggestion
always replaces the whole token and a completed pattern offers nothing. It was a symptom of the
Enter-key bug (fixed), not a splice.

## Overall Impression

The thinking is excellent and the execution has a soft middle. The parts reasoned hardest about
(order-independent counts, loss-aversion-proof save copy, distributions from real data) are good.
The parts not looked at are where it fails: you cannot reliably see, focus, or hear the thing you
are typing into.

## What's Working

1. Percentile thresholds from the live snapshot.
2. SaveToLens copy engineered against loss aversion.
3. Per-line, order-independent counts.

## Priority Issues

[P0] Keep can silently do nothing. The button's disabled state reads the composer's own total;
QueryBar.keep() guards on the scope store's count. Two sources of truth for one number.
Fix: one count, computed once, passed down; say why Keep is unavailable. → /impeccable harden

[P1] You can't see what you're typing. scrollWidth 403px vs clientWidth 318px: 85px silently
clipped, text-overflow: clip, scrollLeft stuck at 0. Input carries outline-none with no
replacement — the only focusable element in the composer without a ring.
Fix: let the row scroll with the ghost synced; give the field a real focus ring. → /impeccable polish

[P1] Unusable with a screen reader; colour is the only channel. No combobox wiring (measured).
Syntax meaning carries through colour alone. Contrast failures: placeholder 3.05:1, dot
separators 2.51:1, both under 4.5:1.
Fix: wire combobox/aria-expanded/aria-controls/aria-activedescendant, add aria-live for parse
errors, lift both colours, give ! and # a non-colour cue. → /impeccable audit

[P2] No grammar reference after the first keystroke. Help scores 1/4. → /impeccable onboard

[P2] Empty-line suggestion list is ~13 flat options (3 start + 5 recents + 5 saved), separated
only by a small icon. Past the ≤4 working-memory guideline. → /impeccable layout

## Persona Red Flags

Alex (power user): ⌘K tooltip-only so the core loop's entry point is invisible; ⌘↵ can silently
no-op; no duplicate-line shortcut.

Sam (screen reader / keyboard / low vision): arrowing the suggestions announces nothing; parse
errors live in a title attribute; transparent-input-over-pre can leave invisible text under
forced-colors; row toggle 13×13px, delete 20×20px, options 23px tall — all under WCAG 2.2 AA
24×24 minimum.

## Minor Observations

Delete "×" hover-only. coveredBy de-emphasises a line with no visible reason. SaveToLens mixes a
__new sentinel among real lens names. The 500ms settle window blanks the count with no indication
it is thinking.

## Questions to Consider

Was "teach once" deliberate for a tool whose users return over months? Does the most consequential
action in the app belong in a popover a stray click dismisses? Is a { } glyph enough signal for a
consultant who has days, not months?
