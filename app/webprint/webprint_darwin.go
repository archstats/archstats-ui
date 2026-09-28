//go:build darwin

package webprint

/*
#cgo CFLAGS: -x objective-c -fobjc-arc -mmacosx-version-min=11.0
#cgo LDFLAGS: -framework Cocoa -framework WebKit -framework CoreText -framework PDFKit
#include <stdlib.h>
#include "webprint_darwin.h"
*/
import "C"

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
	"unsafe"
)

// Supported reports whether Print works on this platform.
func Supported() bool { return true }

var (
	// One print at a time: the web view has one print layout.
	printMu sync.Mutex
	waitMu  sync.Mutex
	waiting = map[int]chan int{}
	nextID  int
)

//export webprintDone
func webprintDone(id C.int, status C.int) {
	waitMu.Lock()
	ch := waiting[int(id)]
	delete(waiting, int(id))
	waitMu.Unlock()
	if ch != nil {
		ch <- int(status)
	}
}

// Print prints the app's web view as it lays out for print media, and returns
// the PDF and its page count.
func Print(o Options) ([]byte, int, error) {
	printMu.Lock()
	defer printMu.Unlock()

	dir, err := os.MkdirTemp("", "archstats-print-")
	if err != nil {
		return nil, 0, err
	}
	defer os.RemoveAll(dir)
	raw, out := filepath.Join(dir, "page.pdf"), filepath.Join(dir, "report.pdf")

	waitMu.Lock()
	nextID++
	id := nextID
	ch := make(chan int, 1)
	waiting[id] = ch
	waitMu.Unlock()

	cRaw := C.CString(raw)
	defer C.free(unsafe.Pointer(cRaw))
	C.webprintPrint(C.int(id), C.double(o.Width), C.double(o.Height), C.double(o.Top), C.double(o.Right), C.double(o.Bottom), C.double(o.Left), cRaw)

	select {
	case status := <-ch:
		switch status {
		case 1:
		case -1:
			return nil, 0, errors.New("the app's web view was not found")
		default:
			return nil, 0, errors.New("the web view did not print")
		}
	case <-time.After(90 * time.Second):
		waitMu.Lock()
		delete(waiting, id)
		waitMu.Unlock()
		return nil, 0, errors.New("the web view took too long to print")
	}

	cOut, cTitle := C.CString(out), C.CString(o.Title)
	defer C.free(unsafe.Pointer(cOut))
	defer C.free(unsafe.Pointer(cTitle))
	var font unsafe.Pointer
	if len(o.FooterFont) > 0 {
		font = C.CBytes(o.FooterFont)
		defer C.free(font)
	}
	pages := int(C.webprintStamp(cRaw, cOut, cTitle, font, C.int(len(o.FooterFont)), C.double(o.Left), C.double(o.Right)))
	if pages < 1 {
		return nil, 0, fmt.Errorf("the printed page could not be read back (%d)", pages)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		return nil, 0, err
	}
	return data, pages, nil
}
