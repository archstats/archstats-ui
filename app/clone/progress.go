package clone

import (
	"regexp"
	"strconv"
	"strings"
)

// Progress is one reading of git's own progress, turned into one number.
type Progress struct {
	// Phase is what git is doing: "connecting", "counting", "compressing",
	// "receiving", "resolving" or "checkout".
	Phase string `json:"phase"`
	// Percent is the whole clone's progress, 0–100, or -1 while git has
	// not said anything measurable yet.
	Percent float64 `json:"percent"`
	// Received and Rate are git's own words for the transfer ("48.20 MiB",
	// "6.10 MiB/s"), while objects are being received.
	Received string `json:"received"`
	Rate     string `json:"rate"`
}

// The phases git reports, and the share of the whole clone each stands for:
// receiving is almost all of the wait; resolving deltas and writing files
// are the tail. The remote's counting and compressing come before anything
// arrives, so they share the first sliver.
var phases = []struct {
	label, phase string
	from, to     float64
}{
	{"Enumerating objects", "counting", 0, 1},
	{"Counting objects", "counting", 1, 2},
	{"Compressing objects", "compressing", 2, 5},
	{"Receiving objects", "receiving", 5, 82},
	{"Resolving deltas", "resolving", 82, 95},
	{"Updating files", "checkout", 95, 100},
}

var progressLine = regexp.MustCompile(`^(?:remote:\s*)?([A-Za-z ]+):\s+(\d+)%(?:\s*\((\d+)/(\d+)\))?(?:,\s*([\d.]+\s*[KMGT]?i?B)\s*\|\s*([\d.]+\s*[KMGT]?i?B/s))?`)

// ParseLine reads one line of `git clone --progress` output. ok is false for
// lines that carry no progress (the "Cloning into" banner, warnings).
func ParseLine(line string) (Progress, bool) {
	line = strings.TrimSpace(line)
	m := progressLine.FindStringSubmatch(line)
	if m == nil {
		if strings.HasPrefix(line, "Cloning into") {
			return Progress{Phase: "connecting", Percent: -1}, true
		}
		return Progress{}, false
	}
	label := strings.TrimSpace(m[1])
	pct, _ := strconv.ParseFloat(m[2], 64)
	for _, p := range phases {
		if p.label != label {
			continue
		}
		out := Progress{Phase: p.phase, Percent: round1(p.from + (p.to-p.from)*pct/100)}
		if p.phase == "receiving" {
			out.Received = strings.TrimSpace(m[5])
			out.Rate = strings.TrimSpace(m[6])
		}
		return out, true
	}
	return Progress{}, false
}

func round1(f float64) float64 { return float64(int(f*10+0.5)) / 10 }

// SplitProgress is a bufio.SplitFunc for git's stderr: git redraws a
// progress line with a carriage return, so both \r and \n end a line.
func SplitProgress(data []byte, atEOF bool) (advance int, token []byte, err error) {
	for i, b := range data {
		if b == '\r' || b == '\n' {
			return i + 1, data[:i], nil
		}
	}
	if atEOF && len(data) > 0 {
		return len(data), data, nil
	}
	return 0, nil, nil
}
