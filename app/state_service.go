package app

import "github.com/archstats/archstats-ui/app/store"

// StateService is the Wails-bound home for state that must outlive the
// webview: per-workspace keys (lenses, merges, facets, arrangements) and
// global settings. Values are JSON strings the frontend owns.
type StateService struct {
	store *store.Store
}

func NewStateService(s *store.Store) *StateService {
	return &StateService{store: s}
}

// Workspace returns every stored key for a workspace.
func (s *StateService) Workspace(workspaceID string) (map[string]string, error) {
	return s.store.GetState(workspaceID)
}

// Put writes one workspace key; an empty value deletes it.
func (s *StateService) Put(workspaceID, key, value string) error {
	return s.store.PutState(workspaceID, key, value)
}

// PutMany writes several keys at once, for a debounced flush.
func (s *StateService) PutMany(workspaceID string, values map[string]string) error {
	for k, v := range values {
		if err := s.store.PutState(workspaceID, k, v); err != nil {
			return err
		}
	}
	return nil
}

// Settings returns every global setting.
func (s *StateService) Settings() (map[string]string, error) {
	return s.store.GetSettings()
}

// PutSetting writes a global setting; an empty value deletes it.
func (s *StateService) PutSetting(key, value string) error {
	return s.store.PutSetting(key, value)
}
