package app

import (
	"path/filepath"
	"testing"
)

func TestResolveInside(t *testing.T) {
	root := filepath.FromSlash("/work/repo")
	for _, bad := range []string{"", "../x", "a/../../x", "/etc/passwd"} {
		if _, err := resolveInside(root, bad); err == nil {
			t.Errorf("%q should be refused", bad)
		}
	}
	got, err := resolveInside(root, "src/a b/c.py")
	if err != nil || got != filepath.Join(root, "src", "a b", "c.py") {
		t.Fatalf("got %q, %v", got, err)
	}
	if _, err := resolveInside(root, "src/../ok.py"); err != nil {
		t.Errorf("a path that stays inside is fine: %v", err)
	}
}

func TestEditorURL(t *testing.T) {
	if u := editorURL("vscode", "/work/a b.py", 12, 0); u != "vscode://file/work/a%20b.py:12:1" {
		t.Errorf("vscode: %s", u)
	}
	if u := editorURL("idea", "/work/a.py", 3, 2); u != "idea://open?file=%2Fwork%2Fa.py&line=3&column=2" {
		t.Errorf("idea: %s", u)
	}
}
