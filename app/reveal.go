package app

import (
	"os/exec"
	goruntime "runtime"
)

// revealInFileManager selects path in Finder, Explorer or the Linux file
// manager (which can only open the containing folder).
func revealInFileManager(path string) error {
	switch goruntime.GOOS {
	case "darwin":
		return exec.Command("open", "-R", path).Start()
	case "windows":
		return exec.Command("explorer", "/select,", path).Start()
	default:
		return exec.Command("xdg-open", dirOf(path)).Start()
	}
}

func dirOf(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			return path[:i]
		}
	}
	return "."
}
