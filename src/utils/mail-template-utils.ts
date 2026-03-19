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
