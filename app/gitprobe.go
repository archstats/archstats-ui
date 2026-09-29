package app

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// HeadDrift is how far a workspace's checkout has moved since its newest
// snapshot: the question "is what I'm reading still the code?".
type HeadDrift struct {
	// Status is "ok", "unknown" (the scanned commit is not in the local
	// history: a shallow clone, a rebase, a force-push), "no-git",
	// "no-snapshot" or "missing-folder". Never a silent zero.
	Status        string `json:"status"`
	Ahead         int    `json:"ahead"`
	HeadSha       string `json:"headSha"`
	Branch        string `json:"branch"`
	BranchChanged bool   `json:"branchChanged"`
}

// HeadDrift compares the checkout's HEAD with the commit the given scan read.
func (w *WorkspaceService) HeadDrift(workspaceID, scanID string) (*HeadDrift, error) {
	ws, err := w.store.GetWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(ws.FolderPath); err != nil {
		return &HeadDrift{Status: "missing-folder"}, nil
	}
	scan, err := w.store.GetScan(scanID)
	if err != nil || scan.HeadCommit == "" {
		return &HeadDrift{Status: "no-snapshot"}, nil
	}
	head, err := exec.Command("git", "-C", ws.FolderPath, "rev-parse", "HEAD").Output()
	if err != nil {
		return &HeadDrift{Status: "no-git"}, nil
	}
	out := &HeadDrift{HeadSha: strings.TrimSpace(string(head))}
	if b, err := exec.Command("git", "-C", ws.FolderPath, "rev-parse", "--abbrev-ref", "HEAD").Output(); err == nil {
		out.Branch = strings.TrimSpace(string(b))
		if out.Branch == "HEAD" {
			out.Branch = "detached"
		}
		out.BranchChanged = scan.Branch != "" && out.Branch != scan.Branch
	}
	if out.HeadSha == scan.HeadCommit {
		out.Status = "ok"
		return out, nil
	}
	count, err := exec.Command("git", "-C", ws.FolderPath, "rev-list", "--count", scan.HeadCommit+"..HEAD").Output()
	if err != nil {
		out.Status = "unknown"
		return out, nil
	}
	out.Ahead, _ = strconv.Atoi(strings.TrimSpace(string(count)))
	out.Status = "ok"
	return out, nil
}

// WorkingCopy is what a scan of the workspace would read right now, against
// the commit a snapshot read: the rail's answer to "is scanning worth it?".
type WorkingCopy struct {
	// Status is "ok", "no-git" or "missing-folder".
	Status  string `json:"status"`
	Branch  string `json:"branch"`
	HeadSha string `json:"headSha"`
	Subject string `json:"subject"`
	// Dirty counts files with uncommitted changes, untracked ones included:
	// a scan reads the folder, not the last commit.
	Dirty int `json:"dirty"`
	// Ahead counts commits past sinceSha; -1 when that commit is not in
	// this history (a rebase, a shallow clone) or none was given.
	Ahead int `json:"ahead"`
	// Remote is origin's address, when there is one.
	Remote string `json:"remote"`
}

// WorkingCopy reads the workspace folder's git state, and how far HEAD is
// past sinceSha (the newest snapshot's commit) when one is given.
func (w *WorkspaceService) WorkingCopy(workspaceID, sinceSha string) (*WorkingCopy, error) {
	ws, err := w.store.GetWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(ws.FolderPath); err != nil {
		return &WorkingCopy{Status: "missing-folder", Ahead: -1}, nil
	}
	git := func(args ...string) (string, error) {
		out, err := exec.Command("git", append([]string{"-C", ws.FolderPath}, args...)...).Output()
		return strings.TrimSpace(string(out)), err
	}
	head, err := git("log", "-1", "--format=%H%x00%s")
	if err != nil || head == "" {
		return &WorkingCopy{Status: "no-git", Ahead: -1}, nil
	}
	parts := strings.SplitN(head, "\x00", 2)
	out := &WorkingCopy{Status: "ok", HeadSha: parts[0], Ahead: -1}
	if len(parts) == 2 {
		out.Subject = parts[1]
	}
	if b, err := git("rev-parse", "--abbrev-ref", "HEAD"); err == nil {
		out.Branch = b
		if b == "HEAD" {
			out.Branch = "detached"
		}
	}
	if st, err := git("status", "--porcelain", "--untracked-files=normal"); err == nil && st != "" {
		out.Dirty = len(strings.Split(st, "\n"))
	}
	if r, err := git("remote", "get-url", "origin"); err == nil {
		out.Remote = r
	}
	if sinceSha != "" {
		if sinceSha == out.HeadSha {
			out.Ahead = 0
		} else if n, err := git("rev-list", "--count", sinceSha+"..HEAD"); err == nil {
			out.Ahead, _ = strconv.Atoi(n)
		}
	}
	return out, nil
}
