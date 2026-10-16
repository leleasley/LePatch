import { Badge } from "@/components/ui/Card";

/**
 * GitHub issue/PR label.
 *
 * GitHub returns an arbitrary hex colour per label. The design system allows a
 * single decorative accent, so labels render as neutral badges and the colour
 * stays in the data rather than the UI.
 */
export function LabelBadge({ name }: { name: string; color?: string }) {
  return <Badge tone="neutral">{name}</Badge>;
}
