package app

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// EditorOpened says what the file on disk is now, next to the snapshot that
// named it: a line number from an older scan may have moved.
type EditorOpened struct {
	// Status is "opened", "missing" (not on disk any more) or "outside"
	// (the path leaves the workspace folder and was refused).
	Status           string `json:"status"`
	ChangedSinceScan bool   `json:"changedSinceScan"`
}

// Editors the app knows how to open at a line. "system" opens the file with
// its default application, at no particular line.
var editorSchemes = map[string]bool{"vscode": true, "cursor": true, "idea": true, "system": true}

// OpenInEditor opens a workspace file at a line in the chosen editor.
func (w *WorkspaceService) OpenInEditor(workspaceID, scanID, relPath string, line, col int, editor string) (*EditorOpened, error) {
	if !editorSchemes[editor] {
		return nil, fmt.Errorf("unknown editor %q", editor)
	}
	ws, err := w.store.GetWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	abs, err := resolveInside(ws.FolderPath, relPath)
	if err != nil {
		return &EditorOpened{Status: "outside"}, nil
	}
	info, err := os.Stat(abs)
	if err != nil {
		return &EditorOpened{Status: "missing"}, nil
	}
	out := &EditorOpened{Status: "opened"}
	if scan, err := w.store.GetScan(scanID); err == nil && info.ModTime().After(scan.StartedAt) {
		out.ChangedSinceScan = true
	}
	if editor == "system" {
		return out, openWithDefault(abs)
	}
	runtime.BrowserOpenURL(w.ctx(), editorURL(editor, abs, line, col))
	return out, nil
}

// RevealWorkspaceFile selects a workspace file in the file manager.
func (w *WorkspaceService) RevealWorkspaceFile(workspaceID, relPath string) error {
	ws, err := w.store.GetWorkspace(workspaceID)
	if err != nil {
		return err
	}
	abs, err := resolveInside(ws.FolderPath, relPath)
	if err != nil {
		return err
	}
	return revealInFileManager(abs)
}

var errOutside = errors.New("path is outside the workspace folder")

// resolveInside joins a snapshot's slash path onto the workspace folder and
// refuses anything that climbs out of it.
func resolveInside(root, rel string) (string, error) {
	if rel == "" || filepath.IsAbs(filepath.FromSlash(rel)) || strings.HasPrefix(rel, "/") {
		return "", errOutside
	}
	root = filepath.Clean(root)
	abs := filepath.Join(root, filepath.FromSlash(rel))
	r, err := filepath.Rel(root, abs)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", errOutside
	}
	return abs, nil
}

func editorURL(editor, abs string, line, col int) string {
	if line < 1 {
		line = 1
	}
	if col < 1 {
		col = 1
	}
	p := filepath.ToSlash(abs)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p // C:/x → /C:/x, as the vscode:// handler expects
	}
	switch editor {
	case "idea":
		return fmt.Sprintf("idea://open?file=%s&line=%d&column=%d", url.QueryEscape(filepath.ToSlash(abs)), line, col)
	default:
		return fmt.Sprintf("%s://file%s:%d:%d", editor, (&url.URL{Path: p}).EscapedPath(), line, col)
	}
}

func openWithDefault(path string) error {
	switch goruntime.GOOS {
	case "darwin":
		return exec.Command("open", path).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", "", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}
