package app

import (
	"context"
	"errors"
	"github.com/archstats/archstats-ui/app/locale"
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
func (c *CloneService) Plan(input, dest string) *clone.Plan { return c.svc.Plan(input, dest) }

func (c *CloneService) Start(req clone.Request) (*clone.Job, error) { return c.svc.Start(req) }

func (c *CloneService) Cancel(id string) { c.svc.Cancel(id) }

func (c *CloneService) Jobs() []clone.Job { return c.svc.Jobs() }

func (c *CloneService) Forget(id string) { c.svc.Forget(id) }

// ChooseParent asks for the folder to clone into; the repository gets its
// own folder inside it. Empty when the user cancelled.
func (c *CloneService) ChooseParent(name string) (string, error) {
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
