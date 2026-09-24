package store

import "database/sql"

// Readings returns the cached readings of a scan; a reading stored as NULL
// (not measurable in that snapshot) comes back as a nil value.
func (s *Store) Readings(scanID string) (map[string]*float64, error) {
	rows, err := s.db.Query(`SELECT reading, value FROM scan_readings WHERE scan_id = ?`, scanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]*float64{}
	for rows.Next() {
		var k string
		var v sql.NullFloat64
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		if v.Valid {
			f := v.Float64
			out[k] = &f
		} else {
			out[k] = nil
		}
	}
	return out, rows.Err()
}

// PutReadings stores a scan's readings in one transaction.
func (s *Store) PutReadings(scanID string, values map[string]*float64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for k, v := range values {
		var val any
		if v != nil {
			val = *v
		}
		if _, err := tx.Exec(`INSERT INTO scan_readings (scan_id, reading, value) VALUES (?, ?, ?)
			ON CONFLICT(scan_id, reading) DO UPDATE SET value = excluded.value`, scanID, k, val); err != nil {
			return err
		}
	}
	return tx.Commit()
}
