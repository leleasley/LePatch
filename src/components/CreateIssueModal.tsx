"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { X, Loader2, Send, ChevronRight, FileText, Bold, Italic, Code, Link as LinkIcon, List, Quote, Strikethrough, Heading, ListOrdered, CheckSquare, Table, AtSign, Terminal, Paperclip } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { ModalShell } from "@/components/ModalShell";

type TemplateField = {
  type: string;
  id: string;
  attributes: {
    label?: string;
    description?: string;
    placeholder?: string;
    value?: string;
    options?: string[];
  };
  validations?: { required?: boolean };
};

type IssueTemplate = {
  name: string;
  description: string;
  title: string;
  labels: string[];
  body: TemplateField[];
};

type CreateIssueModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  owner: string;
  repo: string;
};

function MarkdownToolbar({ fieldId, onInsert }: { fieldId: string; onInsert: (fieldId: string, before: string, after?: string) => void }) {
  const btnClass = "rounded p-1 text-text-muted hover:bg-surface hover:text-text";
  const iconClass = "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5 border-b border-line px-2 py-1 flex-wrap">
      <button type="button" onClick={() => onInsert(fieldId, "**", "**")} className={btnClass} title="Bold"><Bold className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "*", "*")} className={btnClass} title="Italic"><Italic className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "~~", "~~")} className={btnClass} title="Strikethrough"><Strikethrough className={iconClass} /></button>
      <div className="mx-1 h-4 w-px bg-line/50" />
      <button type="button" onClick={() => onInsert(fieldId, "# ")} className={btnClass} title="Heading"><Heading className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "`", "`")} className={btnClass} title="Inline code"><Code className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n```\n", "\n```\n")} className={btnClass} title="Code block"><Terminal className={iconClass} /></button>
      <div className="mx-1 h-4 w-px bg-line/50" />
      <button type="button" onClick={() => onInsert(fieldId, "[", "](url)")} className={btnClass} title="Link"><LinkIcon className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n- ")} className={btnClass} title="Unordered list"><List className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n1. ")} className={btnClass} title="Ordered list"><ListOrdered className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n- [ ] ")} className={btnClass} title="Task list"><CheckSquare className={iconClass} /></button>
      <div className="mx-1 h-4 w-px bg-line/50" />
      <button type="button" onClick={() => onInsert(fieldId, "\n> ")} className={btnClass} title="Quote"><Quote className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n| Col 1 | Col 2 |\n|------|------|\n| Cell | Cell |\n")} className={btnClass} title="Table"><Table className={iconClass} /></button>
      <button type="button" onClick={() => onInsert(fieldId, "@")} className={btnClass} title="Mention"><AtSign className={iconClass} /></button>
      <div className="ml-auto text-[10px] text-text-faint">Markdown</div>
    </div>
  );
}

