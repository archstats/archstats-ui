# Scoring a run

Write `results/<date>-<scenario>/score.md` with these sections, then append
one row to `results/SCORECARD.md`.

## 1. Answer-key coverage (the headline number)

For every generic key (K1–K7, plus F and D when used) and every scenario key
(S1…), record:

| Key | Verdict | Screen | Actions |
| --- | --- | --- | --- |
| … | found / partly / missed / **wrong** | where the persona got it | how many drive actions |

- **Coverage** = (found + ½·partly) ÷ keys.
- **Wrong** counts separately. A wrong claim the persona believed is worse
  than a miss.

## 2. The deliverable

Tick the scenario's "Done looks like" items: met, partly or not met.

Note any claim in the deliverable that is not backed by a screen or a number.

## 3. Ease

Count the lead's and the navigators' per-finding ease ratings:

- easy
- some digging
- hard
- not possible

The goal over time: more easy, and fewer "not possible".

## 4. Cost

- Total drive actions: sum the session logs in
  `$TMPDIR/archstats-drive-sessions/*.log`.
- Budget overruns: the navigators whose actions went over 1.5× their budget.
- Tokens: sum the agents' usage.
- Wall time.

## 5. Friction

Count only what the facilitator verified:

- product bugs;
- engine bugs;
- missing features;
- harness faults (listed, not scored).

Each links to an `ISSUES.md` ID.

## 6. Discoverability (unaided runs)

For each intended feature the scenario stresses, record whether it was:

- found without the guide;
- found late;
- never found.

## Scorecard row

```
| date | scenario | mode | shape | app commit | engine rev | coverage | wrong | done | easy/dig/hard/np | actions | tokens | bugs (P/E) | notes |
```
