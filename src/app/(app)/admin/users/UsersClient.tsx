"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Users,
  Plus,
  Search,
  Pencil,
  KeyRound,
  Trash2,
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
import { EmptyState } from "@/components/ui/Card";
import { List, ListRow, MetricStrip, Panel, RowAvatar, StatusDot, Toolbar, type StatusTone } from "@/components/ui/List";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { UserRole } from "@prisma/client";
import { RelativeTime } from "@/components/RelativeTime";

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

function roleTone(role: string): StatusTone {
  if (role === "administrator") return "danger";
  if (role === "moderator") return "warning";
  if (role === "user") return "accent";
  return "neutral";
}


function PasswordBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", enabled ? "text-text-muted" : "text-text-faint")}>
      <Key className={cn("h-3 w-3", !enabled && "opacity-50")} aria-hidden="true" />
      {enabled ? "Password set" : "No password"}
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
    <ModalShell open={open} onClose={onClose} title={title} panelClassName="w-auto max-w-lg overflow-y-auto p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        <button type="button" onClick={onClose} className="icon-button" aria-label={`Close ${title}`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {children}
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
    <Modal open={open} onClose={onClose} title="Add user">
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Jane Doe"
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="jane@example.com"
        />
        <Select
          label="Role"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
        >
          {Object.entries(roleLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <PasswordInput
          label="Password"
          value={form.password}
          onChange={(password) => setForm({ ...form, password })}
          placeholder="min 10 characters"
        />
        <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
          <button type="button" onClick={onClose} className="btn btn--secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !form.name || !form.email || form.password.length < 10}
            className="btn btn--primary"
          >
            {submitting ? "Creating…" : "Create user"}
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
    <Modal open={open} onClose={onClose} title="Edit user">
      {user && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <RowAvatar tone={roleTone(user.role)}>
              {(user.name || user.email)[0]?.toUpperCase() || "?"}
            </RowAvatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text">{user.name || "Unnamed"}</div>
              <div className="truncate text-xs text-text-muted">{user.email}</div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <StatusDot tone={roleTone(user.role)}>{roleLabels[user.role]}</StatusDot>
                <PasswordBadge enabled={user.passwordEnabled} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => { onClose(); onResetPassword(user); }}
              className="btn btn--secondary btn--sm shrink-0"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Reset password
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <Input
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <Select
              label="Role"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}
            >
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col-reverse justify-end gap-2 pt-1 sm:flex-row">
            <button type="button" onClick={onClose} className="btn btn--secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting || !draft.name || !draft.email}
              className="btn btn--primary"
            >
              {submitting ? "Saving…" : "Save changes"}
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
    <Modal open={open} onClose={onClose} title="Reset password">
      <div className="flex flex-col gap-4">
        {user && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <RowAvatar tone={roleTone(user.role)}>
              {(user.name || user.email)[0]?.toUpperCase() || "?"}
            </RowAvatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text">{user.name || "Unnamed"}</div>
              <div className="truncate text-xs text-text-muted">{user.email}</div>
            </div>
          </div>
        )}

        <p className="rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning">
          Confirm your own password before resetting another user&apos;s password.
        </p>
        <Input
          type="password"
          label="Your current password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="Enter your password"
        />
        <PasswordInput
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="min 10 characters"
        />
        <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
          <button type="button" onClick={onClose} className="btn btn--secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={submitting || !adminPassword || newPassword.length < 10}
            className="btn btn--primary"
          >
            {submitting ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type RoleFilter = "all" | UserRole;

export function UsersClient({ users: initialUsers, currentUserId }: { users: User[]; currentUserId: string }) {
  const { addToast } = useToast();
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) counts[u.role] = (counts[u.role] || 0) + 1;
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

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
    <div className="flex flex-col gap-5">
      <ConfirmDialog
        open={!!deleteUser}
        title="Delete user"
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

      <MetricStrip
        items={[
          { label: "Users", value: users.length },
          { label: "Administrators", value: stats.administrator ?? 0, tone: (stats.administrator ?? 0) > 0 ? "danger" : undefined },
          { label: "Moderators", value: stats.moderator ?? 0, tone: (stats.moderator ?? 0) > 0 ? "warning" : undefined },
          { label: "Restricted", value: stats.restricted ?? 0 },
        ]}
      />

      <Toolbar className="justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
            />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by name or email"
              aria-label="Search users"
              className="pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="icon-button absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="chip-row" role="group" aria-label="Filter users by role">
            {(
              [
                ["all", "All", users.length],
                ["administrator", "Administrators", stats.administrator ?? 0],
                ["moderator", "Moderators", stats.moderator ?? 0],
                ["user", "Users", stats.user ?? 0],
                ["restricted", "Restricted", stats.restricted ?? 0],
              ] as Array<[RoleFilter, string, number]>
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className="chip"
                data-active={roleFilter === key}
                aria-pressed={roleFilter === key}
                onClick={() => { setRoleFilter(key); setPage(0); }}
                disabled={count === 0 && key !== "all"}
              >
                {label}
                <span className="mono text-2xs opacity-70">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={() => setAddOpen(true)} className="btn btn--primary btn--sm">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add user
        </button>
      </Toolbar>

      <p className="text-xs text-text-faint">
        {filtered.length === users.length
          ? `${users.length} user${users.length === 1 ? "" : "s"}`
          : `${filtered.length} of ${users.length} shown`}
      </p>

      {users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-4 w-4" />}
          title="No users yet"
          description="Create the first account and assign it a role."
          action={
            <button type="button" onClick={() => setAddOpen(true)} className="btn btn--primary btn--sm">
              Add user
            </button>
          }
        />
      ) : paginated.length === 0 ? (
        <EmptyState
          title="Nothing matches this view"
          description="Try a different search term or role filter."
          action={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => { setSearch(""); setRoleFilter("all"); }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <Panel flush>
          <List>
            {paginated.map((user) => {
              const isCurrent = user.id === currentUserId;
              return (
                <ListRow
                  key={user.id}
                  leading={
                    <RowAvatar tone={roleTone(user.role)}>
                      {(user.name || user.email)[0]?.toUpperCase() || "?"}
                    </RowAvatar>
                  }
                  title={
                    <>
                      <span className="truncate text-sm font-medium text-text">{user.name || "Unnamed"}</span>
                      {isCurrent && <span className="shrink-0 text-xs text-text-faint">(you)</span>}
                    </>
                  }
                  subtitle={user.email}
                  meta={
                    <>
                      <StatusDot tone={roleTone(user.role)}>{roleLabels[user.role]}</StatusDot>
                      <PasswordBadge enabled={user.passwordEnabled} />
                      <span>added <RelativeTime value={user.createdAt} /></span>
                    </>
                  }
                  trailing={
                    <>
                      <button
                        type="button"
                        onClick={() => setEditUser(user)}
                        className="icon-button"
                        aria-label={`Edit ${user.name || user.email}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetUser(user)}
                        className="icon-button"
                        aria-label={`Reset password for ${user.name || user.email}`}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteUser(user)}
                        disabled={isCurrent}
                        className="icon-button text-text-faint hover:text-status-danger disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={isCurrent ? "You cannot delete your own account" : `Delete ${user.name || user.email}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </>
                  }
                />
              );
            })}
          </List>
        </Panel>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Page {safePage + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="btn btn--ghost btn--sm"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="btn btn--ghost btn--sm"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
