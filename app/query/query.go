package query

import (
	"database/sql"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/archstats/archstats-ui/app/store"
	_ "github.com/mattn/go-sqlite3"
)

// Service executes read-only SQL against the currently selected scan
// snapshot. It replaces the webapp's in-browser sql.js worker; the frontend
// keeps sending raw SQL strings, exactly as before.
type Service struct {
	store *store.Store

	mu     sync.Mutex
	db     *sql.DB
	scanID string

	// A second handle, for reading a snapshot other than the open one — what
	// comparing a component against an earlier scan needs. Only one is kept:
	// a comparison reads one baseline at a time.
	altMu     sync.Mutex
	altDB     *sql.DB
	altScanID string
}

func NewService(st *store.Store) *Service {
	return &Service{store: st}
}

// Open selects a completed scan's snapshot as the active database, closing
// any previously open snapshot.
func (s *Service) Open(scanID string) error {
	db, err := s.openSnapshot(scanID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		s.db.Close()
	}
	s.db = db
	s.scanID = scanID
	return nil
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
	return db, nil
}

// CurrentScan returns the id of the open scan, or "" if none.
func (s *Service) CurrentScan() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.scanID
}

// Close releases the active snapshot and any baseline, if open.
func (s *Service) Close() error {
	s.closeBaseline()

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
	s.mu.Lock()
	db := s.db
	s.mu.Unlock()
	if db == nil {
		return nil, fmt.Errorf("no scan open")
	}

	return runQuery(db, sqlStr)
}

// QueryIn runs raw SQL against a completed snapshot that is not the open one,
// which is how a view compares the current scan against an earlier one. The
// open snapshot is left untouched; asking for a different baseline closes the
// previous one.
func (s *Service) QueryIn(scanID string, sqlStr string) ([]map[string]any, error) {
	s.mu.Lock()
	current, db := s.scanID, s.db
	s.mu.Unlock()
	if scanID == "" {
		return nil, fmt.Errorf("no scan given")
	}
	if scanID == current && db != nil {
		return runQuery(db, sqlStr)
	}

	s.altMu.Lock()
	defer s.altMu.Unlock()
	if s.altDB == nil || s.altScanID != scanID {
		opened, err := s.openSnapshot(scanID)
		if err != nil {
			return nil, err
		}
		if s.altDB != nil {
			s.altDB.Close()
		}
		s.altDB, s.altScanID = opened, scanID
	}
	return runQuery(s.altDB, sqlStr)
}

func (s *Service) closeBaseline() {
	s.altMu.Lock()
	defer s.altMu.Unlock()
	if s.altDB != nil {
		s.altDB.Close()
		s.altDB, s.altScanID = nil, ""
	}
}

func runQuery(db *sql.DB, sqlStr string) ([]map[string]any, error) {
	rows, err := db.Query(sqlStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	out := []map[string]any{}
	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}
	for rows.Next() {
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		row := make(map[string]any, len(columns))
		for i, col := range columns {
			row[col] = jsonValue(values[i])
		}
		out = append(out, row)
	}
	return out, rows.Err()
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
