"use client";

import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function isAbsoluteUrl(value: string) {
  return /^(?:[a-z][a-z\d+\-.]*:|\/\/|#)/i.test(value);
}

function resolveUrl(value: string | undefined, baseUrl?: string) {
  if (!value) return value;
  if (!baseUrl || isAbsoluteUrl(value)) return value;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

const markdownSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "picture",
    "source",
    "img",
    "details",
    "summary",
    "kbd",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] || []), "className", "align"],
    a: [...(defaultSchema.attributes?.a || []), "href", "target", "rel"],
    img: [...(defaultSchema.attributes?.img || []), "src", "alt", "title", "width", "height"],
    source: [...(defaultSchema.attributes?.source || []), "srcSet", "srcset", "media", "type"],
    p: [...(defaultSchema.attributes?.p || []), "align"],
  },
};

export function MarkdownContent({
  body,
  className,
  emptyMessage,
  linkBaseUrl,
  imageBaseUrl,
}: {
  body: string | null;
  className?: string;
  emptyMessage: string;
  linkBaseUrl?: string;
  imageBaseUrl?: string;
}) {
  if (!body || !body.trim()) {
    return <div className={cn("text-sm text-text-muted italic", className)}>{emptyMessage}</div>;
  }

  return (
    <div className={cn("release-notes prose-invert max-w-none overflow-hidden", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSchema]]}
        components={{
          picture: ({ className, ...props }) => (
            <picture className={cn("my-4 flex justify-center", className)} {...props} />
          ),
          source: (props) => {
            const sourceProps = props as typeof props & { srcset?: string; srcSet?: string };
            const resolvedSrcSet =
              typeof sourceProps.srcSet === "string"
                ? resolveUrl(sourceProps.srcSet, imageBaseUrl)
                : typeof sourceProps.srcset === "string"
                  ? resolveUrl(sourceProps.srcset, imageBaseUrl)
                  : undefined;
            return <source {...props} srcSet={resolvedSrcSet} />;
          },
          h1: ({ className, ...props }) => (
            <h1 className={cn("mb-3 mt-0 text-lg font-bold text-text sm:text-xl", className)} {...props} />
          ),
          h2: ({ className, ...props }) => (
            <h2 className={cn("mb-2 mt-4 text-base font-semibold text-text first:mt-0 sm:text-lg", className)} {...props} />
          ),
          h3: ({ className, ...props }) => (
            <h3 className={cn("mb-2 mt-3 text-base font-semibold text-text", className)} {...props} />
          ),
          p: (props) => {
            const paragraphProps = props as typeof props & { align?: string };
            const align = paragraphProps.align;
            const children = props.children;
            const child = Array.isArray(children) && children.length === 1 ? children[0] as React.ReactElement : null;
            const hasOnlyImage = child != null && typeof child === "object" && child.type === "img";
            return (
              <p
                className={cn(
                  "mb-2 break-words text-sm leading-relaxed text-text",
                  align === "center" && "text-center",
                  align === "right" && "text-right",
                  hasOnlyImage && "flex justify-center my-6",
                  props.className
                )}
                {...props}
              />
            );
          },
          ul: ({ className, ...props }) => (
            <ul className={cn("mb-2 ml-4 list-disc space-y-0.5 text-sm text-text", className)} {...props} />
          ),
          ol: ({ className, ...props }) => (
            <ol className={cn("mb-2 ml-4 list-decimal space-y-0.5 text-sm text-text", className)} {...props} />
          ),
          li: ({ className, ...props }) => <li className={cn("leading-relaxed", className)} {...props} />,
          a: ({ className, href, ...props }) => (
            <a
              className={cn("underline underline-offset-2 hover:text-accent text-accent break-all", className)}
              href={resolveUrl(href, linkBaseUrl)}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          img: ({ className, src, alt, ...props }) => (
            <img
              className={cn("my-3 mx-auto h-auto max-w-full rounded-lg border border-line/50 object-contain block", className)}
              src={typeof src === "string" ? resolveUrl(src, imageBaseUrl) : undefined}
              alt={alt || ""}
              loading="lazy"
              {...props}
            />
          ),
          code: ({ className, ...props }) => {
            const isBlock = className?.includes("language-") || (props.children && String(props.children).includes("\n"));
            return isBlock ? (
              <code
                className={cn(
                  "block overflow-x-auto rounded-lg border border-line/50 bg-black/40 p-3 font-mono text-xs text-text",
                  className
                )}
                {...props}
              />
            ) : (
              <code className={cn("rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-accent", className)} {...props} />
            );
          },
          pre: ({ className, ...props }) => (
            <pre className={cn("mb-3 overflow-hidden rounded-lg border border-line/50 bg-black/40 p-0", className)} {...props} />
          ),
          blockquote: ({ className, ...props }) => (
            <blockquote className={cn("my-2 border-l-2 border-cyan-500/50 pl-3 text-sm italic text-text-muted", className)} {...props} />
          ),
          table: ({ className, ...props }) => (
            <div className="mb-3 overflow-x-auto rounded-lg border border-line/50 -mx-2 sm:mx-0">
              <table className={cn("min-w-full text-xs", className)} {...props} />
            </div>
          ),
          details: ({ className, ...props }) => (
            <details className={cn("mb-3 rounded-lg border border-line/50 bg-white/[0.03] p-3 text-sm text-text", className)} {...props} />
          ),
          summary: ({ className, ...props }) => (
            <summary className={cn("cursor-pointer font-medium text-text", className)} {...props} />
          ),
          kbd: ({ className, ...props }) => (
            <kbd className={cn("rounded border border-line/50 bg-black/30 px-1.5 py-0.5 font-mono text-xs text-text", className)} {...props} />
          ),
          thead: ({ className, ...props }) => (
            <thead className={cn("bg-white/5 text-left text-text-muted", className)} {...props} />
          ),
          tbody: ({ className, ...props }) => (
            <tbody className={cn("divide-y divide-line/30", className)} {...props} />
          ),
          tr: ({ className, ...props }) => <tr className={cn("hover:bg-white/[0.02]", className)} {...props} />,
          th: ({ className, ...props }) => <th className={cn("px-3 py-2 font-medium", className)} {...props} />,
          td: ({ className, ...props }) => <td className={cn("px-3 py-2 text-text", className)} {...props} />,
          hr: ({ className, ...props }) => <hr className={cn("my-3 border-line/30", className)} {...props} />,
          strong: ({ className, ...props }) => <strong className={cn("font-semibold text-text", className)} {...props} />,
          em: ({ className, ...props }) => <em className={cn("text-text", className)} {...props} />,
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
