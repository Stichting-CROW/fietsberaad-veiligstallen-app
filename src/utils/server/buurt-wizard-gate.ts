import type { GetServerSidePropsContext, Redirect } from "next";
import { CITIZEN_COOKIE, readCitizenSession, readCookie } from "~/modules/citizen-accounts/auth";

export function readCitizenSessionFromContext(context: GetServerSidePropsContext) {
  return readCitizenSession(readCookie(context.req.headers.cookie, CITIZEN_COOKIE));
}

/** Redirect anonymous visitors to citizen login before the buurt/fietstrommel wizard. */
export function buurtWizardLoginRedirect(context: GetServerSidePropsContext): { redirect: Redirect } | null {
  if (readCitizenSessionFromContext(context)) return null;
  const next = (context.resolvedUrl ?? "/account").split("#")[0] ?? "/account";
  return {
    redirect: {
      destination: `/account/login?next=${encodeURIComponent(next)}`,
      permanent: false,
    },
  };
}
