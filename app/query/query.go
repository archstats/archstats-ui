package query

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"runtime"
	"sync"
	"time"

	"github.com/archstats/archstats-ui/app/store"
	_ "github.com/mattn/go-sqlite3"
)

// Limits on what one query may return. fineract's indirect-connections table
// holds 2.5M rows; a million-row []map over the Wails bridge is hundreds of
// MB, so a query that would return more fails with a message saying so.
const (
	MaxRows      = 300_000
	QueryTimeout = 60 * time.Second
	// altHandles is how many snapshots other than the open one stay open at
	// once: a comparison reads two or three bases, and a fourth is cheap.
	altHandles = 4
	// MaxBytes bounds one result by the size of its values. Rows narrow
	// enough to pass MaxRows can still be wide: each copy of the result the
	// bridge makes (JSON, the escaped script, the parsed rows) is about this
	// size again, and a window holding several of them is killed by the system.
	MaxBytes = 64 << 20
)

// ErrTooManyRows is returned when a query would return more than MaxRows.
var ErrTooManyRows = fmt.Errorf("the query returns more than %d rows; narrow it with WHERE, LIMIT or an aggregate", MaxRows)

// ErrTooLarge is returned when a query's values would come to more than MaxBytes.
var ErrTooLarge = fmt.Errorf("the query returns more than %d MB; select fewer columns, or narrow it with WHERE, LIMIT or an aggregate", MaxBytes>>20)

// ErrCancelled is returned by a query its caller no longer wanted.
var ErrCancelled = fmt.Errorf("cancelled")

// Service executes read-only SQL against the currently selected scan
// snapshot. It replaces the webapp's in-browser sql.js worker; the frontend
// keeps sending raw SQL strings, exactly as before.
type Service struct {
	store *store.Store

	mu     sync.Mutex
	db     *sql.DB
	scanID string

	// Queries a caller can cancel, by the id it gave them. A view that is
	// left, or reloads, cancels its queries instead of letting them run out
	// their minute against everyone else's.
	runMu   sync.Mutex
	running map[string]runningQuery
	anon    int64 // names queries started without an id

	// Snapshots other than the open one, for comparisons: a small LRU keyed
	// by scan id. The mutex guards the map only, never a running query.
	altMu sync.Mutex
	alt   map[string]*altHandle
	tick  int64
}

type altHandle struct {
	db   *sql.DB
	used int64
}

func NewService(st *store.Store) *Service {
	return &Service{store: st, alt: map[string]*altHandle{}, running: map[string]runningQuery{}}
}

// Open selects a completed scan's snapshot as the active database, closing
// any previously open snapshot.
func (s *Service) Open(scanID string) error {
	db, err := s.openSnapshot(scanID)
	if err != nil {
		return err
	}

	// Whatever was still reading the snapshot being closed has no reader left.
	s.cancelWhere(func(q runningQuery) bool { return q.open })

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		s.db.Close()
	}
	s.db = db
	s.scanID = scanID
	return nil
}

// OpenReadOnly returns a handle on any completed snapshot, shared with
// QueryIn's cache. Callers must not close it.
func (s *Service) OpenReadOnly(scanID string) (*sql.DB, error) {
	s.mu.Lock()
	current, db := s.scanID, s.db
	s.mu.Unlock()
	if scanID == current && db != nil {
		return db, nil
	}
	s.altMu.Lock()
	defer s.altMu.Unlock()
	s.tick++
	if h, ok := s.alt[scanID]; ok {
		h.used = s.tick
		return h.db, nil
	}
	opened, err := s.openSnapshot(scanID)
	if err != nil {
		return nil, err
	}
	if len(s.alt) >= altHandles {
		var oldest string
		var min int64 = -1
		for id, h := range s.alt {
			if min < 0 || h.used < min {
				oldest, min = id, h.used
			}
		}
		// Close waits for queries already running on the handle.
		s.alt[oldest].db.Close()
		delete(s.alt, oldest)
	}
	s.alt[scanID] = &altHandle{db: opened, used: s.tick}
	return opened, nil
}

// Release closes every handle on a scan's snapshot. Call it before deleting
// the file: Windows refuses to delete a file that is open.
func (s *Service) Release(scanID string) {
	s.altMu.Lock()
	if h, ok := s.alt[scanID]; ok {
		h.db.Close()
		delete(s.alt, scanID)
	}
	s.altMu.Unlock()
	s.mu.Lock()
	if s.scanID == scanID && s.db != nil {
		s.db.Close()
		s.db, s.scanID = nil, ""
	}
	s.mu.Unlock()
}

