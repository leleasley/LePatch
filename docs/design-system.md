# Design System (in progress)

LePatch is moving toward a flatter, GitHub-inspired aesthetic. Prefer the
semantic tokens below over hardcoded Tailwind palette values.

## Tokens

- Surfaces: `bg-surface`, `bg-surface-elevated`, `bg-panel`
- Borders: `border-border`, `border-line`
- Text: `text-text`, `text-text-muted`, `text-text-faint`
- Accent: `bg-accent`, `text-accent`, `text-accent-foreground`
- Status: `text-status-success`, `text-status-failure`, `text-status-pending`

Dark/light defaults now use GitHub-style neutral grays and a blue accent
(`#58a6ff` dark, `#0969da` light).

## Primitives

- `src/components/ui/Button.tsx`
- `src/components/ui/Card.tsx`
- `src/components/ui/EmptyState.tsx`

Legacy cyan classes are mapped to the active accent via CSS variables so older
screens pick up the new palette without a full rewrite. New code should use the
`accent` tokens directly.