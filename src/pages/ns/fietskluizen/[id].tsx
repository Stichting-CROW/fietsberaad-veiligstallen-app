import type { GetServerSideProps } from "next";
import { legacyStallingRedirectFromStallingsId } from "~/utils/server/legacy-stalling-redirect";

/** Legacy `https://www.veiligstallen.nl/ns/fietskluizen/[StallingsID]` (and KML-style links). */
export const getServerSideProps: GetServerSideProps = async (context) =>
  legacyStallingRedirectFromStallingsId(context);

export default function NsFietskluisRedirectPage() {
  return null;
}
