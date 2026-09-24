// Package report renders an evidence report as a PDF: A4, Inter for prose,
// JetBrains Mono for evidence, the app's one orange as the title rule. The
// frontend flattens its notebook into Blocks (prose already split into
// styled runs, tables into strings, figures into PNG), so the layout here
// only decides where things fall on the page.
package report

import (
	"bytes"
	_ "embed"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/png"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/go-pdf/fpdf"
)

//go:embed fonts/Inter-Regular.ttf
var interRegular []byte

//go:embed fonts/Inter-SemiBold.ttf
var interSemiBold []byte

//go:embed fonts/Inter-Italic.ttf
var interItalic []byte

//go:embed fonts/JetBrainsMono-Regular.ttf
var monoRegular []byte

// Run is a stretch of text in one style.
type Run struct {
	Text   string `json:"text"`
	Bold   bool   `json:"bold"`
	Italic bool   `json:"italic"`
	Code   bool   `json:"code"`
	Link   string `json:"link"`
}

// Table is a table's text, already formatted.
type Table struct {
	Columns []string `json:"columns"`
	// "r" right-aligns a column (numbers); anything else is left.
	Align []string   `json:"align"`
	Rows  [][]string `json:"rows"`
}

// Block is one thing on the page, in reading order.
type Block struct {
	// h1 h2 h3 p ul ol quote code hr table image
	Kind  string  `json:"kind"`
	Runs  []Run   `json:"runs"`
	Items [][]Run `json:"items"`
	Start int     `json:"start"`
	Code  string  `json:"code"`
	Table *Table  `json:"table"`
	// A PNG, base64; captured at twice its on-screen size.
	Image string `json:"image"`
	// For tables and images: a title above, a caption and a provenance line below.
	Title      string `json:"title"`
	Caption    string `json:"caption"`
	Provenance string `json:"provenance"`
}

// Doc is the whole report.
type Doc struct {
	Title string `json:"title"`
	// "Letter" for US Letter; anything else is A4.
	PageSize string `json:"pageSize"`
	// Lines under the title: workspace, snapshot, commit, date.
	Meta   []string `json:"meta"`
	Blocks []Block  `json:"blocks"`
}

const (
	marginX, marginTop = 22.0, 20.0
	marginBottom       = 22.0
	bodySize           = 10.0
	bodyLine           = 5.2
)

// The page of the render in progress; renders take turns (renderMu).
var (
	pageW, pageH = 210.0, 297.0
	contentW     = pageW - 2*marginX
	renderMu     sync.Mutex
)

type rgb struct{ r, g, b int }

var (
	ink      = rgb{31, 35, 41}
	body     = rgb{43, 47, 54}
	muted    = rgb{107, 114, 128}
	hairline = rgb{227, 229, 232}
	fill     = rgb{244, 245, 247}
	accent   = rgb{224, 138, 25}
)

type renderer struct {
	pdf   *fpdf.Fpdf
	title string
	imgN  int
}

