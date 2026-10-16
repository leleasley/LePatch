# Design system

LePatch aims for the restraint of a tool you leave open all day: dense but
calm, one accent, no decoration. If a visual flourish does not help someone read
release data faster, it does not ship.

## Tokens

All colour, radius, type and elevation values live in `src/app/globals.css`.
Never hardcode a palette class (`text-slate-400`, `bg-cyan-500`) in a component —
that is what previously made the light theme fail WCAG AA contrast.

| Purpose | Tailwind class |
| --- | --- |
| Canvas (page background) | `bg-canvas` |
| Card / panel | `bg-panel` |
| Inset surface | `bg-surface` |
| Raised surface (menus) | `bg-surface-elevated` |
| Border | `border-border` |
| Strong border | `border-border-strong` |
| Hairline divider | `border-divider` |
| Body text | `text-text` |
| Secondary text | `text-text-muted` |
| Tertiary text / metadata | `text-text-faint` |
| Accent | `text-accent` / `bg-accent` / `border-accent` |
| Accent on accent | `text-accent-foreground` |
| Success | `text-status-success` / `bg-status-success/10` |
| Warning | `text-status-warning` / `bg-status-warning/10` |
| Danger | `text-status-danger` / `bg-status-danger/10` |

Radii come from `--radius-sm|md|lg|xl`; elevation from `--shadow-xs|sm|md|lg`.
Do not invent new values — extend the token set in `globals.css` instead.

### Rules

1. **One accent.** Blue is the only decorative colour. Everything else is
   neutral or a semantic status colour.
2. **Status colours carry meaning.** Green = healthy/sent, amber = pending/
   pre-release, red = failure. Never use them decoratively.
3. **No gradients, glows, glass or blur.** Flat surfaces, hairline borders,
   subtle elevation.
4. **No emoji in the UI.** Icons come from `lucide-react` at a single stroke
   weight.
5. **Both themes are designed.** Check any change in light and dark before
   opening a PR.

## Components

`src/components/ui` is the only place shared primitives live:

| File | Exports |
| --- | --- |
| `Card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardBody`, `Badge`, `EmptyState`, `ErrorState`, `PermissionDenied`, `Skeleton`, `SkeletonRows` |
| `Input.tsx` | `Input`, `Textarea`, `Select`, `Field`, `Switch` |
| `Tabs.tsx` | `Tabs`, `TabPanel`, `Breadcrumbs`, `CommandPalette`, `useCommandPaletteKey` |
| `Button.tsx` | `Button` (prefer the `.btn` classes in existing screens) |

Prefer these over ad-hoc markup. Legacy class-based components (`.btn`, `.chip`,
`.app-tab`, `.status-pill`, `.empty-state`) are still supported and map to the
same tokens.

## Accessibility requirements

- Every interactive element is reachable and operable by keyboard.
- Every icon-only button has an `aria-label` or visually hidden text.
- Every form control has a programmatically associated `<label>`; placeholders
  are not labels.
- Modals use `ModalShell`: it provides `role="dialog"`, a focus trap, initial
  focus and focus restore.
- Async status changes announce themselves (`aria-live` for toasts, `role="alert"`
  for errors).
- Decorative icons get `aria-hidden="true"`.
- Animations must respect `prefers-reduced-motion` (handled globally in
  `globals.css`).

## Copy

Short, specific, no filler. Say what happened and what the user can do:
"Check failed" beats "Something went wrong". Never use marketing language in the
product.
