"use client";

import { Key, Trash2, EyeOff, Copy, Check, Send, Webhook, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";
import { Panel, StatusDot } from "@/components/ui/List";
import { Input, Switch } from "@/components/ui/Input";

export function IntegrationsTab() {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <GitHubSection />
      <TelegramSection />
      <DiscordSection />
    </div>
  );
}

function CopyButton({ label, copied, onCopy }: { label: string; copied: boolean; onCopy: () => void }) {
  return (
    <button type="button" onClick={onCopy} className="icon-button h-7 w-7" aria-label={label}>
      {copied ? <Check className="h-3.5 w-3.5 text-status-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}

function GitHubSection() {
  const { addToast } = useToast();
  const [token, setToken] = useState("");
  const [configured, setConfigured] = useState(false);
  const [rateLimit, setRateLimit] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [oauthSaving, setOauthSaving] = useState(false);
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);

  const [clientIdError, setClientIdError] = useState("");
  const [clientSecretError, setClientSecretError] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    const response = await fetch("/api/integrations/github");
    if (response.ok) {
      const data = await response.json();
      setConfigured(data.configured);
      setRateLimit(data.rateLimit);
      setOauthConfigured(data.oauth?.configured || false);
      setOauthEnabled(data.oauth?.enabled || false);
      if (data.oauth?.clientId) setOauthClientId(data.oauth.clientId);
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadStatus(); }, []);

  function validateClientId(value: string): boolean {
    if (!value) {
      setClientIdError("");
      return true;
    }
    if (!/^[A-Za-z0-9_]{10,}$/.test(value)) {
      setClientIdError("Must be at least 10 alphanumeric characters");
      return false;
    }
    setClientIdError("");
    return true;
  }

  function validateClientSecret(value: string): boolean {
    if (!value) {
      setClientSecretError("");
      return true;
    }
    if (!/^[A-Za-z0-9]{20,}$/.test(value)) {
      setClientSecretError("Must be at least 20 alphanumeric characters");
      return false;
    }
    setClientSecretError("");
    return true;
  }

  async function saveToken() {
    setSaving(true);
    const response = await csrfFetch("/api/integrations/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-token", token }),
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Failed to save token", "error");
    } else {
      addToast("Token saved", "success");
      setToken("");
      loadStatus();
    }
  }

  async function removeToken() {
    const response = await csrfFetch("/api/integrations/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove-token" }),
    });
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Failed to remove token", "error");
    } else {
      addToast("Token removed", "success");
      setConfigured(false);
      setRateLimit(null);
    }
  }

  async function saveOauth() {
    if (!validateClientId(oauthClientId) || !validateClientSecret(oauthClientSecret)) return;
    setOauthSaving(true);
    const response = await csrfFetch("/api/integrations/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-oauth",
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
        enabled: oauthEnabled,
      }),
    });
    setOauthSaving(false);
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Failed to save OAuth config", "error");
    } else {
      addToast("GitHub OAuth config saved", "success");
      setOauthClientSecret("");
      loadStatus();
    }
  }

  async function removeOauth() {
    const response = await csrfFetch("/api/integrations/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove-oauth" }),
    });
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Failed to remove OAuth config", "error");
    } else {
      addToast("GitHub OAuth config removed", "success");
      setOauthConfigured(false);
      setOauthClientId("");
      setOauthClientSecret("");
      setOauthEnabled(false);
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://your-instance.com";
  const callbackUrl = `${appUrl}/api/auth/github/callback`;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <img src="/assets/github.svg" alt="" className="h-4 w-4" />
          GitHub
        </span>
      }
      description="Personal access tokens and OAuth sign-in"
      actions={<StatusDot tone={configured ? "success" : "neutral"}>{configured ? "Configured" : "Not configured"}</StatusDot>}
    >
      {loading ? (
        <p className="text-sm text-text-muted" aria-live="polite">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rateLimit && !rateLimit.error && (
            <div className="rounded-md border border-border bg-surface p-3 text-sm">
              <p className="text-text">
                API rate limit: {rateLimit.used}/{rateLimit.limit} used
              </p>
              {rateLimit.reset && (
                <p className="text-text-muted">
                  Resets at {new Date(rateLimit.reset * 1000).toLocaleString()}
                </p>
              )}
              {rateLimit.remaining !== undefined && (
                <p className={rateLimit.remaining < 100 ? "text-status-warning" : "text-text"}>
                  Remaining: {rateLimit.remaining}
                </p>
              )}
            </div>
          )}

          {rateLimit?.error && (
            <p role="alert" className="rounded-md border border-status-danger/40 bg-status-danger/10 p-3 text-sm text-status-danger">
              Rate limit check failed: {rateLimit.error} (status {rateLimit.status})
            </p>
          )}

          <Input
            type="password"
            label="GitHub personal access token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={configured ? "Enter a new token to replace the existing one" : "ghp_…"}
          />

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveToken} disabled={saving || !token} className="btn btn--primary btn--sm">
              <Key className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? "Saving…" : "Save token"}
            </button>
            {configured && (
              <button type="button" onClick={removeToken} className="btn btn--danger btn--sm">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remove token
              </button>
            )}
          </div>

          <details className="text-sm text-text-muted">
            <summary className="cursor-pointer hover:text-text">How do I get a GitHub token?</summary>
            <div className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-surface p-3">
              <p>1. GitHub Settings &gt; Developer settings &gt; Personal access tokens &gt; Tokens (classic)</p>
              <p>2. Generate a new token (classic)</p>
              <p>3. Give it a name and select the <code className="mono">repo</code> scope</p>
              <p>4. Copy the generated token and paste it above</p>
            </div>
          </details>

          <div className="border-t border-border pt-4">
            <div className="mb-4 flex items-center gap-3">
              <img src="/assets/github.svg" alt="" className="h-7 w-7" />
              <div>
                <h3 className="text-sm font-semibold text-text">GitHub OAuth</h3>
                <p className="text-xs text-text-muted">Sign-in and issue creation</p>
              </div>
            </div>

            <div className="mb-4">
              <StatusDot tone={oauthConfigured ? "success" : "neutral"}>
                {oauthConfigured ? "OAuth configured" : "OAuth not configured"}
              </StatusDot>
            </div>

            <div className="mb-4">
              <Switch checked={oauthEnabled} onChange={setOauthEnabled} label="Enabled" />
            </div>

            <div className="mb-4 flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-faint">
                Required for the GitHub OAuth app
              </p>
              <div className="flex flex-col gap-2">
                <div>
                  <span className="text-xs text-text-muted">Homepage URL</span>
                  <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-text">
                    <span className="mono min-w-0 flex-1 truncate">{appUrl}</span>
                    <CopyButton
                      label="Copy homepage URL"
                      copied={copiedField === "appUrl"}
                      onCopy={() => copyToClipboard(appUrl, "appUrl")}
                    />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Authorization callback URL</span>
                  <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-text">
                    <span className="mono min-w-0 flex-1 truncate">{callbackUrl}</span>
                    <CopyButton
                      label="Copy authorization callback URL"
                      copied={copiedField === "callbackUrl"}
                      onCopy={() => copyToClipboard(callbackUrl, "callbackUrl")}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                {oauthConfigured && showClientId && (
                  <div className="mb-2 rounded-md border border-border bg-surface px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wide text-text-faint">Stored client ID</div>
                        <div className="mono mt-1 truncate text-sm text-text">{oauthClientId}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowClientId((v) => !v)}
                        className="icon-button"
                        aria-label="Hide stored client ID"
                      >
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
                <Input
                  label="Client ID"
                  value={oauthClientId}
                  error={clientIdError || undefined}
                  onChange={(e) => {
                    setOauthClientId(e.target.value);
                    validateClientId(e.target.value);
                  }}
                  placeholder={oauthConfigured && !showClientId ? "Enter a new client ID to replace the stored one" : "Ov23ct… or Iv1.abc…"}
                />
              </div>

              <div>
                {oauthConfigured && showClientSecret && (
                  <div className="mb-2 rounded-md border border-border bg-surface px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wide text-text-faint">Stored client secret</div>
                        <div className="mono mt-1 truncate text-sm text-text">ghs_****</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowClientSecret((v) => !v)}
                        className="icon-button"
                        aria-label="Hide stored client secret"
                      >
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
                <Input
                  type="password"
                  label="Client secret"
                  value={oauthClientSecret}
                  error={clientSecretError || undefined}
                  onChange={(e) => {
                    setOauthClientSecret(e.target.value);
                    validateClientSecret(e.target.value);
                  }}
                  placeholder={oauthConfigured && !showClientSecret ? "Enter a new secret to replace the stored one" : "Your client secret…"}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={saveOauth} disabled={oauthSaving || !oauthClientId || !oauthClientSecret} className="btn btn--primary btn--sm">
                <img src="/assets/github.svg" alt="" className="h-3.5 w-3.5" />
                {oauthSaving ? "Saving…" : "Save OAuth config"}
              </button>
              {oauthConfigured && (
                <button type="button" onClick={removeOauth} className="btn btn--danger btn--sm">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove OAuth config
                </button>
              )}
            </div>

            <details className="mt-4 text-sm text-text-muted">
              <summary className="cursor-pointer hover:text-text">How do I set up GitHub OAuth?</summary>
              <div className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-surface p-3">
                <p>1. GitHub Settings &gt; Developer settings &gt; OAuth Apps &gt; New OAuth App</p>
                <p>2. Fill in the application name (for example &quot;LePatch&quot;)</p>
                <p>3. Paste the <strong className="text-text">Homepage URL</strong> from above</p>
                <p>4. Paste the <strong className="text-text">Authorization callback URL</strong> from above</p>
                <p>5. Copy the client ID and generate a client secret</p>
                <p>6. Paste them above and enable the OAuth integration</p>
              </div>
            </details>
          </div>
        </div>
      )}
    </Panel>
  );
}