export function CreateIssueModal({ open, onClose, onCreated, owner, repo }: CreateIssueModalProps) {
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [templates, setTemplates] = useState<IssueTemplate[]>([]);
  const [blankEnabled, setBlankEnabled] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<IssueTemplate | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [labels, setLabels] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchTemplates = useCallback(async () => {
    startTransition(() => setLoadingTemplates(true));
    try {
      const res = await fetch(`/api/github/issue-templates?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
      if (res.ok) {
        const data = await res.json();
        startTransition(() => { setTemplates(data.templates || []); setBlankEnabled(data.blankEnabled !== false); });
      }
    } catch {
      // Templates unavailable, allow blank issue
    } finally {
      startTransition(() => setLoadingTemplates(false));
    }
  }, [owner, repo]);

  useEffect(() => {
    if (open) {
      startTransition(() => {
        setStep("choose");
        setSelectedTemplate(null);
        setTitle("");
        setBody("");
        setLabels("");
        setFieldValues({});
        setError("");
      });
      fetchTemplates();
    }
  }, [open, fetchTemplates]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  function selectTemplate(template: IssueTemplate | null) {
    setSelectedTemplate(template);
    if (template) {
      setTitle(template.title || "");
      setLabels(template.labels.join(", "));
      const defaults: Record<string, string> = {};
      template.body.forEach((field, i) => {
        const key = field.id || `f${i}`;
        if (field.type === "markdown") return;
        if (field.attributes.value) defaults[key] = field.attributes.value;
      });
      setFieldValues(defaults);
    } else {
      setTitle("");
      setLabels("");
      setFieldValues({});
    }
    setBody("");
    setStep("form");
  }

  function handleInsert(fieldId: string, before: string, after?: string) {
    const id = `ta-${fieldId}`;
    const textarea = document.getElementById(id) as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = fieldValues[fieldId] || "";
    const selected = current.substring(start, end);
    const newText = current.substring(0, start) + before + selected + (after || "") + current.substring(end);
    setFieldValues((prev) => ({ ...prev, [fieldId]: newText }));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  }

  function buildBody(): string {
    if (!selectedTemplate) return body.trim();

    const sections: string[] = [];
    selectedTemplate.body.forEach((field, i) => {
      if (field.type === "markdown") return;
      if (!field.id || !field.attributes.label) return;
      const key = field.id || `f${i}`;
      const value = fieldValues[key] || "";
      if (field.type === "textarea") {
        const lines = value.split("\n");
        if (lines.length > 0 && lines[0]) {
          sections.push(`### ${field.attributes.label}\n\n${value}`);
        }
      } else {
        sections.push(`### ${field.attributes.label}\n\n${value || "_No response_"}`);
      }
    });
    return sections.join("\n\n");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError("");

    const parsedLabels = labels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);

    const issueBody = buildBody();

    try {
      const response = await csrfFetch("/api/github/create-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          title: title.trim(),
          body: issueBody || undefined,
          labels: parsedLabels.length > 0 ? parsedLabels : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to create issue");
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError("Failed to create issue");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const hasTemplates = templates.length > 0;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      panelClassName="flex w-auto max-w-lg flex-col overflow-hidden"
    >
        <div className="flex items-center justify-between border-b border-line px-5 py-4 shrink-0">
          <h2 className="text-lg font-semibold text-text">
            {step === "choose" ? "New Issue" : selectedTemplate?.name || "New Issue"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-auto flex-1 p-5">
          {step === "choose" && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted mb-4">
                Creating issue on <span className="font-mono text-text">{owner}/{repo}</span>
              </p>

              {loadingTemplates ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  <span className="text-sm text-text-muted">Loading templates...</span>
                </div>
              ) : (
                <>
                  {hasTemplates && (
                    <div className="space-y-2">
                      {templates.map((template) => (
                        <button
                          key={template.name}
                          onClick={() => selectTemplate(template)}
                          className="group flex w-full items-center gap-3 rounded-lg border border-line/50 bg-surface p-3 text-left transition-colors hover:border-line hover:bg-panel"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10">
                            <FileText className="h-4 w-4 text-accent" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-text group-hover:text-accent transition-colors">
                              {template.name}
                            </div>
                            {template.description && (
                              <div className="mt-0.5 text-xs text-text-muted line-clamp-1">
                                {template.description}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-text-faint group-hover:text-text-muted transition-colors" />
                        </button>
                      ))}
                    </div>
                  )}

                  {blankEnabled && hasTemplates && (
                    <div className="flex items-center gap-3 my-3">
                      <div className="h-px flex-1 bg-line/50" />
                      <span className="text-xs uppercase tracking-wider text-text-faint">or</span>
                      <div className="h-px flex-1 bg-line/50" />
                    </div>
                  )}

                  {blankEnabled && (
                    <button
                      onClick={() => selectTemplate(null)}
                      className="group flex w-full items-center gap-3 rounded-lg border border-dashed border-line/50 bg-transparent p-3 text-left transition-colors hover:border-line hover:bg-surface"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5">
                        <Send className="h-4 w-4 text-text-muted" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text group-hover:text-text transition-colors">
                          Blank issue
                        </div>
                        <div className="mt-0.5 text-xs text-text-faint">
                          Open a blank issue without a template
                        </div>
                      </div>
                    </button>
                  )}

                  {!loadingTemplates && !hasTemplates && !blankEnabled && (
                    <p className="text-sm text-text-muted text-center py-6">
                      No issue templates available for this repository.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {step === "form" && (
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm">
                <span className="text-text font-medium">Title *</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={selectedTemplate?.title || "Issue title"}
                  required
                  maxLength={256}
                  className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text placeholder:text-text-faint"
                  autoFocus
                />
              </label>

              {selectedTemplate && selectedTemplate.body.map((field, index) => {
                const fieldKey = field.id || `field-${index}`;
                if (field.type === "markdown") {
                  return (
                    <div key={fieldKey} className="rounded-md border border-line bg-surface p-3 text-xs text-text-muted whitespace-pre-wrap leading-relaxed">
                      {field.attributes.value}
                    </div>
                  );
                }

                if (field.type === "textarea") {
                  return (
                    <div key={fieldKey} className="block text-sm">
                      <span className="text-text font-medium">
                        {field.attributes.label || field.id}
                        {field.validations?.required && " *"}
                      </span>
                      {field.attributes.description && (
                        <span className="block mt-0.5 text-xs text-text-muted font-normal">
                          {field.attributes.description.split("\n").map((line, i) => <span key={i}>{line}<br /></span>)}
                        </span>
                      )}
                      <div className="mt-1 rounded-md border border-line overflow-hidden">
                        <MarkdownToolbar fieldId={fieldKey} onInsert={handleInsert} />
                        <textarea
                          id={`ta-${fieldKey}`}
                          value={fieldValues[fieldKey] || ""}
                          onChange={(e) => setFieldValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                          placeholder={field.attributes.placeholder}
                          rows={4}
                          required={field.validations?.required}
                          className="w-full border-0 bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint resize-y focus:outline-none"
                        />
                        <div className="border-t border-line px-3 py-1.5 text-xs text-text-muted flex items-center gap-1.5">
                          <Paperclip className="h-3 w-3 shrink-0" />
                          <span>Attach files by dragging &amp; dropping, <button type="button" className="text-accent hover:underline" onClick={() => document.getElementById(`file-${fieldKey}`)?.click()}>selecting</button> or pasting them.</span>
                          <input id={`file-${fieldKey}`} type="file" multiple className="hidden" onChange={(e) => {
                            if (e.target.files?.length) {
                              const names = Array.from(e.target.files).map(f => f.name).join(", ");
                              setFieldValues((prev) => ({ ...prev, [fieldKey]: (prev[fieldKey] || "") + `\n[Attached: ${names}]` }));
                            }
                            e.target.value = "";
                          }} />
                        </div>
                      </div>
                    </div>
                  );
                }

                if (field.type === "input") {
                  return (
                    <div key={fieldKey} className="block text-sm">
                      <span className="text-text font-medium">
                        {field.attributes.label || field.id}
                        {field.validations?.required && " *"}
                      </span>
                      {field.attributes.description && (
                        <span className="block mt-0.5 text-xs text-text-muted font-normal">{field.attributes.description}</span>
                      )}
                      <input
                        type="text"
                        value={fieldValues[fieldKey] || ""}
                        onChange={(e) => setFieldValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                        placeholder={field.attributes.placeholder}
                        required={field.validations?.required}
                        className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text placeholder:text-text-faint"
                      />
                    </div>
                  );
                }

                if (field.type === "dropdown") {
                  return (
                    <div key={fieldKey} className="block text-sm">
                      <span className="text-text font-medium">
                        {field.attributes.label || field.id}
                        {field.validations?.required && " *"}
                      </span>
                      {field.attributes.description && (
                        <span className="block mt-0.5 text-xs text-text-muted font-normal">{field.attributes.description}</span>
                      )}
                      <select
                        value={fieldValues[fieldKey] || ""}
                        onChange={(e) => setFieldValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                        required={field.validations?.required}
                        className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
                      >
                        <option value="">Select...</option>
                        {(field.attributes.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                return null;
              })}

              {!selectedTemplate && (
                <div className="block text-sm">
                  <span className="text-text font-medium">Description</span>
                  <div className="mt-1 rounded-md border border-line overflow-hidden">
                    <MarkdownToolbar fieldId="blank-body" onInsert={(_, before, after) => {
                      const textarea = document.getElementById("ta-blank-body") as HTMLTextAreaElement;
                      if (!textarea) return;
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const selected = body.substring(start, end);
                      const newText = body.substring(0, start) + before + selected + (after || "") + body.substring(end);
                      setBody(newText);
                      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + before.length, start + before.length + selected.length); }, 0);
                    }} />
                    <textarea
                      id="ta-blank-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Describe the issue (markdown supported)"
                      rows={6}
                      className="w-full border-0 bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint resize-y focus:outline-none"
                    />
                    <div className="border-t border-line px-3 py-1.5 text-xs text-text-muted flex items-center gap-1.5">
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span>Attach files by dragging &amp; dropping, <button type="button" className="text-accent hover:underline" onClick={() => document.getElementById("file-blank-body")?.click()}>selecting</button> or pasting them.</span>
                      <input id="file-blank-body" type="file" multiple className="hidden" onChange={(e) => {
                        if (e.target.files?.length) {
                          const names = Array.from(e.target.files).map(f => f.name).join(", ");
                          setBody((prev) => prev + `\n[Attached: ${names}]`);
                        }
                        e.target.value = "";
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {selectedTemplate ? (
                <div className="text-sm">
                  <span className="text-text font-medium">Labels</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selectedTemplate.labels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent"
                      >
                        {label}
                      </span>
                    ))}
                    {selectedTemplate.labels.length === 0 && (
                      <span className="text-xs text-text-muted">No labels</span>
                    )}
                  </div>
                </div>
              ) : (
                <label className="block text-sm">
                  <span className="text-text font-medium">Labels</span>
                  <input
                    type="text"
                    value={labels}
                    onChange={(e) => setLabels(e.target.value)}
                    placeholder="bug, enhancement (comma-separated)"
                    className="focus-ring mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-text placeholder:text-text-faint"
                  />
                </label>
              )}

              {error && (
                <p className="rounded-md border border-red-500/40 bg-status-danger/10 px-3 py-2 text-sm text-red-200">{error}</p>
              )}

              <div className="flex justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("choose")}
                  className="rounded-md border border-line px-4 py-2 text-sm text-text hover:bg-white/5 transition-colors"
                >
                  Back
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-line px-4 py-2 text-sm text-text hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !title.trim()}
                    className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                    ) : (
                      <><Send className="h-4 w-4" /> Create Issue</>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
    </ModalShell>
  );
}