// openSnapshot opens a completed scan's snapshot read-only.
func (s *Service) openSnapshot(scanID string) (*sql.DB, error) {
	scan, err := s.store.GetScan(scanID)
	if err != nil {
		return nil, err
	}
	if scan.Status != store.ScanStatusComplete {
		return nil, fmt.Errorf("scan %s is %s, not complete", scanID, scan.Status)
	}

	// Snapshots are immutable once complete, so read-only + immutable is safe
	// and lets SQLite skip locking entirely.
	dsn := fmt.Sprintf("file:%s?mode=ro&immutable=1", scan.SnapshotPath)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("opening snapshot %s: %w", scan.SnapshotPath, err)
	}
	// A view opens a dozen queries at once; past the cores they only slow
	// each other down. A query waiting for a connection still honours its
	// cancellation.
	db.SetMaxOpenConns(max(4, runtime.NumCPU()))
	return db, nil
}

// CurrentScan returns the id of the open scan, or "" if none.
func (s *Service) CurrentScan() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.scanID
}

// Close releases the active snapshot and every baseline.
func (s *Service) Close() error {
	s.altMu.Lock()
	for id, h := range s.alt {
		h.db.Close()
		delete(s.alt, id)
	}
	s.altMu.Unlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return nil
	}
	err := s.db.Close()
	s.db = nil
	s.scanID = ""
	return err
}

// Query runs raw SQL against the open snapshot and returns JSON-friendly
// rows, mirroring sql.js' {column: value} row shape.
func (s *Service) Query(sqlStr string) ([]map[string]any, error) {
	t, err := s.Rows("", "", sqlStr)
	if err != nil {
		return nil, err
	}
	return t.maps(), nil
}

// QueryIn runs raw SQL against a completed snapshot that is not the open one,
// which is how a view compares the current scan against an earlier one. The
// open snapshot is left untouched.
func (s *Service) QueryIn(scanID string, sqlStr string) ([]map[string]any, error) {
	if scanID == "" {
		return nil, fmt.Errorf("no scan given")
	}
	db, err := s.OpenReadOnly(scanID)
	if err != nil {
		return nil, err
	}
	return runQuery(db, sqlStr)
}

// Limited is a result with its column order and whether it was cut short:
// what a console shows, where the reader must see truncation.
type Limited struct {
	Columns   []string `json:"columns"`
	Rows      [][]any  `json:"rows"`
	Truncated bool     `json:"truncated"`
	ElapsedMs int64    `json:"elapsedMs"`
}

// QueryLimited runs SQL on the open snapshot (or scanID when given), keeping
// at most maxRows and stopping after timeoutMs.
func (s *Service) QueryLimited(scanID, sqlStr string, maxRows, timeoutMs int) (*Limited, error) {
	var db *sql.DB
	if scanID == "" {
		s.mu.Lock()
		db = s.db
		s.mu.Unlock()
		if db == nil {
			return nil, fmt.Errorf("no scan open")
		}
	} else {
		var err error
		if db, err = s.OpenReadOnly(scanID); err != nil {
			return nil, err
		}
	}
	if maxRows <= 0 || maxRows > MaxRows {
		maxRows = MaxRows
	}
	timeout := time.Duration(timeoutMs) * time.Millisecond
	if timeout <= 0 || timeout > QueryTimeout {
		timeout = QueryTimeout
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	started := time.Now()
	rows, err := db.QueryContext(ctx, sqlStr)
	if err != nil {
		return nil, timeoutErr(ctx, err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := &Limited{Columns: columns, Rows: [][]any{}}
	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}
	for rows.Next() {
		if len(out.Rows) >= maxRows {
			out.Truncated = true
			break
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		row := make([]any, len(columns))
		for i := range values {
			row[i] = jsonValue(values[i])
		}
		out.Rows = append(out.Rows, row)
	}
	if err := rows.Err(); err != nil {
		return nil, timeoutErr(ctx, err)
	}
	out.ElapsedMs = time.Since(started).Milliseconds()
	return out, nil
}

func timeoutErr(ctx context.Context, err error) error {
	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("the query ran longer than its limit and was stopped")
	}
	return err
}

func runQuery(db *sql.DB, sqlStr string) ([]map[string]any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), QueryTimeout)
	defer cancel()
	t, err := scanTable(ctx, db, sqlStr)
	if err != nil {
		return nil, err
	}
	return t.maps(), nil
}

