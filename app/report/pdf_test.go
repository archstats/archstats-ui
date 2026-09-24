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
