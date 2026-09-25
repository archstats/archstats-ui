#!/usr/bin/env python3
"""Answer keys for a UI dogfood run. FACILITATOR ONLY: never show this output
to the lead or the navigators; it is what their findings are scored against.

usage: keys.py <snapshot.db> [--focus 'SQL LIKE on component name'] [--baseline <older snapshot.db>] [--fitgap]

Prints the facts a persona should be able to establish from the app, computed
straight from the snapshot the app is reading. Numbers change with the engine's
analysis revision, so compute keys at setup, from the pinned snapshot, every run.
"""
import argparse, os, sqlite3, sys
from collections import Counter, defaultdict

ap = argparse.ArgumentParser()
ap.add_argument("db"); ap.add_argument("--focus"); ap.add_argument("--baseline"); ap.add_argument("--fitgap", action="store_true")
a = ap.parse_args()

def open_db(p):
    return sqlite3.connect(f"file:{p}?mode=ro", uri=True)

def has(db, t):
    return db.execute("select 1 from sqlite_master where name=?", (t,)).fetchone() is not None

def cols(db, t):
    return {r[1] for r in db.execute(f"pragma table_info('{t}')")}

def runtime_edges(db):
    kind = "coalesce(kind,'import')" if "kind" in cols(db, "component_connections_direct") else "'import'"
    return db.execute(f'select "from","to",sum(reference_count),count(distinct file) from component_connections_direct where "from"<>"to" and {kind} not like \'%type%\' group by 1,2').fetchall()

def shape(db):
    prod = "role='production'" if "role" in cols(db, "files") else "1"
    comps = db.execute("select count(*) from components").fetchone()[0]
    files, lines = db.execute(f"select count(*), coalesce(sum(complexity__lines),0) from files where {prod}").fetchone()
    exts = Counter(os.path.splitext(n)[1] or n for (n,) in db.execute(f"select name from files where {prod}"))
    return comps, files, lines, exts.most_common(4)

db = open_db(a.db)
print(f"# Answer key for {os.path.basename(a.db)}")
rev = db.execute("select value from _snapshot where key='analysis_revision'").fetchone() if has(db, "_snapshot") else None
print(f"analysis revision: {rev[0] if rev else 'unknown'}\n")

c, f, l, ex = shape(db)
print(f"K1 shape: {c} components, {f} production files, {l:,} production lines; top extensions {ex}")

top = db.execute("select name, complexity__lines, complexity__files from components order by complexity__lines desc limit 5").fetchall()
print("K2 largest components by lines:", "; ".join(f"{n} ({ln:,} lines, {fl} files)" for n, ln, fl in top))

if has(db, "component_strongly_connected_groups"):
    groups = db.execute("select \"group\", max(group_size), group_concat(component, ', ') from component_strongly_connected_groups group by 1 having max(group_size)>1 order by 2 desc").fetchall()
    print(f"K3 tangles: {len(groups)}; largest {groups[0][1] if groups else 0} components" + (f": {groups[0][2][:300]}" if groups else ""))

prodf = "and role='production'" if "role" in cols(db, "files") else ""
hot = db.execute(f"select name, codesmells__hotspot_score, complexity__lines, git__commits__total from files where codesmells__hotspot_score is not null {prodf} order by codesmells__hotspot_score desc limit 5").fetchall()
print("K4 top production hotspots:", "; ".join(f"{n} (score {s:.0f}, {ln} lines, {cm} commits)" for n, s, ln, cm in hot))

edges = runtime_edges(db)
dependents = defaultdict(set); deps = defaultdict(set)
for fr, to, refs, nf in edges:
    dependents[to].add(fr); deps[fr].add(to)
hubs = sorted(dependents, key=lambda x: -len(dependents[x]))[:5]
print("K5 most depended-on components (distinct dependents):", "; ".join(f"{h} ({len(dependents[h])})" for h in hubs))

if has(db, "git_component_shared_commits"):
    linked = {(fr, to) for fr, to, _, _ in edges} | {(to, fr) for fr, to, _, _ in edges}
    pairs = db.execute("select pair_1, pair_2, shared_commits, percentage_of_all_commits_pair_1, percentage_of_all_commits_pair_2 from git_component_shared_commits where pair_1<>pair_2 order by shared_commits desc").fetchall()
    seen, hidden = set(), []
    for p in pairs:
        key = tuple(sorted(p[:2]))
        if (p[0], p[1]) in linked or key in seen: continue
        seen.add(key); hidden.append(p)
    hidden_all = list(hidden)
    hidden = hidden[:5]
    print("K6 co-change without an import:", "; ".join(f"{p1} ~ {p2} ({s} shared)" for p1, p2, s, _, _ in hidden) or "none")

