"use client";

import { Key, Trash2, EyeOff, Copy, Check, Send, Webhook, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";

export function IntegrationsTab() {
  return (
    <div className="space-y-6">
      <GitHubSection />
      <TelegramSection />
      <DiscordSection />
    </div>
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
    <div className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-accent/10 p-2">
          <img src="/assets/github.svg" alt="" className="h-4 w-4" />
        </div>
        <div className="flex flex-1 items-center gap-3">
          <div>
            <h3 className="font-semibold text-text">GitHub</h3>
            <p className="text-xs text-text-muted">Personal access tokens and OAuth sign-in</p>
          </div>
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${configured ? "bg-status-success/10 text-status-success" : "bg-slate-500/10 text-text-muted"}`}>
            {configured ? "Configured" : "Not configured"}
          </span>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : (
        <div className="space-y-4">
          {rateLimit && !rateLimit.error && (
            <div className="rounded-md border border-line bg-surface p-3 text-sm">
              <p className="text-text">
                API Rate Limit: {rateLimit.used}/{rateLimit.limit} used
              </p>
              {rateLimit.reset && (
                <p className="text-text-muted">
                  Resets at: {new Date(rateLimit.reset * 1000).toLocaleString()}
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
            <div className="rounded-md border border-red-500/40 bg-status-danger/10 p-3 text-sm text-red-200">
              Rate limit check failed: {rateLimit.error} (status {rateLimit.status})
            </div>
          )}

          <label className="block text-sm">
            <span className="text-text">GitHub Personal Access Token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={configured ? "Enter new token to replace existing" : "ghp_..."}
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveToken}
              disabled={saving || !token}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Key className="h-4 w-4" />
              {saving ? "Saving..." : "Save token"}
            </button>
            {configured && (
              <button
                onClick={removeToken}
                className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm text-status-danger hover:bg-status-danger/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Remove token
              </button>
            )}
          </div>

          <details className="text-sm text-text-muted">
            <summary className="cursor-pointer hover:text-text">How to get a GitHub token?</summary>
            <div className="mt-2 rounded-md border border-line bg-surface p-3 space-y-1">
              <p>1. Go to GitHub Settings &gt; Developer settings &gt; Personal access tokens &gt; Tokens (classic)</p>
              <p>2. Click &quot;Generate new token (classic)&quot;</p>
              <p>3. Give it a name and select the <code>repo</code> scope</p>
              <p>4. Copy the generated token and paste it above</p>
            </div>
          </details>

          <div className="border-t border-line pt-4">
            <div className="mb-4 flex items-center gap-3">
              <img src="/assets/github.svg" alt="" className="h-7 w-7" />
              <div>
                <h4 className="font-semibold text-text">GitHub OAuth</h4>
                <p className="text-xs text-text-muted">Sign-In &amp; Issue Creation</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm mb-4">
              <span className="text-text">Status:</span>
              {oauthConfigured ? (
                <span className="text-status-success">OAuth configured</span>
              ) : (
                <span className="text-text-muted">Not configured</span>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm mb-4">
              <input
                type="checkbox"
                checked={oauthEnabled}
                onChange={(e) => setOauthEnabled(e.target.checked)}
                className="rounded border-line"
              />
              <span className="text-text">Enabled</span>
            </label>

            <div className="rounded-md border border-line bg-surface p-3 space-y-2 mb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Required for GitHub OAuth App setup</p>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-text-muted">Homepage URL</span>
                  <div className="mt-1 flex items-center gap-2 rounded border border-line/50 bg-black/20 px-3 py-2 font-mono text-xs text-text">
                    <span className="min-w-0 flex-1 truncate">{appUrl}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(appUrl, "appUrl")}
                      className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-white/5 hover:text-text"
                    >
                      {copiedField === "appUrl" ? <Check className="h-3.5 w-3.5 text-status-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Authorization callback URL</span>
                  <div className="mt-1 flex items-center gap-2 rounded border border-line/50 bg-black/20 px-3 py-2 font-mono text-xs text-text">
                    <span className="min-w-0 flex-1 truncate">{callbackUrl}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(callbackUrl, "callbackUrl")}
                      className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-white/5 hover:text-text"
                    >
                      {copiedField === "callbackUrl" ? <Check className="h-3.5 w-3.5 text-status-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <label className="block text-sm mb-4">
              <span className="text-text">Client ID</span>
              {oauthConfigured && showClientId ? (
                <div className="mt-1 rounded-md border border-line/70 bg-surface/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wide text-text-muted">Stored Client ID</div>
                      <div className="mt-1 truncate font-mono text-sm text-text">{oauthClientId}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClientId((v) => !v)}
                      className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text"
                    >
                      <EyeOff className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
              <input
                type="text"
                value={oauthClientId}
                onChange={(e) => {
                  setOauthClientId(e.target.value);
                  validateClientId(e.target.value);
                }}
                placeholder={oauthConfigured && !showClientId ? "Enter new Client ID to replace" : "Ov23ct... or Iv1.abc..."}
                className={`focus-ring mt-1 w-full rounded-md border bg-surface px-3 py-2 text-text ${
                  clientIdError ? "border-red-500/60" : "border-line"
                }`}
              />
              {clientIdError && <p className="mt-1 text-xs text-status-danger">{clientIdError}</p>}
            </label>

            <label className="block text-sm mb-4">
              <span className="text-text">Client Secret</span>
              {oauthConfigured && showClientSecret ? (
                <div className="mt-1 rounded-md border border-line/70 bg-surface/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wide text-text-muted">Stored Client Secret</div>
                      <div className="mt-1 truncate font-mono text-sm text-text">ghs_****</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClientSecret((v) => !v)}
                      className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text"
                    >
                      <EyeOff className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
              <input
                type="password"
                value={oauthClientSecret}
                onChange={(e) => {
                  setOauthClientSecret(e.target.value);
                  validateClientSecret(e.target.value);
                }}
                placeholder={oauthConfigured && !showClientSecret ? "Enter new secret to replace" : "Your client secret..."}
                className={`focus-ring mt-1 w-full rounded-md border bg-surface px-3 py-2 text-text ${
                  clientSecretError ? "border-red-500/60" : "border-line"
                }`}
              />
              {clientSecretError && <p className="mt-1 text-xs text-status-danger">{clientSecretError}</p>}
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={saveOauth}
                disabled={oauthSaving || !oauthClientId || !oauthClientSecret}
                className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <img src="/assets/github.svg" alt="" className="h-4 w-4" />
                {oauthSaving ? "Saving..." : "Save OAuth config"}
              </button>
              {oauthConfigured && (
                <button
                  onClick={removeOauth}
                  className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm text-status-danger hover:bg-status-danger/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove OAuth config
                </button>
              )}
            </div>

            <details className="mt-4 text-sm text-text-muted">
              <summary className="cursor-pointer hover:text-text">How to set up GitHub OAuth?</summary>
              <div className="mt-2 rounded-md border border-line bg-surface p-3 space-y-1">
                <p>1. Go to GitHub Settings &gt; Developer settings &gt; OAuth Apps &gt; New OAuth App</p>
                <p>2. Fill in the application name (e.g. &quot;LePatch&quot;)</p>
                <p>3. Paste the <strong>Homepage URL</strong> from above</p>
                <p>4. Paste the <strong>Authorization callback URL</strong> from above</p>
                <p>5. Copy the Client ID and generate a Client Secret</p>
                <p>6. Paste them above and enable the OAuth integration</p>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
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
    <div className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-accent/10 p-2">
          <Send className="h-4 w-4 text-accent" />
        </div>
        <div className="flex flex-1 items-center gap-3">
          <div>
            <h3 className="font-semibold text-text">Telegram Bot</h3>
            <p className="text-xs text-text-muted">Notifications and alerts via Telegram</p>
          </div>
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${hasToken ? "bg-status-success/10 text-status-success" : "bg-slate-500/10 text-text-muted"}`}>
            {hasToken ? "Configured" : "Not configured"}
          </span>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-line"
            />
            <span className="text-text">Enabled</span>
          </label>

          <label className="block text-sm">
            <span className="text-text">Bot token</span>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={hasToken ? "Leave empty to keep existing" : "123456:ABC-DEF1234..."}
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
            />
          </label>

          <label className="block text-sm">
            <span className="text-text">Chat ID</span>
            {hasChatId ? (
              <div className="mt-1 rounded-md border border-line/70 bg-surface/80 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-text-muted">Stored fallback Chat ID</div>
                    <div className="mt-1 truncate font-mono text-sm text-text">
                      {showStoredChatId ? storedChatId : "*".repeat(Math.max(8, storedChatId.length || 8))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStoredChatId((value) => !value)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text"
                    aria-label={showStoredChatId ? "Hide Chat ID" : "Show Chat ID"}
                  >
                    {showStoredChatId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : null}
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder={hasChatId ? "Enter a new Chat ID to replace the stored one" : "Optional fallback chat"}
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
            />
            <p className="mt-1 text-xs text-text-muted">
              Optional fallback destination. Linked Telegram Bot users receive alerts directly without this.
            </p>
          </label>

          <label className="block text-sm">
            <span className="text-text">Webhook secret</span>
            <input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="Auto-generated if empty"
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={setWebhook}
              disabled={!hasToken}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50"
            >
              <Webhook className="h-4 w-4" />
              Set webhook
            </button>
            <button
              onClick={clearWebhook}
              disabled={!hasToken}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear webhook
            </button>
            <button
              onClick={sendTest}
              disabled={!hasToken}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send test
            </button>
          </div>
        </div>
      )}
    </div>
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
    <div className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-accent/10 p-2">
          <img src="/assets/discord.svg" alt="" className="h-4 w-4" />
        </div>
        <div className="flex flex-1 items-center gap-3">
          <div>
            <h3 className="font-semibold text-text">Discord</h3>
            <p className="text-xs text-text-muted">Webhook notifications for your Discord server</p>
          </div>
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${configured ? "bg-status-success/10 text-status-success" : "bg-slate-500/10 text-text-muted"}`}>
            {configured ? "Configured" : "Not configured"}
          </span>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-line"
            />
            <span className="text-text">Enabled</span>
          </label>

          <label className="block text-sm">
            <span className="text-text">Webhook URL</span>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={configured ? "Leave empty to keep existing" : "https://discord.com/api/webhooks/..."}
              className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </button>
            {configured && (
              <button
                onClick={removeWebhook}
                className="focus-ring inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm text-status-danger hover:bg-status-danger/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Remove webhook
              </button>
            )}
            <button
              onClick={sendTest}
              disabled={!configured}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send test
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
