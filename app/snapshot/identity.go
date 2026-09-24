// Package snapshot reads what a snapshot file says about itself.
package snapshot

import (
	"database/sql"
	"fmt"
	"strconv"
	"time"

	"github.com/archstats/archstats-ui/app/store"
	_ "github.com/mattn/go-sqlite3"
)

// ReadIdentity opens a snapshot read-only and returns its identity: the
// analysis revision that wrote it, the commit it read, and scan settings.
// Snapshots older than a key read as unknown, never as a guess dressed as a
// fact -- except head time, which falls back to the newest commit in the
// snapshot (then to the scan time) and says which it used.
func ReadIdentity(path string, scannedAt time.Time) (store.ScanIdentity, error) {
	var id store.ScanIdentity
	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?mode=ro&_query_only=true", path))
	if err != nil {
		return id, err
	}
	defer db.Close()

	info := map[string]string{}
	if hasTable(db, "_snapshot") {
		rows, err := db.Query(`SELECT key, value FROM _snapshot`)
		if err != nil {
			return id, err
		}
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				if _, seen := info[k]; !seen {
					info[k] = v
				}
			}
		}
		rows.Close()
	}
	id.AnalysisRevision, _ = strconv.Atoi(info["analysis_revision"])
	id.HeadCommit = info["git_head_commit"]
	id.Branch = info["git_branch"]
	id.Extensions = info["extensions"]
	id.IgnoreGlobs = info["ignore_globs"]
	if v, ok := info["git_dirty_files"]; ok {
		if n, err := strconv.Atoi(v); err == nil {
			id.DirtyFiles = &n
		}
	}
	if t, ok := parseTime(info["git_head_time"]); ok {
		id.HeadTime, id.HeadTimeSource = &t, "head"
		return id, nil
	}
	if hasTable(db, "git_commits") {
		var newest sql.NullString
		if err := db.QueryRow(`SELECT max(commit_time) FROM git_commits`).Scan(&newest); err == nil && newest.Valid {
			if t, ok := parseTime(newest.String); ok {
				id.HeadTime, id.HeadTimeSource = &t, "max_commit"
				return id, nil
			}
		}
	}
	t := scannedAt.UTC()
	id.HeadTime, id.HeadTimeSource = &t, "scan"
	return id, nil
}

func hasTable(db *sql.DB, name string) bool {
	var n int
	return db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, name).Scan(&n) == nil && n > 0
}

func parseTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

// FillMissing reads the identity of every finished scan that has none: the
// scans taken before the registry recorded identities. Safe to run in the
// background; a snapshot that cannot be read is skipped, not marked.
func FillMissing(st *store.Store) (int, error) {
	scans, err := st.ScansWithoutIdentity()
	if err != nil {
		return 0, err
	}
	n := 0
	for _, s := range scans {
		if s.SnapshotPath == "" {
			continue
		}
		ident, err := ReadIdentity(s.SnapshotPath, s.StartedAt)
		if err != nil {
			continue
		}
		if err := st.SetScanIdentity(s.ID, ident); err == nil {
			n++
		}
	}
	return n, nil
}
