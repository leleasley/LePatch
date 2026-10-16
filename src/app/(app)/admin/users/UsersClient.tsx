"use client";

import { useState, useMemo, useCallback, createElement, useEffect } from "react";
import {
  Users,
  Plus,
  Search,
  Pencil,
  KeyRound,
  Trash2,
  Shield,
  ShieldCheck,
  UserRound,
  X,
  ChevronLeft,
  ChevronRight,
  Key,
} from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { roleLabels } from "@/lib/rbac";
import { useToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ModalShell } from "@/components/ModalShell";
import { PasswordInput } from "@/components/PasswordStrengthInput";
import type { UserRole } from "@prisma/client";

type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  passwordEnabled: boolean;
};

const PER_PAGE = 20;

const ROLE_STYLES: Record<string, string> = {
  administrator: "text-red-300 bg-red-500/10 border-red-500/20",
  moderator: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  user: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
  restricted: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

function roleIcon(role: string) {
  if (role === "administrator") return Shield;
  if (role === "moderator") return ShieldCheck;
  return UserRound;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function PasswordBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/80">
      <Key className="h-3 w-3" />
      Password
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      <Key className="h-3 w-3 opacity-50" />
      No password
    </span>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <ModalShell open={open} onClose={onClose} panelClassName="w-auto max-w-lg overflow-y-auto p-5 sm:p-6">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.03] to-transparent pointer-events-none rounded-t-2xl sm:rounded-xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </ModalShell>
  );
}

function AddUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (u: User) => void;
}) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as UserRole });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      onCreated(data.user);
      setForm({ name: "", email: "", password: "", role: "user" });
      onClose();
      addToast("User created", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create user", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add User">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-300 font-medium mb-1.5">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Jane Doe"
            className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 font-medium mb-1.5">Email</label>
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="jane@example.com"
            className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-300 font-medium mb-1.5">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors"
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <PasswordInput
          label="Password"
          value={form.password}
          onChange={(password) => setForm({ ...form, password })}
          placeholder="min 10 characters"
        />
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="w-full sm:w-auto rounded-lg border border-line/50 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !form.name || !form.email || form.password.length < 10}
            className="w-full sm:w-auto rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-all"
          >
            {submitting ? "Creating..." : "Create User"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({
  open,
  user,
  onClose,
  onSaved,
  onResetPassword,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: (u: User) => void;
  onResetPassword: (u: User) => void;
}) {
  const { addToast } = useToast();
  const [draft, setDraft] = useState({ name: "", email: "", role: "user" as UserRole });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) setDraft({ name: user.name, email: user.email, role: user.role });
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSubmitting(true);
    try {
      const res = await csrfFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      onSaved({ ...user, ...draft });
      onClose();
      addToast("User saved", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit User">
      {user && (
        <div className="space-y-5">
          {/* User context header */}
          <div className="flex items-center gap-4 rounded-xl border border-line/50 bg-white/[0.02] p-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
              <span className="text-base font-semibold text-cyan-300">
                {(user.name || user.email)[0]?.toUpperCase() || "?"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate">{user.name || "Unnamed"}</div>
              <div className="text-xs text-slate-400 truncate">{user.email}</div>
              <div className="mt-1 flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${ROLE_STYLES[user.role] || ROLE_STYLES.user}`}>
                  {createElement(roleIcon(user.role), { className: "h-2.5 w-2.5" })}
                  {roleLabels[user.role]}
                </span>
                <PasswordBadge enabled={user.passwordEnabled} />
              </div>
            </div>
            <button
              onClick={() => { onClose(); onResetPassword(user); }}
              className="shrink-0 rounded-lg border border-line/50 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white transition-all flex items-center gap-1.5"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Reset Password
            </button>
          </div>

          {/* Edit fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1.5">Name</label>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1.5">Email</label>
              <input
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1.5">Role</label>
              <select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}
                className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors"
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="w-full sm:w-auto rounded-lg border border-line/50 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={submitting || !draft.name || !draft.email}
              className="w-full sm:w-auto rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-all"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ResetPasswordModal({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleReset() {
    if (!user) return;
    setSubmitting(true);
    try {
      const res = await csrfFetch(`/api/users/${user.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword, adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setAdminPassword("");
      setNewPassword("");
      onClose();
      addToast("Password reset", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to reset password", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Reset Password">
      <div className="space-y-4">
        {/* User context */}
        {user && (
          <div className="flex items-center gap-3 rounded-xl border border-line/50 bg-white/[0.02] p-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
              <span className="text-sm font-semibold text-cyan-300">
                {(user.name || user.email)[0]?.toUpperCase() || "?"}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.name || "Unnamed"}</div>
              <div className="text-xs text-slate-400 truncate">{user.email}</div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-300/80">
            You must confirm your own password to reset another user&apos;s password.
          </p>
        </div>
        <div>
          <label className="block text-sm text-slate-300 font-medium mb-1.5">Your Current Password</label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
        <PasswordInput
          label="New Password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="min 10 characters"
        />
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="w-full sm:w-auto rounded-lg border border-line/50 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={submitting || !adminPassword || newPassword.length < 10}
            className="w-full sm:w-auto rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-all"
          >
            {submitting ? "Resetting..." : "Reset Password"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function UserCard({
  user,
  isCurrent,
  onEdit,
  onDelete,
}: {
  user: User;
  isCurrent: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-line/50 bg-panel/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
            <span className="text-sm font-semibold text-cyan-300">
              {(user.name || user.email)[0]?.toUpperCase() || "?"}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">{user.name || "Unnamed"}</span>
              {isCurrent && <span className="text-[10px] text-slate-500 shrink-0">(you)</span>}
            </div>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${ROLE_STYLES[user.role] || ROLE_STYLES.user}`}>
            {createElement(roleIcon(user.role), { className: "h-3 w-3" })}
            {roleLabels[user.role]}
          </span>
          <PasswordBadge enabled={user.passwordEnabled} />
        </div>
        <span className="text-xs text-slate-500">{timeAgo(user.createdAt)}</span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line/30 pt-3">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-lg border border-line/50 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white transition-all"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={isCurrent}
          className="flex items-center gap-1.5 rounded-lg border border-line/50 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-red-300/80 hover:bg-red-500/5 hover:text-red-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

function UserTableRow({
  user,
  isCurrent,
  onEdit,
  onDelete,
}: {
  user: User;
  isCurrent: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b border-line/30 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
            <span className="text-sm font-semibold text-cyan-300">
              {(user.name || user.email)[0]?.toUpperCase() || "?"}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">{user.name || "Unnamed"}</span>
              {isCurrent && <span className="text-[10px] text-slate-500 shrink-0">(you)</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 truncate max-w-[240px]">{user.email}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${ROLE_STYLES[user.role] || ROLE_STYLES.user}`}>
          {createElement(roleIcon(user.role), { className: "h-3 w-3" })}
          {roleLabels[user.role]}
        </span>
      </td>
      <td className="px-4 py-3">
        <PasswordBadge enabled={user.passwordEnabled} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{timeAgo(user.createdAt)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            title="Edit user"
            className="rounded-lg p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isCurrent}
            title={isCurrent ? "Can't delete yourself" : "Delete user"}
            className="rounded-lg p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function UsersClient({ users: initialUsers, currentUserId }: { users: User[]; currentUserId: string }) {
  const { addToast } = useToast();
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q)
    );
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) counts[u.role] = (counts[u.role] || 0) + 1;
    return counts;
  }, [users]);

  const handleDelete = useCallback(async () => {
    if (!deleteUser) return;
    try {
      const res = await csrfFetch(`/api/users/${deleteUser.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
      addToast("User deleted", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete", "error");
    }
    setDeleteUser(null);
  }, [deleteUser, addToast]);

  return (
    <div className="max-w-5xl">
      <ConfirmDialog
        open={!!deleteUser}
        title="Delete User"
        message={`Remove ${deleteUser?.name} (${deleteUser?.email})? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        confirmText="DELETE"
        onConfirm={handleDelete}
        onCancel={() => setDeleteUser(null)}
      />

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={(u) => setUsers((prev) => [...prev, u])} />
      <EditUserModal
        open={!!editUser}
        user={editUser}
        onClose={() => setEditUser(null)}
        onSaved={(updated) => setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))}
        onResetPassword={(u) => setResetUser(u)}
      />
      <ResetPasswordModal open={!!resetUser} user={resetUser} onClose={() => setResetUser(null)} />

      {/* Header */}
      <div className="mb-4 sm:mb-6 overflow-hidden rounded-xl border border-line/50 bg-gradient-to-br from-surface via-panel to-surface p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl bg-cyan-500/10 p-2.5 sm:p-3 shrink-0">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white">User Management</h1>
              <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-slate-400 hidden sm:block">Manage local accounts, roles, and access control.</p>
            </div>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 transition-all shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add User</span>
          </button>
        </div>

        <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line/50 bg-white/[0.03] px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium text-slate-300">
            {users.length} total
          </span>
          {Object.entries(stats).map(([role, count]) => (
            <span key={role} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium ${ROLE_STYLES[role] || ROLE_STYLES.user}`}>
              {count} {roleLabels[role as UserRole] || role}
            </span>
          ))}
        </div>
      </div>

      {/* Search + count */}
      <div className="mb-3 sm:mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full rounded-lg border border-line/50 bg-panel/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <span className="text-xs sm:text-sm text-slate-500 whitespace-nowrap">
          {filtered.length === users.length ? `${users.length} users` : `${filtered.length}/${users.length}`}
        </span>
      </div>

      {/* Desktop: Table */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-line/50 bg-panel/80">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-[220px]">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-[260px]">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-[140px]">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-[110px]">Auth</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-[90px]">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <Users className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                  <p className="text-sm font-medium text-slate-400">{search ? "No users match your search" : "No users yet"}</p>
                  {!search && (
                    <button onClick={() => setAddOpen(true)} className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                      Create your first user
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              paginated.map((user) => (
                <UserTableRow
                  key={user.id}
                  user={user}
                  isCurrent={user.id === currentUserId}
                  onEdit={() => setEditUser(user)}
                  onDelete={() => setDeleteUser(user)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: Cards */}
      <div className="sm:hidden space-y-3">
        {paginated.length === 0 ? (
          <div className="rounded-xl border border-line/50 bg-panel/80 p-8 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm font-medium text-slate-400">{search ? "No users match your search" : "No users yet"}</p>
            {!search && (
              <button onClick={() => setAddOpen(true)} className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                Create your first user
              </button>
            )}
          </div>
        ) : (
          paginated.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              isCurrent={user.id === currentUserId}
              onEdit={() => setEditUser(user)}
              onDelete={() => setDeleteUser(user)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs sm:text-sm text-slate-500">
            Page {safePage + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="rounded-lg border border-line/50 bg-panel/80 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="rounded-lg border border-line/50 bg-panel/80 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
