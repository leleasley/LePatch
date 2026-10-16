"use client";

import { KeyRound, Plus, Save, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { roleLabels } from "@/lib/rbac";
import type { UserRole } from "@prisma/client";

type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export function UsersClient({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const [message, setMessage] = useState("");
  const [newUser, setNewUser] = useState<{ name: string; email: string; password: string; role: UserRole }>({ name: "", email: "", password: "", role: "user" });

  async function createUser() {
    setMessage("");
    const response = await csrfFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser)
    });
    if (response.ok) {
      setNewUser({ name: "", email: "", password: "", role: "user" });
      setMessage("User created");
    } else {
      setMessage((await response.json()).error || "Unable to create user");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-cyan-300" />
          <h2 className="text-lg font-medium">Add User</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <Input label="Name" value={newUser.name} onChange={(name) => setNewUser({ ...newUser, name })} />
          <Input label="Email" value={newUser.email} onChange={(email) => setNewUser({ ...newUser, email })} />
          <Input label="Password" type="password" value={newUser.password} onChange={(password) => setNewUser({ ...newUser, password })} />
          <label className="block text-sm">
            <span className="text-slate-300">Role</span>
            <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as UserRole })} className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white">
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button onClick={createUser} className="focus-ring mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 text-sm font-medium text-slate-950">
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>
      </section>

      <div className="grid gap-3">
        {users.map((user) => (
          <UserRow key={user.id} user={user} currentUserId={currentUserId} onMessage={setMessage} />
        ))}
      </div>

      {message && <p className="rounded-md border border-line bg-panel p-3 text-sm text-slate-300">{message}</p>}
    </div>
  );
}

function UserRow({ user, currentUserId, onMessage }: { user: User; currentUserId: string; onMessage: (message: string) => void }) {
  const [draft, setDraft] = useState({ name: user.name, email: user.email, role: user.role });
  const [password, setPassword] = useState("");
  const isSelf = user.id === currentUserId;

  async function save() {
    onMessage("");
    const response = await csrfFetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    onMessage(response.ok ? "User saved" : (await response.json()).error || "Unable to save user");
  }

  async function resetPassword() {
    onMessage("");
    const response = await csrfFetch(`/api/users/${user.id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (response.ok) {
      setPassword("");
      onMessage("Password reset");
    } else {
      onMessage((await response.json()).error || "Unable to reset password");
    }
  }

  async function remove() {
    onMessage("");
    const response = await csrfFetch(`/api/users/${user.id}`, { method: "DELETE" });
    onMessage(response.ok ? "User removed" : (await response.json()).error || "Unable to remove user");
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-cyan-500/15 text-cyan-200">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium">{user.name}</h2>
            <p className="text-sm text-slate-400">{user.email} · {roleLabels[user.role]}{isSelf ? " · you" : ""}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Input label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <Input label="Email" value={draft.email} onChange={(email) => setDraft({ ...draft, email })} />
        <label className="block text-sm">
          <span className="text-slate-300">Role</span>
          <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })} className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white">
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button onClick={save} className="focus-ring mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm hover:bg-white/5">
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <Input label="New password" type="password" value={password} onChange={setPassword} />
        <button onClick={resetPassword} className="focus-ring mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm hover:bg-white/5">
          <KeyRound className="h-4 w-4" />
          Reset password
        </button>
        <button onClick={remove} disabled={isSelf} className="focus-ring mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-500/40 px-4 text-sm text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50">
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </section>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-300">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white" />
    </label>
  );
}