// Render lays the document out and returns the PDF bytes.
func Render(doc Doc) ([]byte, error) {
	renderMu.Lock()
	defer renderMu.Unlock()
	size := "A4"
	pageW, pageH = 210.0, 297.0
	if strings.EqualFold(doc.PageSize, "Letter") {
		size = "Letter"
		pageW, pageH = 215.9, 279.4
	}
	contentW = pageW - 2*marginX
	pdf := fpdf.New("P", "mm", size, "")
	pdf.SetMargins(marginX, marginTop, marginX)
	pdf.SetAutoPageBreak(true, marginBottom)
	pdf.AddUTF8FontFromBytes("Inter", "", interRegular)
	pdf.AddUTF8FontFromBytes("Inter", "B", interSemiBold)
	pdf.AddUTF8FontFromBytes("Inter", "I", interItalic)
	pdf.AddUTF8FontFromBytes("Mono", "", monoRegular)
	pdf.SetTitle(doc.Title, true)
	pdf.SetCreator("Archstats Desktop", true)
	pdf.AliasNbPages("{nb}")
	r := &renderer{pdf: pdf, title: doc.Title}
	pdf.SetFooterFunc(r.footer)
	pdf.AddPage()
	r.head(doc)
	for i, b := range doc.Blocks {
		r.block(b, i == 0)
	}
	if err := pdf.Error(); err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (r *renderer) color(c rgb)    { r.pdf.SetTextColor(c.r, c.g, c.b) }
func (r *renderer) draw(c rgb)     { r.pdf.SetDrawColor(c.r, c.g, c.b) }
func (r *renderer) fillWith(c rgb) { r.pdf.SetFillColor(c.r, c.g, c.b) }
func (r *renderer) y() float64     { return r.pdf.GetY() }
func (r *renderer) room() float64  { return pageH - marginBottom - r.y() }
func (r *renderer) space(h float64) {
	// Space at the top of a page is space already given.
	if r.y() > marginTop+0.1 {
		r.pdf.Ln(h)
	}
}

// keep starts a new page unless h fits on this one.
func (r *renderer) keep(h float64) {
	if r.room() < h {
		r.pdf.AddPage()
	}
}

func (r *renderer) footer() {
	p := r.pdf
	p.SetY(-13)
	r.draw(hairline)
	p.SetLineWidth(0.2)
	p.Line(marginX, p.GetY(), pageW-marginX, p.GetY())
	p.Ln(2)
	p.SetFont("Inter", "", 7.5)
	r.color(muted)
	p.CellFormat(contentW/2, 4, r.title, "", 0, "L", false, 0, "")
	p.CellFormat(contentW/2, 4, fmt.Sprintf("Page %d of {nb}", p.PageNo()), "", 0, "R", false, 0, "")
}

func (r *renderer) head(doc Doc) {
	p := r.pdf
	p.SetFont("Inter", "B", 20)
	r.color(ink)
	p.MultiCell(contentW, 9, doc.Title, "", "L", false)
	p.Ln(2)
	r.draw(accent)
	p.SetLineWidth(0.7)
	p.Line(marginX, p.GetY(), marginX+24, p.GetY())
	p.Ln(4)
	p.SetFont("Inter", "", 8.5)
	r.color(muted)
	for _, m := range doc.Meta {
		p.MultiCell(contentW, 4.4, m, "", "L", false)
	}
	p.Ln(6)
}

func (r *renderer) block(b Block, first bool) {
	p := r.pdf
	switch b.Kind {
	case "h1", "h2", "h3":
		size, line, above := 15.0, 7.0, 7.0
		if b.Kind == "h2" {
			size, line, above = 12.5, 6.2, 6.0
		} else if b.Kind == "h3" {
			size, line, above = 10.5, 5.4, 4.5
		}
		if !first {
			r.space(above)
		}
		// A heading never ends a page: it keeps a few lines of what it heads.
		r.keep(line + 3*bodyLine)
		r.runs(b.Runs, "Inter", "B", size, line, ink)
		p.Ln(line)
		p.Ln(1.2)
	case "p":
		r.runs(b.Runs, "Inter", "", bodySize, bodyLine, body)
		p.Ln(bodyLine)
		p.Ln(2.6)
	case "ul", "ol":
		for i, item := range b.Items {
			r.keep(bodyLine)
			marker := "•"
			if b.Kind == "ol" {
				start := b.Start
				if start == 0 {
					start = 1
				}
				marker = fmt.Sprintf("%d.", start+i)
			}
			p.SetFont("Inter", "", bodySize)
			r.color(muted)
			p.SetX(marginX + 1)
			p.CellFormat(5, bodyLine, marker, "", 0, "L", false, 0, "")
			p.SetLeftMargin(marginX + 6)
			p.SetX(marginX + 6)
			r.runs(item, "Inter", "", bodySize, bodyLine, body)
			p.SetLeftMargin(marginX)
			p.Ln(bodyLine)
			p.Ln(0.8)
		}
		p.Ln(1.8)
	case "quote":
		top := r.y()
		startPage := p.PageNo()
		p.SetLeftMargin(marginX + 6)
		p.SetX(marginX + 6)
		r.runs(b.Runs, "Inter", "I", bodySize, bodyLine, muted)
		p.Ln(bodyLine)
		p.SetLeftMargin(marginX)
		if p.PageNo() == startPage {
			r.draw(hairline)
			p.SetLineWidth(0.8)
			p.Line(marginX+1.5, top+0.5, marginX+1.5, r.y()-0.5)
		}
		p.Ln(2.6)
	case "code":
		p.SetFont("Mono", "", 8.3)
		lines := p.SplitText(strings.TrimRight(b.Code, "\n"), contentW-8)
		h := float64(len(lines))*4.2 + 6
		r.keep(minf(h, 40))
		r.fillWith(fill)
		r.color(body)
		p.SetCellMargin(4)
		p.MultiCell(contentW, 4.2, "\n"+strings.Join(lines, "\n")+"\n", "", "L", true)
		p.SetCellMargin(1)
		p.Ln(3)
	case "hr":
		r.space(2)
		r.draw(hairline)
		p.SetLineWidth(0.25)
		p.Line(marginX, r.y(), pageW-marginX, r.y())
		p.Ln(4)
	case "table":
		r.table(b)
	case "image":
		r.image(b)
	}
}

// runs writes styled text that wraps at the margins and continues on the next line.
func (r *renderer) runs(runs []Run, family, style string, size, line float64, c rgb) {
	p := r.pdf
	for _, run := range runs {
		fam, st, sz := family, style, size
		if run.Code {
			fam, st, sz = "Mono", "", size*0.88
		} else {
			if run.Bold {
				st = "B"
			} else if run.Italic && st == "" {
				st = "I"
			}
		}
		p.SetFont(fam, st, sz)
		if run.Link != "" {
			r.color(rgb{159, 93, 12})
			p.WriteLinkString(line, run.Text, run.Link)
		} else {
			r.color(c)
			p.Write(line, run.Text)
		}
	}
}

func (r *renderer) cellTitle(b Block) {
	if b.Title == "" {
		return
	}
	p := r.pdf
	p.SetFont("Inter", "B", 9.5)
	r.color(ink)
	p.MultiCell(contentW, 5, b.Title, "", "L", false)
	p.Ln(1)
}

func (r *renderer) cellFoot(b Block) {
	p := r.pdf
	if b.Caption != "" {
		p.Ln(1.4)
		p.SetFont("Inter", "I", 8.5)
		r.color(muted)
		p.MultiCell(contentW, 4.2, b.Caption, "", "L", false)
	}
	if b.Provenance != "" {
		p.Ln(0.8)
		p.SetFont("Mono", "", 6.8)
		r.color(muted)
		p.MultiCell(contentW, 3.4, b.Provenance, "", "L", false)
	}
	p.Ln(5)
}

func (r *renderer) table(b Block) {
	t := b.Table
	if t == nil || len(t.Columns) == 0 {
		return
	}
	p := r.pdf
	const size, rowH, pad = 7.8, 5.2, 1.6
	widths := r.columnWidths(t, size, pad)
	r.space(1.5)
	// The title, the header and a few rows stay together.
	r.keep(8 + rowH*float64(minInt(4, len(t.Rows))+1))
	r.cellTitle(b)
	header := func() {
		p.SetFont("Inter", "B", size)
		r.color(muted)
		x := marginX
		for i, c := range t.Columns {
			p.SetXY(x, r.y())
			p.CellFormat(widths[i], rowH, fit(p, c, widths[i]-2*pad, false), "", 0, alignOf(t, i), false, 0, "")
			x += widths[i]
		}
		p.Ln(rowH)
		r.draw(rgb{200, 203, 208})
		p.SetLineWidth(0.3)
		p.Line(marginX, r.y(), marginX+sum(widths), r.y())
	}
	p.SetCellMargin(pad)
	header()
	for _, row := range t.Rows {
		if r.room() < rowH+1 {
			p.AddPage()
			header()
		}
		x := marginX
		for i := range t.Columns {
			v := ""
			if i < len(row) {
				v = row[i]
			}
			numeric := alignOf(t, i) == "R"
			if numeric || looksLikeIdentifier(v) {
				p.SetFont("Mono", "", size*0.94)
			} else {
				p.SetFont("Inter", "", size)
			}
			r.color(body)
			p.SetXY(x, r.y())
			p.CellFormat(widths[i], rowH, fit(p, v, widths[i]-2*pad, !numeric && looksLikeIdentifier(v)), "", 0, alignOf(t, i), false, 0, "")
			x += widths[i]
		}
		p.Ln(rowH)
		r.draw(hairline)
		p.SetLineWidth(0.15)
		p.Line(marginX, r.y(), marginX+sum(widths), r.y())
	}
	p.SetCellMargin(1)
	r.cellFoot(b)
}

// columnWidths gives numbers what they need and shares the rest among text columns.
func (r *renderer) columnWidths(t *Table, size, pad float64) []float64 {
	p := r.pdf
	n := len(t.Columns)
	want := make([]float64, n)
	for i, c := range t.Columns {
		p.SetFont("Inter", "B", size)
		want[i] = p.GetStringWidth(c) + 2*pad
		for j, row := range t.Rows {
			if j > 60 || i >= len(row) {
				continue
			}
			if alignOf(t, i) == "R" || looksLikeIdentifier(row[i]) {
				p.SetFont("Mono", "", size*0.94)
			} else {
				p.SetFont("Inter", "", size)
			}
			want[i] = maxf(want[i], p.GetStringWidth(row[i])+2*pad)
		}
		want[i] = minf(want[i], contentW*0.6)
	}
	if total := sum(want); total <= contentW {
		// Room to spare goes to the first text column, so the table spans the page.
		for i := range want {
			if alignOf(t, i) != "R" {
				want[i] += contentW - total
				return want
			}
		}
		return want
	}
	fixed, flexible := 0.0, 0.0
	for i, w := range want {
		if alignOf(t, i) == "R" {
			fixed += w
		} else {
			flexible += w
		}
	}
	left := contentW - fixed
	for i, w := range want {
		if alignOf(t, i) != "R" {
			want[i] = maxf(14, w*left/flexible)
		}
	}
	return want
}

func (r *renderer) image(b Block) {
	p := r.pdf
	data, err := base64.StdEncoding.DecodeString(b.Image)
	if err != nil {
		return
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width == 0 {
		return
	}
	r.imgN++
	name := fmt.Sprintf("img%d", r.imgN)
	p.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(data))
	// Captured at twice the size it had on screen; one CSS pixel is 1/96 inch.
	w := float64(cfg.Width) / 2 * 25.4 / 96
	w = minf(w, contentW)
	h := w * float64(cfg.Height) / float64(cfg.Width)
	maxH := pageH - marginTop - marginBottom - 24
	if h > maxH {
		h = maxH
		w = h * float64(cfg.Width) / float64(cfg.Height)
	}
	r.space(1.5)
	r.keep(h + 8)
	r.cellTitle(b)
	p.ImageOptions(name, marginX, r.y(), w, h, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	p.SetY(r.y() + h)
	r.cellFoot(b)
}

func alignOf(t *Table, i int) string {
	if i < len(t.Align) && t.Align[i] == "r" {
		return "R"
	}
	return "L"
}

// looksLikeIdentifier: a path or a dotted name, set in mono and cut from the front.
func looksLikeIdentifier(s string) bool {
	return !strings.Contains(s, " ") && (strings.Count(s, "/") > 0 || strings.Count(s, ".") > 1 || strings.Contains(s, "\\"))
}

// fit cuts text to a width with an ellipsis; identifiers keep their tail, which is the part that differs.
func fit(p *fpdf.Fpdf, s string, w float64, keepTail bool) string {
	if p.GetStringWidth(s) <= w {
		return s
	}
	runes := []rune(s)
	for n := len(runes) - 1; n > 0; n-- {
		var cut string
		if keepTail {
			cut = "…" + string(runes[len(runes)-n:])
		} else {
			cut = string(runes[:n]) + "…"
		}
		if p.GetStringWidth(cut) <= w {
			return cut
		}
	}
	if utf8.RuneCountInString(s) > 0 {
		return "…"
	}
	return ""
}

func sum(xs []float64) float64 {
	t := 0.0
	for _, x := range xs {
		t += x
	}
	return t
}
func minf(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
func maxf(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
