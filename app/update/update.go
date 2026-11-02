// Package update answers two questions about the app's own releases: is a
// newer one out, and what changed since the version the user last ran.
//
// The first asks GitHub for the latest published release. Drafts and
// prereleases are never offered, and nothing about the user or their code is
// sent: the request is an anonymous GET of a public page. The second reads
// the CHANGELOG.md the app was built with, so it works offline.
package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"golang.org/x/mod/semver"
)

// Repository is where the app's releases are published.
const Repository = "archstats/archstats-ui"

// Release is one published release.
type Release struct {
	Version   string `json:"version"`
	URL       string `json:"url"`
	Published string `json:"published"`
	Notes     string `json:"notes"`
}

// Latest fetches the newest published release. base is the API root, which
// tests point at a local server.
func Latest(ctx context.Context, client *http.Client, base string) (Release, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/repos/"+Repository+"/releases/latest", nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "archstats-desktop")
	resp, err := client.Do(req)
	if err != nil {
		return Release{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Release{}, fmt.Errorf("GitHub answered %s", resp.Status)
	}
	var body struct {
		TagName     string    `json:"tag_name"`
		HTMLURL     string    `json:"html_url"`
		PublishedAt time.Time `json:"published_at"`
		Body        string    `json:"body"`
		Draft       bool      `json:"draft"`
		Prerelease  bool      `json:"prerelease"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return Release{}, err
	}
	if body.Draft || body.Prerelease || !semver.IsValid(body.TagName) {
		return Release{}, fmt.Errorf("the latest release %q is not a published version", body.TagName)
	}
	return Release{Version: body.TagName, URL: body.HTMLURL, Published: body.PublishedAt.Format("2006-01-02"), Notes: body.Body}, nil
}

// Newer reports whether candidate is a later release than current. A build
// that is not a release ("dev", a commit) is never offered an update: it was
// built by hand, and whoever built it knows what they have.
func Newer(current, candidate string) bool {
	if !semver.IsValid(current) || !semver.IsValid(candidate) {
		return false
	}
	return semver.Compare(candidate, current) > 0
}

// Section is one release's part of CHANGELOG.md.
type Section struct {
	Version string `json:"version"`
	Date    string `json:"date"`
	Body    string `json:"body"`
}

var heading = regexp.MustCompile(`^## (v\d+\.\d+\.\d+\S*)(?: \((\d{4}-\d{2}-\d{2})\))?\s*$`)

// Sections splits a changelog into its released sections, newest first, as
// written. The Unreleased section is not a release and is left out.
func Sections(changelog string) []Section {
	var out []Section
	var cur *Section
	var body []string
	flush := func() {
		if cur != nil {
			cur.Body = strings.TrimSpace(strings.Join(body, "\n"))
			out = append(out, *cur)
		}
		cur, body = nil, nil
	}
	for _, line := range strings.Split(strings.ReplaceAll(changelog, "\r\n", "\n"), "\n") {
		if strings.HasPrefix(line, "## ") {
			flush()
			if m := heading.FindStringSubmatch(line); m != nil {
				cur = &Section{Version: m[1], Date: m[2]}
			}
			continue
		}
		if cur != nil {
			body = append(body, line)
		}
	}
	flush()
	return out
}

// Since returns the sections after seen, up to and including current: what
// changed between the version the user last ran and this one. A first run
// (seen empty) and a build that is not a release show nothing.
func Since(changelog, seen, current string) []Section {
	if !semver.IsValid(current) || !semver.IsValid(seen) || semver.Compare(current, seen) <= 0 {
		return nil
	}
	var out []Section
	for _, s := range Sections(changelog) {
		if semver.Compare(s.Version, seen) > 0 && semver.Compare(s.Version, current) <= 0 {
			out = append(out, s)
		}
	}
	return out
}
