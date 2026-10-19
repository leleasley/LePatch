// A tiny dependency free check that every JSX component used in a file is
// either imported or declared locally. It catches the mistakes a bundler
// happily ships: a component that only fails once the route is opened.
import fs from 'node:fs';
import path from 'node:path';

const HTML_TAGS = new Set([
  'a', 'abbr', 'article', 'aside', 'b', 'br', 'button', 'code', 'dd', 'details', 'div', 'dl', 'dt',
  'em', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img',
  'input', 'kbd', 'label', 'li', 'main', 'nav', 'ol', 'option', 'p', 'pre', 'section', 'select',
  'small', 'span', 'strong', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead',
  'tr', 'ul', 'video', 'audio', 'canvas', 'svg', 'path', 'circle', 'rect', 'g', 'defs', 'use',
]);

const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.jsx?$/.test(entry.name)) files.push(target);
  }
};
walk('src');

const problems = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const known = new Set();

  // Imported bindings, including aliases.
  const importRe = /import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*from\s*['"][^'"]+['"]/g;
  let match;
  while ((match = importRe.exec(text)) !== null) {
    if (match[1]) known.add(match[1]);
    for (const raw of (match[2] || '').split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (name) known.add(name);
    }
  }
  const defaultImportRe = /import\s+([\w$]+)\s+from\s*['"][^'"]+['"]/g;
  while ((match = defaultImportRe.exec(text)) !== null) known.add(match[1]);

  // Locally declared bindings.
  const declareRe = /(?:function|class|const|let|var)\s+([A-Z][\w$]*)/g;
  while ((match = declareRe.exec(text)) !== null) known.add(match[1]);

  // Components used in JSX.
  const used = new Set();
  const jsxRe = /<\/?([A-Z][\w$]*)/g;
  while ((match = jsxRe.exec(text)) !== null) used.add(match[1]);

  for (const name of used) {
    if (known.has(name) || HTML_TAGS.has(name.toLowerCase())) continue;
    problems.push(`${file}: <${name}> is used but never imported or declared`);
  }
}

if (problems.length) {
  console.error('Unresolved JSX components found:');
  problems.forEach(problem => console.error(`  - ${problem}`));
  process.exit(1);
}

console.log(`Checked ${files.length} files: every JSX component resolves.`);
