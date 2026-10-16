"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input, Switch } from "@/components/ui/Input";
import { Panel } from "@/components/ui/List";
import { cn } from "@/lib/cn";

const steps = ["Account", "App URL", "GitHub", "Telegram", "Discord", "Finish"];

type SetupData = {
  email: string;
  password: string;
  confirmPassword: string;
  appUrl: string;
  githubToken: string;
  telegramEnabled: boolean;
  botToken: string;
  chatId: string;
  webhookSecret: string;
  discordEnabled: boolean;
  webhookUrl: string;
};

const initialData: SetupData = {
  email: "",
  password: "",
  confirmPassword: "",
  appUrl: "http://localhost:3000",
  githubToken: "",
  telegramEnabled: false,
  botToken: "",
  chatId: "",
  webhookSecret: "",
  discordEnabled: false,
  webhookUrl: "",
};

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<SetupData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testOk, setTestOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof SetupData, value: string | boolean) {
    setData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function validateStep(): boolean {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (!data.email) e.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = "Invalid email format";
      if (!data.password) e.password = "Password is required";
      else if (data.password.length < 10) e.password = "Password must be at least 10 characters";
      if (data.password !== data.confirmPassword) e.confirmPassword = "Passwords do not match";
    }
    if (step === 2) {
      if (!data.appUrl) e.appUrl = "App URL is required";
    }
    if (step === 4 && data.telegramEnabled) {
      if (!data.botToken) e.botToken = "Bot token is required";
      if (!data.chatId) e.chatId = "Chat ID is required";
    }
    if (step === 5 && data.discordEnabled) {
      if (!data.webhookUrl) e.webhookUrl = "Webhook URL is required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (validateStep()) setStep((s) => Math.min(s + 1, 6));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 1));
    setErrors({});
    setTestMessage("");
  }

  async function testService(type: "github" | "telegram" | "discord") {
    setTesting(type);
    setTestMessage("");
    setTestOk(false);
    const body: Record<string, string> = { type };
    if (type === "github") body.githubToken = data.githubToken;
    if (type === "telegram") {
      body.botToken = data.botToken;
      body.chatId = data.chatId;
    }
    if (type === "discord") body.webhookUrl = data.webhookUrl;
    try {
      const res = await fetch("/api/setup/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setTestMessage("Connection successful");
        setTestOk(true);
      } else {
        const json = await res.json();
        setTestMessage(json.error || "Connection failed");
      }
    } catch {
      setTestMessage("Connection failed");
    } finally {
      setTesting(null);
    }
  }

  async function complete() {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
        appUrl: data.appUrl,
      };
      if (data.githubToken) body.githubToken = data.githubToken;
      if (data.telegramEnabled) {
        body.telegram = {
          botToken: data.botToken,
          chatId: data.chatId,
          webhookSecret: data.webhookSecret,
        };
      }
      if (data.discordEnabled) {
        body.discord = { webhookUrl: data.webhookUrl };
      }
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        setErrors({ form: json.error || "Setup failed" });
        setSubmitting(false);
        return;
      }
      router.push("/login");
    } catch {
      setErrors({ form: "Setup failed" });
      setSubmitting(false);
    }
  }

  const review: Array<{ label: string; value: string; ok?: boolean }> = [
    { label: "Admin", value: data.email },
    { label: "App URL", value: data.appUrl },
    { label: "GitHub", value: data.githubToken ? "Configured" : "Not configured", ok: Boolean(data.githubToken) },
    { label: "Telegram", value: data.telegramEnabled ? "Enabled" : "Not configured", ok: data.telegramEnabled },
    { label: "Discord", value: data.discordEnabled ? "Enabled" : "Not configured", ok: data.discordEnabled },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-text">
            Step {step} of {steps.length}
          </span>
          <span className="text-text-faint">{steps[step - 1]}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${(step / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={data.email}
            onChange={(e) => update("email", e.target.value)}
            error={errors.email}
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters"
            value={data.password}
            onChange={(e) => update("password", e.target.value)}
            error={errors.password}
          />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={data.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            error={errors.confirmPassword}
          />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <Input
            label="Public app URL"
            type="text"
            value={data.appUrl}
            onChange={(e) => update("appUrl", e.target.value)}
            error={errors.appUrl}
            autoFocus
          />
          <p className="text-xs text-text-muted">
            The HTTPS URL your instance is served on. Used for links in release notifications and webhook callbacks.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <Input
            label="GitHub token (optional)"
            type="password"
            value={data.githubToken}
            onChange={(e) => update("githubToken", e.target.value)}
            autoFocus
          />
          <p className="text-xs text-text-muted">
            A classic token with the <code className="font-mono text-accent">public_repo</code> scope. GitHub works
            without a token but rate limits are lower.
          </p>
          {data.githubToken && (
            <button
              type="button"
              onClick={() => testService("github")}
              disabled={testing === "github"}
              className="btn btn--secondary btn--sm self-start"
            >
              {testing === "github" ? "Testing…" : "Test connection"}
            </button>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <Switch
            checked={data.telegramEnabled}
            onChange={(next) => update("telegramEnabled", next)}
            label="Enable Telegram"
            description="Send release notifications to a Telegram chat."
          />
          {data.telegramEnabled && (
            <div className="flex flex-col gap-4">
              <Input
                label="Bot token"
                type="password"
                value={data.botToken}
                onChange={(e) => update("botToken", e.target.value)}
                error={errors.botToken}
                autoFocus
              />
              <Input
                label="Chat ID"
                type="text"
                value={data.chatId}
                onChange={(e) => update("chatId", e.target.value)}
                error={errors.chatId}
              />
              <Input
                label="Webhook secret (optional)"
                type="password"
                hint="Verifies incoming Telegram webhook requests."
                value={data.webhookSecret}
                onChange={(e) => update("webhookSecret", e.target.value)}
              />
              <button
                type="button"
                onClick={() => testService("telegram")}
                disabled={testing === "telegram"}
                className="btn btn--secondary btn--sm self-start"
              >
                {testing === "telegram" ? "Testing…" : "Send test message"}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-4">
          <Switch
            checked={data.discordEnabled}
            onChange={(next) => update("discordEnabled", next)}
            label="Enable Discord"
            description="Send release notifications to a Discord webhook."
          />
          {data.discordEnabled && (
            <div className="flex flex-col gap-4">
              <Input
                label="Webhook URL"
                type="text"
                value={data.webhookUrl}
                onChange={(e) => update("webhookUrl", e.target.value)}
                error={errors.webhookUrl}
                autoFocus
              />
              <button
                type="button"
                onClick={() => testService("discord")}
                disabled={testing === "discord"}
                className="btn btn--secondary btn--sm self-start"
              >
                {testing === "discord" ? "Testing…" : "Send test message"}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 6 && (
        <div className="flex flex-col gap-3">
          <Panel flush>
            <dl className="divide-y divide-divider text-sm">
              {review.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <dt className="text-text-muted">{row.label}</dt>
                  <dd className={row.ok ? "text-status-success" : "text-text"}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <p className="text-xs text-text-muted">You&apos;ll be redirected to the login page when setup completes.</p>
        </div>
      )}

      {testMessage && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            testOk
              ? "border-status-success/40 bg-status-success/10 text-status-success"
              : "border-status-danger/40 bg-status-danger/10 text-status-danger"
          )}
        >
          {testMessage}
        </p>
      )}

      {errors.form && (
        <p role="alert" className="rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {errors.form}
        </p>
      )}

      <div className="flex gap-2">
        {step > 1 && step < 6 && (
          <button type="button" onClick={back} className="btn btn--secondary flex-1">
            Back
          </button>
        )}
        {step < 6 ? (
          <button type="button" onClick={next} className="btn btn--primary flex-1">
            Next
          </button>
        ) : (
          <button type="button" onClick={complete} disabled={submitting} className="btn btn--primary w-full">
            {submitting ? "Setting up…" : "Complete setup"}
          </button>
        )}
      </div>
    </div>
  );
}
