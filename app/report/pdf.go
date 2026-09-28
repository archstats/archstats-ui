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

// Source Serif 4 sets the prose: the reading face of the report.
//
//go:embed fonts/SourceSerif4-Regular.ttf
var serifRegular []byte

//go:embed fonts/SourceSerif4-It.ttf
var serifItalic []byte

//go:embed fonts/SourceSerif4-Semibold.ttf
var serifSemibold []byte

//go:embed fonts/SourceSerif4-SemiboldIt.ttf
var serifSemiboldItalic []byte

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
	// "soft" sets a paragraph a shade lighter: a template's explanation of its terms.
	Tone string `json:"tone"`
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
	// The page the app shows: a 156 mm column between even 27 mm margins.
	marginL, marginR = 27.0, 27.0
	marginTop        = 22.0
	marginBottom     = 24.0
	// Prose: Source Serif 4 at 12 pt on 18 pt (1.5) leading, about 75 characters a line.
	bodySize = 12.0
	bodyLine = 18.0 * 25.4 / 72
	// Between paragraphs, 8 pt.
	paraGap = 8.0 * 25.4 / 72
)

// The page of the render in progress; renders take turns (renderMu).
var (
	pageW, pageH = 210.0, 297.0
	contentW     = pageW - marginL - marginR
	renderMu     sync.Mutex
)

type rgb struct{ r, g, b int }

