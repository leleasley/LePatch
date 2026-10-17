# LePatch design direction

This proposal keeps LePatch quiet enough to leave open all day and gives release
changes a clear visual signal. A fresh citrus green marks the product and its
primary actions; release severity uses status colors only. Repository names,
release tags, and hashes use a compact mono face. Surfaces stay close in value,
with thin borders and small shadows to show which layer is active.

## Palette and contrast

| Role | Light | Dark |
|---|---|---|
| Canvas | `#F5F7F2` | `#111712` |
| Surface | `#FFFFFF` | `#172019` |
| Panel | `#FFFFFF` | `#1D2820` |
| Raised surface | `#EDF1E9` | `#26332A` |
| Border | `#D9E0D5` | `#344138` |
| Divider | `#E7ECE3` | `#2A352D` |
| Main text | `#19211A` | `#EBF0E7` |
| Muted text | `#536150` | `#B0BCAD` |
| Faint text | `#6B786A` | `#839083` |
| Accent | `#315D20` | `#B5EA73` |
| Accent foreground | `#FFFFFF` | `#24321C` |
| Success | `#226737` | `#8ED5A0` |
| Warning | `#895A0B` | `#EDC37B` |
| Danger | `#A42F2A` | `#FF9288` |

Measured WCAG contrast ratios for normal text: main text on canvas **15.28:1**
light and **14.44:1** dark; muted text on canvas **6.10:1** light and above
**8:1** dark; faint text on its least favorable listed surface **4.65:1** light
and **4.56:1** dark; accent text on its canvas **7.73:1** light and **11.92:1**
dark. White text on the light accent is **7.73:1**; dark accent foreground on
the dark accent is **9.68:1**. All exceed WCAG AA's 4.5:1 normal-text target.
Status foregrounds also exceed 4.5:1 against their page canvases.

## Type and tokens

- UI face: Inter, falling back to the native system sans stack. Inter is already
  loaded by the application; no dependency is needed.
- Data face: platform monospace (`ui-monospace`, SF Mono, Menlo, Consolas).
- Type scale: 11, 12, 13, 14, 16, 20, 26, 32px. Phone page titles use 25px;
  desktop titles use 30–32px. Body copy is 14px desktop and 13–14px phone.
- Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px.
- Radius: 6px controls, 10px compact panels, 16px primary panels, 999px status
  badges. Keep card groups joined by dividers rather than stacking identical
  cards.
- Elevation: a thin border at rest; a soft 12px/32px shadow only for floating
  menus and focused desktop surfaces. Phone lists rely on surface contrast and
  spacing.
- Motion: 180–220ms for color, expansion, and sheet changes; disable movement
  for `prefers-reduced-motion`.

## Navigation and page structure

At phone widths, a compact sticky brand bar sits above content and a five-item
bottom bar sits within the safe area: **Feed, Watchlist, Search, Alerts, Profile**.
The selected item has a green label and a subtle inset surface. Detail pages keep
the bottom bar so navigation stays reachable. Primary actions sit in the
content header or a sticky bottom action strip when a task has a clear commit
action. Edit and overflow actions open bottom sheets. Tap targets are at least
44px.

At 1024px and above, the bottom bar gives way to a 232px fixed sidebar grouped
into Monitor, Discover, and Account. A slim top bar holds breadcrumbs, live
status, search, and the command-palette shortcut. Content uses a readable
1120px maximum width.

The feed opens with a short title, three inline watch-health facts, then a
date-grouped stream of release cards. On phones each release card leads with the
repository and mono version, gives the release title and two-line summary, and
puts acknowledge and overflow actions inside the card. On desktop those facts
align in a denser stream with the health rail alongside.

Watched apps use rich, single-column phone cards. Each card keeps repository,
status, current tag, and the common Check, Mute, and Releases actions together.
On desktop the same fields become a dense four-column list with status and
row-actions aligned. Filters move into a horizontally scrollable 44px chip
strip; search and Add stay directly above results.

Release detail starts with a back affordance, mono tag, release name, and
acknowledge action. On phones, version context and notification state precede
the full notes, which remain in a single readable column. Desktop places the
notes beside a narrow version-context rail. Tables and code blocks scroll within
their own bounds without widening the page.

## Live and offline behavior

Every mutation updates its affected row immediately, then revalidates SWR data;
failed requests restore the previous value and announce the failure. A small
“Updated just now” label ages into a relative timestamp. A small in-place sync
indicator appears during revalidation. Offline state uses a persistent banner
and keeps the last server snapshot visible. Returning from background or
reconnecting triggers revalidation.

## Phase 1.5 proposal: server-pushed updates

Use Redis pub/sub already present in the stack. After a worker commits a release
or finishes a check, publish a small `{ userId, type, appId, releaseId, at }`
message on a LePatch event channel. An authenticated Node route handler opens an
SSE stream, subscribes to Redis, filters messages to that session's user, sends
named events and a heartbeat, and closes the subscription when the request is
aborted. A browser `EventSource` listener invalidates the dashboard and watched
app SWR keys for the affected account. It never carries release-note bodies or
secrets. Browser reconnect plus the normal focus/reconnect polling recovers
missed events; Redis pub/sub itself is not a durable event log. Use the existing
`ioredis` dependency and no new package. Add connection limits and a short
reconnect/backoff policy before shipping this phase.

## Clickable preview

Open [`preview/design-direction.html`](../preview/design-direction.html) from a
local static server. Its Feed, Watched apps, and Release detail views, light/dark
switch, responsive phone navigation, and demo workspace are static fixtures; no
database or account data is used.

The preview was captured at 390×844 and 1440×1000. Each screenshot shows the
full page and can be opened at original size:

| View | Phone (dark / light) | Desktop (dark / light) |
|---|---|---|
| Feed | [dark](../preview/screenshots/feed-390-dark.png) / [light](../preview/screenshots/feed-390-light.png) | [dark](../preview/screenshots/feed-1440-dark.png) / [light](../preview/screenshots/feed-1440-light.png) |
| Watched apps | [dark](../preview/screenshots/apps-390-dark.png) / [light](../preview/screenshots/apps-390-light.png) | [dark](../preview/screenshots/apps-1440-dark.png) / [light](../preview/screenshots/apps-1440-light.png) |
| Release detail | [dark](../preview/screenshots/release-390-dark.png) / [light](../preview/screenshots/release-390-light.png) | [dark](../preview/screenshots/release-1440-dark.png) / [light](../preview/screenshots/release-1440-light.png) |
