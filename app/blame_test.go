package app

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "user.name=Ada", "-c", "user.email=ada@example.com"}, args...)...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// An import is dated by the commit that wrote it, read at the scanned commit:
// a later edit to the checkout does not change the answer.
func TestBlameReadsLinesAtTheScannedCommit(t *testing.T) {
	dir := t.TempDir()
	git(t, dir, "init", "-q")
	path := filepath.Join(dir, "web", "Checkout.java")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("package web;\n\nclass Checkout {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git(t, dir, "add", ".")
	git(t, dir, "commit", "-q", "-m", "Checkout page")
	if err := os.WriteFile(path, []byte("package web;\n\nimport core.Money;\n\nclass Checkout {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git(t, dir, "commit", "-q", "-am", "Charge in Money")
	scanned := git(t, dir, "rev-parse", "HEAD")
	if err := os.WriteFile(path, []byte("package web;\n\n\n\nimport core.Money;\n\nclass Checkout {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	git(t, dir, "commit", "-q", "-am", "Spacing")

	got, err := blameLines(dir, scanned, "web/Checkout.java", []int{3})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Line != 3 || got[0].Summary != "Charge in Money" || got[0].Author != "Ada" || got[0].Commit != scanned || got[0].AtHead || got[0].Time == "" {
		t.Fatalf("got %+v", got)
	}
}
