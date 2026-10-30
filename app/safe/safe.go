// Package safe keeps a panic from taking more down than the work it hit.
//
// A panic in a method the window calls never reaches the window: Wails
// recovers it and answers with nothing, which the window cannot read, so the
// call's promise never settles and the view spins for ever. A panic in a
// goroutine of our own ends the whole app. Guard and Recover turn both into an
// error that is logged with its stack and, for a call, returned to the window.
package safe

import (
	"fmt"
	"runtime/debug"

	"github.com/rs/zerolog/log"
)

// Guard ends a call from the window that panicked. Defer it first in the
// method; err is the method's error result, or nil when it has none, in which
// case the window gets the zero value.
func Guard(call string, err *error) {
	if r := recover(); r != nil {
		log.Error().Str("call", call).Str("stack", string(debug.Stack())).Msgf("panic: %v", r)
		if err != nil {
			*err = fmt.Errorf("%s failed unexpectedly: %v", call, r)
		}
	}
}

// Recover ends a goroutine that panicked, logging it instead of exiting.
// Defer it first in the goroutine; onPanic, when given, hears the message.
func Recover(task string, onPanic func(msg string)) {
	if r := recover(); r != nil {
		msg := fmt.Sprintf("%s failed unexpectedly: %v", task, r)
		log.Error().Str("task", task).Str("stack", string(debug.Stack())).Msg(msg)
		if onPanic != nil {
			onPanic(msg)
		}
	}
}

// Go runs fn in a goroutine that cannot end the app.
func Go(task string, fn func()) {
	go func() {
		defer Recover(task, nil)
		fn()
	}()
}
