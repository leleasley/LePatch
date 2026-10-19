# UI design system

The active web UI lives in `ui/src/` and is embedded into the Go application
from `internal/web/dist`. It is a Vite and React single page app.

## Layout

```
ui/src/
  main.jsx            entry point, mounts the app and the toast provider
  App.jsx             routing, session state, data loading and live events
  components/         shell, command palette, dialogs, markdown, shared widgets
  pages/              one module per screen
  lib/                API access, formatting, storage, theme and toasts
  styles/             design tokens, base, shell, components, pages, content
```

`ui/src/styles/tokens.css` holds the colour, type, radius and motion tokens.
The four appearances are `dark`, `midnight`, `oled` and `light`; each one only
overrides tokens, never component rules.

The look follows the LeLibrary house style: deep neutral surfaces, a single
warm accent, Space Grotesk for interface text, DM Mono for labels and figures,
and a faint film grain over the whole page. `ui/src/styles/base.css` owns the
reset, the grain and the shared text helpers.

## Conventions

- Use the existing CSS variables for page, panel, border, text, muted text and
  accent colours. Never hard code a colour in a component rule.
- Buttons are `.btn` with `.btn-primary`, `.btn-ghost` or `.btn-danger`. Forms
  use `.field` with `.input`, `.select` or `.textarea`. Cards are `.card` with
  `.card-head` and `.card-body`.
- Keep buttons and form controls keyboard accessible, preserve visible focus,
  and use the existing Lucide icon set. Check phone layouts around 360–430px as
  well as desktop layouts. Avoid adding another UI framework or component
  dependency without a clear need.
- `npm run build` runs `scripts/check-imports.mjs` first. It fails the build
  when a JSX component is used without being imported or declared, which is the
  failure mode that otherwise only appears when a route is opened.

## Screens

Repository detail uses the same `RepositoryPage` workspace for watched, own and
sponsored repositories. Keep its Overview, Releases, Files, Commits, Pull
requests, Issues, Branches and Actions tabs consistent. Only an owned
repository view exposes file commits; server-side ownership and GitHub push
permission checks remain mandatory.

Issues and notification history stay inside the app: a raised issue opens
`/issues/{owner}/{repo}/{number}` and a delivery row opens the release page.
GitHub remains a secondary link on both.

Dialogs render through a portal on `document.body`. Any ancestor with a
transform becomes the containing block for `position: fixed`, which would pin a
dialog to the page instead of the screen, so never move a dialog back inside a
page. Text fields must stay at 16px on a phone or iOS zooms the page when one
is focused.

The administrator console is a tabbed panel in `pages/Admin.jsx`: Overview,
Workspace, Integrations, Users, Delivery queues, Backups and Audit log. Every
figure it shows comes from the Go API. The Workspace tab edits the settings
that the service enforces when repositories are watched and when the release
feed is assembled.

## Appearance

The appearance is stored on the user record and pushed to `/api/account`
whenever it changes, so it follows the account between devices. The local
value is applied immediately so there is no flash while the request is in
flight.
