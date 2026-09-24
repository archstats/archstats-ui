package query

import (
	"testing"
)

func TestMatcherCounts(t *testing.T) {
	cases := []struct {
		needle string
		opt    FindOptions
		text   string
		want   int
	}{
		{"pay", FindOptions{}, "Payment pay PAY", 3},
		{"pay", FindOptions{CaseSensitive: true}, "Payment pay PAY", 1},
		{"pay", FindOptions{Word: true}, "Payment pay PAY", 2},
		{"a.c", FindOptions{}, "abc a.c", 1},
		{"a.c", FindOptions{Regex: true}, "abc a.c", 2},
	}
	for _, c := range cases {
		m, err := newMatcher(c.needle, c.opt)
		if err != nil {
			t.Fatalf("%q: %v", c.needle, err)
		}
		if got := m.count(c.text); got != c.want {
			t.Errorf("%q %+v in %q: got %d, want %d", c.needle, c.opt, c.text, got, c.want)
		}
	}
}

func TestInvalidPatternsSayWhy(t *testing.T) {
	if _, err := newMatcher("(a", FindOptions{Regex: true}); err == nil || err.Error() != "not a valid pattern: missing closing )" {
		t.Fatalf("got %v", err)
	}
	if _, err := newMatcher("x*", FindOptions{Regex: true}); err == nil {
		t.Fatal("a pattern that matches the empty string would match everywhere")
	}
}

func TestHitLinesKeepContextOnceAndCountInUTF16(t *testing.T) {
	re, _ := compileNeedle("pay", FindOptions{})
	got := hitLines("a\n😀 pay\npay\nb\nc\nd\npay", re, 10)
	var lines []int
	for _, h := range got {
		lines = append(lines, h.Line)
	}
	if want := []int{1, 2, 3, 4, 6, 7}; !equalInts(lines, want) {
		t.Fatalf("lines %v, want %v", lines, want)
	}
	// "😀 " is three UTF-16 units: the emoji's two and the space.
	if r := got[1].Ranges; len(r) != 1 || r[0] != [2]int{3, 6} {
		t.Fatalf("ranges %v", r)
	}
	if !got[0].Context || got[1].Context {
		t.Fatal("line 1 is context, line 2 a hit")
	}
}

func equalInts(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
