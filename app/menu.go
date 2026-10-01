package app

import (
	"context"
	goruntime "runtime"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// MenuService owns the macOS application menu. Without one, a release build
// has no Edit menu, so copy, paste, select-all and quit do nothing: the
// standard App, Edit and Window roles restore them. Custom items emit a
// "menu" event with their id and the frontend acts on it; Windows and Linux
// get the same commands from keyboard handlers instead of a menu bar.
type MenuService struct {
	ctx func() context.Context

	mu      sync.Mutex
	menu    *menu.Menu
	items   map[string]*menu.MenuItem
	enabled map[string]bool
}

func NewMenuService(ctx func() context.Context) *MenuService {
	return &MenuService{ctx: ctx, items: map[string]*menu.MenuItem{}, enabled: map[string]bool{}}
}

// ApplicationMenu returns the menu to install, or nil where the platform has
// none. A function rather than a method, so Wails does not bind it.
func ApplicationMenu(m *MenuService) *menu.Menu {
	if goruntime.GOOS != "darwin" {
		return nil
	}
	root := menu.NewMenu()
	root.Append(menu.AppMenu())

	file := m.submenu(root, "menu:file", "File")
	m.add(file, "workspace:new", "Add Folder…", keys.CmdOrCtrl("n"))
	m.add(file, "workspace:clone", "Clone Repository…", keys.Combo("n", keys.CmdOrCtrlKey, keys.ShiftKey))
	file.AddSeparator()
	m.add(file, "scan:again", "Scan Again", keys.CmdOrCtrl("r"))
	file.AddSeparator()
	m.add(file, "snapshot:reveal", "Reveal Snapshot in Finder", keys.Combo("r", keys.CmdOrCtrlKey, keys.OptionOrAltKey))
	m.add(file, "snapshot:save", "Save a Copy of Snapshot…", nil)
	m.add(file, "snapshot:import", "Import Snapshot…", keys.CmdOrCtrl("o"))
	file.AddSeparator()
	m.add(file, "export", "Export…", keys.CmdOrCtrl("e"))
	file.AddSeparator()
	m.add(file, "settings:open", "Settings…", keys.CmdOrCtrl(","))

	root.Append(menu.EditMenu())

	view := m.submenu(root, "menu:view", "View")
	m.add(view, "goto", "Go to Anything…", keys.CmdOrCtrl("p"))
	view.AddSeparator()
	m.add(view, "nav:back", "Back", keys.CmdOrCtrl("["))
	m.add(view, "nav:forward", "Forward", keys.CmdOrCtrl("]"))

	root.Append(menu.WindowMenu())

	help := m.submenu(root, "menu:help", "Help")
	m.add(help, "help:shortcuts", "Keyboard Shortcuts", nil)
	m.add(help, "help:metrics", "Metric Reference", nil)

	m.menu = root
	return root
}

// submenu adds a submenu whose title the frontend can relabel, like an item.
func (m *MenuService) submenu(root *menu.Menu, id, label string) *menu.Menu {
	sub := root.AddSubmenu(label)
	m.items[id] = root.Items[len(root.Items)-1]
	return sub
}

func (m *MenuService) add(parent *menu.Menu, id, label string, accel *keys.Accelerator) {
	item := parent.AddText(label, accel, func(_ *menu.CallbackData) {
		if ctx := m.ctx(); ctx != nil {
			runtime.EventsEmit(ctx, "menu", id)
		}
	})
	m.items[id] = item
}

// MenuState is what the frontend knows that decides which items apply.
type MenuState struct {
	HasWorkspace bool `json:"hasWorkspace"`
	HasSnapshot  bool `json:"hasSnapshot"`
	Scanning     bool `json:"scanning"`
	CanExport    bool `json:"canExport"`
	// Labels names the custom items and submenus in the app's language, by id.
	Labels map[string]string `json:"labels,omitempty"`
}

// SetState enables and disables items to match the app: no Scan Again
// without a workspace or while one runs, no Reveal without a snapshot.
func (m *MenuService) SetState(state MenuState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.menu == nil {
		return
	}
	want := map[string]bool{
		"scan:again":      state.HasWorkspace && !state.Scanning,
		"snapshot:reveal": state.HasSnapshot,
		"snapshot:save":   state.HasSnapshot,
		"export":          state.CanExport,
		"goto":            state.HasSnapshot,
	}
	changed := false
	for id, label := range state.Labels {
		if item, ok := m.items[id]; ok && label != "" && item.Label != label {
			item.Label = label
			changed = true
		}
	}
	for id, on := range want {
		if item, ok := m.items[id]; ok && item.Disabled == on {
			item.Disabled = !on
			changed = true
		}
	}
	if changed {
		if ctx := m.ctx(); ctx != nil {
			runtime.MenuUpdateApplicationMenu(ctx)
		}
	}
}
