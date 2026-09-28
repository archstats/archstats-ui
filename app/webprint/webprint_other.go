//go:build !darwin

package webprint

// Supported reports whether Print works on this platform.
func Supported() bool { return false }

// Print is not available here; the caller lays the PDF out itself.
func Print(Options) ([]byte, int, error) { return nil, 0, ErrUnsupported }
