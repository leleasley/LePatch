"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { X, Loader2, Send, ChevronRight, FileText, Bold, Italic, Code, Link as LinkIcon, List, Quote, Strikethrough, Heading, ListOrdered, CheckSquare, Table, AtSign, Terminal, Paperclip } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { ModalShell } from "@/components/ModalShell";
import { Badge } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import { List as ListContainer, RowAvatar } from "@/components/ui/List";

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
  const btnClass = "rounded p-1 text-text-muted transition-colors hover:bg-surface hover:text-text";
  const iconClass = "h-3.5 w-3.5";
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      <button type="button" onClick={() => onInsert(fieldId, "**", "**")} className={btnClass} title="Bold" aria-label="Bold"><Bold className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "*", "*")} className={btnClass} title="Italic" aria-label="Italic"><Italic className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "~~", "~~")} className={btnClass} title="Strikethrough" aria-label="Strikethrough"><Strikethrough className={iconClass} aria-hidden="true" /></button>
      <div className="mx-1 h-4 w-px bg-border" />
      <button type="button" onClick={() => onInsert(fieldId, "# ")} className={btnClass} title="Heading" aria-label="Heading"><Heading className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "`", "`")} className={btnClass} title="Inline code" aria-label="Inline code"><Code className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n```\n", "\n```\n")} className={btnClass} title="Code block" aria-label="Code block"><Terminal className={iconClass} aria-hidden="true" /></button>
      <div className="mx-1 h-4 w-px bg-border" />
      <button type="button" onClick={() => onInsert(fieldId, "[", "](url)")} className={btnClass} title="Link" aria-label="Link"><LinkIcon className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n- ")} className={btnClass} title="Unordered list" aria-label="Unordered list"><List className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n1. ")} className={btnClass} title="Ordered list" aria-label="Ordered list"><ListOrdered className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n- [ ] ")} className={btnClass} title="Task list" aria-label="Task list"><CheckSquare className={iconClass} aria-hidden="true" /></button>
      <div className="mx-1 h-4 w-px bg-border" />
      <button type="button" onClick={() => onInsert(fieldId, "\n> ")} className={btnClass} title="Quote" aria-label="Quote"><Quote className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "\n| Col 1 | Col 2 |\n|------|------|\n| Cell | Cell |\n")} className={btnClass} title="Table" aria-label="Table"><Table className={iconClass} aria-hidden="true" /></button>
      <button type="button" onClick={() => onInsert(fieldId, "@")} className={btnClass} title="Mention" aria-label="Mention"><AtSign className={iconClass} aria-hidden="true" /></button>
      <span className="ml-auto text-[10px] text-text-faint">Markdown</span>
    </div>
  );
}

