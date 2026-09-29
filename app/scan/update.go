package scan

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// A clone the app made is the app's to keep current: before it is scanned,
// it is brought up to its upstream, so "Scan" reads what the repository has
// now. A checkout the user made is never touched. Offline, or with the
// remote gone, the scan reads the local copy and says so.

// updateClone fast-forwards a managed clone to its upstream; it returns
// what went wrong, or "" when the clone is current.
func updateClone(dir string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	run := func(args ...string) error {
		cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...)
		cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "LC_ALL=C")
		if os.Getenv("GIT_SSH_COMMAND") == "" {
			cmd.Env = append(cmd.Env, "GIT_SSH_COMMAND=ssh -o BatchMode=yes -o ConnectTimeout=20")
		}
		out, err := cmd.CombinedOutput()
		if err != nil {
			msg := strings.TrimSpace(string(out))
			if i := strings.LastIndex(msg, "\n"); i >= 0 {
				msg = msg[i+1:]
			}
			return fmt.Errorf("%s", strings.TrimPrefix(msg, "fatal: "))
		}
		return nil
	}
	if err := run("fetch", "--quiet", "--prune", "origin"); err != nil {
		return "Could not update from origin (" + err.Error() + "); scanned the local copy."
	}
	// The app owns this checkout, so a hard reset loses nothing of the user's.
	if err := run("reset", "--quiet", "--hard", "@{upstream}"); err != nil {
		return "Could not move to the latest commit (" + err.Error() + "); scanned the local copy."
	}
	return ""
}
