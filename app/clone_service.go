package app

import (
	"context"
	"errors"
	"github.com/archstats/archstats-ui/app/locale"
	"github.com/archstats/archstats-ui/app/safe"
	"path/filepath"

	"github.com/archstats/archstats-ui/app/clone"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// CloneService is the Wails-bound facade over clone.Service: a workspace
// made from a repository address.
type CloneService struct {
	svc *clone.Service
	ctx func() context.Context
}

func NewCloneService(svc *clone.Service, ctx func() context.Context) *CloneService {
	return &CloneService{svc: svc, ctx: ctx}
}

// Plan reads an address and says where it would be cloned and what is in the way.
func (c *CloneService) Plan(input, dest string) *clone.Plan {
	defer safe.Guard("CloneService.Plan", nil)
	return c.svc.Plan(input, dest)
}

func (c *CloneService) Start(req clone.Request) (_ *clone.Job, callErr error) {
	defer safe.Guard("CloneService.Start", &callErr)
	return c.svc.Start(req)
}

func (c *CloneService) Cancel(id string) {
	defer safe.Guard("CloneService.Cancel", nil)
	c.svc.Cancel(id)
}

func (c *CloneService) Jobs() []clone.Job {
	defer safe.Guard("CloneService.Jobs", nil)
	return c.svc.Jobs()
}

func (c *CloneService) Forget(id string) {
	defer safe.Guard("CloneService.Forget", nil)
	c.svc.Forget(id)
}

// ChooseParent asks for the folder to clone into; the repository gets its
// own folder inside it. Empty when the user cancelled.
func (c *CloneService) ChooseParent(name string) (_ string, callErr error) {
	defer safe.Guard("CloneService.ChooseParent", &callErr)

	ctx := c.ctx()
	if ctx == nil {
		return "", errors.New("folder picker unavailable before startup")
	}
	dir, err := runtime.OpenDirectoryDialog(ctx, runtime.OpenDialogOptions{
		Title:                locale.T("cloneWhere", name),
		CanCreateDirectories: true,
	})
	if err != nil || dir == "" {
		return "", err
	}
	return filepath.Join(dir, clone.SafeSegment(name)), nil
}
