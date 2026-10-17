"use client";

import { useEffect, useState } from "react";
import { Monitor, Trash2, RefreshCw, ShieldOff } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { List, ListRow, Panel, RowAvatar } from "@/components/ui/List";
import { Badge } from "@/components/ui/Card";

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

  const failed = message.includes("Failed") || message.includes("failed");

  return (
    <>
      <Panel
        title="Trusted devices"
        description='Devices that skip MFA after "Remember this device" is checked at sign-in.'
        actions={
          <>
            <button type="button" onClick={loadDevices} className="btn btn--ghost btn--sm">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Refresh
            </button>
            {devices.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmRevokeAll(true)}
                className="btn btn--danger btn--sm"
              >
                <ShieldOff className="h-3 w-3" aria-hidden="true" />
                Revoke all
              </button>
            )}
          </>
        }
        flush
      >
        {loading ? (
          <p className="px-4 py-3 text-sm text-text-muted">Loading trusted devices…</p>
        ) : devices.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-text-muted">
            <Monitor className="h-4 w-4 text-text-faint" aria-hidden="true" />
            No trusted devices. Check &ldquo;Remember this device&rdquo; when verifying MFA to add one.
          </p>
        ) : (
          <List>
            {devices.map((device) => (
              <ListRow
                key={device.id}
                leading={
                  <RowAvatar>
                    <Monitor className="h-4 w-4" aria-hidden="true" />
                  </RowAvatar>
                }
                title={
                  <>
                    <span className="truncate text-sm font-medium text-text">
                      {device.name || "Unknown device"}
                    </span>
                    {isExpiringSoon(device.expiresAt) && <Badge tone="warning">Expiring soon</Badge>}
                  </>
                }
                subtitle={`Added ${formatDate(device.createdAt)} · Expires ${formatDate(device.expiresAt)}`}
                trailing={
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeId(device.id)}
                    className="icon-button text-text-faint hover:text-status-danger"
                    aria-label={`Revoke ${device.name || "unknown device"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                }
              />
            ))}
          </List>
        )}

        {message ? (
          <p
            role={failed ? "alert" : "status"}
            aria-live="polite"
            className={`border-t border-border px-4 py-2.5 text-xs ${
              failed ? "text-status-danger" : "text-status-success"
            }`}
          >
            {message}
          </p>
        ) : null}
      </Panel>

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
    </>
  );
}
