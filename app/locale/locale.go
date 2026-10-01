// Package locale holds the app's language for the few strings the Go side
// shows on its own: native dialog titles and provider checks. Everything
// else a person reads comes from the frontend's messages. The frontend sets
// the language at startup (AppService.SetLocale).
package locale

import (
	"fmt"
	"sync/atomic"
)

var current atomic.Value

// Set records the app's language ("en", "nl").
func Set(lang string) { current.Store(lang) }

// T is the message for key in the app's language, English when it has none,
// with args filled in as by fmt.Sprintf.
func T(key string, args ...any) string {
	lang, _ := current.Load().(string)
	msg, ok := messages[lang][key]
	if !ok {
		msg = messages["en"][key]
	}
	if len(args) > 0 {
		return fmt.Sprintf(msg, args...)
	}
	return msg
}

var messages = map[string]map[string]string{
	"en": {
		"chooseFolder":     "Choose a folder to analyze",
		"saveSnapshotCopy": "Save a copy of the snapshot",
		"snapshotFilter":   "Archstats snapshot",
		"cloneWhere":       "Choose where to clone %s",
		"noSuchProvider":   "No such provider",
		"notAllowed":       "Not allowed by policy",
		"noChatModels":     "It answers, but offers no chat models",
	},
	"nl": {
		"chooseFolder":     "Kies een map om te analyseren",
		"saveSnapshotCopy": "Een kopie van het snapshot bewaren",
		"snapshotFilter":   "Archstats-snapshot",
		"cloneWhere":       "Kies waar je %s wilt clonen",
		"noSuchProvider":   "Deze provider bestaat niet",
		"notAllowed":       "Niet toegestaan door het beleid",
		"noChatModels":     "Hij antwoordt, maar biedt geen chatmodellen",
	},
}
