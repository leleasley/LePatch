"use client";

import { Copy, Eye, EyeOff, Link2, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { telegramBotCommands } from "@/lib/telegram-commands";

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

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-cyan-300" />
          <h2 className="text-lg font-medium">Telegram Bot Access</h2>
        </div>
        <button
          onClick={generateCode}
          disabled={working || !enabled}
          className="focus-ring inline-flex items-center gap-2 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />
          Generate link code
        </button>
      </div>

      {!enabled ? (
        <p className="text-sm text-slate-400">An administrator must configure and enable Telegram Bot first.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-slate-400">
            Link your Telegram account to {botName || "the Telegram Bot"} so only signed-in LePatch users can use bot commands and receive direct release alerts.
          </p>

          <div className="rounded-md border border-line bg-surface p-3">
            <div className="text-slate-300">Current link</div>
            {link.linked ? (
              <div className="mt-2 space-y-1 text-slate-400">
                <div>Bot account: {link.username ? `@${link.username}` : "Unnamed Telegram account"}</div>
                <div className="flex items-center gap-2">
                  <span>
                    Chat ID: {showChatId ? link.chatId : "*".repeat(Math.max(8, link.chatId?.length || 8))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowChatId((value) => !value)}
                    className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label={showChatId ? "Hide Chat ID" : "Show Chat ID"}
                  >
                    {showChatId ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div>Linked: {formatDate(link.linkedAt)}</div>
                <div>Last seen: {formatDate(link.lastSeenAt)}</div>
              </div>
            ) : (
              <p className="mt-2 text-slate-500">No Telegram account linked yet.</p>
            )}
          </div>

          {linkCode && (
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-cyan-200">Link code</div>
                <button
                  type="button"
                  onClick={copyLinkCommand}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 px-2 py-1 text-xs text-cyan-100 transition-colors hover:bg-cyan-500/10"
                >
                  <Copy className="h-3 w-3" />
                  Copy command
                </button>
              </div>
              <div className="mt-2 font-mono text-base text-white">{linkCode}</div>
              <div className="mt-2 text-slate-300">
                Open {botHandle} in Telegram and send:
              </div>
              <div className="mt-1 rounded bg-slate-950/60 px-3 py-2 font-mono text-cyan-200">/link {linkCode}</div>
              <div className="mt-2 text-xs text-slate-400">Expires: {formatDate(expiresAt)}</div>
            </div>
          )}

          <div className="rounded-md border border-line bg-surface p-3 text-slate-400">
            <div>Available bot commands after linking:</div>
            <div className="mt-2 space-y-1">
              {visibleCommands.map((command) => (
                <div key={command.command} className="flex items-center justify-between gap-3 rounded-md border border-line/40 bg-black/10 px-3 py-2">
                  <div className="font-mono text-xs text-cyan-200">/{command.command}</div>
                  <div className="text-right text-xs text-slate-500">{command.description}</div>
                </div>
              ))}
            </div>
          </div>

          {link.linked && (
            <button
              onClick={unlink}
              disabled={working}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Unlink Telegram Bot
            </button>
          )}
        </div>
      )}

      {message && (
        <p className={`mt-4 rounded-md border p-3 text-sm ${
          message.includes("Failed") || message.includes("failed")
            ? "border-red-500/40 bg-red-500/10 text-red-200"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        }`}>
          {message}
        </p>
      )}
    </section>
  );
}
