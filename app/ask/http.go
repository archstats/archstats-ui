package ask

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// post sends a JSON body and returns the response when it is 200; any other
// status comes back as an error carrying the API's own message. A busy API
// (429, 503, 529) is asked again after the wait it names, a few times, before
// its refusal is shown.
func post(ctx context.Context, client *http.Client, who, url string, headers map[string]string, body any) (*http.Response, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		res, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("%s is not answering: %w", who, err)
		}
		if res.StatusCode == http.StatusOK {
			return res, nil
		}
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 8192))
		res.Body.Close()
		if wait, ok := busyWait(res, attempt); ok {
			select {
			case <-time.After(wait):
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		return nil, httpError(who, res.StatusCode, msg)
	}
}

// busyRetries is how many times a busy API is asked again. Few: a key over
// its per-minute limit is refused again on every request until the minute
// turns, and each refusal counts against it.
const busyRetries = 2

// busyWait is how long to wait before asking a busy API again: its
// retry-after when it names one (up to a minute), else 5s, 10s.
func busyWait(res *http.Response, attempt int) (time.Duration, bool) {
	switch res.StatusCode {
	case http.StatusTooManyRequests, http.StatusServiceUnavailable, 529:
	default:
		return 0, false
	}
	if attempt >= busyRetries {
		return 0, false
	}
	if s, err := strconv.ParseFloat(strings.TrimSpace(res.Header.Get("retry-after")), 64); err == nil && s >= 0 {
		return min(time.Duration(s*float64(time.Second)), time.Minute), true
	}
	return time.Duration(5<<attempt) * time.Second, true
}

// getJSON reads a JSON document.
func getJSON(ctx context.Context, client *http.Client, who, url string, headers map[string]string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("%s is not answering: %w", who, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 8192))
		return httpError(who, res.StatusCode, msg)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// readSSE calls each with every server-sent event's type and data, until
// the stream ends or each returns false.
func readSSE(r io.Reader, each func(event string, data []byte) bool) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	var event string
	var data bytes.Buffer
	flush := func() bool {
		if data.Len() == 0 {
			event = ""
			return true
		}
		ok := each(event, bytes.TrimSuffix(data.Bytes(), []byte("\n")))
		event = ""
		data.Reset()
		return ok
	}
	for sc.Scan() {
		line := sc.Text()
		switch {
		case line == "":
			if !flush() {
				return nil
			}
		case strings.HasPrefix(line, ":"):
		case strings.HasPrefix(line, "event:"):
			event = strings.TrimSpace(line[len("event:"):])
		case strings.HasPrefix(line, "data:"):
			data.WriteString(strings.TrimPrefix(line[len("data:"):], " "))
			data.WriteByte('\n')
		}
	}
	if err := sc.Err(); err != nil {
		return err
	}
	flush()
	return nil
}

// requestLog notes every request to a provider (method, host, path, status,
// how long, and the provider's rate-limit headers; never a key or a body)
// in the file askLogPath, so a run of refusals can be read afterwards.
type requestLog struct{ next http.RoundTripper }

var askLogPath = filepath.Join(os.TempDir(), "archstats-ask-requests.log")

func (l requestLog) RoundTrip(req *http.Request) (*http.Response, error) {
	t0 := time.Now()
	res, err := l.next.RoundTrip(req)
	line := fmt.Sprintf("%s %s %s%s", t0.Format("15:04:05.000"), req.Method, req.URL.Host, req.URL.Path)
	if err != nil {
		line += " error: " + err.Error()
	} else {
		line += fmt.Sprintf(" %d %dms", res.StatusCode, time.Since(t0).Milliseconds())
		for k, v := range res.Header {
			lk := strings.ToLower(k)
			if lk == "retry-after" || lk == "request-id" || strings.Contains(lk, "ratelimit") || lk == "x-should-retry" {
				line += fmt.Sprintf(" %s=%s", lk, strings.Join(v, ","))
			}
		}
	}
	if f, ferr := os.OpenFile(askLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600); ferr == nil {
		fmt.Fprintln(f, line)
		f.Close()
	}
	return res, err
}
