package store

import "testing"

func TestNotesRoundTrip(t *testing.T) {
	s := openTestStore(t)
	ws, err := s.CreateWorkspace("shop", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	n := &Note{ID: "n1", WorkspaceID: ws.ID, SubjectKind: "component", Subject: "com.acme.pay", Text: "Payments are called only through PaymentGateway.", Author: "model"}
	if err := s.SaveNote(n); err != nil {
		t.Fatal(err)
	}
	n.Text = "Payments are called only through PaymentGateway; Stripe is the only implementation."
	if err := s.SaveNote(n); err != nil {
		t.Fatal(err)
	}
	notes, err := s.Notes(ws.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 1 || notes[0].Text != n.Text || notes[0].Author != "model" || notes[0].Subject != "com.acme.pay" {
		t.Fatalf("got %+v", notes)
	}
	if err := s.DeleteWorkspace(ws.ID); err != nil {
		t.Fatal(err)
	}
	if notes, _ := s.Notes(ws.ID); len(notes) != 0 {
		t.Fatalf("notes outlived their workspace: %+v", notes)
	}
}
