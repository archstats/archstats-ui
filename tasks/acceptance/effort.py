"""Where change effort goes, computed independently of the UI.

Usage: python3 tasks/acceptance/effort.py <snapshot.db> [days=90] [threshold=5]

Changed lines (additions + deletions) of human commits in the window before
the snapshot's anchor (the scanned commit's time), split into files below the
health threshold, tangle members, files not in the snapshot, files without a
health reading, and commits whose subject matches the default fix pattern.
On snapshots before analysis revision 2, a stored health of 0 is no reading.
Activity's Effort tab should show the same percentages, unscoped.
"""
import datetime, pathlib, re, sqlite3, sys

src = pathlib.Path(__file__).resolve().parents[2] / "frontend/src/utils/authors.ts"
not_bot = re.search(r"NOT_BOT_SQL = `(.*?)`", src.read_text(), re.S).group(1).replace("\\\\", "\\")
fix = re.compile(r"\b(fix(es|ed)?|bug(fix)?|hotfix|revert)\b", re.I)
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
days = int(sys.argv[2]) if len(sys.argv) > 2 else 90
threshold = float(sys.argv[3]) if len(sys.argv) > 3 else 5

def iso(v):
    d = datetime.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=datetime.timezone.utc)

# The UI's anchor: the scanned commit's time, or for snapshots from before
# _snapshot recorded it, the time the scan started (from the app's database).
try:
    anchor = iso(db.execute("SELECT value FROM _snapshot WHERE key = 'git_based_on'").fetchone()[0])
except (sqlite3.OperationalError, TypeError):
    app = sqlite3.connect(f"file:{pathlib.Path.home()}/Library/Application Support/archstats/app.db?mode=ro", uri=True)
    anchor = iso(app.execute("SELECT started_at FROM scans WHERE snapshot_path = ?", (sys.argv[1],)).fetchone()[0])
since = anchor - datetime.timedelta(days=days)

tangle = {r[0] for r in db.execute("""SELECT component FROM component_strongly_connected_groups
    WHERE "group" IN (SELECT "group" FROM component_strongly_connected_groups GROUP BY 1 HAVING count(*) > 1)""")}
# Before analysis revision 2 an unrated file (pom.xml) was written with health 0; that is no reading.
try:
    revision = int(db.execute("SELECT value FROM _snapshot WHERE key = 'analysis_revision'").fetchone()[0])
except (sqlite3.OperationalError, TypeError):
    revision = 0
files = {r[0]: (r[1], None if (revision < 2 and r[2] == 0) else r[2]) for r in db.execute("SELECT name, component, codesmells__code_health FROM files")}
tot = {"lines": 0, "low": 0, "tangle": 0, "gone": 0, "no_health": 0, "fix": 0}
commits = set()
for h, t, msg, f, add, dele in db.execute(f"""SELECT commit_hash, commit_time, commit_message, file, file_additions, file_deletions
        FROM git_commits WHERE {not_bot}"""):
    when = iso(t)
    if when < since or when > anchor:
        continue
    n = (add or 0) + (dele or 0)
    commits.add(h)
    tot["lines"] += n
    comp, health = files.get(f, (None, None))
    if f not in files:
        tot["gone"] += n
    elif health is None:
        tot["no_health"] += n
    elif health < threshold:
        tot["low"] += n
    if comp in tangle:
        tot["tangle"] += n
    if fix.search((msg or "").split("\n")[0]):
        tot["fix"] += n
pct = lambda k: f"{round(100 * tot[k] / tot['lines'])}%" if tot["lines"] else "-"
print(f"{days} d to {anchor:%d %b %Y}: {tot['lines']:,} changed lines in {len(commits):,} commits")
print(f"  health below {threshold:g} {pct('low')} · tangle members {pct('tangle')} · fix pattern {pct('fix')} · not in snapshot {pct('gone')} · no health reading {pct('no_health')}")
