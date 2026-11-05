import type { GetServerSideProps } from "next";
import { legacyStallingRedirectFromStallingsId } from "~/utils/server/legacy-stalling-redirect";

/** Legacy `https://www.veiligstallen.nl/ns/stallingen/[StallingsID]`. */
export const getServerSideProps: GetServerSideProps = async (context) =>
  legacyStallingRedirectFromStallingsId(context);

export default function NsStallingRedirectPage() {
  return null;
}
