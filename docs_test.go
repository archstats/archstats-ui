package main

import (
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The repository's documents point at each other and at the code. A link or a
// path that no longer resolves sends a reader, or an agent, somewhere that is
// gone, so they are checked like code: every relative link resolves, and every
// backticked path into the source tree exists.

var (
	mdLink    = regexp.MustCompile(`\]\(([^)\s]+)\)`)
	codePath  = regexp.MustCompile("`((?:app|build|scripts|specs|tasks|frontend/src|frontend/scripts)/[^`\\s]*)`")
	trailings = regexp.MustCompile(`(:\d+(-\d+)?|[.,;:])$`)
)

var documents = []string{"README.md", "DESCRIPTION.md", "CHANGELOG.md", "CLAUDE.md", "frontend/src/README.md"}

// tracked lists the files git tracks and the folders that hold them. A
// document points at those, or at a place git ignores on purpose because a
// build or a test makes it (e2eTest/temp_testdata). Checking the disk instead
// passed locally on folders that exist only on the machine that made them.
func tracked(t *testing.T) map[string]bool {
	t.Helper()
	out, err := exec.Command("git", "ls-files").Output()
	if err != nil {
		t.Skip("git ls-files: ", err)
	}
	set := map[string]bool{}
	for _, f := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		for p := f; p != "." && p != "/" && p != ""; p = path.Dir(p) {
			set[p] = true
		}
	}
	return set
}

func exists(set map[string]bool, p string) bool {
	p = strings.TrimSuffix(path.Clean(filepath.ToSlash(p)), "/")
	return set[p] || exec.Command("git", "check-ignore", "-q", p).Run() == nil
}

func TestDocumentLinksResolve(t *testing.T) {
	files := tracked(t)
	for _, doc := range documents {
		raw, err := os.ReadFile(doc)
		if err != nil {
			t.Fatal(err)
		}
		text := string(raw)
		for _, m := range mdLink.FindAllStringSubmatch(text, -1) {
			target := m[1]
			if strings.Contains(target, "://") || strings.HasPrefix(target, "#") || strings.HasPrefix(target, "mailto:") {
				continue
			}
			target, _, _ = strings.Cut(target, "#")
			if !exists(files, filepath.Join(filepath.Dir(doc), target)) {
				t.Errorf("%s links to %s, which git neither tracks nor ignores", doc, m[1])
			}
		}
		for _, m := range codePath.FindAllStringSubmatch(text, -1) {
			p := trailings.ReplaceAllString(m[1], "")
			if strings.ContainsAny(p, "*<{") {
				continue
			}
			if !exists(files, p) {
				t.Errorf("%s names %s, which git neither tracks nor ignores", doc, m[1])
			}
		}
	}
}
