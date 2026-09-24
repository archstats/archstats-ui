package app

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// FilesService saves and opens files through the native dialogs. A webview's
// Blob-and-anchor download does nothing in a desktop build (there is no
// downloads folder to drop into on macOS), so every export comes through
// here, and every "Reveal" too.
type FilesService struct {
	ctx func() context.Context
}

func NewFilesService(ctx func() context.Context) *FilesService {
	return &FilesService{ctx: ctx}
}

// FileFilter is one entry of a dialog's file-type list.
type FileFilter struct {
	Name     string `json:"name"`     // "CSV table"
	Patterns string `json:"patterns"` // "*.csv"
}

// SaveRequest is one file to write. Exactly one of Text or Base64 is used.
type SaveRequest struct {
	DefaultName string       `json:"defaultName"`
	Title       string       `json:"title"`
	Filters     []FileFilter `json:"filters"`
	Text        string       `json:"text"`
	Base64      string       `json:"base64"`
}

// SaveFile asks where to save and writes the content. It returns the path
// written, or "" when the user cancelled.
func (f *FilesService) SaveFile(req SaveRequest) (string, error) {
	path, err := runtime.SaveFileDialog(f.ctx(), runtime.SaveDialogOptions{
		DefaultFilename: req.DefaultName,
		Title:           req.Title,
		Filters:         toFilters(req.Filters),
	})
	if err != nil || path == "" {
		return "", err
	}
	if err := writeContent(path, req.Text, req.Base64); err != nil {
		return "", err
	}
	return path, nil
}

// BundleFile is one file of a bundle, named relative to the chosen folder.
type BundleFile struct {
	Name   string `json:"name"`
	Text   string `json:"text"`
	Base64 string `json:"base64"`
}

// SaveBundle asks for a folder and writes several files into it: a report
// with its figures, say. It returns the folder, or "" when cancelled.
func (f *FilesService) SaveBundle(title string, files []BundleFile) (string, error) {
	dir, err := runtime.OpenDirectoryDialog(f.ctx(), runtime.OpenDialogOptions{Title: title, CanCreateDirectories: true})
	if err != nil || dir == "" {
		return "", err
	}
	for _, file := range files {
		name := filepath.Clean(file.Name)
		if filepath.IsAbs(name) || strings.HasPrefix(name, "..") {
			return "", fmt.Errorf("bundle file %q must stay inside the folder", file.Name)
		}
		target := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return "", err
		}
		if err := writeContent(target, file.Text, file.Base64); err != nil {
			return "", err
		}
	}
	return dir, nil
}

// OpenFile asks for one file and returns its path, or "" when cancelled.
func (f *FilesService) OpenFile(title string, filters []FileFilter) (string, error) {
	return runtime.OpenFileDialog(f.ctx(), runtime.OpenDialogOptions{Title: title, Filters: toFilters(filters)})
}

// Reveal shows a file or folder in the OS file manager.
func (f *FilesService) Reveal(path string) error {
	if _, err := os.Stat(path); err != nil {
		return err
	}
	return revealInFileManager(path)
}

// CopyText puts text on the system clipboard.
func (f *FilesService) CopyText(text string) error {
	return runtime.ClipboardSetText(f.ctx(), text)
}

func writeContent(path, text, b64 string) error {
	data := []byte(text)
	if b64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return fmt.Errorf("decoding %s: %w", filepath.Base(path), err)
		}
		data = decoded
	}
	return os.WriteFile(path, data, 0o644)
}

func toFilters(in []FileFilter) []runtime.FileFilter {
	out := make([]runtime.FileFilter, 0, len(in))
	for _, f := range in {
		out = append(out, runtime.FileFilter{DisplayName: f.Name, Pattern: f.Patterns})
	}
	return out
}
