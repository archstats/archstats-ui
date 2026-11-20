package app

import (
	"go/ast"
	"go/parser"
	"go/token"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// bound is every service main.go hands to Wails. Wails turns each exported
// method into a frontend binding and each struct it takes or returns into a
// TypeScript class in frontend/wailsjs/go/models.ts.
var bound = []any{
	&WorkspaceService{}, &ScanService{}, &CloneService{}, &QueryService{}, &StateService{},
	&MenuService{}, &AppService{}, &FilesService{}, &ChangesService{}, &EvidenceService{},
	&NotesService{}, &AskService{}, &AIService{},
}

// TestBoundListMatchesMain keeps bound in step with main.go's Bind list, so a
// new service cannot skip TestIPCStructsHaveJSONTags.
func TestBoundListMatchesMain(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "../main.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	n := -1
	ast.Inspect(file, func(node ast.Node) bool {
		kv, ok := node.(*ast.KeyValueExpr)
		if !ok {
			return true
		}
		if id, ok := kv.Key.(*ast.Ident); ok && id.Name == "Bind" {
			if lit, ok := kv.Value.(*ast.CompositeLit); ok {
				n = len(lit.Elts)
			}
		}
		return true
	})
	if n != len(bound) {
		t.Fatalf("main.go binds %d services, bound in ipc_test.go lists %d: add the new service to bound", n, len(bound))
	}
}

// TestIPCStructsHaveJSONTags checks every struct a bound method takes or
// returns, all the way down: each exported field names itself with a json
// tag. Without one, encoding/json sends the Go field name (HeadCommit, not
// headCommit) and the generated TypeScript model follows it, so the frontend
// and the Go side quietly disagree on a key the day someone renames a field.
func TestIPCStructsHaveJSONTags(t *testing.T) {
	seen := map[reflect.Type]bool{}
	var missing []string
	var walk func(t reflect.Type, via string)
	walk = func(t reflect.Type, via string) {
		for t.Kind() == reflect.Pointer || t.Kind() == reflect.Slice || t.Kind() == reflect.Array || t.Kind() == reflect.Map {
			t = t.Elem()
		}
		if t.Kind() != reflect.Struct || seen[t] || t.PkgPath() == "time" {
			return
		}
		seen[t] = true
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			if !f.IsExported() {
				continue
			}
			tag := f.Tag.Get("json")
			if f.Anonymous && tag == "" {
				walk(f.Type, via) // embedded: its fields are flattened into this one
				continue
			}
			if name, _, _ := strings.Cut(tag, ","); name == "" {
				missing = append(missing, t.String()+"."+f.Name+"  (via "+via+")")
			}
			walk(f.Type, via)
		}
	}
	for _, svc := range bound {
		st := reflect.TypeOf(svc)
		for i := 0; i < st.NumMethod(); i++ {
			m := st.Method(i)
			via := st.Elem().Name() + "." + m.Name
			for j := 1; j < m.Type.NumIn(); j++ {
				walk(m.Type.In(j), via)
			}
			for j := 0; j < m.Type.NumOut(); j++ {
				walk(m.Type.Out(j), via)
			}
		}
	}
	if len(seen) < 20 {
		t.Fatalf("walked only %d structs; the walk has stopped seeing the bound methods", len(seen))
	}
	t.Logf("%d structs cross the IPC boundary", len(seen))
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("fields crossing the IPC boundary without a json tag (add `json:\"camelCase\"`, or `json:\"-\"` to keep one out):\n  %s", strings.Join(missing, "\n  "))
	}
}