if has(db, "git_commits"):
    per = defaultdict(Counter)
    for comp, auth, h in db.execute("select component, author_name, commit_hash from git_commits where component is not null and component<>'' group by 1,2,3"):
        per[comp][auth] += 1
    conc = []
    for comp, cnt in per.items():
        total = sum(cnt.values())
        if total >= 20:
            who, n = cnt.most_common(1)[0]
            conc.append((n / total, comp, who, total))
    conc.sort(reverse=True)
    print("K7 knowledge concentration (>=20 commits, top author share):", "; ".join(f"{c} {sh:.0%} {w} of {t}" for sh, c, w, t in conc[:5]))
    authors = db.execute("select count(distinct author_name) from git_commits").fetchone()[0]
    print(f"    distinct authors in history: {authors}")

if a.focus:
    print(f"\nF focus components LIKE {a.focus!r}:")
    for (name,) in db.execute("select name from components where name like ? order by complexity__lines desc limit 8", (a.focus,)):
        ln = db.execute("select complexity__lines, complexity__files, complexity__files__test from components where name=?", (name,)).fetchone()
        print(f"  {name}: {ln[0]} lines, {ln[1]} files ({ln[2]} test); depends on {len(deps[name])}, depended on by {len(dependents[name])}")
        if deps[name]: print(f"    depends on: {', '.join(sorted(deps[name])[:12])}")
        if dependents[name]: print(f"    used by: {', '.join(sorted(dependents[name])[:12])}")
        if has(db, "git_commits"):
            top_auth = db.execute("select author_name, count(distinct commit_hash) n from git_commits where component=? group by 1 order by n desc limit 3", (name,)).fetchall()
            print(f"    top authors: {top_auth}")

if a.baseline:
    b = open_db(a.baseline)
    bc = {n: ln for n, ln in b.execute("select name, complexity__lines from components")}
    hc = {n: ln for n, ln in db.execute("select name, complexity__lines from components")}
    added, removed = sorted(set(hc) - set(bc)), sorted(set(bc) - set(hc))
    grew = sorted(((hc[n] or 0) - (bc[n] or 0), n) for n in set(hc) & set(bc))[::-1][:5]
    print(f"\nD drift vs {os.path.basename(a.baseline)}:")
    print(f"  components {len(bc)} -> {len(hc)} (+{len(added)} / -{len(removed)}); added e.g. {added[:6]}; removed e.g. {removed[:6]}")
    print(f"  grew most: {[(n, d) for d, n in grew]}")
    be = runtime_edges(b)
    print(f"  component dependencies {len({(x[0], x[1]) for x in be})} -> {len({(x[0], x[1]) for x in edges})}")
    if has(b, "component_strongly_connected_groups"):
        bl = b.execute("select coalesce(max(group_size),0) from component_strongly_connected_groups").fetchone()[0]
        hl = db.execute("select coalesce(max(group_size),0) from component_strongly_connected_groups").fetchone()[0]
        print(f"  largest tangle {bl} -> {hl}")

