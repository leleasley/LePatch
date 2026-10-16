"use client";

import { Copy, Eye, EyeOff, Link2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { telegramBotCommands } from "@/lib/telegram-commands";
import { Panel } from "@/components/ui/List";

type LinkStatus = {
  linked: boolean;
  chatId: string | null;
  username: string | null;
  linkedAt: string | null;
  lastSeenAt: string | null;
};

export function TelegramLinkSection() {
  const [enabled, setEnabled] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const [link, setLink] = useState<LinkStatus>({
    linked: false,
    chatId: null,
    username: null,
    linkedAt: null,
    lastSeenAt: null,
  });
  const [linkCode, setLinkCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [showChatId, setShowChatId] = useState(false);

  async function load() {
    const response = await fetch("/api/account/telegram");
    if (response.ok) {
      const data = await response.json();
      setEnabled(Boolean(data.enabled));
      setBotUsername(data.botUsername || null);
      setBotName(data.botName || null);
      setLink(data.link);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function generateCode() {
    setWorking(true);
    setMessage("");
    const response = await csrfFetch("/api/account/telegram", { method: "POST" });
    setWorking(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Failed to generate link code");
      return;
    }
    setLinkCode(data.token);
    setExpiresAt(data.expiresAt);
    setBotUsername(data.botUsername || null);
    setBotName(data.botName || null);
    setMessage("Link code created");
  }

  async function unlink() {
    setWorking(true);
    setMessage("");
    const response = await csrfFetch("/api/account/telegram", { method: "DELETE" });
    setWorking(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Failed to unlink Telegram Bot");
      return;
    }
    setLinkCode("");
    setExpiresAt(null);
    setMessage("Telegram Bot unlinked");
    load();
  }

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleString() : "N/A";
  }

  function copyLinkCommand() {
    if (!linkCode) return;
    navigator.clipboard.writeText(`/link ${linkCode}`);
    setMessage("Link command copied");
  }

  const botHandle = botUsername ? `@${botUsername}` : "your configured Telegram Bot";
  const visibleCommands = telegramBotCommands.filter((command) => !command.adminOnly);
  const failed = message.includes("Failed") || message.includes("failed");

  return (
    <Panel
      title="Telegram"
      description="Link your Telegram account to use bot commands and receive direct release alerts."
      actions={
        <button
          type="button"
          onClick={generateCode}
          disabled={working || !enabled}
          className="btn btn--primary btn--sm"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Generate link code
        </button>
      }
      flush
    >
      {!enabled ? (
        <p className="p-4 text-sm text-text-muted">
          An administrator must configure and enable Telegram Bot first.
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4 text-sm">
          <p className="text-text-muted">
            Link your Telegram account to {botName || "the Telegram Bot"} so only signed-in LePatch
            users can use bot commands and receive direct release alerts.
          </p>

          <div className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
              Current link
            </p>
            {link.linked ? (
              <dl className="mt-2 space-y-1 text-text-muted">
                <div>
                  Bot account:{" "}
                  <span className="text-text">
                    {link.username ? `@${link.username}` : "Unnamed Telegram account"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>
                    Chat ID:{" "}
                    <span className="mono text-text">
                      {showChatId ? link.chatId : "*".repeat(Math.max(8, link.chatId?.length || 8))}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowChatId((value) => !value)}
                    className="icon-button h-6 w-6"
                    aria-label={showChatId ? "Hide Chat ID" : "Show Chat ID"}
                  >
                    {showChatId ? (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <div>Linked: {formatDate(link.linkedAt)}</div>
                <div>Last seen: {formatDate(link.lastSeenAt)}</div>
              </dl>
            ) : (
              <p className="mt-2 text-text-muted">No Telegram account linked yet.</p>
            )}
          </div>

          {linkCode && (
            <div className="rounded-md border border-accent/40 bg-accent/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-accent">Link code</p>
                <button type="button" onClick={copyLinkCommand} className="btn btn--ghost btn--sm">
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  Copy command
                </button>
              </div>
              <div className="mono mt-2 text-base text-text">{linkCode}</div>
              <p className="mt-2 text-text">Open {botHandle} in Telegram and send:</p>
              <div className="mono mt-1 rounded-md border border-border bg-surface px-3 py-2 text-accent">
                /link {linkCode}
              </div>
              <p className="mt-2 text-xs text-text-muted">Expires: {formatDate(expiresAt)}</p>
            </div>
          )}

          <div className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
              Available bot commands after linking
            </p>
            <ul className="mt-2 divide-y divide-divider">
              {visibleCommands.map((command) => (
                <li
                  key={command.command}
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <span className="mono text-xs text-accent">/{command.command}</span>
                  <span className="text-right text-xs text-text-muted">{command.description}</span>
                </li>
              ))}
            </ul>
          </div>

          {link.linked && (
            <div>
              <button
                type="button"
                onClick={unlink}
                disabled={working}
                className="btn btn--danger btn--sm"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Unlink Telegram Bot
              </button>
            </div>
          )}
        </div>
      )}

      {message && (
        <p
          role={failed ? "alert" : "status"}
          aria-live="polite"
          className={`border-t border-border px-4 py-2.5 text-xs ${
            failed ? "text-status-danger" : "text-status-success"
          }`}
        >
          {message}
        </p>
      )}
    </Panel>
  );
}
