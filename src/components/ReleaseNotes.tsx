import { MarkdownContent } from "@/components/MarkdownContent";

export function ReleaseNotes({ body, className }: { body: string | null; className?: string }) {
  return (
    <MarkdownContent body={body} className={className} emptyMessage="No release notes available." />
  );
}
