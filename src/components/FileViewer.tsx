"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { X, Copy, Check, Loader2, FileCode2, ExternalLink, FileText, ChevronRight } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ModalShell } from "@/components/ModalShell";

const EXTENSION_MAP: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
  rb: "Ruby", php: "PHP", swift: "Swift", dart: "Dart",
  c: "C", cpp: "C++", cs: "C#", h: "C Header", hpp: "C++ Header",
  css: "CSS", scss: "SCSS", less: "LESS",
  html: "HTML", htm: "HTML", xml: "XML",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML",
  md: "Markdown", mdx: "MDX", txt: "Text", csv: "CSV",
  sh: "Shell", bash: "Bash", zsh: "Zsh", fish: "Fish",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL",
  dockerfile: "Dockerfile", makefile: "Makefile",
  lua: "Lua", vim: "Vim", el: "Emacs Lisp",
  terraform: "Terraform", tf: "Terraform", hcl: "HCL",
  proto: "Protobuf",
};

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx"]);
const IGNORED_BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp",
  "mp3", "mp4", "wav", "avi", "mov", "mkv",
  "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "exe", "dll", "so", "dylib", "bin",
  "woff", "woff2", "ttf", "eot",
]);

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (filename.toLowerCase() === "dockerfile") return "Dockerfile";
  if (filename.toLowerCase() === "makefile") return "Makefile";
  if (filename.toLowerCase() === ".gitignore") return "Shell";
  return EXTENSION_MAP[ext] || ext.toUpperCase() || "Text";
}

function isMarkdown(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return MARKDOWN_EXTENSIONS.has(ext);
}

function isBinary(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return IGNORED_BINARY_EXTENSIONS.has(ext);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ className }: { className?: string }) {
  return <FileCode2 className={className} aria-hidden="true" />;
}

export function FileViewer({
  owner,
  repo,
  filePath,
  fileName,
  fileSize,
  htmlUrl,
  open,
  onClose,
}: {
  owner: string;
  repo: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  htmlUrl: string;
  open: boolean;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const doFetch = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/github/file-content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load file (${res.status})`);
      }
      const data = await res.json();
      startTransition(() => setContent(data.content));
    } catch (err) {
      startTransition(() => setError(err instanceof Error ? err.message : "Failed to load file"));
    } finally {
      startTransition(() => setLoading(false));
    }
  }, [owner, repo, filePath]);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError("");
    setContent(null);
    await doFetch();
  }, [doFetch]);

  useEffect(() => {
    if (open) {
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      doFetch();
    }
  }, [open, doFetch]);

  async function handleCopy() {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  const language = detectLanguage(fileName);
  const isMd = isMarkdown(fileName);
  const isBin = isBinary(fileName);
  const lines = content ? content.split("\n") : [];
  const lineCount = lines.length;
  const pathParts = filePath.split("/");

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      variant="fullscreen"
      panelClassName="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border lg:mx-auto lg:my-auto lg:h-[calc(100dvh-3rem)] lg:max-w-5xl"
    >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3 sm:px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
            <FileIcon className="h-4 w-4 text-text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm">
              {pathParts.map((part, i) => (
                <span key={`${part}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-text-faint" aria-hidden="true" />}
                  <span className={i === pathParts.length - 1 ? "font-medium text-text" : "text-text-muted"}>
                    {part}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
              <span className="inline-flex items-center rounded-sm bg-surface px-1.5 py-0.5 font-medium text-text">
                {language}
              </span>
              <span>{formatBytes(fileSize)}</span>
              {!loading && content && <span>{lineCount} lines</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on GitHub"
              className="btn btn--secondary btn--sm"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            {content && !isBin && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Copied to clipboard" : "Copy file contents"}
                className="btn btn--secondary btn--sm"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-status-success" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close file preview"
              className="icon-button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-panel">
          {loading && (
            <div
              role="status"
              aria-busy="true"
              className="flex flex-col items-center justify-center gap-3 py-20"
            >
              <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
              <p className="text-sm text-text-muted">Loading file</p>
            </div>
          )}

          {error && (
            <div role="alert" className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-danger/10">
                <FileText className="h-6 w-6 text-status-danger" aria-hidden="true" />
              </div>
              <p className="text-sm text-status-danger">{error}</p>
              <button type="button" onClick={loadContent} className="btn btn--secondary btn--sm">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && isBin && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-surface">
                <FileText className="h-8 w-8 text-text-muted" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">Binary file</p>
                <p className="mt-1 text-xs text-text-muted">This file type cannot be previewed</p>
              </div>
              <a
                href={htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--primary"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View on GitHub
              </a>
            </div>
          )}

          {!loading && !error && content !== null && !isBin && isMd && (
            <div className="p-4 sm:p-6">
              <MarkdownContent
                body={content}
                emptyMessage="This markdown file is empty."
                linkBaseUrl={`https://github.com/${owner}/${repo}/blob/HEAD`}
                imageBaseUrl={`https://raw.githubusercontent.com/${owner}/${repo}/HEAD`}
              />
            </div>
          )}

          {!loading && !error && content !== null && !isBin && !isMd && (
            <div className="flex font-mono text-[13px]">
              {/* Line numbers */}
              <div className="hidden w-12 shrink-0 select-none border-r border-border bg-surface py-4 text-right sm:block">
                {lines.map((_, i) => (
                  <div key={i} className="px-3 leading-6 text-text-faint">{i + 1}</div>
                ))}
              </div>
              {/* Code */}
              <div className="flex-1 overflow-x-auto">
                <pre className="py-4 pl-4 pr-6 sm:pl-4">
                  <code className="leading-6 text-text">
                    {lines.map((line, i) => (
                      <div key={i} className="flex">
                        <span className="mr-4 inline-block w-8 text-right text-text-faint sm:hidden">{i + 1}</span>
                        <span>{line}</span>
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          )}
        </div>
    </ModalShell>
  );
}
