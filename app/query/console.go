package query

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	sqlite3 "github.com/mattn/go-sqlite3"
)

// The SQL console runs what a person types against a snapshot, so it gets a
// driver of its own that can only read: an authorizer allows SELECT, reads,
// functions and recursive CTEs and denies everything else (ATTACH, writes,
// schema changes), attaching is limited to zero databases, and the file is
// opened read-only. One statement, ten seconds, 5,000 rows, cells clipped.

const (
	ConsoleDriver   = "sqlite3_console"
	ConsoleRows     = 5000
	ConsoleTimeout  = 10 * time.Second
	ConsoleCellSize = 4096
	sqliteRecursive = 33 // SQLITE_RECURSIVE, not exported by the driver
)

var consoleOnce sync.Once

// readPragmas are the pragmas the console allows: schema reading only.
var readPragmas = map[string]bool{"table_info": true, "table_xinfo": true, "index_list": true, "index_info": true, "table_list": true, "foreign_key_list": true}

func consoleAuthorizer(op int, arg1, _, _ string) int {
	switch op {
	case sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqliteRecursive:
		return sqlite3.SQLITE_OK
	case sqlite3.SQLITE_PRAGMA:
		if readPragmas[strings.ToLower(arg1)] {
			return sqlite3.SQLITE_OK
		}
	}
	return sqlite3.SQLITE_DENY
}

func registerConsole() {
	consoleOnce.Do(func() {
		sql.Register(ConsoleDriver, &sqlite3.SQLiteDriver{
			ConnectHook: func(conn *sqlite3.SQLiteConn) error {
				conn.SetLimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
				conn.RegisterAuthorizer(consoleAuthorizer)
				return nil
			},
		})
	})
}

// singleStatement rejects more than one statement: the console answers one question at a time.
func singleStatement(q string) (string, error) {
	t := strings.TrimSpace(q)
	t = strings.TrimRight(t, "; \t\n")
	if t == "" {
		return "", fmt.Errorf("nothing to run")
	}
	if strings.Contains(t, ";") && !inStringsOnly(t) {
		return "", fmt.Errorf("one statement at a time")
	}
	return t, nil
}

// inStringsOnly reports whether every ';' sits inside a quoted string.
func inStringsOnly(q string) bool {
	var quote rune
	for _, r := range q {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
			}
		case r == '\'' || r == '"':
			quote = r
		case r == ';':
			return false
		}
	}
	return true
}

// Console runs one read-only statement against a scan's snapshot file.
func (s *Service) Console(scanID, sqlStr string) (*Limited, error) {
	registerConsole()
	stmt, err := singleStatement(sqlStr)
	if err != nil {
		return nil, err
	}
	scan, err := s.store.GetScan(scanID)
	if err != nil {
		return nil, err
	}
	if scan.SnapshotPath == "" {
		return nil, fmt.Errorf("the scan has no snapshot")
	}
	db, err := sql.Open(ConsoleDriver, "file:"+scan.SnapshotPath+"?mode=ro&_query_only=1")
	if err != nil {
		return nil, err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), ConsoleTimeout)
	defer cancel()
	started := time.Now()
	rows, err := db.QueryContext(ctx, stmt)
	if err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("stopped after %s", ConsoleTimeout)
		}
		if strings.Contains(err.Error(), "not authorized") {
			return nil, fmt.Errorf("the console only reads: %v", err)
		}
		return nil, err
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
		if len(out.Rows) >= ConsoleRows {
			out.Truncated = true
			break
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		row := make([]any, len(columns))
		for i := range values {
			v := jsonValue(values[i])
			if str, ok := v.(string); ok && len(str) > ConsoleCellSize {
				v = str[:ConsoleCellSize] + "…"
			}
			row[i] = v
		}
		out.Rows = append(out.Rows, row)
	}
	if err := rows.Err(); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("stopped after %s", ConsoleTimeout)
		}
		return nil, err
	}
	out.ElapsedMs = time.Since(started).Milliseconds()
	return out, nil
}
