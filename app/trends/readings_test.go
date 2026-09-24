package trends

import "testing"

func TestLevels(t *testing.T) {
	// a -> b -> c, with b <-> d a tangle: a, {b,d}, c is three levels.
	if got := Levels([][2]string{{"a", "b"}, {"b", "c"}, {"b", "d"}, {"d", "b"}}); got != 3 {
		t.Errorf("levels = %d", got)
	}
	if got := Levels([][2]string{{"x", "y"}, {"y", "x"}}); got != 1 {
		t.Errorf("one tangle is one level, got %d", got)
	}
}

func TestMedian(t *testing.T) {
	if m := Median([]float64{3, 1, 2, 4}); m == nil || *m != 2 {
		t.Errorf("median = %v", m)
	}
	if Median(nil) != nil {
		t.Error("no values, no median")
	}
}
