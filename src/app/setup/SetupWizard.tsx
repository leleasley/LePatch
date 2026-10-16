"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

  function inputClass(field: string) {
    return `focus-ring mt-1 w-full rounded-md border ${errors[field] ? "border-red-500/40" : "border-line"} bg-surface px-3 py-2 text-white`;
  }

  function errorText(field: string) {
    return errors[field] ? <p className="mt-1 text-xs text-red-400">{errors[field]}</p> : null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {steps.map((label, i) => {
          const num = i + 1;
          const active = num === step;
          const done = num < step;
          return (
            <div key={label} className="flex flex-col items-center">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                active ? "bg-cyan-500 text-slate-950" : done ? "bg-emerald-500/20 text-emerald-400" : "bg-surface text-slate-500"
              }`}>
                {done ? "✓" : num}
              </div>
              <span className={`mt-1 text-[10px] ${active ? "text-cyan-400" : "text-slate-500"}`}>{label}</span>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-300">Email</span>
            <input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} className={inputClass("email")} autoFocus />
            {errorText("email")}
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Password</span>
            <input type="password" value={data.password} onChange={(e) => update("password", e.target.value)} className={inputClass("password")} />
            <p className="mt-1 text-xs text-slate-500">At least 10 characters</p>
            {errorText("password")}
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Confirm Password</span>
            <input type="password" value={data.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} className={inputClass("confirmPassword")} />
            {errorText("confirmPassword")}
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-300">Public App URL</span>
            <input type="text" value={data.appUrl} onChange={(e) => update("appUrl", e.target.value)} className={inputClass("appUrl")} autoFocus />
            {errorText("appUrl")}
          </label>
          <p className="text-xs text-slate-500">
            Enter the HTTPS URL that your LePatch instance is exposed through your reverse proxy. This is used for links in release notifications and webhook callbacks.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="text-slate-300">GitHub Personal Access Token</span>
            <input type="password" value={data.githubToken} onChange={(e) => update("githubToken", e.target.value)} className={inputClass("githubToken")} autoFocus />
          </label>
          <p className="text-xs text-slate-500">
            Optional. Create a classic token at GitHub Settings → Developer settings → Personal access tokens → Tokens (classic). Only needs <code className="text-cyan-400">public_repo</code> scope for public repos. GitHub works without a token but has stricter API rate limits.
          </p>
          {data.githubToken && (
            <button onClick={() => testService("github")} disabled={testing === "github"} className="focus-ring rounded-md border border-line bg-surface px-4 py-2 text-sm text-slate-300 hover:bg-panel transition-colors disabled:opacity-60">
              {testing === "github" ? "Testing..." : "Test GitHub connection"}
            </button>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <span className="text-slate-300">Enable Telegram</span>
            <input type="checkbox" checked={data.telegramEnabled} onChange={(e) => update("telegramEnabled", e.target.checked)} className="h-4 w-4 accent-cyan-500" />
          </label>
          {data.telegramEnabled && (
            <>
              <label className="block text-sm">
                <span className="text-slate-300">Bot Token</span>
                <input type="password" value={data.botToken} onChange={(e) => update("botToken", e.target.value)} className={inputClass("botToken")} autoFocus />
                {errorText("botToken")}
              </label>
              <label className="block text-sm">
                <span className="text-slate-300">Chat ID</span>
                <input type="text" value={data.chatId} onChange={(e) => update("chatId", e.target.value)} className={inputClass("chatId")} />
                {errorText("chatId")}
              </label>
              <label className="block text-sm">
                <span className="text-slate-300">Webhook Secret</span>
                <input type="password" value={data.webhookSecret} onChange={(e) => update("webhookSecret", e.target.value)} className={inputClass("webhookSecret")} />
                <p className="mt-1 text-xs text-slate-500">Optional. Used to verify incoming Telegram webhook requests.</p>
              </label>
              <button onClick={() => testService("telegram")} disabled={testing === "telegram"} className="focus-ring rounded-md border border-line bg-surface px-4 py-2 text-sm text-slate-300 hover:bg-panel transition-colors disabled:opacity-60">
                {testing === "telegram" ? "Testing..." : "Send test Telegram message"}
              </button>
            </>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <span className="text-slate-300">Enable Discord</span>
            <input type="checkbox" checked={data.discordEnabled} onChange={(e) => update("discordEnabled", e.target.checked)} className="h-4 w-4 accent-cyan-500" />
          </label>
          {data.discordEnabled && (
            <>
              <label className="block text-sm">
                <span className="text-slate-300">Webhook URL</span>
                <input type="text" value={data.webhookUrl} onChange={(e) => update("webhookUrl", e.target.value)} className={inputClass("webhookUrl")} autoFocus />
                {errorText("webhookUrl")}
              </label>
              <button onClick={() => testService("discord")} disabled={testing === "discord"} className="focus-ring rounded-md border border-line bg-surface px-4 py-2 text-sm text-slate-300 hover:bg-panel transition-colors disabled:opacity-60">
                {testing === "discord" ? "Testing..." : "Send test Discord message"}
              </button>
            </>
          )}
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Review your configuration:</p>
          <div className="rounded-md border border-line bg-surface p-4 text-sm space-y-2">
            <p><span className="text-slate-400">Admin:</span> <span className="text-white">{data.email}</span></p>
            <p><span className="text-slate-400">App URL:</span> <span className="text-white">{data.appUrl}</span></p>
            <p><span className="text-slate-400">GitHub:</span> <span className={data.githubToken ? "text-emerald-400" : "text-slate-500"}>{data.githubToken ? "Configured" : "Not configured"}</span></p>
            <p><span className="text-slate-400">Telegram:</span> <span className={data.telegramEnabled ? "text-emerald-400" : "text-slate-500"}>{data.telegramEnabled ? "Enabled" : "Not configured"}</span></p>
            <p><span className="text-slate-400">Discord:</span> <span className={data.discordEnabled ? "text-emerald-400" : "text-slate-500"}>{data.discordEnabled ? "Enabled" : "Not configured"}</span></p>
          </div>
          <p className="text-xs text-slate-500">After setup completes, you will be redirected to the login page.</p>
        </div>
      )}

      {testMessage && (
        <p className={`rounded-md border px-3 py-2 text-sm ${
          testOk ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-red-500/40 bg-red-500/10 text-red-200"
        }`}>
          {testMessage}
        </p>
      )}

      {errors.form && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{errors.form}</p>
      )}

      <div className="flex gap-3">
        {step > 1 && step < 6 && (
          <button onClick={back} className="focus-ring flex-1 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-slate-300 hover:bg-panel transition-colors">
            Back
          </button>
        )}
        {step < 6 ? (
          <button onClick={next} className="focus-ring flex-1 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 transition-colors">
            Next
          </button>
        ) : (
          <button onClick={complete} disabled={submitting} className="focus-ring w-full rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-60">
            {submitting ? "Setting up..." : "Complete Setup"}
          </button>
        )}
      </div>
    </div>
  );
}
