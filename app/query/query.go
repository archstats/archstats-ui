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

	// mu guards the handles and the running queries, never a query itself.
	mu sync.Mutex
	// open is the snapshot the window shows.
	open *handle
	// Snapshots other than the open one, for comparisons: a small LRU keyed
	// by scan id.
	alt  map[string]*handle
	tick int64

	// Queries a caller can cancel, by the id it gave them. A view that is
	// left, or reloads, cancels its queries instead of letting them run out
	// their minute against everyone else's.
	running map[string]runningQuery
	anon    int64 // names queries started without an id
}

func NewService(st *store.Store) *Service {
	return &Service{store: st, alt: map[string]*handle{}, running: map[string]runningQuery{}}
}

// Open selects a completed scan's snapshot as the active database. Queries
// asked of the snapshot it replaces are cancelled: they were for the view
// being left. The old database closes once nothing reads it.
func (s *Service) Open(scanID string) error {
	db, err := s.openSnapshot(scanID)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if old := s.open; old != nil {
		s.cancelWhere(func(q runningQuery) bool { return q.h == old && q.followsOpen })
		s.retire(old)
	}
	s.open = s.newHandle(scanID, db)
	return nil
}

// Release closes every handle on a scan's snapshot, cancelling what still
// reads it, and returns once the file is closed. Call it before deleting the
// file: Windows refuses to delete a file that is open.
func (s *Service) Release(scanID string) {
	s.mu.Lock()
	var gone []*handle
	if h := s.alt[scanID]; h != nil {
		delete(s.alt, scanID)
		gone = append(gone, h)
	}
	if h := s.open; h != nil && h.scanID == scanID {
		s.open = nil
		gone = append(gone, h)
	}
	s.retireAll(gone)
	s.mu.Unlock()
	for _, h := range gone {
		<-h.done
	}
}

// retireAll cancels the queries reading hs and retires them. The caller
// holds s.mu.
func (s *Service) retireAll(hs []*handle) {
	for _, h := range hs {
		s.cancelWhere(func(q runningQuery) bool { return q.h == h })
		s.retire(h)
	}
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
	if s.open == nil {
		return ""
	}
	return s.open.scanID
}

// Close releases the active snapshot and every baseline, once what reads
// them has stopped.
func (s *Service) Close() error {
	s.mu.Lock()
	var gone []*handle
	for id, h := range s.alt {
		delete(s.alt, id)
		gone = append(gone, h)
	}
	if s.open != nil {
		gone = append(gone, s.open)
		s.open = nil
	}
	s.retireAll(gone)
	s.mu.Unlock()
	for _, h := range gone {
		<-h.done
	}
	return nil
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
	var out []map[string]any
	err := s.Read(scanID, func(db *sql.DB) (err error) {
		out, err = runQuery(db, sqlStr)
		return err
	})
	return out, err
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
	h, err := s.acquire(scanID)
	if err != nil {
		return nil, err
	}
	defer s.release(h)
	db := h.db
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
	// The handle it reads, and whether it asked for the open snapshot rather
	// than naming one.
	h           *handle
	followsOpen bool
}

// Rows runs SQL on the open snapshot, or on scanID when given, as a Table.
// id names the query for Cancel. A query on the open snapshot is cancelled
// when another snapshot is opened.
func (s *Service) Rows(id, scanID, sqlStr string) (*Table, error) {
	h, err := s.acquire(scanID)
	if err != nil {
		return nil, err
	}
	defer s.release(h)
	ctx, cancel := context.WithTimeout(context.Background(), QueryTimeout)
	defer cancel()
	id = s.track(id, runningQuery{cancel: cancel, h: h, followsOpen: scanID == ""})
	defer s.untrack(id)
	return scanTable(ctx, h.db, sqlStr)
}

// track registers a running query under id, naming it when id is "". A
// query whose handle was retired between acquire and here is cancelled
// straight away, as it would have been had it registered first.
func (s *Service) track(id string, q runningQuery) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id == "" {
		s.anon++
		id = fmt.Sprintf("~%d", s.anon)
	}
	if q.h.state != live && q.followsOpen {
		q.cancel()
	}
	s.running[id] = q
	return id
}

func (s *Service) untrack(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.running, id)
}

// Cancel stops the query started with this id, if it is still running.
func (s *Service) Cancel(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if q, ok := s.running[id]; ok {
		q.cancel()
	}
}

// cancelWhere cancels every running query match accepts. The caller holds
// s.mu.
func (s *Service) cancelWhere(match func(runningQuery) bool) {
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
