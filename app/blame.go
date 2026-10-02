package app

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// BlameLine is the commit that last wrote one line, as of the commit a scan
// read: when an import appeared, and who wrote it and why.
type BlameLine struct {
	Line    int    `json:"line"`
	Commit  string `json:"commit"`
	Time    string `json:"time"`
	Author  string `json:"author"`
	Summary string `json:"summary"`
	// AtHead is set when the file's repository is not the one the scan's
	// commit belongs to (a workspace of several repositories): the lines are
	// blamed at that repository's HEAD instead.
	AtHead bool `json:"atHead"`
}

var blameCache sync.Map // "<folder>\x00<rev>\x00<file>\x00<lines>" -> []BlameLine

// Blame reads who last wrote the given lines of a file, at the commit the scan
// read, so the answer is the same however far the checkout has moved. It is
// asked for a few files at a time, about one edge or one cycle: blaming every
// import at scan time would cost minutes on a large repository.
func (w *WorkspaceService) Blame(scanID, file string, lines []int) ([]BlameLine, error) {
	scan, err := w.store.GetScan(scanID)
	if err != nil {
		return nil, err
	}
	ws, err := w.store.GetWorkspace(scan.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return blameLines(ws.FolderPath, scan.HeadCommit, file, lines)
}

func blameLines(folder, commit, file string, lines []int) ([]BlameLine, error) {
	if len(lines) == 0 {
		return []BlameLine{}, nil
	}
	sort.Ints(lines)
	full := filepath.Join(folder, filepath.FromSlash(file))
	dir := filepath.Dir(full)
	top, err := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return nil, fmt.Errorf("%s is not in a git repository", file)
	}
	repo := strings.TrimSpace(string(top))
	rev, atHead := commit, false
	if commit == "" || !sameDir(repo, folder) {
		rev, atHead = "HEAD", true
	}
	// Run from the file's own folder and name it plainly: a path made relative
	// to the repository breaks when either side is reached through a symlink.
	key := strings.Join([]string{repo, rev, full, fmt.Sprint(lines)}, "\x00")
	if v, ok := blameCache.Load(key); ok {
		return v.([]BlameLine), nil
	}
	args := []string{"-C", dir, "blame", "--porcelain", "-w", "-M"}
	for _, l := range lines {
		args = append(args, "-L", fmt.Sprintf("%d,%d", l, l))
	}
	args = append(args, rev, "--", filepath.Base(full))
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("git blame %s: %w", file, err)
	}
	result := parsePorcelain(string(out), atHead)
	blameCache.Store(key, result)
	return result, nil
}

func sameDir(a, b string) bool {
	ea, errA := filepath.EvalSymlinks(a)
	eb, errB := filepath.EvalSymlinks(b)
	if errA != nil || errB != nil {
		return filepath.Clean(a) == filepath.Clean(b)
	}
	return ea == eb
}

// parsePorcelain reads `git blame --porcelain`: a header per line naming the
// commit and the final line number, the commit's details the first time it
// appears.
func parsePorcelain(text string, atHead bool) []BlameLine {
	type info struct{ author, summary, time string }
	commits := map[string]*info{}
	var out []BlameLine
	var cur *BlameLine
	for _, line := range strings.Split(text, "\n") {
		if line == "" {
			continue
		}
		if line[0] == '\t' {
			if cur != nil {
				out = append(out, *cur)
				cur = nil
			}
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 3 && len(fields[0]) == 40 {
			n, _ := strconv.Atoi(fields[2])
			cur = &BlameLine{Line: n, Commit: fields[0], AtHead: atHead}
			if commits[fields[0]] == nil {
				commits[fields[0]] = &info{}
			}
			continue
		}
		if cur == nil {
			continue
		}
		c := commits[cur.Commit]
		switch fields[0] {
		case "author":
			c.author = strings.TrimPrefix(line, "author ")
		case "summary":
			c.summary = strings.TrimPrefix(line, "summary ")
		case "author-time":
			if sec, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
				c.time = time.Unix(sec, 0).UTC().Format(time.RFC3339)
			}
		}
	}
	for i := range out {
		if c := commits[out[i].Commit]; c != nil {
			out[i].Author, out[i].Summary, out[i].Time = c.author, c.summary, c.time
		}
	}
	return out
}
