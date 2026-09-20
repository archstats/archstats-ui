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
}

func NewService(st *store.Store) *Service {
	return &Service{store: st}
}

// Open selects a completed scan's snapshot as the active database, closing
// any previously open snapshot.
func (s *Service) Open(scanID string) error {
	scan, err := s.store.GetScan(scanID)
	if err != nil {
		return err
	}
	if scan.Status != store.ScanStatusComplete {
		return fmt.Errorf("scan %s is %s, not complete", scanID, scan.Status)
	}

	// Snapshots are immutable once complete, so read-only + immutable is safe
	// and lets SQLite skip locking entirely.
	dsn := fmt.Sprintf("file:%s?mode=ro&immutable=1", scan.SnapshotPath)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return fmt.Errorf("opening snapshot %s: %w", scan.SnapshotPath, err)
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

// CurrentScan returns the id of the open scan, or "" if none.
func (s *Service) CurrentScan() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.scanID
}

// Close releases the active snapshot, if any.
func (s *Service) Close() error {
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
