import { NextRequest, NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { fetchRepoWithAccess, githubFetch } from "@/lib/github";
import { logger } from "@/lib/logger";
import { parse } from "yaml";

type TemplateField = {
  type: string;
  id: string;
  attributes: {
    label?: string;
    description?: string;
    placeholder?: string;
    value?: string;
    options?: string[];
    render?: string;
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

export async function GET(request: NextRequest) {
  try {
    const session = await assertApiSession();
    const owner = request.nextUrl.searchParams.get("owner")?.trim();
    const repo = request.nextUrl.searchParams.get("repo")?.trim();

    if (!owner || !repo) {
      throw new Error("owner and repo are required");
    }

    const { templates, blankEnabled } = await fetchRepoWithAccess(session.userId, async (token) => {
      const templates: IssueTemplate[] = [];
      let blankEnabled = true;
      const rawHeaders: Record<string, string> = { "User-Agent": "LePatch" };
      if (token) rawHeaders.Authorization = `Bearer ${token}`;

      try {
        const contents = await githubFetch<Array<{ name: string; path: string; type: string }>>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/.github/ISSUE_TEMPLATE`,
          undefined,
          token
        );

      const ymlFiles = contents.filter(
        (f) => f.type === "file" && (f.name.endsWith(".yml") || f.name.endsWith(".yaml"))
      );

      for (const file of ymlFiles) {
        if (file.name === "config.yml") {
          try {
            const configRes = await fetch(
              `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/main/${file.path}`,
              { headers: rawHeaders, next: { revalidate: 300 } }
            );
            if (configRes.ok) {
              const configText = await configRes.text();
              const configYaml = parse(configText) as Record<string, unknown>;
              if (configYaml?.blank_issues_enabled === false) blankEnabled = false;
            }
          } catch (err) {
            logger.debug("Failed to read issue config", err);
          }
          continue;
        }

        try {
          const response = await fetch(
            `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/main/${file.path}`,
            { headers: rawHeaders, next: { revalidate: 300 } }
          );
          if (!response.ok) continue;
          const text = await response.text();
          const parsed = parseTemplateYaml(text);
          if (parsed) templates.push(parsed);
        } catch (err) {
          logger.debug("Skipping unparseable issue template", err);
        }
      }
      } catch (err) {
        logger.debug("Could not fetch issue templates", { owner, repo, error: String(err) });
      }

      return { templates, blankEnabled };
    });

    return NextResponse.json({ templates, blankEnabled });
  } catch (error) {
    return handleApiError(error);
  }
}

function parseTemplateYaml(text: string): IssueTemplate | null {
  try {
    const raw = parse(text) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return null;

    const name = String(raw.name || "");
    if (!name) return null;

    const title = raw.title ? String(raw.title) : "";
    const description = raw.description ? String(raw.description) : "";
    const labels: string[] = Array.isArray(raw.labels)
      ? raw.labels.map(String)
      : [];

    const bodyFields: TemplateField[] = [];
    const rawBody = raw.body;
    if (Array.isArray(rawBody)) {
      for (const field of rawBody) {
        if (!field || typeof field !== "object") continue;
        const f = field as Record<string, unknown>;
        const type = f.type ? String(f.type) : "";
        if (!type) continue;

        const attrs = f.attributes as Record<string, unknown> | undefined;
        const validations = f.validations as Record<string, unknown> | undefined;

        const id = attrs?.id ? String(attrs.id) : "";

        const attributes: TemplateField["attributes"] = {};
        if (attrs) {
          if (attrs.label) attributes.label = String(attrs.label);
          if (attrs.description) attributes.description = String(attrs.description);
          if (attrs.placeholder) attributes.placeholder = String(attrs.placeholder);
          if (attrs.value) attributes.value = String(attrs.value);
          if (attrs.render) attributes.render = String(attrs.render);
          if (Array.isArray(attrs.options)) {
            attributes.options = attrs.options.map(String);
          }
        }

        bodyFields.push({
          type,
          id,
          attributes,
          validations: validations
            ? { required: validations.required === true }
            : undefined,
        });
      }
    }

    return { name, description, title, labels, body: bodyFields };
  } catch {
    return null;
  }
}
