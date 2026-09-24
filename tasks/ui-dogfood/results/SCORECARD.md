# Scorecard

One row per run. Coverage = (found + ½·partly) ÷ keys. See `../SCORING.md`.

| date | scenario | mode | shape | app commit | engine rev | coverage | wrong | done | easy/dig/hard/np | actions | tokens | bugs (P/E) | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-24 | 06 | unaided → guided (switched mid-run) | full (3 rounds + follow-up, 14 navigators) | 9906210 | 3 | 12/17 (11 found, 2 partly) | 0 | plan implemented; 32 mutual pairs, 51 own-rule violations (manual ref: 5 / 0) | not tallied | ≈1,000 | ≈2.8M | 20 / 4 | First run, before this kit existed. Branch `refactor/archstats-clicks`. Harness faults fixed mid-run (tooltips, clear, datalist). |
