package app

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"strings"
	"testing"
)

// boundTypes are the services main.go binds to the window.
var boundTypes = map[string]bool{
	"WorkspaceService": true, "ScanService": true, "CloneService": true, "QueryService": true,
	"StateService": true, "MenuService": true, "AppService": true, "FilesService": true,
	"ChangesService": true, "EvidenceService": true, "AskService": true, "AIService": true,
}

// A panic in a method the window calls leaves the window's promise unsettled
// for ever (see app/safe). Every exported method of a bound service starts by
// deferring safe.Guard, so a new one cannot forget.
func TestEveryBoundMethodIsGuarded(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", func(fi fs.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go")
	}, 0)
	if err != nil {
		t.Fatal(err)
	}
	checked := 0
	for _, pkg := range pkgs {
		for _, f := range pkg.Files {
			for _, d := range f.Decls {
				fn, ok := d.(*ast.FuncDecl)
				if !ok || fn.Recv == nil || fn.Body == nil || !fn.Name.IsExported() {
					continue
				}
				rt := fn.Recv.List[0].Type
				if s, ok := rt.(*ast.StarExpr); ok {
					rt = s.X
				}
				id, ok := rt.(*ast.Ident)
				if !ok || !boundTypes[id.Name] {
					continue
				}
				checked++
				if !startsWithGuard(fn) {
					t.Errorf("%s.%s does not start with defer safe.Guard(...)", id.Name, fn.Name.Name)
				}
			}
		}
	}
	if checked < 50 {
		t.Fatalf("checked only %d methods; is boundTypes still right?", checked)
	}
}

func startsWithGuard(fn *ast.FuncDecl) bool {
	if len(fn.Body.List) == 0 {
		return false
	}
	ds, ok := fn.Body.List[0].(*ast.DeferStmt)
	if !ok {
		return false
	}
	sel, ok := ds.Call.Fun.(*ast.SelectorExpr)
	if !ok {
		return false
	}
	pkg, ok := sel.X.(*ast.Ident)
	return ok && pkg.Name == "safe" && sel.Sel.Name == "Guard"
}
