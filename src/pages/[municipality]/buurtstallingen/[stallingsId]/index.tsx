import type { GetServerSideProps } from "next";
import type { ComponentProps } from "react";
import PublicFlow from "~/components/buurtstallingen/PublicFlow";
import { getPublicDetail } from "~/modules/buurtstallingen/application/service";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const detail = await getPublicDetail(String(context.params?.municipality ?? ""), String(context.params?.stallingsId ?? ""));
  if (!detail || detail.stalling.type !== "buurtstalling") return { notFound: true };
  return { props: { detail: JSON.parse(JSON.stringify(detail)) } };
};

export default function Page({ detail }: { detail: ComponentProps<typeof PublicFlow>["detail"] }) {
  return <PublicFlow detail={detail} step="fiets" />;
}