function TelegramSection() {
  const { addToast } = useToast();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [storedChatId, setStoredChatId] = useState("");
  const [showStoredChatId, setShowStoredChatId] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<Record<string, { configured: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadStatus() {
    setLoading(true);
    const response = await fetch("/api/integrations/telegram");
    if (response.ok) {
      const data = await response.json();
      setSettingsStatus(data.settings || {});
      setEnabled(Boolean(data.enabled));
      setStoredChatId(data.chatId || "");
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadStatus(); }, []);

  async function save() {
    setSaving(true);
    const body: Record<string, any> = { action: "update" };
    if (botToken) body.botToken = botToken;
    if (chatId) body.chatId = chatId;
    if (webhookSecret) body.webhookSecret = webhookSecret;
    body.enabled = enabled;
    const response = await csrfFetch("/api/integrations/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Save failed", "error");
    } else {
      addToast("Telegram settings saved", "success");
      setBotToken("");
      setWebhookSecret("");
      loadStatus();
    }
  }

  async function setWebhook() {
    const response = await csrfFetch("/api/integrations/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setWebhook" }),
    });
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Failed to set webhook", "error");
    } else {
      addToast("Webhook set successfully", "success");
    }
  }

  async function clearWebhook() {
    const response = await csrfFetch("/api/integrations/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clearWebhook" }),
    });
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Failed to clear webhook", "error");
    } else {
      addToast("Webhook cleared", "success");
    }
  }

  async function sendTest() {
    const response = await csrfFetch("/api/integrations/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sendTest" }),
    });
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Test failed", "error");
    } else {
      addToast("Test message sent", "success");
    }
  }

  const hasToken = settingsStatus.botToken?.configured;
  const hasChatId = settingsStatus.chatId?.configured;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Send className="h-4 w-4 text-text-faint" aria-hidden="true" />
          Telegram bot
        </span>
      }
      description="Notifications and alerts via Telegram"
      actions={<StatusDot tone={hasToken ? "success" : "neutral"}>{hasToken ? "Configured" : "Not configured"}</StatusDot>}
    >
      {loading ? (
        <p className="text-sm text-text-muted" aria-live="polite">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Switch
            checked={enabled}
            onChange={setEnabled}
            label="Enabled"
            description="Send release and issue notifications through Telegram."
          />

          <Input
            type="password"
            label="Bot token"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={hasToken ? "Leave empty to keep the existing token" : "123456:ABC-DEF1234…"}
          />

          <div>
            {hasChatId && (
              <div className="mb-2 rounded-md border border-border bg-surface px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-text-faint">Stored fallback chat ID</div>
                    <div className="mono mt-1 truncate text-sm text-text">
                      {showStoredChatId ? storedChatId : "*".repeat(Math.max(8, storedChatId.length || 8))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStoredChatId((value) => !value)}
                    className="icon-button"
                    aria-label={showStoredChatId ? "Hide chat ID" : "Show chat ID"}
                  >
                    {showStoredChatId ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
            )}
            <Input
              label="Chat ID"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder={hasChatId ? "Enter a new chat ID to replace the stored one" : "Optional fallback chat"}
              hint="Optional fallback destination. Linked Telegram bot users receive alerts directly without this."
            />
          </div>

          <Input
            type="password"
            label="Webhook secret"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Auto-generated if empty"
          />

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={saving} className="btn btn--primary btn--sm">
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={setWebhook} disabled={!hasToken} className="btn btn--ghost btn--sm">
              <Webhook className="h-3.5 w-3.5" aria-hidden="true" />
              Set webhook
            </button>
            <button type="button" onClick={clearWebhook} disabled={!hasToken} className="btn btn--danger btn--sm">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear webhook
            </button>
            <button type="button" onClick={sendTest} disabled={!hasToken} className="btn btn--ghost btn--sm">
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Send test
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function DiscordSection() {
  const { addToast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadStatus() {
    setLoading(true);
    const response = await fetch("/api/integrations/discord");
    if (response.ok) {
      const data = await response.json();
      setConfigured(data.settings?.webhookUrl?.configured || false);
      setEnabled(Boolean(data.enabled));
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadStatus(); }, []);

  async function save() {
    setSaving(true);
    const body: Record<string, any> = { action: "update", enabled };
    if (webhookUrl) body.webhookUrl = webhookUrl;
    const response = await csrfFetch("/api/integrations/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Save failed", "error");
    } else {
      addToast("Discord settings saved", "success");
      setWebhookUrl("");
      loadStatus();
    }
  }

  async function removeWebhook() {
    const response = await csrfFetch("/api/integrations/discord", { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Failed to remove webhook", "error");
    } else {
      addToast("Webhook removed", "success");
      setConfigured(false);
      setEnabled(false);
    }
  }

  async function sendTest() {
    const response = await csrfFetch("/api/integrations/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sendTest" }),
    });
    if (!response.ok) {
      const data = await response.json();
      addToast(data.error || "Test failed", "error");
    } else {
      addToast("Test message sent", "success");
    }
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <img src="/assets/discord.svg" alt="" className="h-4 w-4" />
          Discord
        </span>
      }
      description="Webhook notifications for your Discord server"
      actions={<StatusDot tone={configured ? "success" : "neutral"}>{configured ? "Configured" : "Not configured"}</StatusDot>}
    >
      {loading ? (
        <p className="text-sm text-text-muted" aria-live="polite">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Switch
            checked={enabled}
            onChange={setEnabled}
            label="Enabled"
            description="Post release notifications to the configured webhook."
          />

          <Input
            type="url"
            label="Webhook URL"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={configured ? "Leave empty to keep the existing webhook" : "https://discord.com/api/webhooks/…"}
          />

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={saving} className="btn btn--primary btn--sm">
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? "Saving…" : "Save"}
            </button>
            {configured && (
              <button type="button" onClick={removeWebhook} className="btn btn--danger btn--sm">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remove webhook
              </button>
            )}
            <button type="button" onClick={sendTest} disabled={!configured} className="btn btn--ghost btn--sm">
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Send test
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