// maps is the table as {column: value} rows, sql.js' shape.
func (t *Table) maps() []map[string]any {
	out := make([]map[string]any, len(t.Rows))
	for r, values := range t.Rows {
		row := make(map[string]any, len(t.Columns))
		for i, col := range t.Columns {
			row[col] = values[i]
		}
		out[r] = row
	}
	return out
}

// Table is a result as its column names once and its rows as values in that
// order. Rows as maps repeat every column name in every row, which on a wide
// table is most of what crosses the bridge.
type Table struct {
	Columns []string `json:"columns"`
	Rows    [][]any  `json:"rows"`
}

type runningQuery struct {
	cancel context.CancelFunc
	// open is set when the query reads the open snapshot rather than a named one.
	open bool
}

// Rows runs SQL on the open snapshot, or on scanID when given, as a Table.
// id names the query for Cancel. Every query on the open snapshot is
// cancelled when another snapshot is opened: closing a database waits for
// the queries still running on it, and the window would wait with it.
func (s *Service) Rows(id, scanID, sqlStr string) (*Table, error) {
	var db *sql.DB
	if scanID == "" {
		s.mu.Lock()
		db = s.db
		s.mu.Unlock()
		if db == nil {
			return nil, fmt.Errorf("no scan open")
		}
	} else {
		var err error
		if db, err = s.OpenReadOnly(scanID); err != nil {
			return nil, err
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), QueryTimeout)
	defer cancel()
	if id == "" {
		s.runMu.Lock()
		s.anon++
		id = fmt.Sprintf("~%d", s.anon)
		s.runMu.Unlock()
	}
	s.runMu.Lock()
	s.running[id] = runningQuery{cancel: cancel, open: scanID == ""}
	s.runMu.Unlock()
	defer func() {
		s.runMu.Lock()
		delete(s.running, id)
		s.runMu.Unlock()
	}()
	return scanTable(ctx, db, sqlStr)
}

// Cancel stops the query started with this id, if it is still running.
func (s *Service) Cancel(id string) {
	s.cancelWhere(func(q runningQuery) bool { return false }, id)
}

// cancelWhere cancels the named queries and every running query match accepts.
func (s *Service) cancelWhere(match func(runningQuery) bool, ids ...string) {
	s.runMu.Lock()
	defer s.runMu.Unlock()
	for _, id := range ids {
		if q, ok := s.running[id]; ok {
			q.cancel()
		}
	}
	for _, q := range s.running {
		if match(q) {
			q.cancel()
		}
	}
}

// scanTable reads a query's rows within MaxRows and MaxBytes.
func scanTable(ctx context.Context, db *sql.DB, sqlStr string) (*Table, error) {
	rows, err := db.QueryContext(ctx, sqlStr)
	if err != nil {
		return nil, queryErr(ctx, err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := &Table{Columns: columns, Rows: [][]any{}}
	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}
	size := 0
	for rows.Next() {
		if len(out.Rows) >= MaxRows {
			return nil, ErrTooManyRows
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, queryErr(ctx, err)
		}
		row := make([]any, len(columns))
		for i := range values {
			row[i] = jsonValue(values[i])
			size += valueSize(row[i])
		}
		if size > MaxBytes {
			return nil, ErrTooLarge
		}
		out.Rows = append(out.Rows, row)
	}
	if err := rows.Err(); err != nil {
		return nil, queryErr(ctx, err)
	}
	return out, nil
}

// queryErr says why a query stopped when its context stopped it.
func queryErr(ctx context.Context, err error) error {
	if ctx.Err() == context.Canceled {
		return ErrCancelled
	}
	return timeoutErr(ctx, err)
}

// valueSize is roughly how many bytes a value takes as JSON.
func valueSize(v any) int {
	switch val := v.(type) {
	case string:
		return len(val) + 3
	case nil:
		return 5
	default:
		return 9
	}
}

// jsonValue makes a scanned SQLite value safe for the Wails JSON bridge.
// Non-finite floats (a ratio over zero produces +Inf; SQLite happily stores
// and returns them) would make encoding/json fail, which Wails treats as
// fatal for the whole app; they become null instead.
func jsonValue(v any) any {
	switch val := v.(type) {
	case []byte:
		return string(val)
	case time.Time:
		return val.Format(time.RFC3339)
	case float64:
		if math.IsInf(val, 0) || math.IsNaN(val) {
			return nil
		}
		return val
	case float32:
		f := float64(val)
		if math.IsInf(f, 0) || math.IsNaN(f) {
			return nil
		}
		return f
	default:
		return v
	}
}
