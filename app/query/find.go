package query

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf16"
	"unicode/utf8"
)

// Find in code searches the source a snapshot keeps (file_contents), in Go
// rather than SQL: a plain needle is counted with strings.Count, which is far
// quicker than a regexp over megabytes, and a regular expression is RE2, so
// no pattern a person types can run away.

const (
	FindMaxFiles = 5000
	FindMaxLines = 300
	FindTimeout  = 10 * time.Second
	findLineCap  = 400
)

// FindOptions are the toggles next to the search field.
type FindOptions struct {
	Regex         bool `json:"regex"`
	CaseSensitive bool `json:"caseSensitive"`
	Word          bool `json:"word"`
}

type FileHits struct {
	File string `json:"file"`
	Hits int    `json:"hits"`
}

type FindResult struct {
	Files     []FileHits `json:"files"`
	TotalHits int        `json:"totalHits"`
	// Files searched: the denominator of "in N of M files".
	Searched  int   `json:"searched"`
	Truncated bool  `json:"truncated"`
	ElapsedMs int64 `json:"elapsedMs"`
}

// HitLine is a line that matched, or a line of context around one.
type HitLine struct {
	Line    int    `json:"line"`
	Text    string `json:"text"`
	Context bool   `json:"context"`
	// Match ranges in UTF-16 units of Text, as JavaScript counts them.
	Ranges [][2]int `json:"ranges"`
}

// matcher counts a needle's occurrences in a text.
type matcher struct {
	re    *regexp.Regexp
	plain string
	fold  bool
}

func newMatcher(needle string, opt FindOptions) (*matcher, error) {
	if needle == "" {
		return nil, fmt.Errorf("nothing to find")
	}
	if !opt.Regex && !opt.Word {
		if opt.CaseSensitive {
			return &matcher{plain: needle}, nil
		}
		return &matcher{plain: strings.ToLower(needle), fold: true}, nil
	}
	re, err := compileNeedle(needle, opt)
	if err != nil {
		return nil, err
	}
	return &matcher{re: re}, nil
}

func compileNeedle(needle string, opt FindOptions) (*regexp.Regexp, error) {
	p := needle
	if !opt.Regex {
		p = regexp.QuoteMeta(needle)
	}
	if opt.Word {
		p = `\b(?:` + p + `)\b`
	}
	if !opt.CaseSensitive {
		p = `(?i)` + p
	}
	re, err := regexp.Compile(p)
	if err != nil {
		// "error parsing regexp: missing closing ): `(?i)(a`" -> the part a person
		// can act on, without the flags this function added to their pattern.
		msg := err.Error()
		if i := strings.Index(msg, ": "); i >= 0 {
			msg = msg[i+2:]
		}
		if i := strings.LastIndex(msg, ": `"); i >= 0 {
			msg = msg[:i]
		}
		return nil, fmt.Errorf("not a valid pattern: %s", msg)
	}
	if re.MatchString("") {
		return nil, fmt.Errorf("the pattern matches nothing at all, so it would match everywhere")
	}
	return re, nil
}

func (m *matcher) count(text string) int {
	if m.re != nil {
		return len(m.re.FindAllStringIndex(text, -1))
	}
	if m.fold {
		text = strings.ToLower(text)
	}
	return strings.Count(text, m.plain)
}

// FindInCode counts the needle in every file the snapshot kept the source of,
// most hits first.
func (s *Service) FindInCode(scanID, needle string, opt FindOptions) (*FindResult, error) {
	m, err := newMatcher(needle, opt)
	if err != nil {
		return nil, err
	}
	db, err := s.OpenReadOnly(scanID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), FindTimeout)
	defer cancel()
	started := time.Now()
	rows, err := db.QueryContext(ctx, `SELECT file, content FROM file_contents WHERE content IS NOT NULL`)
	if err != nil {
		return nil, timeoutErr(ctx, err)
	}
	defer rows.Close()
	out := &FindResult{Files: []FileHits{}}
	for rows.Next() {
		var file, content string
		if err := rows.Scan(&file, &content); err != nil {
			return nil, err
		}
		out.Searched++
		if n := m.count(content); n > 0 {
			out.Files = append(out.Files, FileHits{File: file, Hits: n})
			out.TotalHits += n
		}
	}
	if err := rows.Err(); err != nil {
		return nil, timeoutErr(ctx, err)
	}
	sort.Slice(out.Files, func(i, j int) bool {
		if out.Files[i].Hits != out.Files[j].Hits {
			return out.Files[i].Hits > out.Files[j].Hits
		}
		return out.Files[i].File < out.Files[j].File
	})
	if len(out.Files) > FindMaxFiles {
		out.Files = out.Files[:FindMaxFiles]
		out.Truncated = true
	}
	out.ElapsedMs = time.Since(started).Milliseconds()
	return out, nil
}

// FindLines returns one file's matching lines, each with a line of context
// either side, in file order; at most FindMaxLines matching lines.
func (s *Service) FindLines(scanID, file, needle string, opt FindOptions) ([]HitLine, error) {
	re, err := compileNeedle(needle, opt)
	if err != nil {
		return nil, err
	}
	db, err := s.OpenReadOnly(scanID)
	if err != nil {
		return nil, err
	}
	var content string
	if err := db.QueryRow(`SELECT content FROM file_contents WHERE file = ?`, file).Scan(&content); err != nil {
		return nil, fmt.Errorf("no source kept for %s", file)
	}
	return hitLines(content, re, FindMaxLines), nil
}

func hitLines(content string, re *regexp.Regexp, max int) []HitLine {
	lines := strings.Split(content, "\n")
	hits := map[int][][2]int{}
	order := []int{}
	for i, l := range lines {
		l = strings.TrimSuffix(l, "\r")
		if len(order) >= max {
			break
		}
		idx := re.FindAllStringIndex(l, -1)
		if len(idx) == 0 {
			continue
		}
		clip := clipLine(l)
		var ranges [][2]int
		for _, r := range idx {
			if r[0] >= len(clip) {
				break
			}
			end := r[1]
			if end > len(clip) {
				end = len(clip)
			}
			ranges = append(ranges, [2]int{utf16Len(clip[:r[0]]), utf16Len(clip[:end])})
		}
		hits[i] = ranges
		order = append(order, i)
	}
	out := []HitLine{}
	last := -1
	emit := func(i int, context bool) {
		if i < 0 || i >= len(lines) || i <= last {
			return
		}
		out = append(out, HitLine{Line: i + 1, Text: clipLine(strings.TrimSuffix(lines[i], "\r")), Context: context, Ranges: hits[i]})
		last = i
	}
	for _, i := range order {
		if _, isHit := hits[i-1]; !isHit {
			emit(i-1, true)
		}
		emit(i, false)
		if _, isHit := hits[i+1]; !isHit {
			emit(i+1, true)
		}
	}
	return out
}

// clipLine keeps the start of a very long line (a minified bundle), cut on a rune boundary.
func clipLine(l string) string {
	if len(l) <= findLineCap {
		return l
	}
	cut := findLineCap
	for cut > 0 && !utf8.RuneStart(l[cut]) {
		cut--
	}
	return l[:cut]
}

func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		n += len(utf16.Encode([]rune{r}))
	}
	return n
}
