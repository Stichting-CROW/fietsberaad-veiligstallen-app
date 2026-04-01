/**
 * Base URL for absolute links and image src in outgoing mail.
 * Acceptance uses NODE_ENV=acceptance (see azure-webapps-node-acceptance workflow).
 */
export function resolveMailBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "");
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim()?.replace(/\/$/, "");
  const configuredOrAuthUrl = configured ?? nextAuthUrl ?? "";
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();

  if (nodeEnv === "development" || nodeEnv === "test") {
    return "http://localhost:3000";
  }

  if (nodeEnv === "acceptance") {
    return "https://vstfb-eu-acc-app01.azurewebsites.net";
  }

  if (configuredOrAuthUrl) return configuredOrAuthUrl;
  return "https://beta.veiligstallen.nl";
}
