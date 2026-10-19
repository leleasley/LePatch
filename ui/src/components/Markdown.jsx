import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

function resolveUrl(value, baseURL, image = false) {
  try {
    const parsed = new URL(value, baseURL || location.href);
    if (image ? parsed.protocol === 'https:' : ['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return parsed.href;
  } catch {
    // Invalid links are rendered as plain text.
  }
  return '';
}

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'picture', 'source', 'img', 'details', 'summary', 'kbd'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'align'],
    a: [...(defaultSchema.attributes?.a || []), 'href', 'target', 'rel'],
    img: [...(defaultSchema.attributes?.img || []), 'src', 'alt', 'title', 'width', 'height'],
    source: [...(defaultSchema.attributes?.source || []), 'srcSet', 'srcset', 'media', 'type'],
    p: [...(defaultSchema.attributes?.p || []), 'align'],
  },
};

function isBadge(value) {
  return /(?:shields\.io|badge\.svg|\/backers\/badge|\/sponsors\/badge|\/megasponsors\/badge|build\/status)/i.test(String(value || ''));
}

export function MarkdownView({ source, baseURL, className = '' }) {
  const resolve = value => resolveUrl(value, baseURL, false);
  const resolveImage = value => resolveUrl(value, baseURL, true);
  return (
    <div className={`markdown ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={resolve(href)} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
          img: ({ src, alt, ...props }) => (
            <img className={isBadge(src) ? 'image badge' : 'image'} src={resolveImage(src)} alt={alt || ''} loading="lazy" {...props} />
          ),
          source: ({ srcSet, srcset, ...props }) => <source srcSet={resolveImage(srcSet || srcset)} {...props} />,
          picture: props => <picture className="picture" {...props} />,
          table: props => (
            <div className="table-wrap">
              <table {...props} />
            </div>
          ),
          details: props => <details className="details" {...props} />,
        }}
      >
        {String(source || '')}
      </Markdown>
    </div>
  );
}
