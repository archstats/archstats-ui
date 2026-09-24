package store

import "testing"

func TestReportsKeepTheirOrderAndBody(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	ws, _ := st.CreateWorkspace("w", t.TempDir())
	a := &Report{ID: "a", WorkspaceID: ws.ID, Title: "Audit", Body: `{"blocks":[]}`}
	b := &Report{ID: "b", WorkspaceID: ws.ID, Title: "Summary", Body: `{}`}
	for _, r := range []*Report{a, b} {
		if err := st.UpsertReport(r); err != nil {
			t.Fatal(err)
		}
	}
	a.Body = `{"blocks":[{"id":"x"}]}`
	if err := st.UpsertReport(a); err != nil {
		t.Fatal(err)
	}
	if err := st.ReorderReports(ws.ID, []string{"b", "a"}); err != nil {
		t.Fatal(err)
	}
	got, _ := st.Reports(ws.ID)
	if len(got) != 2 || got[0].ID != "b" || got[1].Body != `{"blocks":[{"id":"x"}]}` {
		t.Fatalf("%+v", got)
	}
	st.DeleteReport("b")
	if got, _ := st.Reports(ws.ID); len(got) != 1 {
		t.Fatal("deleted report still listed")
	}
}
