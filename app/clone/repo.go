// Package clone makes a workspace from a repository address: it clones the
// repository into the app's own folder (or one the user chose), reports
// git's progress as it goes, and says in plain words why a clone failed.
package clone

import (
	"errors"
	"net/url"
	"path"
	"regexp"
	"strings"
)

// Repo is a repository address as the user typed it, understood.
type Repo struct {
	// URL is what git clones: the input, or the https address a shorthand
	// ("owner/repo", "github.com/owner/repo") stands for.
	URL string `json:"url"`
	// Host, Owner and Name name the repository; Owner may hold several
	// segments on hosts that nest groups (gitlab.com/group/sub/repo).
	Host  string `json:"host"`
	Owner string `json:"owner"`
	Name  string `json:"name"`
	// Local is set for a path or file:// address, which is cloned as is.
	Local bool `json:"local"`
}

// Slug is "host/owner/name", the repository's folder under the repos root.
func (r Repo) Slug() string {
	parts := []string{}
	for _, p := range []string{r.Host, r.Owner, r.Name} {
		if p != "" {
			parts = append(parts, p)
		}
	}
	return strings.Join(parts, "/")
}

var (
	scpLike   = regexp.MustCompile(`^(?:[\w.-]+@)?([\w.-]+):(?:/)?(.+)$`)
	shorthand = regexp.MustCompile(`^[\w.-]+/[\w.-]+$`)
	safeSeg   = regexp.MustCompile(`[^\w.-]+`)
)

// ErrNotARepo is the refusal for input that names no repository.
var ErrNotARepo = errors.New("that is not a repository address")

// Parse understands the addresses people paste: https and ssh URLs, the
// scp-like "git@host:owner/repo.git", "host/owner/repo" without a scheme,
// GitHub's "owner/repo" shorthand, and file:// or absolute local paths.
func Parse(input string) (Repo, error) {
	in := strings.TrimSpace(input)
	in = strings.TrimSuffix(in, "/")
	if in == "" {
		return Repo{}, ErrNotARepo
	}
	// A pasted "git clone <url>" is a url.
	if f := strings.Fields(in); len(f) >= 3 && f[0] == "git" && f[1] == "clone" {
		in = f[len(f)-1]
	}

	if strings.HasPrefix(in, "/") || strings.HasPrefix(in, "file://") {
		p := strings.TrimPrefix(in, "file://")
		name := trimGit(path.Base(p))
		if name == "" || name == "/" || name == "." {
			return Repo{}, ErrNotARepo
		}
		return Repo{URL: in, Name: name, Local: true}, nil
	}

	if strings.Contains(in, "://") {
		u, err := url.Parse(in)
		if err != nil || u.Host == "" {
			return Repo{}, ErrNotARepo
		}
		switch u.Scheme {
		case "https", "http", "ssh", "git":
		default:
			return Repo{}, ErrNotARepo
		}
		// A browser address points inside the repository: github's
		// /owner/repo/tree/main/src still means owner/repo.
		segs := splitPath(u.Path)
		if isForge(u.Hostname()) && len(segs) > 2 {
			segs = segs[:2]
			u.Path = "/" + strings.Join(segs, "/")
		}
		if len(segs) < 1 {
			return Repo{}, ErrNotARepo
		}
		r := fromSegments(u.Hostname(), segs)
		if isForge(u.Hostname()) && (u.Scheme == "https" || u.Scheme == "http") {
			r.URL = "https://" + u.Host + "/" + strings.Join(segs, "/")
			if !strings.HasSuffix(r.URL, ".git") {
				r.URL += ".git"
			}
		} else {
			r.URL = in
		}
		return r, nil
	}

	if m := scpLike.FindStringSubmatch(in); m != nil && strings.Contains(m[1], ".") {
		segs := splitPath(m[2])
		if len(segs) < 1 {
			return Repo{}, ErrNotARepo
		}
		r := fromSegments(m[1], segs)
		r.URL = in
		return r, nil
	}

	// "github.com/owner/repo" with the scheme left off.
	if segs := splitPath(in); len(segs) >= 3 && strings.Contains(segs[0], ".") {
		host := segs[0]
		rest := segs[1:]
		if isForge(host) && len(rest) > 2 {
			rest = rest[:2]
		}
		r := fromSegments(host, rest)
		r.URL = "https://" + host + "/" + strings.Join(rest, "/")
		if !strings.HasSuffix(r.URL, ".git") {
			r.URL += ".git"
		}
		return r, nil
	}

	if shorthand.MatchString(in) {
		segs := splitPath(in)
		r := fromSegments("github.com", segs)
		r.URL = "https://github.com/" + segs[0] + "/" + trimGit(segs[1]) + ".git"
		return r, nil
	}
	return Repo{}, ErrNotARepo
}

func fromSegments(host string, segs []string) Repo {
	name := trimGit(segs[len(segs)-1])
	owner := strings.Join(segs[:len(segs)-1], "/")
	return Repo{Host: strings.ToLower(host), Owner: owner, Name: name}
}

func splitPath(p string) []string {
	out := []string{}
	for _, s := range strings.Split(p, "/") {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func trimGit(s string) string { return strings.TrimSuffix(s, ".git") }

// isForge is a host whose web addresses put the repository in the first two
// path segments, so anything after them is a page inside it.
func isForge(host string) bool {
	switch strings.ToLower(host) {
	case "github.com", "bitbucket.org", "codeberg.org":
		return true
	}
	return false
}

// SafeSegment makes one path segment safe for any file system.
func SafeSegment(s string) string {
	s = safeSeg.ReplaceAllString(s, "-")
	s = strings.Trim(s, ".-")
	if s == "" {
		return "repo"
	}
	return s
}