if a.fitgap:
    # One number per criterion of the fit-gap sheet (scenario 07). Thresholds
    # live in the scenario; this prints the measured side only.
    from datetime import datetime, timedelta
    print("\nG fit-gap measurements:")
    fc = cols(db, "files")
    prod = "role='production'" if "role" in fc else "1"
    test = "role='test'" if "role" in fc else "0"
    if has(db, "summary"):
        print("  summary:", dict(db.execute("select name, value from summary").fetchall()))
    # R1 build modules
    if has(db, "modules"):
        mods = db.execute("select name, directory, depends_on, files from modules").fetchall()
        inmod = db.execute(f"select count(*), sum(module is not null and module<>'') from files where {prod}").fetchone()
        print(f"  R1 build modules: {len(mods)}; production files inside a module: {inmod[1]}/{inmod[0]} ({(inmod[1] or 0)/max(inmod[0],1):.0%})")
    # R2 tangles
    if has(db, "component_strongly_connected_groups"):
        g = db.execute("select count(distinct \"group\"), coalesce(max(group_size),0), count(distinct component) from component_strongly_connected_groups where group_size>1").fetchone()
        total = db.execute("select count(*) from components").fetchone()[0]
        print(f"  R2 tangles: {g[0]}, largest {g[1]}, components in tangles {g[2]}/{total} ({g[2]/max(total,1):.0%})")
    # R3 conformance: import edges between build modules that the build files do not declare
    if has(db, "modules") and "module" in fc:
        declared = defaultdict(set)
        for name, _d, dep, _f in mods:
            for x in (dep or "").split(","):
                if x.strip(): declared[name].add(x.strip())
        file_mod = dict(db.execute("select name, module from files where module is not null and module<>''"))
        comp_mod = {}
        for comp, mod, n in db.execute("select component, module, count(*) n from files where module is not null and module<>'' and component is not null group by 1,2 order by n desc"):
            comp_mod.setdefault(comp, mod)
        kind = "coalesce(kind,'import')" if "kind" in cols(db, "component_connections_direct") else "'import'"
        mod_edges = Counter()
        for fr_file, to_comp, refs in db.execute(f'select file, "to", sum(reference_count) from component_connections_direct where "from"<>"to" and {kind} not like \'%type%\' group by 1,2'):
            fm, tm = file_mod.get(fr_file), comp_mod.get(to_comp)
            if fm and tm and fm != tm: mod_edges[(fm, tm)] += refs
        undeclared = [(k, v) for k, v in mod_edges.most_common() if k[1] not in declared.get(k[0], set())]
        mutual = sorted({tuple(sorted(k)) for k in mod_edges if (k[1], k[0]) in mod_edges})
        print(f"  R3 module→module import pairs: {len(mod_edges)}; not declared in the build: {len(undeclared)}; mutual module pairs: {len(mutual)}")
        print(f"     top undeclared: {[(f'{x}→{y}', r) for (x, y), r in undeclared[:6]]}")
        if mutual: print(f"     mutual: {mutual[:6]}")
    # R4 stable hubs
    cc = cols(db, "components")
    if "modularity__instability" in cc:
        print("  R4 hubs (dependents, instability):", [(h, len(dependents[h]), round(db.execute("select modularity__instability from components where name=?", (h,)).fetchone()[0] or 0, 2)) for h in hubs])
    # R5 health: share of production lines in files with health < 5 (null = unrated)
    hl = db.execute(f"select coalesce(sum(case when codesmells__code_health is not null and codesmells__code_health>0 and codesmells__code_health<5 then complexity__lines else 0 end),0), coalesce(sum(complexity__lines),0) from files where {prod}").fetchone()
    print(f"  R5 production lines in files with health < 5: {hl[0]:,}/{hl[1]:,} ({hl[0]/max(hl[1],1):.1%})")
    big = db.execute(f"select name, complexity__lines from files where {prod} order by complexity__lines desc limit 3").fetchall()
    print(f"  R6 largest production files: {big}")
    # R7 tests
    tl = db.execute(f"select coalesce(sum(complexity__lines),0) from files where {test}").fetchone()[0]
    print(f"  R7 test lines / production lines: {tl:,}/{hl[1]:,} = {tl/max(hl[1],1):.2f}")
    if has(db, "modules") and "module" in fc:
        untested = [m for (m,) in db.execute(f"select distinct module from files where module is not null and module<>'' and {prod}") if not db.execute(f"select 1 from files where module=? and {test} limit 1", (m,)).fetchone()]
        print(f"     modules with production code and no test files: {len(untested)} {untested[:8]}")
    # R8 activity, R9 knowledge, R12 effort (windows anchored at the newest commit)
    if has(db, "git_commits"):
        newest = db.execute("select max(commit_time) from git_commits").fetchone()[0]
        t = datetime.fromisoformat(newest)
        w180, w365, w90 = [(t - timedelta(days=d)).isoformat() for d in (180, 365, 90)]
        # commit_time strings carry offsets; compare as text within the same format is approximate, good enough for keys
        a180 = db.execute("select count(distinct author_name) from git_commits where commit_time >= ?", (w180,)).fetchone()[0]
        print(f"  R8 authors active in the 180 days to {newest[:10]}: {a180}")
        if "git__last_change_age_in_days" in cc:
            ch = db.execute("select sum(git__last_change_age_in_days <= 365), count(*) from components").fetchone()
            print(f"     components changed within 365 days: {ch[0]}/{ch[1]}")
        if "module" in fc:
            permod = defaultdict(Counter)
            for mod, auth, h in db.execute("select f.module, g.author_name, g.commit_hash from git_commits g join files f on f.name=g.file where f.module is not null and f.module<>'' group by 1,2,3"):
                permod[mod][auth] += 1
            conc = sorted(((c.most_common(1)[0][1] / sum(c.values()), m, sum(c.values())) for m, c in permod.items() if sum(c.values()) >= 20), reverse=True)
            print(f"  R9 modules by top-author share (>=20 commits): {[(m, f'{sh:.0%}', n) for sh, m, n in conc[:6]]}")
        low = {n for (n,) in db.execute(f"select name from files where {prod} and codesmells__code_health>0 and codesmells__code_health<5")}
        ch_all = ch_low = 0
        for f_, ad, de in db.execute("select file, file_additions, file_deletions from git_commits where commit_time >= ?", (w90,)):
            n = (ad or 0) + (de or 0); ch_all += n
            if f_ in low: ch_low += n
        print(f"  R12 changed lines in the 90 days to {newest[:10]} going into health<5 files: {ch_low:,}/{ch_all:,} ({ch_low/max(ch_all,1):.1%})")
    # R10 hidden coupling above threshold
    if has(db, "git_component_shared_commits"):
        strong = [p for p in hidden_all if p[2] >= 10 and max(p[3] or 0, p[4] or 0) >= 30] if 'hidden_all' in dir() else []
        print(f"  R10 co-change pairs without an import (>=10 shared, >=30%): {len(strong)}")
