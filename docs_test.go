package main

import (
	"os"
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

func TestDocumentLinksResolve(t *testing.T) {
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
			if _, err := os.Stat(filepath.Join(filepath.Dir(doc), target)); err != nil {
				t.Errorf("%s links to %s, which does not exist", doc, m[1])
			}
		}
		for _, m := range codePath.FindAllStringSubmatch(text, -1) {
			path := trailings.ReplaceAllString(m[1], "")
			if strings.ContainsAny(path, "*<{") {
				continue
			}
			if _, err := os.Stat(path); err != nil {
				t.Errorf("%s names %s, which does not exist", doc, m[1])
			}
		}
	}
}
