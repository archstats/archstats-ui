// Package webprint prints the app's own web view to a PDF: the page the user
// reads in the editor, set by the same engine with the same fonts, then
// paginated by the engine's print layout. A footer (the title and the page
// number) is stamped on every page afterwards, since print CSS cannot count
// pages. Only macOS prints this way; elsewhere Supported is false and the
// caller keeps its own renderer.
package webprint

import "errors"

// Options is the page the web view is printed on.
type Options struct {
	// The paper, in PDF points (1/72 inch).
	Width, Height float64
	// The margins, in points; the body of the page is what the print CSS lays out.
	Top, Right, Bottom, Left float64
	// Set in the footer and as the document's title.
	Title string
	// The footer's face: a TrueType font's bytes.
	FooterFont []byte
}

// ErrUnsupported: this platform's web view does not print here.
var ErrUnsupported = errors.New("printing the page is only available on macOS")

// MM is one millimetre in points.
const MM = 72 / 25.4
