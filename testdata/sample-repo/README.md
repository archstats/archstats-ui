# sample-repo

The workspace `app/contract` scans with the app's own scan service to build
the snapshot fixture. It is small on purpose and polyglot on purpose: Java
with a package cycle and an HTTP endpoint, TypeScript, a Go service with a
Dockerfile, and a GitHub Actions workflow, so the component, connection,
tangle, entry point, git and CI/CD tables all appear. The test commits it
twice into a fresh git repository, so it has history.
