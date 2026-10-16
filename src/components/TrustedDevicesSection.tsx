"use client";

import { useEffect, useState } from "react";
import { Monitor, Trash2, RefreshCw, ShieldOff } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type TrustedDevice = {
  id: string;
  name: string | null;
  createdAt: string;
  expiresAt: string;
};

export function TrustedDevicesSection() {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    setLoading(true);
    try {
      const res = await csrfFetch("/api/account/trusted-devices");
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function revokeDevice(id: string) {
    setMessage("");
    try {
      const res = await csrfFetch(`/api/account/trusted-devices?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== id));
        setMessage("Device revoked");
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to revoke device");
      }
    } catch {
      setMessage("Failed to revoke device");
    }
  }

  async function revokeAll() {
    setMessage("");
    try {
      const res = await csrfFetch("/api/account/trusted-devices?all=true", { method: "DELETE" });
      if (res.ok) {
        setDevices([]);
        setMessage("All trusted devices revoked");
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to revoke devices");
      }
    } catch {
      setMessage("Failed to revoke devices");
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  function isExpiringSoon(dateStr: string) {
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff < 7 * 24 * 60 * 60 * 1000; // less than 7 days
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <ConfirmDialog
        open={!!confirmRevokeId}
        title="Revoke trusted device"
        message="This device will need to re-verify MFA the next time it signs in."
        confirmLabel="Revoke"
        variant="danger"
        confirmText="REVOKE"
        onConfirm={() => {
          if (confirmRevokeId) {
            revokeDevice(confirmRevokeId);
            setConfirmRevokeId(null);
          }
        }}
        onCancel={() => setConfirmRevokeId(null)}
      />
      <ConfirmDialog
        open={confirmRevokeAll}
        title="Revoke all trusted devices"
        message="All devices will need to re-verify MFA on their next sign in."
        confirmLabel="Revoke All"
        variant="danger"
        confirmText="REVOKE ALL"
        onConfirm={() => {
          revokeAll();
          setConfirmRevokeAll(false);
        }}
        onCancel={() => setConfirmRevokeAll(false)}
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-cyan-400" />
          <h2 className="text-lg font-medium">Trusted Devices</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadDevices}
            className="focus-ring inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
          {devices.length > 0 && (
            <button
              onClick={() => setConfirmRevokeAll(true)}
              className="focus-ring inline-flex items-center gap-1 rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <ShieldOff className="h-3 w-3" />
              Revoke all
            </button>
          )}
        </div>
      </div>

      <p className="mb-4 text-sm text-slate-400">
        Devices that skip MFA after &quot;Remember this device&quot; is checked at login.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Loading trusted devices...</p>
      ) : devices.length === 0 ? (
        <div className="rounded-md border border-line/50 bg-surface/50 p-4 text-center">
          <Monitor className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-500">No trusted devices</p>
          <p className="mt-1 text-xs text-slate-600">Check &quot;Remember this device&quot; when verifying MFA to add one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="group flex items-center gap-3 rounded-md border border-line bg-surface p-3 text-sm transition-colors hover:border-line/80"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10">
                <Monitor className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200 truncate">
                    {device.name || "Unknown device"}
                  </span>
                  {isExpiringSoon(device.expiresAt) && (
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                      Expiring soon
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                  <span>Added: {formatDate(device.createdAt)}</span>
                  <span>&middot;</span>
                  <span>Expires: {formatDate(device.expiresAt)}</span>
                </div>
              </div>
              <button
                onClick={() => setConfirmRevokeId(device.id)}
                className="focus-ring shrink-0 rounded-md border border-line px-2.5 py-1.5 text-xs text-slate-400 opacity-0 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                title="Revoke this device"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {message && (
        <p
          className={`mt-3 rounded-md border p-3 text-sm ${
            message.includes("Failed") || message.includes("failed")
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
