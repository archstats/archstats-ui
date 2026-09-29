package clone

import (
	"strings"
)

// Explain turns git's stderr into the sentence a person needs: what went
// wrong and what to do about it. Unknown failures keep git's last line.
func Explain(stderr string, repo Repo) string {
	s := strings.ToLower(stderr)
	host := repo.Host
	if host == "" {
		host = "the server"
	}
	switch {
	case strings.Contains(s, "could not resolve host"), strings.Contains(s, "could not resolve hostname"):
		return "Could not reach " + host + ". Check the address and the network connection."
	case strings.Contains(s, "host key verification failed"):
		return "SSH does not know " + host + " yet. Connect to it once in a terminal (ssh -T git@" + host + ") to trust it, then try again."
	case strings.Contains(s, "permission denied (publickey"):
		return "SSH refused the key for " + host + ". Check that your SSH key is added to your account and to the agent (ssh-add), or clone the https address instead."
	case strings.Contains(s, "terminal prompts disabled"), strings.Contains(s, "could not read username"),
		strings.Contains(s, "authentication failed"), strings.Contains(s, "invalid username or password"):
		return "The repository needs a sign-in, and git has none stored for " + host + ". Clone it once in a terminal so your credential helper remembers you, or use its SSH address."
	case strings.Contains(s, "repository not found"), strings.Contains(s, "not found"), strings.Contains(s, "does not appear to be a git repository"):
		return "There is no repository at that address, or it is private and your git credentials cannot see it."
	case strings.Contains(s, "already exists and is not an empty directory"):
		return "The destination folder already exists and is not empty. Choose another folder."
	case strings.Contains(s, "no space left on device"):
		return "The disk is full. Free some space, or choose a folder on another disk."
	case strings.Contains(s, "shallow file has changed"), strings.Contains(s, "--shallow-since"):
		return "The server refused a partial history. Try again with Full history."
	case strings.Contains(s, "executable file not found"):
		return "Git is not installed, or not on this app's path. Install git (on macOS: xcode-select --install) and try again."
	}
	return "git clone failed: " + lastLine(stderr)
}

func lastLine(s string) string {
	lines := strings.FieldsFunc(s, func(r rune) bool { return r == '\n' || r == '\r' })
	for i := len(lines) - 1; i >= 0; i-- {
		l := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(lines[i]), "fatal:"))
		if l != "" {
			if _, ok := ParseLine(lines[i]); !ok {
				return l
			}
		}
	}
	return "no reason given"
}
