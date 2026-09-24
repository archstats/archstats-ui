package scan

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/archstats/archstats-ui/app/store"
	"github.com/rs/zerolog/log"
)

// Rescanning one commit: the workspace's own checkout is never touched. A
// clone shares its objects (git clone --shared, no copy of history), is
// checked out detached at the commit in the app's data folder, scanned like
// any folder, and deleted afterwards, whatever happened.

// CommitInfo is what the confirmation sheet shows before a rescan.
type CommitInfo struct {
	Sha     string    `json:"sha"`
	Time    time.Time `json:"time"`
	Subject string    `json:"subject"`
}

func git(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok && len(ee.Stderr) > 0 {
			return "", fmt.Errorf("git %s: %s", args[0], strings.TrimSpace(string(ee.Stderr)))
		}
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// ResolveCommit checks a commit exists in the workspace's history.
func (s *Service) ResolveCommit(workspaceID, rev string) (*CommitInfo, error) {
	ws, err := s.store.GetWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	out, err := git(ws.FolderPath, "log", "-1", "--format=%H%x00%cI%x00%s", rev+"^{commit}", "--")
	if err != nil {
		return nil, fmt.Errorf("%s is not a commit in this repository's history (a shallow clone stops early)", rev)
	}
	parts := strings.SplitN(out, "\x00", 3)
	if len(parts) < 3 {
		return nil, fmt.Errorf("could not read commit %s", rev)
	}
	t, _ := time.Parse(time.RFC3339, parts[1])
	return &CommitInfo{Sha: parts[0], Time: t, Subject: parts[2]}, nil
}

// ResolveCommitAt names the commit HEAD most probably was at a moment: for
// snapshots older than recorded commits, "HEAD at scan time was probably …".
func (s *Service) ResolveCommitAt(workspaceID string, at time.Time) (*CommitInfo, error) {
	ws, err := s.store.GetWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	sha, err := git(ws.FolderPath, "rev-list", "-1", "--before="+at.UTC().Format(time.RFC3339), "HEAD")
	if err != nil || sha == "" {
		return nil, fmt.Errorf("no commit before %s", at.Format("2 Jan 2006 15:04"))
	}
	return s.ResolveCommit(workspaceID, sha)
}

func backfillRoot(st *store.Store) string { return filepath.Join(st.Root(), "backfill") }

// SweepBackfill removes clones left by a scan that never finished (the app
// quit or crashed mid-scan). Run at startup, before any scan starts.
func SweepBackfill(st *store.Store) {
	if err := os.RemoveAll(backfillRoot(st)); err != nil {
		log.Warn().Err(err).Msg("removing leftover backfill clones")
	}
}

// StartScanAt scans the workspace as it was at one commit.
func (s *Service) StartScanAt(workspaceID, rev string) (*store.Scan, error) {
	info, err := s.ResolveCommit(workspaceID, rev)
	if err != nil {
		return nil, err
	}
	ws, err := s.store.GetWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	if s.running[ws.ID] {
		s.mu.Unlock()
		return nil, fmt.Errorf("a scan is already running for workspace %s", ws.Name)
	}
	s.running[ws.ID] = true
	s.mu.Unlock()
	release := func() { s.mu.Lock(); delete(s.running, ws.ID); s.mu.Unlock() }

	dir := filepath.Join(backfillRoot(s.store), ws.ID, info.Sha)
	_ = os.RemoveAll(dir)
	if err := os.MkdirAll(filepath.Dir(dir), 0o755); err != nil {
		release()
		return nil, err
	}
	if _, err := git(ws.FolderPath, "clone", "--quiet", "--shared", "--no-checkout", ws.FolderPath, dir); err != nil {
		os.RemoveAll(dir)
		release()
		return nil, fmt.Errorf("cloning for the rescan: %w", err)
	}
	if _, err := git(dir, "-c", "advice.detachedHead=false", "checkout", "--quiet", "--detach", info.Sha); err != nil {
		os.RemoveAll(dir)
		release()
		return nil, fmt.Errorf("checking out %s: %w", info.Sha[:12], err)
	}

	scan, err := s.store.CreateScan(ws.ID)
	if err != nil {
		os.RemoveAll(dir)
		release()
		return nil, err
	}
	_ = s.store.SetScanOrigin(scan.ID, "backfill", info.Sha)
	go s.run(ws, scan, dir, func(bool) {
		// The identity read after saving overwrote the ref; the commit is what this scan is.
		_ = s.store.SetScanOrigin(scan.ID, "backfill", info.Sha)
		if err := os.RemoveAll(dir); err != nil {
			log.Warn().Err(err).Str("dir", dir).Msg("removing the rescan clone")
		}
	})
	return scan, nil
}
