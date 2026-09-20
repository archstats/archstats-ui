---
target: building and managing dimensions and groups
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/frontend/src/components/connections/DraftBuilder.vue"
target_fingerprint: "sha256:c6d97cd5dafbf62608c70e95a9a0e51b89110881f1c657006441a08c4180fc09"
target_path: /Users/ryansusana/workspace-manager/workspaces/personal/archstats-ui/frontend/src/components/connections/DraftBuilder.vue
timestamp: 2026-09-18T15-05-05Z
slug: c-components-connections-draftbuilder-vue-e2a32563
---
Method: dual-agent (A: design review · B: detector and browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Save and "Lanes → dimension" give no confirmation; the lens moves silently |
| 2 | Match System / Real World | 3 | Reasons read naturally; the first builder screen is a dense unlabeled graph |
| 3 | User Control and Freedom | 2 | No undo after Save; native prompt/confirm for dimension rename and delete |
| 4 | Consistency and Standards | 2 | Four ways to create a group, each with a different default dimension and confirmation |
| 5 | Error Prevention | 2 | "Lanes → dimension" and "Save as file group" commit saved state in one click |
| 6 | Recognition Rather Than Recall | 3 | Lock toggle icons don't read as a lock without the tooltip |
| 7 | Flexibility and Efficiency | 4 | ⌘G, drag plus Move to, presets, copy of a dimension, locks |
| 8 | Aesthetic and Minimalist Design | 3 | Fine-tune folds well; the builder sits under a ten-control toolbar and 11px text |
| 9 | Error Recovery | 1 | A bad groups import fails only in the console |
| 10 | Help and Documentation | 3 | Empty states teach; nothing beyond them |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict
Authored for this product. Vocabulary, engine and cross-cut are bespoke. Seams: browser prompts, "Groups" doing three jobs, one-click shortcuts that skip the builder.
Deterministic scan: nine feature files clean. In-page overlay: Connections with builder open 30 findings (tiny-text ×20, tight-leading ×5, cramped-padding ×3, layout-transition ×2, flat-type-hierarchy, overused-font); Overview 14; Metrics 5. One repeated text-occlusion finding likely an overlay artifact.

## Priority Issues
- [P0] Dimension is not an entity; default dimension is the feature's name ("Groups"). Fix: dimensions record (name, cut, order, colour cursor, description); tray and Custom default to the lens; migrate "Groups" to "Ad hoc". /impeccable shape
- [P1] "Lanes → dimension" and "Save as file group" bypass the builder and move the lens. Fix: open the builder prefilled. /impeccable harden
- [P1] Colour assigned in creation order across all dimensions; collisions in the cross-cut. Fix: per-dimension colour cursor, distinct sub-ramps for rows/columns. /impeccable colorize
- [P1] Native prompt/confirm for dimension rename/delete vs inline confirm for group delete; no confirmation after Save. Fix: inline rename, inline confirm, Save feedback. /impeccable harden
- [P2] Type scale and density: 11px text ×20, leading <1.3, flat 11/13/13 scale, cramped segmented controls, sidebar list hides new dimension below fold. Fix: 12px floor, 1.35 leading, section-title step, auto-scroll. /impeccable typeset

## Persona Red Flags
Alex: window.prompt rename; lens stolen by Lanes → dimension. Jordan: lands on a 52-node graph; "Group A..E" next to real names reads as failure; no Save confirmation; new dimension below the fold. Sam: builder's show-files chevron hover-only, no focus reveal; native dialogs break ARIA context.

## Minor Observations
Import errors console-only; dimension ops match raw strings; draft key namespaces mixed; lock icon pairing; Start from list six-plus options.

## Questions
A dimension card with name, cut, coverage, colour, provenance? Tray never asks for a dimension because the lens answers? Never show "Group A": name by largest component until renamed?
