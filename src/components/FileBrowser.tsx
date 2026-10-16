"use client";

import { useState, useEffect, startTransition } from "react";
import { ChevronRight, FileCode2, FolderTree, ArrowLeft, Loader2, FileText } from "lucide-react";
import { FileViewer } from "@/components/FileViewer";

type FileEntry = {
  name: string;
  path: string;
  type: string;
  size: number;
  html_url: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    md: "text-accent",
    json: "text-status-warning",
    yml: "text-purple-300",
    yaml: "text-purple-300",
    toml: "text-purple-300",
    ts: "text-blue-300",
    tsx: "text-blue-300",
    js: "text-yellow-300",
    jsx: "text-yellow-300",
    py: "text-status-success",
    go: "text-accent",
    rs: "text-orange-300",
    sh: "text-text",
    txt: "text-text-muted",
  };
  return map[ext] || "text-[var(--color-text-muted)]";
}

export function FileBrowser({
  owner,
  repo,
  initialFiles,
}: {
  owner: string;
  repo: string;
  defaultBranch: string;
  initialFiles: FileEntry[];
}) {
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState<FileEntry[]>(initialFiles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewingFile, setViewingFile] = useState<FileEntry | null>(null);

  const breadcrumbs = currentPath ? currentPath.split("/") : [];

  useEffect(() => {
    if (currentPath === "") {
      startTransition(() => setFiles(initialFiles));
      return;
    }

    let cancelled = false;
    startTransition(() => { setLoading(true); setError(""); });

    fetch(`/api/github/contents?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(currentPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load directory");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          startTransition(() => { setFiles(data.files || []); setLoading(false); });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          startTransition(() => { setError(err.message); setLoading(false); });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentPath, owner, repo, initialFiles]);

  function navigateTo(index: number) {
    if (index < 0) setCurrentPath("");
    else setCurrentPath(breadcrumbs.slice(0, index + 1).join("/"));
  }

  function openDir(path: string) {
    setCurrentPath(path);
  }

  const sortedFiles = [...files].sort((a, b) => {
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--theme-divider)] px-4 py-2.5 text-[0.82rem]">
        <button
          onClick={() => navigateTo(-1)}
          className={`app-mono font-medium transition-colors ${
            currentPath === "" ? "text-[var(--color-text)]" : "text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
          }`}
        >
          {repo}
        </button>
        {breadcrumbs.map((segment, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-[var(--color-text-faint)]" />
            <button
              onClick={() => navigateTo(i)}
              className={`app-mono font-medium transition-colors ${
                i === breadcrumbs.length - 1 ? "text-[var(--color-text)]" : "text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
              }`}
            >
              {segment}
            </button>
          </span>
        ))}
      </div>

      <div className="divide-y divide-[var(--theme-divider)]">
        {currentPath && (
          <button
            onClick={() => navigateTo(breadcrumbs.length - 2)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>..</span>
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 spin" />
            Loading...
          </div>
        )}

        {error && (
          <div className="px-4 py-4 text-sm text-[var(--color-status-danger)]">{error}</div>
        )}

        {!loading && !error && sortedFiles.map((file) =>
          file.type === "dir" ? (
            <button
              key={file.path}
              onClick={() => openDir(file.path)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <FolderTree className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                  <span className="truncate font-medium text-[var(--color-text)]">{file.name}</span>
                </div>
              </div>
              <span className="text-[0.72rem] text-[var(--color-text-faint)]">Browse →</span>
            </button>
          ) : (
            <button
              key={file.path}
              onClick={() => setViewingFile(file)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  {file.name.toLowerCase().endsWith(".md") ? (
                    <FileText className={`h-4 w-4 shrink-0 ${fileIcon(file.name)}`} />
                  ) : (
                    <FileCode2 className={`h-4 w-4 shrink-0 ${fileIcon(file.name)}`} />
                  )}
                  <span className="truncate font-medium text-[var(--color-text)]">{file.name}</span>
                </div>
              </div>
              <span className="app-mono shrink-0 text-[0.7rem] text-[var(--color-text-faint)]">{formatBytes(file.size)}</span>
            </button>
          )
        )}

        {!loading && !error && sortedFiles.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--color-text-faint)]">This directory is empty.</div>
        )}
      </div>

      {viewingFile && (
        <FileViewer
          owner={owner}
          repo={repo}
          filePath={viewingFile.path}
          fileName={viewingFile.name}
          fileSize={viewingFile.size}
          htmlUrl={viewingFile.html_url}
          open={!!viewingFile}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  );
}
