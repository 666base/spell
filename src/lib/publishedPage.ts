const ALLOWED_IMAGE_SRC = /^(https?:|data:image\/)/i;
const ALLOWED_HREF = /^(https?:|mailto:|#)/i;
const UNSAFE_TAGS = new Set([
  "SCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "FORM",
  "LINK",
  "META",
  "BASE",
  "STYLE",
  "TEMPLATE",
]);

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeUrl(value: string, allowed: RegExp): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//")) return false;
  return allowed.test(trimmed);
}

export function sanitizePublishedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(
    `<div id="spell-root">${html}</div>`,
    "text/html",
  );
  const root = parsed.getElementById("spell-root");
  if (!root) return "";

  const walk = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (UNSAFE_TAGS.has(node.tagName)) {
      node.remove();
      return;
    }

    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "srcset") {
        node.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" && !isSafeUrl(attr.value, ALLOWED_HREF)) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (
        (name === "src" || name === "poster") &&
        !isSafeUrl(attr.value, ALLOWED_IMAGE_SRC)
      ) {
        node.removeAttribute(attr.name);
      }
    }

    if (node.tagName === "A") {
      node.setAttribute("rel", "noopener noreferrer");
      node.setAttribute("target", "_blank");
    }

    if (node.tagName === "IMG" && !node.getAttribute("src")) {
      node.remove();
      return;
    }

    if (node instanceof HTMLInputElement && node.type === "checkbox") {
      node.disabled = true;
    }

    node.removeAttribute("contenteditable");

    for (const child of [...node.childNodes]) walk(child);
  };

  for (const child of [...root.childNodes]) walk(child);
  return root.innerHTML;
}

const PAGE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #fff;
  --text: #1c1c1e;
  --muted: #8e8e93;
  --border: rgba(60, 60, 67, 0.14);
  --accent: #ffcc00;
  --code: #d73a49;
  --mark: #fff3a0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1c1e;
    --text: #f5f5f7;
    --muted: #8e8e93;
    --border: rgba(235, 235, 245, 0.16);
    --code: #ff7b83;
    --mark: #c9a227;
  }
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 17px/1.47 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main {
  max-width: 42rem;
  margin: 0 auto;
  padding: 3.5rem 1.5rem 4.5rem;
}
h1, h2, h3, h4 { font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
h1 { font-size: 1.75rem; margin: 0 0 1rem; }
h2 { font-size: 1.35rem; margin: 1.6em 0 0.55em; }
h3 { font-size: 1.15rem; margin: 1.4em 0 0.45em; }
p, ul, ol, pre, blockquote, table { margin: 0 0 1em; }
a { color: inherit; }
img { max-width: 100%; height: auto; border-radius: 8px; }
hr { border: 0; border-top: 1px solid var(--border); margin: 1.5em 0; }
blockquote {
  margin-left: 0;
  padding-left: 0.9em;
  border-left: 3px solid var(--border);
  color: var(--muted);
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.88em;
  color: var(--code);
}
pre {
  overflow: auto;
  padding: 0.9em 1em;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.86em;
}
pre code { color: inherit; }
mark {
  background: var(--mark);
  color: #7a5b00;
  border-radius: 0.35em;
  padding: 0.05em 0.28em;
}
ul[data-type="taskList"] { list-style: none; padding: 0; }
ul[data-type="taskList"] li {
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
}
ul[data-type="taskList"] input[type="checkbox"] {
  appearance: none;
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 0.2em;
  border: 1.5px solid color-mix(in srgb, var(--text) 28%, transparent);
  border-radius: 999px;
  background: transparent;
  flex-shrink: 0;
}
ul[data-type="taskList"] input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' d='M2.4 6.2 4.8 8.6 9.6 3.4'/></svg>");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 11px;
}
table { width: 100%; border-collapse: collapse; font-size: 0.95em; }
th, td {
  border: 1px solid var(--border);
  padding: 0.4em 0.7em;
  text-align: left;
  vertical-align: top;
}
th { font-weight: 600; }
footer {
  margin-top: 3rem;
  color: var(--muted);
  font-size: 0.78rem;
}
`;

export function publishedPageHtml(title: string, bodyHtml: string): string {
  const safeTitle = title.trim() || "Untitled";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(safeTitle)}</title>
<style>${PAGE_CSS.trim()}</style>
</head>
<body>
<main>
${sanitizePublishedHtml(bodyHtml)}
<footer>Published from Spell</footer>
</main>
</body>
</html>
`;
}
