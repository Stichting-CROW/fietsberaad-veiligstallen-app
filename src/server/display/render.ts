import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

export function renderDocument(title: string, headExtra: string, body: ReactElement): string {
  const bodyHtml = renderToStaticMarkup(body);
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex" />
${headExtra}
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** CF Article HTML from beheer — trusted content, pass through like CF. */
export function trustedHtml(html: string): string {
  return html;
}

export function displayNoStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
}
