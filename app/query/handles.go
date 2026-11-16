package query

import (
	"database/sql"
	"fmt"
)

// handleState is where a snapshot's database is in its life.
type handleState int

const (
	// live takes new readers.
	live handleState = iota
	// retired takes none: another snapshot was opened, it was evicted from
	// the comparison handles, or it was released. It closes once its last
	// reader has left, because closing a database waits for the queries on
	// it and the window would wait with them.
	retired
	// closed has released the file.
	closed
)

// A handle is one snapshot's database and the queries reading it.
type handle struct {
	scanID  string
	db      *sql.DB
	state   handleState
	readers int
	used    int64         // when it was last asked for, to evict the oldest
	done    chan struct{} // closed with the database
}

var errNoScan = fmt.Errorf("no scan open")

// acquire returns the handle on scanID's snapshot, or on the open one when
// scanID is "", counting the caller as a reader. Every acquire is paired with
// a release.
func (s *Service) acquire(scanID string) (*handle, error) {
	s.mu.Lock()
	if h := s.lookup(scanID); h != nil {
		h.readers++
		s.mu.Unlock()
		return h, nil
	}
	s.mu.Unlock()
	if scanID == "" {
		return nil, errNoScan
	}

	// Opening a file is slow next to the lock; another caller may open the
	// same snapshot meanwhile, and then the first one in is kept.
	db, err := s.openSnapshot(scanID)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if h := s.lookup(scanID); h != nil {
		db.Close()
		h.readers++
		return h, nil
	}
	h := s.newHandle(scanID, db)
	h.readers = 1
	s.alt[scanID] = h
	for len(s.alt) > altHandles {
		s.evictOldest()
	}
	return h, nil
}

// lookup is the live handle on scanID ("" for the open snapshot), or nil.
// The caller holds s.mu.
func (s *Service) lookup(scanID string) *handle {
	if s.open != nil && (scanID == "" || scanID == s.open.scanID) {
		return s.open
	}
	h := s.alt[scanID]
	if h != nil {
		s.tick++
		h.used = s.tick
	}
	return h
}

func (s *Service) newHandle(scanID string, db *sql.DB) *handle {
	s.tick++
	return &handle{scanID: scanID, db: db, used: s.tick, done: make(chan struct{})}
}

// release ends one reader of h.
func (s *Service) release(h *handle) {
	s.mu.Lock()
	defer s.mu.Unlock()
	h.readers--
	s.closeIfIdle(h)
}

// retire stops h taking readers; it closes once the last one has left. The
// caller holds s.mu and has already taken h out of s.open or s.alt.
func (s *Service) retire(h *handle) {
	if h.state == live {
		h.state = retired
		s.closeIfIdle(h)
	}
}

func (s *Service) closeIfIdle(h *handle) {
	if h.state == retired && h.readers == 0 {
		h.state = closed
		h.db.Close()
		close(h.done)
	}
}

// evictOldest retires the comparison handle asked for longest ago. Its
// queries run to the end; a comparison is not cancelled for being old.
func (s *Service) evictOldest() {
	var oldest *handle
	for _, h := range s.alt {
		if oldest == nil || h.used < oldest.used {
			oldest = h
		}
	}
	delete(s.alt, oldest.scanID)
	s.retire(oldest)
}

// Read lends fn the snapshot of scanID (the open one when ""). The database
// stays open until fn returns; fn must not close it.
func (s *Service) Read(scanID string, fn func(*sql.DB) error) error {
	h, err := s.acquire(scanID)
	if err != nil {
		return err
	}
	defer s.release(h)
	return fn(h.db)
}
