package app

// AppService answers questions about the running build.
type AppService struct {
	version string
}

func NewAppService(version string) *AppService {
	return &AppService{version: version}
}

// Version is the release this build was stamped with ("dev" locally). It
// goes on every export, next to the analysis revision that read the code.
func (a *AppService) Version() string {
	return a.version
}
