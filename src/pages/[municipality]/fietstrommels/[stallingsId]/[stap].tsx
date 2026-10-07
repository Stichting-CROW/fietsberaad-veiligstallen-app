import type { GetServerSideProps } from "next";
import type { ComponentProps } from "react";
import PublicFlow, { needsRek, type WizardStep } from "~/components/buurtstallingen/PublicFlow";
import { getPublicDetail } from "~/modules/buurtstallingen/application/service";

const STEPS = new Set<WizardStep>(["rek", "gegevens", "bevestiging"]);

export const getServerSideProps: GetServerSideProps = async (context) => {
  const stap = String(context.params?.stap ?? "");
  if (!STEPS.has(stap as WizardStep)) return { notFound: true };
  const municipality = String(context.params?.municipality ?? "");
  const stallingsId = String(context.params?.stallingsId ?? "");
  const detail = await getPublicDetail(municipality, stallingsId);
  if (!detail || detail.stalling.type !== "fietstrommel") return { notFound: true };
  if (stap === "rek" && !needsRek(detail)) {
    const fiets = typeof context.query.fiets === "string" ? context.query.fiets : "";
    return { redirect: { destination: `/${municipality}/fietstrommels/${stallingsId}/gegevens?fiets=${encodeURIComponent(fiets)}`, permanent: false } };
  }
  return { props: { detail: JSON.parse(JSON.stringify(detail)), step: stap } };
};

export default function Page({ detail, step }: { detail: ComponentProps<typeof PublicFlow>["detail"]; step: WizardStep }) {
  return <PublicFlow detail={detail} step={step} />;
}
