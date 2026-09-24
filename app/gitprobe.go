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
