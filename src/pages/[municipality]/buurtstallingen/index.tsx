import type { GetServerSideProps } from "next";
import Link from "next/link";
import { listFacilities } from "~/modules/buurtstallingen/application/service";
import { prisma } from "~/server/db";

type Facility = Awaited<ReturnType<typeof listFacilities>>["facilities"][number];

export const getServerSideProps: GetServerSideProps = async (context) => {
  const urlName = String(context.params?.municipality ?? "");
  const council = await prisma.contacts.findFirst({
    where: { UrlName: urlName, Status: { not: "0" } },
    select: { ID: true, CompanyName: true, UrlName: true },
  });
  if (!council) return { notFound: true };
  const list = await listFacilities(council.ID, "buurtstalling");
  return { props: { council, facilities: JSON.parse(JSON.stringify(list.facilities)) } };
};

const Page = ({ council, facilities }: { council: { CompanyName: string | null; UrlName: string | null }; facilities: Facility[] }) => (
    <main className="mx-auto my-6 max-w-3xl space-y-4 rounded bg-white p-6 text-gray-900">
    <h1 className="text-2xl font-semibold">Buurtstallingen in {council.CompanyName}</h1>
    <ul className="space-y-3">
      {facilities.map((facility) => (
        <li key={facility.id} className="rounded border bg-white p-4">
          <Link className="text-lg font-medium text-sky-800" href={`/${council.UrlName}/buurtstallingen/${facility.id}`}>{facility.title}</Link>
          <p className="text-sm text-gray-600">{facility.counts.free} vrije plekken</p>
        </li>
      ))}
    </ul>
    <Link className="underline" href={`/${council.UrlName}/mijn-stalling`}>Mijn stalling</Link>
  </main>
);

export default Page;
