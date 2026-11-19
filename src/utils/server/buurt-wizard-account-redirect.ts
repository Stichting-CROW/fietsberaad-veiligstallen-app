import type { GetServerSidePropsResult } from "next";
import type { GetServerSidePropsContext } from "next";
import { needsRek, type WizardStep } from "~/components/buurtstallingen/PublicFlow";
import { accountWizardRedirectPath, getPublicDetail } from "~/modules/buurtstallingen/application/service";
import { buurtWizardLoginRedirect } from "~/utils/server/buurt-wizard-gate";

export async function buurtWizardAccountRedirect(
  context: GetServerSidePropsContext,
  expectedType: "buurtstalling" | "fietstrommel",
  wizard: WizardStep,
): Promise<GetServerSidePropsResult<Record<string, never>>> {
  const loginRedirect = buurtWizardLoginRedirect(context);
  if (loginRedirect) return loginRedirect as GetServerSidePropsResult<Record<string, never>>;

  const municipality = String(context.params?.municipality ?? "");
  const stallingsId = String(context.params?.stallingsId ?? "");
  const detail = await getPublicDetail(municipality, stallingsId);
  if (!detail || detail.stalling.type !== expectedType) return { notFound: true };

  let step = wizard;
  if (step === "rek" && !needsRek(detail)) {
    step = "gegevens";
  }

  const destination = await accountWizardRedirectPath(municipality, stallingsId, step, context.query);
  if (!destination) return { notFound: true };
  return { redirect: { destination, permanent: false } };
}
