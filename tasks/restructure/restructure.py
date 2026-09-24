#!/usr/bin/env python3
"""Move frontend source files per a map and rewrite every import that points at them.

usage: restructure.py <map file> <frontend dir> [--dry]

Map lines: "old -> new", "olddir/ -> newdir/", or "old DEAD". Paths are relative
to src/. A test file (x.test.ts) follows its source unless mapped itself.
Every file under the folders being dissolved must be accounted for.
"""
import os, re, subprocess, sys

MAP, FRONT = sys.argv[1], sys.argv[2]
DRY = "--dry" in sys.argv
SRC = os.path.join(FRONT, "src")
ANY = "--any" in sys.argv  # any file may be mapped; unmapped files stay put
DISSOLVE = ("utils/", "stores/", "composables/", "components/")
STAY = ("pages/", "layouts/", "plugins/", "assets/", "workers/", "app.vue")

exact, dirs, dead = {}, {}, set()
for raw in open(MAP):
    line = raw.split("#", 1)[0].strip()
    if not line:
        continue
    if line.endswith(" DEAD"):
        dead.add(line[:-5].strip())
        continue
    old, new = [s.strip() for s in line.split("->")]
    (dirs if old.endswith("/") else exact)[old] = new

files = []
for d, _, fs in os.walk(SRC):
    for f in fs:
        files.append(os.path.relpath(os.path.join(d, f), SRC))

def test_source(rel):
    for ext in (".test.ts", ".parity.test.ts", ".bench.test.ts"):
        if rel.endswith(ext):
            return rel[: -len(ext)] + ".ts"
    return None

moves, deletes, unmapped = {}, set(), []
def target(rel):
    if rel in dead:
        return "DEAD"
    if rel in exact:
        return exact[rel]
    d = os.path.dirname(rel) + "/"
    if d in dirs:
        return dirs[d] + os.path.basename(rel)
    return None

for rel in files:
    if rel.startswith(STAY) or (not ANY and not rel.startswith(DISSOLVE)):
        continue
    t = target(rel)
    if t is None and rel.endswith(".test.ts"):
        src = test_source(rel)
        st = target(src) if src else None
        if st == "DEAD":
            t = "DEAD"
        elif st:
            t = st[:-3] + rel[len(src) - 3:]
    if t is None:
        if not ANY:
            unmapped.append(rel)
    elif t == "DEAD":
        deletes.add(rel)
    else:
        moves[rel] = t

if unmapped:
    print("UNMAPPED:", *unmapped, sep="\n  ")
    sys.exit(1)
dups = {}
for o, n in moves.items():
    dups.setdefault(n, []).append(o)
clash = {n: o for n, o in dups.items() if len(o) > 1}
if clash:
    print("CLASH:", clash)
    sys.exit(1)

def new_of(rel):
    return moves.get(rel, rel)

# Resolve an import specifier (in the old tree) to a file relative to src/.
def resolve(importer_rel, spec):
    if spec.startswith(("~/", "@/")):
        base = os.path.join(SRC, spec[2:])
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(SRC, os.path.dirname(importer_rel), spec)) if not importer_rel.startswith("../") \
            else os.path.normpath(os.path.join(FRONT, importer_rel[3:], "..", spec))
    else:
        return None
    for c in (base, base + ".ts", base + ".vue", os.path.join(base, "index.ts")):
        if os.path.isfile(c):
            r = os.path.relpath(c, SRC)
            return None if r.startswith("..") else r
    return None

def spec_for(importer_new_rel, target_new_rel):
    t = target_new_rel[:-3] if target_new_rel.endswith(".ts") else target_new_rel
    if not importer_new_rel.startswith("../") and os.path.dirname(importer_new_rel) == os.path.dirname(target_new_rel):
        return "./" + os.path.basename(t)
    return "~/" + t

TILDE = re.compile(r"""(["'])([~@]/[^"'\n]+)\1""")
REL = re.compile(r"""((?:\bfrom|\bimport|\bvi\.mock|\bimportActual|\bvi\.importActual)\s*\(?\s*)(["'])(\.{1,2}/[^"'\n]+)\2""")

BOTH = re.compile(r"""(?P<kw>(?:\bfrom|\bimport|\bvi\.mock|\bimportActual|\bvi\.importActual)\s*\(?\s*)(?P<rq>["'])(?P<rspec>\.{1,2}/[^"'\n]+)(?P=rq)|(?P<tq>["'])(?P<tspec>[~@]/[^"'\n]+)(?P=tq)""")

importers = [f for f in files if f.endswith((".ts", ".vue"))]
bench = os.path.join(FRONT, "bench")
extra = ["../bench/" + f for f in os.listdir(bench) if f.endswith(".ts")] if os.path.isdir(bench) else []

rewrites, broken = {}, []
for rel in importers + extra:
    if rel in deletes:
        continue
    path = os.path.join(SRC, rel) if not rel.startswith("../") else os.path.join(FRONT, rel[3:])
    code = open(path).read()
    me_new = rel if rel.startswith("../") else new_of(rel)
    def fix(spec):
        tgt = resolve(rel, spec)
        if tgt is None:
            return spec
        if tgt in deletes:
            broken.append((rel, spec))
            return spec
        new_spec = spec_for(me_new, new_of(tgt))
        if new_spec == spec:
            return spec
        # Keep an explicit extension if the author wrote one on a .ts import.
        return new_spec
    # One pass over both patterns, so a specifier rewritten once is never re-read.
    def sub(m):
        if m.group("tq"):
            return m.group("tq") + fix(m.group("tspec")) + m.group("tq")
        return m.group("kw") + m.group("rq") + fix(m.group("rspec")) + m.group("rq")
    out = BOTH.sub(sub, code)
    if out != code:
        rewrites[path] = out

if broken:
    print("IMPORTS OF DELETED FILES (from live code):")
    for r, s in broken:
        print("  ", r, "->", s)
    sys.exit(1)

print(f"{len(moves)} moves, {len(deletes)} deletes, {len(rewrites)} files rewritten")
if DRY:
    sys.exit(0)

# Contents first (by old path), then move.
for path, out in rewrites.items():
    open(path, "w").write(out)
def git(*a):
    subprocess.run(["git", *a], cwd=FRONT, check=True, capture_output=True)
for rel in sorted(deletes):
    git("rm", "-q", os.path.join("src", rel))
for old, new in sorted(moves.items()):
    os.makedirs(os.path.join(SRC, os.path.dirname(new)), exist_ok=True)
    git("mv", os.path.join("src", old), os.path.join("src", new))
for d, _, _ in sorted(os.walk(SRC), key=lambda x: -len(x[0])):
    if not os.listdir(d):
        os.rmdir(d)
print("done")
