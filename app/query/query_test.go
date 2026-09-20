package query

import (
	"encoding/json"
	"math"
	"testing"
)

func TestJsonValueNeutralisesNonFiniteFloats(t *testing.T) {
	cases := map[string]any{
		"+inf":  math.Inf(1),
		"-inf":  math.Inf(-1),
		"nan":   math.NaN(),
		"f32":   float32(math.Inf(1)),
		"plain": 1.5,
		"bytes": []byte("x"),
	}
	want := map[string]any{"+inf": nil, "-inf": nil, "nan": nil, "f32": nil, "plain": 1.5, "bytes": "x"}
	for k, v := range cases {
		got := jsonValue(v)
		if got != want[k] {
			t.Errorf("%s: got %v, want %v", k, got, want[k])
		}
	}
	row := map[string]any{}
	for k, v := range cases {
		row[k] = jsonValue(v)
	}
	if _, err := json.Marshal(row); err != nil {
		t.Fatalf("row must encode: %v", err)
	}
}
