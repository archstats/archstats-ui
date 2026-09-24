"""Knowledge concentration for one component, independently of the UI.

Usage: python3 tasks/acceptance/knowledge.py <snapshot.db> <component>

Lines added per author across the component's current files, bots left out
with the UI's NOT_BOT_SQL, no aliases merged. Prints the author count and how
many of the largest contributors cover 50% and 80% of the lines added.
"""
import pathlib, re, sqlite3, sys

src = pathlib.Path(__file__).resolve().parents[2] / "frontend/src/utils/authors.ts"
not_bot = re.search(r"NOT_BOT_SQL = `(.*?)`", src.read_text(), re.S).group(1).replace("\\\\", "\\")
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
files = {r[0] for r in db.execute("SELECT name FROM files WHERE component = ?", (sys.argv[2],))}
added = {}
for author, f, n in db.execute(f"SELECT author_name, file, file_additions FROM git_commits WHERE {not_bot}"):
    if f in files and n:
        added[author] = added.get(author, 0) + n
ranked = sorted(added.values(), reverse=True)
total = sum(ranked)
def cover(frac):
    s = 0
    for i, n in enumerate(ranked):
        s += n
        if s >= frac * total:
            return i + 1
    return len(ranked)
print(f"{sys.argv[2]}: {len(ranked)} authors, {total:,} lines added; {cover(0.5)} cover 50%, {cover(0.8)} cover 80%")
