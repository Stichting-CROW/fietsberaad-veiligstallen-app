import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { CITIZEN_COOKIE, readCitizenSession, readCookie } from "~/modules/buurtstallingen/auth";
import { listMine } from "~/modules/buurtstallingen/application/citizen";
import { prisma } from "~/server/db";

type Mine = Awaited<ReturnType<typeof listMine>>;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const urlName = String(context.params?.municipality ?? "");
  const council = await prisma.contacts.findFirst({
    where: { UrlName: urlName, Status: { not: "0" } },
    select: { ID: true, CompanyName: true, UrlName: true },
  });
  if (!council) return { notFound: true };
  const session = readCitizenSession(readCookie(context.req.headers.cookie, CITIZEN_COOKIE));
  const mine = session ? await listMine(council.ID, session.accountId) : null;
  return { props: { council, mine: JSON.parse(JSON.stringify(mine)) } };
};

const Page = ({ council, mine }: { council: { CompanyName: string | null; UrlName: string | null }; mine: Mine | null }) => {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [productByPlace, setProductByPlace] = useState<Record<string, string>>({});

  async function run(action: "accept" | "decline" | "cancel" | "leave", extra: { placeId?: string; entryId?: string; subscriptionTypeId?: number }, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    const response = await fetch("/api/buurtstallingen/mijn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urlName: council.UrlName, action, ...extra }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Actie mislukt");
      return;
    }
    setMessage(data.message ?? "");
    await router.replace(router.asPath);
  }

  return (
    <main className="mx-auto my-6 max-w-xl space-y-4 rounded bg-white p-6 text-gray-900">
      <h1 className="text-2xl font-semibold">Mijn stalling</h1>
      <p>{council.CompanyName}</p>
      {message && <p>{message}</p>}
      {!mine && <p>Log in via een buurtstalling om uw plekken te zien.</p>}
      {mine && (
        <>
          <ul className="space-y-2">
            {mine.places.map((place) => (
              <li key={place.placeId} className="rounded border p-3">
                <strong>{place.stallingTitle}</strong>
                <p>{place.placeTitle} — {place.status}</p>
                <div className="mt-2 flex gap-3 text-sm">
                  {place.status === "PROPOSED" && (
                    <>
                      {place.subscriptionTypes.length > 1 && (
                        <select
                          className="rounded border p-1"
                          value={productByPlace[place.placeId] ?? String(place.subscriptionTypes[0]?.id ?? "")}
                          onChange={(event) => setProductByPlace({ ...productByPlace, [place.placeId]: event.target.value })}
                        >
                          {place.subscriptionTypes.map((form) => (
                            <option key={form.id} value={form.id}>{form.name}{form.price ? ` € ${form.price}` : ""}</option>
                          ))}
                        </select>
                      )}
                      <button type="button" className="underline" onClick={() => void run("accept", { placeId: place.placeId, subscriptionTypeId: Number(productByPlace[place.placeId] ?? place.subscriptionTypes[0]?.id) || undefined }, "Dit aanbod accepteren?")}>Accepteren</button>
                      <button type="button" className="underline" onClick={() => void run("decline", { placeId: place.placeId }, "Dit aanbod afwijzen?")}>Afwijzen</button>
                    </>
                  )}
                  {place.status === "OCCUPIED" && (
                    <button type="button" className="underline" onClick={() => void run("cancel", { placeId: place.placeId }, "Abonnement opzeggen? U levert de sleutel binnen een week in.")}>Beëindigen</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <h2 className="font-medium">Wachtlijst</h2>
          <ul className="space-y-2">
            {mine.waitingList.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3">
                <span>{entry.sequence}. {entry.stallingTitle}</span>
                <button type="button" className="underline" onClick={() => void run("leave", { entryId: entry.id ?? "" }, "Van de wachtlijst af?")}>Afmelden</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link className="underline" href={`/${council.UrlName}/buurtstallingen`}>Naar buurtstallingen</Link>
    </main>
  );
};

export default Page;
