const EMAIL_IMG_MAX_WIDTH_STYLE = "max-width:100%;height:auto";

function insertImgStyleAttribute(tag: string): string {
  const trimmed = tag.replace(/\s+$/, "");
  if (trimmed.endsWith("/>")) {
    const inner = trimmed.slice(0, -2).trimEnd();
    return `${inner} style="${EMAIL_IMG_MAX_WIDTH_STYLE}" />`;
  }
  if (trimmed.endsWith(">")) {
    const inner = trimmed.slice(0, -1).trimEnd();
    return `${inner} style="${EMAIL_IMG_MAX_WIDTH_STYLE}">`;
  }
  return tag;
}

/** Makes inline <img> tags responsive in HTML mail clients. */
export function ensureEmailImagesMaxWidth(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (/\sstyle\s*=\s*["']/i.test(tag)) {
      return tag.replace(/\sstyle\s*=\s*(["'])([^"']*)\1/i, (match, quote: string, styleVal: string) => {
        const s = styleVal.trim();
        if (/max-width\s*:/i.test(s)) return match;
        const merged = s ? `${s};${EMAIL_IMG_MAX_WIDTH_STYLE}` : EMAIL_IMG_MAX_WIDTH_STYLE;
        return ` style=${quote}${merged}${quote}`;
      });
    }
    return insertImgStyleAttribute(tag);
  });
}

/** Remove empty [intro] and [outro] shortcodes including their newlines to avoid extra breaks in email body. */
export function removeEmptyShortcodes(
  templateBody: string,
  introText: string,
  outroText: string
): string {
  let body = templateBody;
  if (!introText.trim()) {
    body = body.replace(/\[intro\]\s*\r?\n?/g, "");
  }
  if (!outroText.trim()) {
    body = body.replace(/\r?\n\s*\[outro\]\s*/g, "");
  }
  return body;
}
