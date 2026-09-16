package app

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/archstats/archstats-ui/app/query"
	"github.com/archstats/archstats-ui/app/scan"
	"github.com/archstats/archstats-ui/app/store"
)

// SelfCheck exercises the packaged binary end to end without opening a
// window: temp registry → workspace over a generated fixture → a real scan
// through the embedded engine (cgo: tree-sitter + sqlite) → queries over the
// snapshot. CI runs it against the extracted/installed artifact on every OS,
// so a green release means the shipped binary actually works there.
func SelfCheck(version string) error {
	fmt.Printf("archstats-desktop %s self-check\n", version)

	root, err := os.MkdirTemp("", "archstats-selfcheck-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)

	fixture := filepath.Join(root, "fixture")
	if err := writeSelfCheckFixture(fixture); err != nil {
		return fmt.Errorf("writing fixture: %w", err)
	}

	st, err := store.Open(filepath.Join(root, "data"))
	if err != nil {
		return fmt.Errorf("opening registry: %w", err)
	}
	defer st.Close()
	fmt.Println("  ok  registry")

	ws, err := st.CreateWorkspace("selfcheck", fixture)
	if err != nil {
		return fmt.Errorf("creating workspace: %w", err)
	}

	started, err := scan.NewService(st).StartScan(ws.ID)
	if err != nil {
		return fmt.Errorf("starting scan: %w", err)
	}
	deadline := time.Now().Add(2 * time.Minute)
	var sc *store.Scan
	for {
		if sc, err = st.GetScan(started.ID); err != nil {
			return fmt.Errorf("reading scan: %w", err)
		}
		if sc.Status != store.ScanStatusRunning {
			break
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("scan did not finish within 2 minutes")
		}
		time.Sleep(50 * time.Millisecond)
	}
	if sc.Status != store.ScanStatusComplete {
		return fmt.Errorf("scan %s: %s", sc.Status, sc.Error)
	}
	fmt.Println("  ok  scan (engine + snapshot export)")

	q := query.NewService(st)
	if err := q.Open(sc.ID); err != nil {
		return fmt.Errorf("opening snapshot: %w", err)
	}
	defer q.Close()

	for _, table := range []string{"files", "snippets", "components"} {
		rows, err := q.Query(fmt.Sprintf("SELECT count(*) AS c FROM %s", table))
		if err != nil {
			return fmt.Errorf("querying %s: %w", table, err)
		}
		n, _ := rows[0]["c"].(int64)
		if n == 0 {
			return fmt.Errorf("%s: expected rows, got none", table)
		}
		fmt.Printf("  ok  %-10s %d rows\n", table, n)
	}

	fmt.Println("self-check PASSED")
	return nil
}

// A two-language fixture so both tree-sitter grammars and the component
// extensions get exercised.
func writeSelfCheckFixture(root string) error {
	files := map[string]string{
		"web/src/util.ts":         "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
		"web/src/main.ts":         "import { add } from \"./util\";\nconsole.log(add(1, 2));\n",
		"server/src/Main.java":    "package com.example;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(Greeter.greet());\n    }\n}\n",
		"server/src/Greeter.java": "package com.example;\n\npublic class Greeter {\n    static String greet() {\n        return \"hi\";\n    }\n}\n",
	}
	for path, content := range files {
		full := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			return err
		}
	}
	return nil
}
