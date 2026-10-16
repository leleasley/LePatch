"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { ModalShell } from "@/components/ModalShell";
import { Lightbulb, X } from "lucide-react";

const CATEGORIES = ["media", "identity", "monitoring", "infrastructure", "documents"];

export function SuggestAppButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name") as string,
      repoFullName: form.get("repoFullName") as string,
      description: form.get("description") as string,
      category: form.get("category") as string,
      packageNames: (form.get("packageNames") as string || "").split(",").map(s => s.trim()).filter(Boolean),
    };

    const res = await csrfFetch("/api/apps/catalogue/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    if (!res.ok) {
      setMessage((await res.json()).error || "Failed to submit");
      return;
    }
    setSuccess(true);
    setMessage("Suggestion submitted! An admin will review it shortly.");
  }

  if (success) {
    return (
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
        {message}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
        <Lightbulb className="h-4 w-4" />
        Suggest an app
      </button>

      {open && (
        <ModalShell open={open} onClose={() => setOpen(false)} panelClassName="w-auto max-w-lg overflow-y-auto p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Suggest an app</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-400">App name</label>
                <input name="name" required type="text"
                  className="w-full rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">GitHub repo (owner/repo)</label>
                <input name="repoFullName" required type="text" placeholder="owner/repo"
                  className="w-full rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Description</label>
                <textarea name="description" required rows={3}
                  className="w-full rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Category</label>
                <select name="category" required
                  className="w-full rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none">
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Package names (comma-separated, optional)</label>
                <input name="packageNames" type="text" placeholder="myapp, my-app"
                  className="w-full rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none" />
              </div>
              {message && <p className="text-sm text-slate-300">{message}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)}
                  className="rounded-md border border-line px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
                <button type="submit" disabled={loading}
                  className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60">
                  {loading ? "Submitting..." : "Submit suggestion"}
                </button>
              </div>
            </form>
        </ModalShell>
      )}
    </>
  );
}
