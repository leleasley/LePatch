"use client";

import { useState, useEffect, useCallback } from "react";
import { logger } from "@/lib/logger";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Star,
  RefreshCw,
  Bookmark,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { ModalShell } from "@/components/ModalShell";

type CatalogueEntry = {
  id: string;
  name: string;
  repoFullName: string;
  description: string;
  category: string;
  packageNames: string[];
  homepageUrl: string | null;
  logoUrl: string | null;
  featured: boolean;
  featuredOrder: number | null;
  isActive: boolean;
  installCount: number;
  addCount: number;
  githubStars: number | null;
  latestReleaseTag: string | null;
  latestReleaseAt: string | null;
  githubStatsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type EntryFormData = {
  name: string;
  repoFullName: string;
  description: string;
  category: string;
  packageNames: string;
  homepageUrl: string;
  logoUrl: string;
  featured: boolean;
};

const emptyForm: EntryFormData = {
  name: "",
  repoFullName: "",
  description: "",
  category: "",
  packageNames: "",
  homepageUrl: "",
  logoUrl: "",
  featured: false,
};

export function CatalogueAdminClient({
  initialCategories,
}: {
  initialCategories: string[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogueEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEntry, setEditEntry] = useState<CatalogueEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<CatalogueEntry | null>(null);
  const [form, setForm] = useState<EntryFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const perPage = 50;

  const categories = initialCategories.length > 0
    ? initialCategories
    : [...new Set(entries.map((e) => e.category))];

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      if (activeFilter) params.set("active", activeFilter);
      const res = await fetch(`/api/admin/catalogue?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      logger.error("Failed to fetch catalogue entries", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, activeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries();
  }, [fetchEntries]);

  function openAddModal() {
    setForm(emptyForm);
    setError("");
    setShowAddModal(true);
  }

  function openEditModal(entry: CatalogueEntry) {
    setForm({
      name: entry.name,
      repoFullName: entry.repoFullName,
      description: entry.description,
      category: entry.category,
      packageNames: entry.packageNames.join(", "),
      homepageUrl: entry.homepageUrl || "",
      logoUrl: entry.logoUrl || "",
      featured: entry.featured,
    });
    setError("");
    setEditEntry(entry);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        packageNames: form.packageNames
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };

      if (editEntry) {
        const res = await csrfFetch(`/api/admin/catalogue/${editEntry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update");
        }
      } else {
        const res = await csrfFetch("/api/admin/catalogue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create");
        }
      }

      setShowAddModal(false);
      setEditEntry(null);
      router.refresh();
      fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteEntry) return;
    setSaving(true);
    try {
      const res = await csrfFetch(`/api/admin/catalogue/${deleteEntry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      setDeleteEntry(null);
      router.refresh();
      fetchEntries();
    } catch (err) {
      logger.error("Failed to delete entry", err);    } finally {
      setSaving(false);
    }
  }

  async function toggleFeatured(entry: CatalogueEntry) {
    try {
      const res = await csrfFetch(`/api/admin/catalogue/${entry.id}/feature`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !entry.featured }),
      });
      if (!res.ok) throw new Error("Failed to toggle featured");
      router.refresh();
      fetchEntries();
    } catch (err) {
      logger.error("Failed to toggle featured", err);    }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, repo, description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-line/50 bg-panel/80 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
          />
        </div>

        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-line/50 bg-panel/80 px-3 py-2 text-sm text-slate-300 outline-none focus:border-cyan-500/50"
        >
          <option value="">All status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        <button
          onClick={fetchEntries}
          className="flex items-center gap-2 rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
        >
          <Plus className="h-4 w-4" />
          Add Entry
        </button>

        <div className="text-sm text-slate-500">
          {total} entry{total !== 1 ? "ies" : "y"}
        </div>
      </div>

      {/* Category pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => { setCategoryFilter(""); setPage(1); }}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            !categoryFilter
              ? "bg-cyan-500/20 text-cyan-300"
              : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => { setCategoryFilter(cat); setPage(1); }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryFilter === cat
                ? "bg-cyan-500/20 text-cyan-300"
                : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-line/50 bg-panel/80">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
            Loading...
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Bookmark className="mb-3 h-12 w-12 text-slate-600" />
            <p className="text-lg font-medium text-slate-400">No entries found</p>
            <p className="mt-1 text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/50 text-left text-xs font-medium uppercase text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Repo</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-center">Featured</th>
                <th className="px-4 py-3 text-center">Active</th>
                <th className="px-4 py-3 text-right">Installs</th>
                <th className="px-4 py-3 text-right">Stars</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {entries.map((entry) => (
                <tr key={entry.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-white">{entry.name}</td>
                  <td className="px-4 py-3 text-slate-400">{entry.repoFullName}</td>
                  <td className="px-4 py-3 text-slate-400">{entry.category}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleFeatured(entry)}
                      className={`transition-colors ${
                        entry.featured ? "text-amber-400" : "text-slate-600 hover:text-slate-400"
                      }`}
                      title={entry.featured ? "Unfeature" : "Feature"}
                    >
                      <Star className={`h-4 w-4 ${entry.featured ? "fill-amber-400" : ""}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {entry.isActive ? (
                      <Check className="mx-auto h-4 w-4 text-emerald-400" />
                    ) : (
                      <X className="mx-auto h-4 w-4 text-red-400" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">{entry.installCount}</td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {entry.githubStars != null ? entry.githubStars.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(entry)}
                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-cyan-400"
                        title="Edit"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteEntry(entry)}
                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-red-400"
                        title="Delete (soft)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editEntry) && (
        <ModalShell
          open={true}
          onClose={() => { setShowAddModal(false); setEditEntry(null); }}
          panelClassName="w-auto max-w-lg overflow-y-auto bg-panel shadow-xl shadow-black/40"
        >
            <div className="flex items-center justify-between border-b border-line/50 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">
                {editEntry ? "Edit Entry" : "Add Entry"}
              </h2>
              <button
                onClick={() => { setShowAddModal(false); setEditEntry(null); }}
                className="rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-line/50 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
                  placeholder="My App"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Repo Full Name *</label>
                <input
                  type="text"
                  value={form.repoFullName}
                  onChange={(e) => setForm({ ...form, repoFullName: e.target.value })}
                  className="w-full rounded-lg border border-line/50 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
                  placeholder="owner/repo"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Description *</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-line/50 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
                  placeholder="A brief description of the app"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Category *</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-lg border border-line/50 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
                    placeholder="monitoring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Package Names</label>
                  <input
                    type="text"
                    value={form.packageNames}
                    onChange={(e) => setForm({ ...form, packageNames: e.target.value })}
                    className="w-full rounded-lg border border-line/50 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
                    placeholder="pkg1, pkg2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Homepage URL</label>
                  <input
                    type="url"
                    value={form.homepageUrl}
                    onChange={(e) => setForm({ ...form, homepageUrl: e.target.value })}
                    className="w-full rounded-lg border border-line/50 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Logo URL</label>
                  <input
                    type="url"
                    value={form.logoUrl}
                    onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                    className="w-full rounded-lg border border-line/50 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
                    placeholder="https://example.com/logo.png"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                  className="h-4 w-4 rounded border-line/50 bg-black/20 text-cyan-500 focus:ring-cyan-500/50"
                />
                <span className="text-sm text-slate-300">Featured entry</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-line/50 px-6 py-4">
              <button
                onClick={() => { setShowAddModal(false); setEditEntry(null); }}
                className="rounded-lg border border-line/50 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
              >
                {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
                {editEntry ? "Save Changes" : "Create Entry"}
              </button>
            </div>
        </ModalShell>
      )}

      {/* Delete confirmation */}
      {deleteEntry && (
        <ModalShell
          open={true}
          onClose={() => setDeleteEntry(null)}
          panelClassName="w-auto max-w-sm bg-panel shadow-xl shadow-black/40"
        >
            <div className="px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-500/10 p-2.5">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Delete Entry</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    This will soft-delete <span className="font-medium text-white">{deleteEntry.name}</span>.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-line/50 px-6 py-4">
              <button
                onClick={() => setDeleteEntry(null)}
                className="rounded-lg border border-line/50 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
        </ModalShell>
      )}
    </div>
  );
}
