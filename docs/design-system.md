# UI design system

The active web UI lives in `ui/src/` and is embedded into the Go application
from `internal/web/dist`. Shared visual tokens are defined near the top of
`ui/src/style.css`; repository and README-specific styling lives in
`ui/src/readme.css` and `ui/src/add-repo.css`.

Use the existing CSS variables for page, panel, border, text, muted text, and
accent colours. Keep buttons and form controls keyboard-accessible, preserve
visible focus, and use the existing Lucide icon set. Check phone layouts around
360–430px as well as desktop layouts. Avoid adding another UI framework or
component dependency without a clear need.

Repository detail uses the same `RepositoryDetailView` workspace for watched,
own, and sponsored repositories. Keep its Overview, Releases, Files, Commits,
Pull requests, Issues, Branches, and Actions tabs consistent. Only an owned
repository view exposes file commits; server-side ownership and GitHub push
permission checks remain mandatory.