const textareaClass =
  "w-full resize-y border-0 bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none";

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
      title={step === "choose" ? "New issue" : selectedTemplate?.name || "New issue"}
      panelClassName="flex w-auto max-w-lg flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-text">
          {step === "choose" ? "New issue" : selectedTemplate?.name || "New issue"}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="icon-button -mr-1">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {step === "choose" && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Creating an issue on <span className="mono text-text">{owner}/{repo}</span>
            </p>

            {loadingTemplates ? (
              <div className="flex items-center justify-center gap-2 py-8" aria-live="polite">
                <Loader2 className="h-4 w-4 spin text-accent" aria-hidden="true" />
                <span className="text-sm text-text-muted">Loading templates…</span>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-panel">
                <ListContainer>
                  {templates.map((template) => (
                    <li key={template.name}>
                      <button
                        type="button"
                        onClick={() => selectTemplate(template)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                      >
                        <RowAvatar tone="accent"><FileText className="h-4 w-4" aria-hidden="true" /></RowAvatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text">{template.name}</span>
                          {template.description && (
                            <span className="mt-0.5 block truncate text-xs text-text-muted">{template.description}</span>
                          )}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-text-faint" aria-hidden="true" />
                      </button>
                    </li>
                  ))}

                  {blankEnabled && (
                    <li>
                      <button
                        type="button"
                        onClick={() => selectTemplate(null)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                      >
                        <RowAvatar><Send className="h-4 w-4" aria-hidden="true" /></RowAvatar>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-text">Blank issue</span>
                          <span className="mt-0.5 block text-xs text-text-muted">Open a blank issue without a template</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-text-faint" aria-hidden="true" />
                      </button>
                    </li>
                  )}
                </ListContainer>
              </div>
            )}

            {!loadingTemplates && !hasTemplates && !blankEnabled && (
              <p className="py-6 text-center text-sm text-text-muted">
                No issue templates available for this repository.
              </p>
            )}
          </div>
        )}

        {step === "form" && (
          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Title *"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedTemplate?.title || "Issue title"}
              required
              maxLength={256}
              data-autofocus
              className="mt-1"
            />

            {selectedTemplate && selectedTemplate.body.map((field, index) => {
              const fieldKey = field.id || `field-${index}`;
              const label = `${field.attributes.label || field.id}${field.validations?.required ? " *" : ""}`;
              if (field.type === "markdown") {
                return (
                  <div key={fieldKey} className="whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-xs leading-relaxed text-text-muted">
                    {field.attributes.value}
                  </div>
                );
              }

              if (field.type === "textarea") {
                return (
                  <Field key={fieldKey} label={label} htmlFor={`ta-${fieldKey}`} hint={field.attributes.description}>
                    <div className="mt-1 overflow-hidden rounded-md border border-border">
                      <MarkdownToolbar fieldId={fieldKey} onInsert={handleInsert} />
                      <textarea
                        id={`ta-${fieldKey}`}
                        value={fieldValues[fieldKey] || ""}
                        onChange={(e) => setFieldValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                        placeholder={field.attributes.placeholder}
                        rows={4}
                        required={field.validations?.required}
                        className={textareaClass}
                      />
                      <div className="flex items-center gap-1.5 border-t border-border px-3 py-1.5 text-xs text-text-muted">
                        <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
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
                  </Field>
                );
              }

              if (field.type === "input") {
                return (
                  <Input
                    key={fieldKey}
                    label={label}
                    hint={field.attributes.description}
                    type="text"
                    value={fieldValues[fieldKey] || ""}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                    placeholder={field.attributes.placeholder}
                    required={field.validations?.required}
                    className="mt-1"
                  />
                );
              }

              if (field.type === "dropdown") {
                return (
                  <Select
                    key={fieldKey}
                    label={label}
                    hint={field.attributes.description}
                    value={fieldValues[fieldKey] || ""}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))}
                    required={field.validations?.required}
                    className="mt-1"
                  >
                    <option value="">Select…</option>
                    {(field.attributes.options || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </Select>
                );
              }

              return null;
            })}

            {!selectedTemplate && (
              <Field label="Description" htmlFor="ta-blank-body">
                <div className="mt-1 overflow-hidden rounded-md border border-border">
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
                    className={textareaClass}
                  />
                  <div className="flex items-center gap-1.5 border-t border-border px-3 py-1.5 text-xs text-text-muted">
                    <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
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
              </Field>
            )}

            {selectedTemplate ? (
              <div className="text-sm">
                <span className="font-medium text-text">Labels</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selectedTemplate.labels.map((label) => (
                    <Badge key={label} tone="neutral">{label}</Badge>
                  ))}
                  {selectedTemplate.labels.length === 0 && (
                    <span className="text-xs text-text-muted">No labels</span>
                  )}
                </div>
              </div>
            ) : (
              <Input
                label="Labels"
                type="text"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="bug, enhancement (comma-separated)"
                className="mt-1"
              />
            )}

            {error && (
              <p role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={() => setStep("choose")} className="btn btn--secondary">
                Back
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn btn--ghost">
                  Cancel
                </button>
                <button type="submit" disabled={loading || !title.trim()} className="btn btn--primary">
                  {loading ? (
                    <><Loader2 className="h-4 w-4 spin" aria-hidden="true" /> Creating…</>
                  ) : (
                    <><Send className="h-4 w-4" aria-hidden="true" /> Create issue</>
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
