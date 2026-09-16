package main

import (
	"context"
	"embed"
	"log"

	"github.com/archstats/archstats-ui/app"
	"github.com/archstats/archstats-ui/app/query"
	"github.com/archstats/archstats-ui/app/scan"
	"github.com/archstats/archstats-ui/app/store"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

// version is stamped by the release workflow via
// -ldflags "-X main.version=vX.Y.Z"; local builds report "dev".
var version = "dev"

func main() {
	log.Printf("archstats-desktop %s", version)
	root, err := store.DefaultRoot()
	if err != nil {
		log.Fatalf("resolving app data dir: %v", err)
	}
	st, err := store.Open(root)
	if err != nil {
		log.Fatalf("opening registry at %s: %v", root, err)
	}
	defer st.Close()

	scanSvc := scan.NewService(st)
	querySvc := query.NewService(st)
	defer querySvc.Close()

	err = wails.Run(&options.App{
		Title:  "Archstats Desktop",
		Width:  1100,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: func(ctx context.Context) {
			scanSvc.SetEmitter(func(event string, data ...any) {
				runtime.EventsEmit(ctx, event, data...)
			})
		},
		Bind: []interface{}{
			app.NewWorkspaceService(st),
			app.NewScanService(scanSvc),
			app.NewQueryService(querySvc),
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
