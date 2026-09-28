package report

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/go-pdf/fpdf"
)

func pngBase64(w, h int) string {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		img.Set(x, h/2, color.RGBA{224, 138, 25, 255})
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return base64.StdEncoding.EncodeToString(buf.Bytes())
}

func TestRenderLaysOutEveryBlockKind(t *testing.T) {
	rows := [][]string{}
	for i := 0; i < 120; i++ {
		rows = append(rows, []string{"org/broadleafcommerce/core/catalog/domain/ProductImpl" + strconv.Itoa(i) + ".java", "1,204", "6.91", "→ ·"})
	}
	doc := Doc{
		Title: "Broadleaf: structural audit",
		Meta:  []string{"BroadleafCommerce · snapshot 22 Sep 2026 · a1b2c3d · analysis r3"},
		Blocks: []Block{
			{Kind: "h1", Runs: []Run{{Text: "Where change effort goes"}}},
			{Kind: "p", Runs: []Run{{Text: "In the 90 days to 22 Sep, "}, {Text: "4%", Bold: true}, {Text: " of changed lines went into "}, {Text: "files", Italic: true}, {Text: " with health below 5, see "}, {Text: "core.catalog", Code: true}, {Text: " and "}, {Text: "the plan", Link: "https://example.org"}, {Text: ". Ünïcödé “quotes” — dashes."}}},
			{Kind: "ul", Items: [][]Run{{{Text: "one"}}, {{Text: "two, which is long enough to wrap onto a second line of the page because it keeps going and going"}}}},
			{Kind: "ol", Start: 3, Items: [][]Run{{{Text: "third"}}}},
			{Kind: "quote", Runs: []Run{{Text: "A quote."}}},
			{Kind: "code", Code: "SELECT name FROM components\nWHERE hotspot > 40;"},
			{Kind: "hr"},
			{Kind: "table", Title: "Hottest files", Caption: "Table 1. Files by hotspot.", Provenance: "BroadleafCommerce · 22 Sep · a1b2c3d · r3", Table: &Table{Columns: []string{"File", "Lines", "Health", "Note"}, Align: []string{"", "r", "r", ""}, Rows: rows}},
			{Kind: "image", Title: "Coupling", Image: pngBase64(1600, 900), Caption: "Figure 1."},
		},
	}
	out, err := Render(doc)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(out, []byte("%PDF")) {
		t.Fatal("not a PDF")
	}
	// 120 rows do not fit one page: the table breaks and repeats its header.
	if n := strings.Count(string(out), "/Type /Page\n"); n < 3 {
		t.Errorf("%d pages, want at least 3", n)
	}
	if path := os.Getenv("PDF_OUT"); path != "" {
		os.WriteFile(path, out, 0o644)
	}
}

func TestLetterIsNarrowerAndShorter(t *testing.T) {
	a4, err := Render(Doc{Title: "x", Blocks: []Block{{Kind: "p", Runs: []Run{{Text: "hello"}}}}})
	if err != nil {
		t.Fatal(err)
	}
	letter, _ := Render(Doc{Title: "x", PageSize: "Letter", Blocks: []Block{{Kind: "p", Runs: []Run{{Text: "hello"}}}}})
	if !strings.Contains(string(a4), "/MediaBox [0 0 595.28 841.89]") || !strings.Contains(string(letter), "/MediaBox [0 0 612.00 792.00]") {
		t.Fatal("page sizes are not A4 and Letter")
	}
}

func TestLongCellsWrapAndWideTablesKeepEveryColumn(t *testing.T) {
	p := fpdf.New("P", "mm", "A4", "")
	p.AddUTF8FontFromBytes("Inter", "", interRegular)
	p.AddUTF8FontFromBytes("Mono", "", monoRegular)
	p.SetFont("Inter", "", 7.8)
	sentence := "Controllers that call repositories directly skip the service layer, so a rule written in a service does not guard them."
	lines := wrapCell(p, sentence, 60, false, false, maxCellLines)
	if len(lines) < 2 || strings.Contains(strings.Join(lines, " "), "…") {
		t.Errorf("a sentence should wrap whole, got %q", lines)
	}
	p.SetFont("Mono", "", 7.3)
	path := "org/broadleafcommerce/core/catalog/service/CatalogServiceImpl.java"
	lines = wrapCell(p, path, 45, false, true, maxCellLines)
	if strings.Join(lines, "") != path {
		t.Errorf("a path should wrap without losing characters, got %q", lines)
	}
	if !strings.HasSuffix(lines[0], "/") {
		t.Errorf("a path should break after a slash, got %q", lines[0])
	}
	if got := wrapCell(p, "1,204", 4, true, false, maxCellLines); len(got) != 1 {
		t.Errorf("numbers stay on one line, got %q", got)
	}

	cols := []string{"Component", "Files", "Lines", "Afferent coupling", "Efferent coupling", "Instability", "Abstractness", "Distance", "Note"}
	row := []string{"org.broadleafcommerce.core.catalog", "120", "14,020", "31", "12", "0.28", "0.11", "0.61", sentence}
	r := &renderer{pdf: p}
	contentW = 210 - marginL - marginR
	widths := r.columnWidths(&Table{Columns: cols, Align: []string{"", "r", "r", "r", "r", "r", "r", "r", ""}, Rows: [][]string{row}}, tableType(len(cols)), 1.6)
	if len(widths) != len(cols) {
		t.Fatalf("%d widths for %d columns", len(widths), len(cols))
	}
	if total := sum(widths); total > contentW+0.5 {
		t.Errorf("columns span %.1f mm, the page has %.1f", total, contentW)
	}
	if tableType(len(cols)) >= 7.8 {
		t.Error("a nine-column table should be set smaller")
	}
}

func TestTallFigureShrinksIntoAMostlyFreePage(t *testing.T) {
	long := strings.Repeat("A computed paragraph that leads into the figure below it. ", 15)
	// 1720x1620, the size of a real dependency graph capture: 166 x 156 mm, taller than what is left under the paragraph.
	doc := Doc{Title: "Gap", Blocks: []Block{{Kind: "p", Runs: []Run{{Text: long}}}, {Kind: "image", Title: "Dependency structure", Image: pngBase64(1720, 1620)}}}
	out, err := Render(doc)
	if err != nil {
		t.Fatal(err)
	}
	if n := strings.Count(string(out), "/Type /Page\n"); n != 1 {
		t.Errorf("%d pages: the figure should shrink onto the first page rather than leave it half empty", n)
	}
}

func TestPunctuationStaysWithTheStyledWordItTouches(t *testing.T) {
	got := glued([]Run{{Text: "grouped into "}, {Text: "122 components", Bold: true}, {Text: ". Most of it"}, {Text: " people ("}, {Text: "authors", Italic: true}, {Text: ") made"}})
	want := []string{"grouped into ", "122 components.", " Most of it", " people ", "(authors)", " made"}
	for i, r := range got {
		if r.Text != want[i] {
			t.Errorf("run %d = %q, want %q", i, r.Text, want[i])
		}
	}
}
