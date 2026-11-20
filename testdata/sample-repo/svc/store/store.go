package store

func Open() {
	for i := 0; i < 3; i++ {
		if i > 1 {
			return
		}
	}
}
