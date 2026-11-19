import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { CitizenShell, IdealButton } from "~/components/citizen/CitizenShell";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";

type Doc = {
  name: string;
  price: number;
  vat: number;
  vatPercentage: number;
  start: string | null;
  end: string | null;
  dateCreated: string | null;
  startsToday: boolean;
  invoice: string;
  passType: string;
  pass: { passId: string; name: string | null; displayName: string; temporary: boolean; tmpOvchip: boolean; tmpSleutelhanger: boolean } | null;
  stallings: { title: string; location: string }[];
  council: { id: string | null; name: string; address: string; zip: string; city: string; btw: string; kvk: string; themeColor2: string };
  fee: number;
  paid: boolean;
  active: boolean;
  paymentStatus: string | null;
};

function shortDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
}

function dottedDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

export default function ConfirmationPage() {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const transactionID = typeof router.query.transactionID === "string" ? router.query.transactionID : "";
  const prolongId = typeof router.query.prolongId === "string" ? router.query.prolongId : "";

  useEffect(() => {
    if (!router.isReady || !id) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const params = new URLSearchParams({ id });
      if (transactionID) params.set("transactionID", transactionID);
      const response = await fetch(`/api/account/abonnement?${params.toString()}`);
      if (response.status === 401) {
        await router.replace(`/account/login?next=${encodeURIComponent(router.asPath)}`);
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Abonnement niet gevonden");
        return;
      }
      if (data.paymentStatus && ["cancelled", "expired", "failed"].includes(data.paymentStatus)) {
        await router.replace(`/account/abonnement?error=${encodeURIComponent("Uw betaling is helaas niet geslaagd.")}`);
        return;
      }
      if (prolongId && data.paid) {
        await router.replace(data.pass
          ? "/account?showForm=abonnementen"
          : `/account/abonnement?subscriptionId=${encodeURIComponent(id)}&view=koppelPas&source=mijngegevens`);
        return;
      }
      setDoc(data);
      if (data.paymentStatus === "open" || data.paymentStatus === "pending") timer = setTimeout(() => void load(), 30000);
    };
    void load();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [router, router.isReady, id, transactionID, prolongId]);

  async function pay() {
    const response = await fetch("/api/account/abonnement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Betaling mislukt");
      return;
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    await router.replace(`/account/abonnement/${id}?transactionID=${data.transactionID}`);
  }

  const pending = doc?.paymentStatus === "open" || doc?.paymentStatus === "pending";
  const paidNow = doc?.paymentStatus === "ok";

  return (
    <CitizenShell title="Abonnement" siteId={doc?.council.id} page="Abonnement" pageText={false}>
      {error && <div className="mb-3 border border-red-300 bg-red-50 p-3 text-red-800">{error}</div>}
      {paidNow && <div className="mb-3 border border-green-300 bg-green-50 p-3 text-green-800">Uw betaling is geslaagd.</div>}
      {pending && <div className="mb-3 border border-red-300 bg-red-50 p-3 text-red-800">Uw betaling wordt verwerkt. Een ogenblik geduld...</div>}
      {!doc && !error && <LoadingSpinner message="" />}
      {doc && (
        <article className="space-y-3 bg-white p-4">
          {doc.pass?.tmpOvchip && (
            <>
              <p className="p-[5px] text-center text-[120%] font-bold" style={{ border: `4px solid #${doc.council.themeColor2}` }}>
                Noteer uw id-code: {doc.pass.passId}
              </p>
              <p><strong>Om uw abonnement met OV chipkaart {doc.pass.name} te kunnen gebruiken moet u uw kaart bij de kluis activeren.</strong></p>
            </>
          )}
          {doc.pass?.tmpSleutelhanger && (
            <>
              <p className="p-[5px] text-center text-[120%] font-bold" style={{ border: `4px solid #${doc.council.themeColor2}` }}>
                Noteer uw id-code: {doc.pass.passId}
              </p>
              <p><strong>Om uw abonnement met sleutelhanger {doc.pass.name} te kunnen gebruiken moet u uw sleutelhanger bij de stalling activeren.</strong></p>
            </>
          )}
          <p>
            {!doc.startsToday ? "Details abonnement:" : doc.paid ? "U heeft het volgende product aangeschaft:" : "U heeft gekozen voor het volgende product:"}
          </p>
          <ul className="list-disc pl-8">
            <li>1x {doc.name} voor € {doc.price.toFixed(2)} (BTW {doc.vatPercentage}% € {doc.vat.toFixed(2)})</li>
            <li>Kenmerk: {dottedDate(doc.dateCreated)} - {doc.invoice}</li>
            <li>Dit abonnement is geldig van {shortDate(doc.start)} tot {shortDate(doc.end)}.</li>
          </ul>
          <div>
            <p>Met dit abonnement kunt u stallen in:</p>
            <ul className="list-disc pl-8">
              {doc.stallings.map((stalling) => <li key={stalling.title}><strong>{stalling.title}</strong></li>)}
            </ul>
          </div>
          {!doc.paid ? null : !doc.pass || doc.pass.temporary ? (
            <>
              <h2 className="text-lg font-semibold">Activeren in de stalling</h2>
              <p>
                Klik{" "}
                <a className="underline" target="veiligstallen_barcode" href={`/api/account/document?abonnement=${encodeURIComponent(id)}`}><strong>hier</strong></a>
                {" "}om een document te openen met daarin een <strong>streepjescode</strong>. Druk dit document af en neem de afdruk mee naar de stalling.
                <br />
                Daar zal uw abonnement aan een sleutelhanger gekoppeld worden waarmee u de stalling binnen kunt komen.
              </p>
              <p>Als u geen printer heeft, noteer dan de volgende code: <strong>{doc.pass?.passId ?? ""}</strong>, en neem deze mee naar de stalling.</p>
              <p>
                Met vriendelijke groet,<br />
                Gemeente {doc.council.name}<br />
                {doc.council.address}<br />
                {doc.council.zip} {doc.council.city}<br />
                <br />
                {doc.council.btw && <>BTW nr {doc.council.btw}</>}
                {doc.council.kvk && <><br />KVK {doc.council.kvk}</>}
              </p>
            </>
          ) : (
            <p>Het abonnement is gekoppeld aan {doc.passType}: {doc.pass.displayName}</p>
          )}
          {!doc.paid && !pending && (
            <div className="ml-10 mt-4">
              <IdealButton fee={doc.fee} onClick={() => void pay()} />
            </div>
          )}
        </article>
      )}
    </CitizenShell>
  );
}
