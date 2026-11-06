import type { GetServerSideProps } from "next";
import { buurtWizardAccountRedirect } from "~/utils/server/buurt-wizard-account-redirect";

export const getServerSideProps: GetServerSideProps = async (context) => {
  return buurtWizardAccountRedirect(context, "buurtstalling", "fiets");
};

export default function Page() {
  return null;
}
