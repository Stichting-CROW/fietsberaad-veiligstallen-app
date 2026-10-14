import type { GetServerSideProps } from "next";
import type { WizardStep } from "~/components/buurtstallingen/PublicFlow";
import { buurtWizardAccountRedirect } from "~/utils/server/buurt-wizard-account-redirect";

const STEPS = new Set<WizardStep>(["rek", "gegevens", "bevestiging"]);

export const getServerSideProps: GetServerSideProps = async (context) => {
  const stap = String(context.params?.stap ?? "");
  if (!STEPS.has(stap as WizardStep)) return { notFound: true };
  return buurtWizardAccountRedirect(context, "fietstrommel", stap as WizardStep);
};

export default function Page() {
  return null;
}
