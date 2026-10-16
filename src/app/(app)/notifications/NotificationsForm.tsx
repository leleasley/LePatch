"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";

type Channel = {
  id: string;
  type: "discord" | "telegram";
  enabled: boolean;
  configJson: Record<string, string>;
};

export function NotificationsForm({ initialChannels }: { initialChannels: Channel[] }) {
  const ensure = (type: "discord" | "telegram") =>
    initialChannels.find((channel) => channel.type === type) || { id: "", type, enabled: false, configJson: {} };
  const [discord, setDiscord] = useState<Channel>(ensure("discord"));
  const [telegram, setTelegram] = useState<Channel>(ensure("telegram"));
  const [message, setMessage] = useState("");

  async function save() {
    setMessage("");
    const response = await csrfFetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels: [discord, telegram].map(({ type, enabled, configJson }) => ({ type, enabled, configJson })) })
    });
    if (!response.ok) setMessage((await response.json()).error || "Save failed");
    else {
      setMessage("Saved");
    }
  }

  async function test(channelId: string) {
    setMessage("");
    const response = await csrfFetch("/api/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId })
    });
    setMessage(response.ok ? "Test sent" : (await response.json()).error || "Test failed");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChannelPanel title="Discord" enabled={discord.enabled} onEnabled={(enabled) => setDiscord({ ...discord, enabled })}>
        <Input label="Webhook URL" value={discord.configJson.webhookUrl || ""} onChange={(webhookUrl) => setDiscord({ ...discord, configJson: { webhookUrl } })} />
        <PanelActions onSave={save} onTest={() => test(discord.id)} canTest={Boolean(discord.id)} />
      </ChannelPanel>
      <ChannelPanel title="Telegram Bot" enabled={telegram.enabled} onEnabled={(enabled) => setTelegram({ ...telegram, enabled })}>
        <Input label="Bot token" value={telegram.configJson.botToken || ""} onChange={(botToken) => setTelegram({ ...telegram, configJson: { ...telegram.configJson, botToken } })} />
        <Input label="Chat ID" value={telegram.configJson.chatId || ""} onChange={(chatId) => setTelegram({ ...telegram, configJson: { ...telegram.configJson, chatId } })} />
        <PanelActions onSave={save} onTest={() => test(telegram.id)} canTest={Boolean(telegram.id)} />
      </ChannelPanel>
      {message && <p className="lg:col-span-2 rounded-md border border-line bg-panel p-3 text-sm text-slate-300">{message}</p>}
    </div>
  );
}

function ChannelPanel({ title, enabled, onEnabled, children }: { title: string; enabled: boolean; onEnabled: (enabled: boolean) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} />
          Enabled
        </label>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-300">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-white" />
    </label>
  );
}

function PanelActions({ onSave, onTest, canTest }: { onSave: () => void; onTest: () => void; canTest: boolean }) {
  return (
    <div className="flex gap-2">
      <button onClick={onSave} className="focus-ring rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950">Save</button>
      <button onClick={onTest} disabled={!canTest} className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50">
        <Send className="h-4 w-4" />
        Send test
      </button>
    </div>
  );
}
