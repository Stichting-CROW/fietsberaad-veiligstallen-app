import type { GetServerSideProps } from "next";
import { legacyStallingRedirectFromStallingsId } from "~/utils/server/legacy-stalling-redirect";

export const getServerSideProps: GetServerSideProps = async (context) =>
  legacyStallingRedirectFromStallingsId(context);

export default function LegacyStallingRedirectPage() {
  return null;
}