var (
	ink      = rgb{31, 35, 41}
	body     = rgb{30, 32, 38}
	soft     = rgb{64, 70, 79}
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
	contentW = pageW - marginL - marginR
	pdf := fpdf.New("P", "mm", size, "")
	pdf.SetMargins(marginL, marginTop, marginR)
	pdf.SetAutoPageBreak(true, marginBottom)
	pdf.AddUTF8FontFromBytes("Inter", "", interRegular)
	pdf.AddUTF8FontFromBytes("Inter", "B", interSemiBold)
	pdf.AddUTF8FontFromBytes("Inter", "I", interItalic)
	pdf.AddUTF8FontFromBytes("Mono", "", monoRegular)
	pdf.AddUTF8FontFromBytes("Serif", "", serifRegular)
	pdf.AddUTF8FontFromBytes("Serif", "I", serifItalic)
	pdf.AddUTF8FontFromBytes("Serif", "B", serifSemibold)
	pdf.AddUTF8FontFromBytes("Serif", "BI", serifSemiboldItalic)
	pdf.SetTitle(doc.Title, true)
	pdf.SetCreator("Archstats Desktop", true)
	pdf.AliasNbPages("{nb}")
	r := &renderer{pdf: pdf, title: doc.Title}
	pdf.SetFooterFunc(r.footer)
	pdf.AddPage()
	r.head(doc)
	for i, b := range doc.Blocks {
		// A heading, or a sentence leading into a table or figure, keeps the start of what follows it on its page.
		// A lead-in sentence moves only when that leaves a short gap: a
		// full-page figure after it would otherwise empty half a page.
		if i+1 < len(doc.Blocks) && (isHeading(b) || (b.Kind == "p" && isEvidence(doc.Blocks[i+1]))) {
			h := r.height(b) + r.startOf(doc.Blocks[i+1:])
			fits := h < pageH-marginTop-marginBottom-20
			shortGap := isHeading(b) || r.room() < (pageH-marginTop-marginBottom)*0.3
			if fits && shortGap {
				r.keep(h)
			}
		}
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

func isHeading(b Block) bool  { return b.Kind == "h1" || b.Kind == "h2" || b.Kind == "h3" }
func isEvidence(b Block) bool { return b.Kind == "table" || b.Kind == "image" }

// height is about how tall a heading or paragraph sets.
func (r *renderer) height(b Block) float64 {
	switch b.Kind {
	case "h1":
		return 7 + 16*1.25*25.4/72 + 1.2
	case "h2":
		return 5.6 + 13*1.3*25.4/72 + 1.2
	case "h3":
		return 3.9 + 11*1.35*25.4/72 + 1.2
	case "p":
		var sb strings.Builder
		for _, run := range b.Runs {
			sb.WriteString(run.Text)
		}
		r.pdf.SetFont("Serif", "", bodySize)
		return float64(len(r.pdf.SplitText(sb.String(), contentW)))*bodyLine + paraGap
	}
	return 0
}

// startOf is how much of what follows must share the page: a few lines of
// prose, a table's title, header and first rows, or a whole figure.
func (r *renderer) startOf(rest []Block) float64 {
	h := 0.0
	for _, b := range rest {
		switch {
		case isHeading(b):
			h += r.height(b)
			continue
		case b.Kind == "table":
			return h + r.tableStart(b)
		case b.Kind == "image":
			if _, ih, ok := imageSize(b); ok {
				return h + ih + 8
			}
			return h
		default:
			return h + 3*bodyLine
		}
	}
	return h
}

// tableStart is what the table itself keeps together: its title, its header
// and its first four rows, measured as they will wrap.
func (r *renderer) tableStart(b Block) float64 {
	t := b.Table
	if t == nil || len(t.Columns) == 0 {
		return 0
	}
	p := r.pdf
	size := tableType(len(t.Columns))
	const pad, vpad = 1.6, 0.9
	lineH := size * 0.46
	widths := r.columnWidths(t, size, pad)
	was := p.GetCellMargin()
	p.SetCellMargin(pad)
	defer p.SetCellMargin(was)
	rowH := func(vals []string, header bool) float64 {
		most := 1
		for i := range t.Columns {
			v := ""
			if i < len(vals) {
				v = vals[i]
			}
			r.cellFont(t, i, v, size, header)
			if n := len(wrapCell(p, v, widths[i]-2*pad, !header && alignOf(t, i) == "R", !header && looksLikeIdentifier(v), linesFor(header))); n > most {
				most = n
			}
		}
		return float64(most)*lineH + 2*vpad
	}
	h := 8 + rowH(t.Columns, true)
	if b.Title != "" {
		p.SetFont("Inter", "B", 9.5)
		h += float64(len(p.SplitText(b.Title, contentW+2*pad)))*5 + 1
	}
	for j := 0; j < len(t.Rows) && j < 4; j++ {
		h += rowH(t.Rows[j], false)
	}
	return h
}

// imageSize is the figure's size on the page: its captured size, at most the text width and a page.
func imageSize(b Block) (w, h float64, ok bool) {
	data, err := base64.StdEncoding.DecodeString(b.Image)
	if err != nil {
		return 0, 0, false
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width == 0 {
		return 0, 0, false
	}
	// Captured at twice the size it had on screen; one CSS pixel is 1/96 inch.
	w = minf(float64(cfg.Width)/2*25.4/96, contentW)
	h = w * float64(cfg.Height) / float64(cfg.Width)
	if maxH := pageH - marginTop - marginBottom - 24; h > maxH {
		h = maxH
		w = h * float64(cfg.Width) / float64(cfg.Height)
	}
	return w, h, true
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
	p.Line(marginL, p.GetY(), pageW-marginR, p.GetY())
	p.Ln(2)
	p.SetFont("Inter", "", 7.5)
	r.color(muted)
	p.CellFormat(contentW/2, 4, r.title, "", 0, "L", false, 0, "")
	p.CellFormat(contentW/2, 4, fmt.Sprintf("Page %d of {nb}", p.PageNo()), "", 0, "R", false, 0, "")
}

func (r *renderer) head(doc Doc) {
	p := r.pdf
	p.SetFont("Inter", "B", 22)
	r.color(ink)
	p.MultiCell(contentW, 22*1.15*25.4/72, doc.Title, "", "L", false)
	p.Ln(3)
	r.draw(accent)
	p.SetLineWidth(0.7)
	p.Line(marginL, p.GetY(), marginL+24, p.GetY())
	p.Ln(4)
	p.SetFont("Inter", "", 8)
	r.color(muted)
	for _, m := range doc.Meta {
		p.MultiCell(contentW, 8*1.5*25.4/72, m, "", "L", false)
	}
	p.Ln(7)
}

func (r *renderer) block(b Block, first bool) {
	p := r.pdf
	switch b.Kind {
	case "h1", "h2", "h3":
		// Inter semibold on a 16 / 13 / 11 pt scale, the space above larger than below.
		size, line, above := 16.0, 16*1.25*25.4/72, 7.0
		if b.Kind == "h2" {
			size, line, above = 13.0, 13*1.3*25.4/72, 5.6
		} else if b.Kind == "h3" {
			size, line, above = 11.0, 11*1.35*25.4/72, 3.9
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
		tone := body
		if b.Tone == "soft" {
			tone = soft
		}
		r.runs(b.Runs, "Serif", "", bodySize, bodyLine, tone)
		p.Ln(bodyLine)
		p.Ln(paraGap)
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
			p.SetFont("Serif", "", bodySize)
			r.color(muted)
			p.SetX(marginL + 1.5)
			p.CellFormat(5, bodyLine, marker, "", 0, "L", false, 0, "")
			p.SetLeftMargin(marginL + 6)
			p.SetX(marginL + 6)
			r.runs(item, "Serif", "", bodySize, bodyLine, body)
			p.SetLeftMargin(marginL)
			p.Ln(bodyLine)
			p.Ln(1)
		}
		p.Ln(paraGap - 1)
	case "quote":
		top := r.y()
		startPage := p.PageNo()
		p.SetLeftMargin(marginL + 6)
		p.SetX(marginL + 6)
		r.runs(b.Runs, "Serif", "I", bodySize, bodyLine, soft)
		p.Ln(bodyLine)
		p.SetLeftMargin(marginL)
		if p.PageNo() == startPage {
			r.draw(hairline)
			p.SetLineWidth(0.8)
			p.Line(marginL+1.5, top+0.5, marginL+1.5, r.y()-0.5)
		}
		p.Ln(paraGap)
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
		p.Line(marginL, r.y(), pageW-marginR, r.y())
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
	for _, run := range glued(runs) {
		fam, st, sz := family, style, size
		if run.Code {
			// Mono runs wide beside the serif: a size down keeps the line even.
			fam, st, sz = "Mono", "", size*0.8
		} else {
			bold, italic := run.Bold || strings.Contains(st, "B"), run.Italic || strings.Contains(st, "I")
			switch {
			case bold && italic && fam == "Serif":
				st = "BI"
			case bold:
				st = "B"
			case italic:
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

// glued keeps punctuation with the word it touches across a change of style:
// the "." after a bold number and the "(" before an italic term would otherwise
// be free to start or end a line on their own ("122 components / . Most").
func glued(runs []Run) []Run {
	out := make([]Run, len(runs))
	copy(out, runs)
	const closing, opening = ".,;:!?)]’”%", "([‘“"
	for i := 0; i+1 < len(out); i++ {
		a, b := &out[i], &out[i+1]
		// Closing punctuation at the start of the next run joins this one.
		n := 0
		for n < len(b.Text) && strings.ContainsRune(closing, rune(b.Text[n])) {
			n++
		}
		if n > 0 && a.Text != "" && !strings.HasSuffix(a.Text, " ") {
			a.Text += b.Text[:n]
			b.Text = b.Text[n:]
		}
		// An opening mark at the end of this run moves to the next.
		if t := a.Text; t != "" && strings.ContainsRune(opening, []rune(t)[len([]rune(t))-1]) && b.Text != "" && !strings.HasPrefix(b.Text, " ") {
			rs := []rune(t)
			a.Text = string(rs[:len(rs)-1])
			b.Text = string(rs[len(rs)-1]) + b.Text
		}
	}
	return out
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

// tableType: wide tables set smaller, so every column stays on the page.
func tableType(cols int) float64 {
	switch {
	case cols >= 9:
		return 6.2
	case cols >= 7:
		return 6.8
	}
	return 7.8
}

// maxCellLines: a cell wraps this far, then keeps what matters and cuts the rest.
// A header may take more: it names the column, and two cut alike cannot be told apart.
const maxCellLines, maxHeaderLines = 4, 7

func linesFor(header bool) int {
	if header {
		return maxHeaderLines
	}
	return maxCellLines
}

func (r *renderer) table(b Block) {
	t := b.Table
	if t == nil || len(t.Columns) == 0 {
		return
	}
	p := r.pdf
	size := tableType(len(t.Columns))
	const pad, vpad = 1.6, 0.9
	lineH := size * 0.46
	widths := r.columnWidths(t, size, pad)
	// Each cell's lines, and the row's height from its tallest cell.
	layout := func(vals []string, header bool) ([][]string, float64) {
		out := make([][]string, len(t.Columns))
		most := 1
		for i := range t.Columns {
			v := ""
			if i < len(vals) {
				v = vals[i]
			}
			r.cellFont(t, i, v, size, header)
			out[i] = wrapCell(p, v, widths[i]-2*pad, !header && alignOf(t, i) == "R", !header && looksLikeIdentifier(v), linesFor(header))
			if len(out[i]) > most {
				most = len(out[i])
			}
		}
		return out, float64(most)*lineH + 2*vpad
	}
	draw := func(cells [][]string, vals []string, h float64, header bool) {
		top, x := r.y(), marginL
		for i := range t.Columns {
			v := ""
			if i < len(vals) {
				v = vals[i]
			}
			r.cellFont(t, i, v, size, header)
			if header {
				r.color(muted)
			} else {
				r.color(body)
			}
			for k, line := range cells[i] {
				p.SetXY(x, top+vpad+float64(k)*lineH)
				p.CellFormat(widths[i], lineH, line, "", 0, alignOf(t, i), false, 0, "")
			}
			x += widths[i]
		}
		p.SetXY(marginL, top+h)
	}
	headCells, headH := layout(t.Columns, true)
	header := func() {
		draw(headCells, t.Columns, headH, true)
		r.draw(rgb{200, 203, 208})
		p.SetLineWidth(0.3)
		p.Line(marginL, r.y(), marginL+sum(widths), r.y())
	}
	r.space(1.5)
	// The title, the header and a few rows stay together.
	r.keep(r.tableStart(b))
	r.cellTitle(b)
	p.SetCellMargin(pad)
	// Rows are placed by hand, so the page breaks here, with the header repeated.
	p.SetAutoPageBreak(false, marginBottom)
	header()
	for _, row := range t.Rows {
		cells, h := layout(row, false)
		if r.room() < h+0.5 {
			p.AddPage()
			header()
		}
		draw(cells, row, h, false)
		r.draw(hairline)
		p.SetLineWidth(0.15)
		p.Line(marginL, r.y(), marginL+sum(widths), r.y())
	}
	p.SetAutoPageBreak(true, marginBottom)
	p.SetCellMargin(1)
	r.cellFoot(b)
}

// cellFont: numbers and identifiers in mono, words in Inter, the header in bold.
func (r *renderer) cellFont(t *Table, i int, v string, size float64, header bool) {
	switch {
	case header:
		r.pdf.SetFont("Inter", "B", size)
	case alignOf(t, i) == "R" || looksLikeIdentifier(v):
		r.pdf.SetFont("Mono", "", size*0.94)
	default:
		r.pdf.SetFont("Inter", "", size)
	}
}

// wrapCell breaks a cell's text over lines of width w. Words wrap at spaces;
// identifiers wrap after a / or a dot, and past maxCellLines keep their tail,
// the part that tells two paths apart. Numbers stay on one line.
func wrapCell(p *fpdf.Fpdf, s string, w float64, numeric, identifier bool, maxLines int) []string {
	if s == "" {
		return []string{""}
	}
	if numeric || p.GetStringWidth(s) <= w {
		return []string{fit(p, s, w, false)}
	}
	var lines []string
	if identifier {
		lines = wrapIdentifier(p, s, w)
	} else {
		// SplitText takes the cell margin off the width again; give it back.
		for _, l := range p.SplitText(s, w+2*p.GetCellMargin()) {
			lines = append(lines, strings.TrimSpace(l))
		}
	}
	if len(lines) <= maxLines {
		return lines
	}
	if identifier {
		kept := lines[len(lines)-maxLines+1:]
		return append([]string{fit(p, "…"+lines[len(lines)-maxLines], w, true)}, kept...)
	}
	kept := lines[:maxLines]
	kept[maxLines-1] = fit(p, kept[maxLines-1]+"…", w, false)
	return kept
}

// wrapIdentifier fills each line up to a separator where it can, mid-name where it must.
func wrapIdentifier(p *fpdf.Fpdf, s string, w float64) []string {
	var lines []string
	runes := []rune(s)
	for len(runes) > 0 {
		if p.GetStringWidth(string(runes)) <= w {
			lines = append(lines, string(runes))
			break
		}
		n, slash, other := 1, 0, 0
		for n < len(runes) && p.GetStringWidth(string(runes[:n+1])) <= w {
			n++
			switch runes[n-1] {
			case '/', '\\':
				slash = n
			case '.', '_', '-':
				other = n
			}
		}
		if slash > n/3 {
			n = slash
		} else if other > n/3 {
			n = other
		}
		lines = append(lines, string(runes[:n]))
		runes = runes[n:]
	}
	return lines
}

// columnWidths sizes columns by what they hold. Numbers get what they need;
// text columns share the rest in proportion to their longest value, never
// narrower than their longest word, so text wraps between words.
func (r *renderer) columnWidths(t *Table, size, pad float64) []float64 {
	p := r.pdf
	n := len(t.Columns)
	want := make([]float64, n)
	floor := make([]float64, n)
	for i, c := range t.Columns {
		r.cellFont(t, i, c, size, true)
		// A number column is as wide as its numbers; a long header wraps over them.
		want[i] = p.GetStringWidth(c) + 2*pad
		if alignOf(t, i) == "R" {
			want[i] = longestWord(p, c) + 2*pad
		}
		floor[i] = longestWord(p, c) + 2*pad
		for j, row := range t.Rows {
			if j > 200 || i >= len(row) {
				continue
			}
			r.cellFont(t, i, row[i], size, false)
			want[i] = maxf(want[i], p.GetStringWidth(row[i])+2*pad)
			if !looksLikeIdentifier(row[i]) {
				floor[i] = maxf(floor[i], longestWord(p, row[i])+2*pad)
			}
		}
		// A little slack, so a value measured to fit is never cut by rounding.
		want[i] = minf(want[i]+0.4, contentW*0.6)
		floor[i] = minf(minf(floor[i], want[i]), contentW*0.3)
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
			want[i] = maxf(maxf(12, floor[i]), w*left/flexible)
		}
	}
	// Floors can overfill the page; take the excess from the widest text columns.
	for over := sum(want) - contentW; over > 0.1; over = sum(want) - contentW {
		wide := -1
		for i := range want {
			if alignOf(t, i) != "R" && want[i] > 12 && (wide < 0 || want[i] > want[wide]) {
				wide = i
			}
		}
		if wide < 0 {
			break
		}
		want[wide] = maxf(12, want[wide]-minf(over, want[wide]*0.25))
	}
	return want
}

func longestWord(p *fpdf.Fpdf, s string) float64 {
	most := 0.0
	for _, w := range strings.Fields(s) {
		most = maxf(most, p.GetStringWidth(w))
	}
	return most
}

func (r *renderer) image(b Block) {
	p := r.pdf
	w, h, ok := imageSize(b)
	if !ok {
		return
	}
	// A figure that does not fit where a good part of the page is still free is
	// set smaller, to half its size at the least, rather than leave that part empty.
	title := 0.0
	if b.Title != "" {
		title = 6
	}
	if avail := r.room() - 1.5 - 8 - title; h > avail && avail > (pageH-marginTop-marginBottom)*0.3 && avail/h >= 0.5 {
		w, h = w*avail/h, avail
	}
	data, _ := base64.StdEncoding.DecodeString(b.Image)
	r.imgN++
	name := fmt.Sprintf("img%d", r.imgN)
	p.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(data))
	r.space(1.5)
	r.keep(h + 8)
	r.cellTitle(b)
	p.ImageOptions(name, marginL, r.y(), w, h, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
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
