import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { CitizenShell, IdealButton } from "~/components/citizen/CitizenShell";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";

type Product = { id: number; titel: string | null; credit: number; prijs: number };
type TopupData = { products: Product[]; fee: number; ideal: boolean; saldo: number | null; paymentStatus: string | null };

function amount(product: Product): number {
  return product.prijs > 0 ? product.prijs : product.credit;
}

export default function TegoedPage() {
  const router = useRouter();
  const [data, setData] = useState<TopupData | null>(null);
  const [selected, setSelected] = useState<number | "saldotekort" | null>(null);
  const [error, setError] = useState("");
  const transactionID = typeof router.query.transactionID === "string" ? router.query.transactionID : "";

  useEffect(() => {
    if (!router.isReady) return;
    const params = transactionID ? `?transactionID=${encodeURIComponent(transactionID)}` : "";
    void fetch(`/api/account/topup${params}`).then(async (response) => {
      const body = (await response.json()) as TopupData;
      if (body.saldo === null) {
        await router.replace(`/account/login?next=${encodeURIComponent("/account/tegoed")}`);
        return;
      }
      setData(body);
      setSelected(body.saldo < 0 ? "saldotekort" : body.products[0]?.id ?? null);
    });
  }, [router, router.isReady, transactionID]);

  async function pay() {
    setError("");
    if (selected === null) {
      setError("Kies een opwaardeerbedrag");
      return;
    }
    const response = await fetch("/api/account/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: selected }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Opwaarderen mislukt");
      return;
    }
    if (body.checkoutUrl) {
      window.location.href = body.checkoutUrl;
      return;
    }
    await router.replace(`/account/tegoed?transactionID=${body.transactionID}`);
  }

  const status = data?.paymentStatus;
  const feedback = status === "ok"
    ? "De betaling is geslaagd."
    : status === "open" || status === "pending"
      ? "Uw betaling wordt op dit moment verwerkt. Zodra dat is afgerond, zal uw stallingstegoed worden opgewaardeerd."
      : "";
  const failed = Boolean(status && !feedback);
  const tile = (active: boolean) =>
    `float-left mb-2 mr-2 w-28 border-2 px-3 py-4 text-center font-semibold text-white ${active ? "border-[var(--vs-theme2)] bg-[var(--vs-theme2)]" : "border-[var(--vs-theme1)] bg-[var(--vs-theme1)] hover:border-[var(--vs-theme2)] hover:bg-[var(--vs-theme2)]"}`;

  return (
    <CitizenShell title="Stallingstegoed opwaarderen" page="Stallingstegoed">
      {feedback && <div className="mb-3 border border-green-300 bg-green-50 p-3 text-green-800">{feedback}</div>}
      {failed && <div className="mb-3 border border-red-300 bg-red-50 p-3 text-red-800">De betaling is niet geslaagd.</div>}
      {error && <div className="mb-3 border border-red-300 bg-red-50 p-3 text-red-800">{error}</div>}
      {!data ? <LoadingSpinner message="" /> : (
        <div className="bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Actueel stallingstegoed: € {(data.saldo ?? 0).toFixed(2)}</h3>
          <p className="mb-2 font-bold">Selecteer het gewenste bedrag:</p>
          <div className="overflow-hidden">
            {data.saldo !== null && data.saldo < 0 && (
              <button type="button" aria-pressed={selected === "saldotekort"} className={tile(selected === "saldotekort")} onClick={() => setSelected("saldotekort")}>
                € {(-data.saldo).toFixed(2)}
              </button>
            )}
            {data.products.map((product) => (
              <button key={product.id} type="button" aria-pressed={selected === product.id} className={tile(selected === product.id)} onClick={() => setSelected(product.id)}>
                € {amount(product).toFixed(2)}
              </button>
            ))}
          </div>
          {data.products.length === 0 && <p>Er zijn geen opwaardeerproducten.</p>}
          <p className="mb-2 mt-4 font-bold">Selecteer de gewenste betalingsmethode:</p>
          {data.ideal && <IdealButton fee={data.fee} onClick={() => void pay()} />}
        </div>
      )}
    </CitizenShell>
  );
}
