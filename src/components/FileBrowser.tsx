"use client";

import { useState, useEffect, startTransition } from "react";
import { ChevronRight, FileCode2, FolderTree, ArrowLeft, Loader2, FileText } from "lucide-react";
import { FileViewer } from "@/components/FileViewer";
import { List, ListRow } from "@/components/ui/List";
import { cn } from "@/lib/cn";

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

/** One accent, neutral defaults — no decorative per-extension palette. */
function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ext === "md" ? "text-accent" : "text-text-faint";
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
      <nav
        aria-label="File path"
        className="flex flex-wrap items-center gap-1 border-b border-divider px-4 py-2.5 text-xs"
      >
        <button
          type="button"
          onClick={() => navigateTo(-1)}
          className={cn(
            "mono font-medium transition-colors",
            currentPath === "" ? "text-text" : "text-accent hover:text-accent-hover"
          )}
        >
          {repo}
        </button>
        {breadcrumbs.map((segment, i) => (
          <span key={`${segment}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-text-faint" aria-hidden="true" />
            <button
              type="button"
              onClick={() => navigateTo(i)}
              aria-current={i === breadcrumbs.length - 1 ? "location" : undefined}
              className={cn(
                "mono font-medium transition-colors",
                i === breadcrumbs.length - 1 ? "text-text" : "text-accent hover:text-accent-hover"
              )}
            >
              {segment}
            </button>
          </span>
        ))}
      </nav>

      <List>
        {currentPath && (
          <ListRow
            onClick={() => navigateTo(breadcrumbs.length - 2)}
            leading={<ArrowLeft className="h-4 w-4 text-text-faint" aria-hidden="true" />}
            title={<span className="text-sm text-text">Parent directory</span>}
          />
        )}

        {loading && (
          <li
            role="status"
            aria-busy="true"
            className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-text-muted"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading directory
          </li>
        )}

        {error && (
          <li role="alert" className="px-4 py-4 text-sm text-status-danger">
            {error}
          </li>
        )}

        {!loading && !error && sortedFiles.map((file) =>
          file.type === "dir" ? (
            <ListRow
              key={file.path}
              onClick={() => openDir(file.path)}
              leading={<FolderTree className="h-4 w-4 text-accent" aria-hidden="true" />}
              title={<span className="truncate font-medium text-text">{file.name}</span>}
              trailing={<span className="text-xs text-text-faint">Browse</span>}
            />
          ) : (
            <ListRow
              key={file.path}
              onClick={() => setViewingFile(file)}
              leading={
                file.name.toLowerCase().endsWith(".md") ? (
                  <FileText className={cn("h-4 w-4", fileIcon(file.name))} aria-hidden="true" />
                ) : (
                  <FileCode2 className={cn("h-4 w-4", fileIcon(file.name))} aria-hidden="true" />
                )
              }
              title={<span className="truncate font-medium text-text">{file.name}</span>}
              trailing={<span className="mono shrink-0 text-xs text-text-faint">{formatBytes(file.size)}</span>}
            />
          )
        )}

        {!loading && !error && sortedFiles.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-text-faint">This directory is empty.</li>
        )}
      </List>

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
