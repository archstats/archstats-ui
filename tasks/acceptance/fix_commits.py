"""Counts fix commits the way Activity does, independently of the UI.

Usage: python3 tasks/acceptance/fix_commits.py <snapshot.db>

Commits touching a file still in the snapshot, bots left out with the UI's
own NOT_BOT_SQL (read from utils/authors.ts), subject line matched by
Python's re against the default fix pattern. The UI's "Commits matching"
line on All should read the same two numbers.
"""
import pathlib, re, sqlite3, sys

src = pathlib.Path(__file__).resolve().parents[2] / "frontend/src/utils/authors.ts"
not_bot = re.search(r"NOT_BOT_SQL = `(.*?)`", src.read_text(), re.S).group(1).replace("\\\\", "\\")
pattern = re.compile(r"\b(fix(es|ed)?|bug(fix)?|hotfix|revert)\b", re.I)

db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
rows = db.execute(f"""
    SELECT commit_hash, max(commit_message), max(CASE WHEN {not_bot} THEN 0 ELSE 1 END)
    FROM git_commits WHERE file IN (SELECT name FROM files) GROUP BY commit_hash""").fetchall()
human = [r for r in rows if r[2] == 0]
subject = lambda m: (m or "").split("\n")[0].strip()
matched = [r for r in human if pattern.search(subject(r[1]))]
fixture_only = [r for r in matched if not pattern.search(re.sub(r"(?i)fixtures?", "", subject(r[1])))]
print(f"{len(matched):,} of {len(human):,} commits match; {len(fixture_only)} match only through 'fixture'")
