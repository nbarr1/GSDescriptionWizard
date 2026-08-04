// Collapses the Vite build into one self-contained HTML file.
//
// We do this by hand rather than with a plugin so there is no dependency between
// "the tool has zero external references" and a third-party package we would have
// to audit. The assertions at the bottom are the real deliverable: the build fails
// loudly if anything external ever creeps back in.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'dist', 'single');
const outFile = join(root, 'dist', 'ii-description-wizard.html');

if (!existsSync(buildDir)) {
  console.error(
    `Build directory not found: ${buildDir}. Run "vite build --outDir dist/single" first.`,
  );
  process.exit(1);
}

let html = readFileSync(join(buildDir, 'index.html'), 'utf8');

// Vite is configured to emit flat filenames, but handle an assets/ subdirectory
// too so a future config change does not silently break the single-file build.
const readAsset = (relativePath) => {
  const cleaned = relativePath.replace(/^\.?\//, '');
  return readFileSync(join(buildDir, cleaned), 'utf8');
};

// Inline <script type="module" src="..."></script>
html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*><\/script>/g, (_match, file) => {
  const code = readAsset(file);
  // A literal </script> inside a string would end the tag early.
  return `<script type="module">\n${code.replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
});

// Inline <link rel="stylesheet" href="..."> in either attribute order.
const inlineStyle = (_match, file) => `<style>\n${readAsset(file)}\n</style>`;
html = html.replace(
  /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+\.css)["'][^>]*>/g,
  inlineStyle,
);
html = html.replace(
  /<link\b[^>]*\bhref=["']([^"']+\.css)["'][^>]*\brel=["']stylesheet["'][^>]*>/g,
  inlineStyle,
);

// Drop modulepreload hints - they point at files that no longer exist standalone.
html = html.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>\s*/g, '');

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html, 'utf8');

// ---------------------------------------------------------------------------
// Constraint assertions. These are why this script exists.
// ---------------------------------------------------------------------------
const failures = [];

const forbidden = [
  [/<script\b[^>]*\bsrc\s*=/i, 'external <script src=...> reference'],
  [
    /<link\b[^>]*\bhref\s*=\s*["']?(?!data:)[^"'>]*\.(css|js)/i,
    'external <link href=...> reference',
  ],
  [/@import\s+(url\()?["']?https?:/i, 'CSS @import over http'],
  [/\bnew\s+XMLHttpRequest\b/, 'XMLHttpRequest usage'],
  [/\bnavigator\s*\.\s*sendBeacon\b/, 'sendBeacon usage'],
  [/\bimportScripts\s*\(/, 'importScripts usage'],
  [/\bEventSource\s*\(/, 'EventSource usage'],
  [/\bWebSocket\s*\(/, 'WebSocket usage'],
  // Any absolute http(s) URL that is not a namespace declaration or a comment marker.
  [/["'`]https?:\/\/(?!www\.w3\.org)/i, 'absolute http(s) URL in a string literal'],
];

for (const [pattern, label] of forbidden) {
  if (pattern.test(html)) failures.push(label);
}

// `fetch(` needs a narrower check: the word appears in prose (e.g. "fetch the part")
// inside the question content, so only flag it as a call in script context.
const scriptBodies = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
for (const body of scriptBodies) {
  if (/(^|[^.\w])fetch\s*\(/.test(body)) failures.push('fetch() call in script');
}

// Any emitted file other than the HTML and the two things we just inlined would
// have to be fetched at runtime, which the tool must never do.
const emitted = readdirSync(buildDir).filter((f) => f !== 'index.html');
const unexpected = emitted.filter((f) => !/\.(js|css)$/.test(f));
if (unexpected.length > 0) {
  failures.push(`build emitted files that cannot be inlined: ${unexpected.join(', ')}`);
}

if (failures.length > 0) {
  console.error('Single-file build FAILED constraint checks:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(
  `Single-file build OK -> dist/ii-description-wizard.html (${kb} KB, zero external references)`,
);
