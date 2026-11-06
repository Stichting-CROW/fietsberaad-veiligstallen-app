import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { Button } from "~/components/Button";
import { formatDateTimeNl } from "~/utils/datetime-nl";
import { accountKindLabel } from "~/utils/account-kind-label";
import {
  barcodeLinksFromTag,
  LinkedReportSection,
  SubscriptionTable,
} from "~/components/test-reports/LinkedReportSection";
import type {
  TagReportAccountInfo,
  TagReportFinancialRecord,
  TagReportStallingRecord,
  TagReportUsedSubscription,
} from "~/pages/api/protected/test/tag-report";

function formatDate(iso: string | null): string {
  return formatDateTimeNl(iso);
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}u ${m}m`;
  return `${m}m`;
}

function formatMoney(amount: number | null): string {
  if (amount == null) return "—";
  return `€ ${amount.toFixed(2)}`;
}

function ResolvedCell({
  name,
  id,
  description,
}: {
  name: string | null;
  id?: string | null;
  description?: string | null;
}) {
  if (!name && !id) return <>—</>;
  return (
    <div>
      <div>{name ?? id}</div>
      {name && id && <div className="text-xs text-gray-500">{id}</div>}
      {description && <div className="text-xs text-gray-500">{description}</div>}
    </div>
  );
}

function AccountCell({
  name,
  email,
  accountType,
  accountId,
}: {
  name: string | null;
  email: string | null;
  accountType: string | null;
  accountId?: string | null;
}) {
  if (accountType === "SYSTEM") {
    return (
      <div>
        <div>Anoniem</div>
        {accountId && <div className="text-xs text-gray-500 font-mono">{accountId}</div>}
      </div>
    );
  }
  return <ResolvedCell name={name} id={email} />;
}

function AccountLinks({ accounts }: { accounts: TagReportAccountInfo[] }) {
  const rows = accounts.map((account, idx) => {
    const gemeenten = [
      ...new Set(
        account.pasids
          .map((pas) => pas.siteName ?? pas.siteID)
          .filter((name): name is string => !!name)
      ),
    ];
    return {
      key: account.accountID ?? `none-${idx}`,
      accountID: account.accountID,
      accountType: account.accountType,
      gemeente: gemeenten.length > 0 ? gemeenten.join(", ") : "—",
    };
  });

  if (rows.length === 0) {
    return <p className="text-sm text-gray-600">Geen account gekoppeld aan deze sleutelhanger.</p>;
  }

  return (
    <table className="min-w-full max-w-3xl text-sm tag-report-table">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Account</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
          <th className="px-3 py-2 text-left font-medium text-gray-600">Gemeenten</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row) => (
          <tr key={row.key} className={row.accountType === "SYSTEM" ? "bg-amber-50" : undefined}>
            <td className="px-3 py-2 font-mono text-xs">
              {row.accountID ? (
                <Link
                  href={`/test/account-report?accountId=${encodeURIComponent(row.accountID)}`}
                  className="text-blue-700 underline"
                >
                  {row.accountID}
                </Link>
              ) : (
                "geen account gekoppeld"
              )}
            </td>
            <td className="px-3 py-2">{accountKindLabel(row.accountType)}</td>
            <td className="px-3 py-2">{row.gemeente}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StallingTable({ rows }: { rows: TagReportStallingRecord[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-600">Geen stalling transacties</p>;
  }

  return (
    <div className="tag-report-table-wrap border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 text-sm tag-report-table">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Check-in</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Check-out</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Stalling naam</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Gemeente</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Sectie in</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Sectie uit</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Plek</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Pas</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Account</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Barcode in</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Barcode uit</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Fietstype</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Klanttype</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Duur</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Type in</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Type uit</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Kosten</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Exploitant</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {rows.map((row) => (
            <tr key={row.ID} className={row.AccountType === "SYSTEM" ? "bg-amber-50" : "hover:bg-gray-50"}>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.Date_checkin)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.Date_checkout)}</td>
              <td className="px-3 py-2">{row.StallingTitle ?? "—"}</td>
              <td className="px-3 py-2">{row.GemeenteName ?? "—"}</td>
              <td className="px-3 py-2">
                <ResolvedCell
                  name={row.SectieName}
                  id={row.SectieID}
                  description={row.SectieDescription}
                />
              </td>
              <td className="px-3 py-2">
                <ResolvedCell
                  name={row.SectieName_uit}
                  id={row.SectieID_uit}
                  description={row.SectieDescription_uit}
                />
              </td>
              <td className="px-3 py-2">
                <ResolvedCell
                  name={row.PlaceTitle}
                  id={row.ExternalPlaceID ?? (row.PlaceID != null ? String(row.PlaceID) : null)}
                />
              </td>
              <td className="px-3 py-2">
                <ResolvedCell name={row.PasNaam} id={row.PasID} description={row.Pastype} />
              </td>
              <td className="px-3 py-2">
                <AccountCell
                  name={row.AccountName}
                  email={row.AccountEmail}
                  accountType={row.AccountType}
                  accountId={row.AccountID}
                />
              </td>
              <td className="px-3 py-2 font-mono text-xs">{row.BarcodeFiets_in ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.BarcodeFiets_uit ?? "—"}</td>
              <td className="px-3 py-2">{row.BikeTypeName ?? row.BikeTypeID}</td>
              <td className="px-3 py-2">{row.ClientTypeName ?? row.ClientTypeID}</td>
              <td className="px-3 py-2">{formatDuration(row.Stallingsduur)}</td>
              <td className="px-3 py-2">{row.Type_checkin ?? "—"}</td>
              <td className="px-3 py-2">{row.Type_checkout ?? "—"}</td>
              <td className="px-3 py-2">{formatMoney(row.Stallingskosten)}</td>
              <td className="px-3 py-2">{row.ExploitantName ?? "—"}</td>
              <td className="px-3 py-2 text-gray-500">{row.ID}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FinancialTable({ rows }: { rows: TagReportFinancialRecord[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-600">Geen financiële transacties</p>;
  }

  return (
    <div className="tag-report-table-wrap border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 text-sm tag-report-table">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Datum</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Bedrag</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">BTW</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Betaalmethode</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Omschrijving</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Code</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Account</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Site</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Stalling</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Sectie</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Abonnement</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Stalling tx</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Mollie</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {rows.map((row) => (
            <tr key={row.ID} className={row.AccountType === "SYSTEM" ? "bg-amber-50" : "hover:bg-gray-50"}>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.transactionDate)}</td>
              <td className="px-3 py-2">{formatMoney(row.amount)}</td>
              <td className="px-3 py-2">
                {row.btw != null ? formatMoney(row.btw) : "—"}
                {row.btwPercentage != null && (
                  <div className="text-xs text-gray-500">{row.btwPercentage}%</div>
                )}
              </td>
              <td className="px-3 py-2">{row.paymentMethod ?? "—"}</td>
              <td className="px-3 py-2">{row.status ?? "—"}</td>
              <td className="px-3 py-2">{row.description ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.code ?? "—"}</td>
              <td className="px-3 py-2">
                <AccountCell
                  name={row.AccountName}
                  email={row.AccountEmail}
                  accountType={row.AccountType}
                  accountId={row.accountID}
                />
              </td>
              <td className="px-3 py-2">{row.SiteName ?? "—"}</td>
              <td className="px-3 py-2">
                <ResolvedCell name={row.StallingTitle} id={row.StallingsID ?? row.bikeparkID} />
              </td>
              <td className="px-3 py-2">
                <ResolvedCell name={row.SectieName} id={row.sectionID} />
              </td>
              <td className="px-3 py-2">
                <ResolvedCell
                  name={row.SubscriptionTypeName}
                  id={row.subscriptionID != null ? String(row.subscriptionID) : null}
                />
              </td>
              <td className="px-3 py-2 text-gray-500">{row.transactionID ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.mollieTransactionID ?? "—"}</td>
              <td className="px-3 py-2 text-gray-500 font-mono text-xs">{row.ID}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TagReportPage: React.FC = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [barcodeInput, setBarcodeInput] = useState("");
  const [activeBarcode, setActiveBarcode] = useState("");
  const [accountInfo, setAccountInfo] = useState<TagReportAccountInfo[]>([]);
  const [usedSubscriptions, setUsedSubscriptions] = useState<TagReportUsedSubscription[]>([]);
  const [stallingRows, setStallingRows] = useState<TagReportStallingRecord[]>([]);
  const [financialRows, setFinancialRows] = useState<TagReportFinancialRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("tag-report-page");
    document.body.classList.add("tag-report-page");
    return () => {
      document.documentElement.classList.remove("tag-report-page");
      document.body.classList.remove("tag-report-page");
    };
  }, []);

  const loadReport = async (barcode: string) => {
    setLoading(true);
    setError(null);
    setAccountInfo([]);
    setUsedSubscriptions([]);
    setStallingRows([]);
    setFinancialRows([]);
    setActiveBarcode("");

    try {
      const response = await fetch(
        `/api/protected/test/tag-report?barcode=${encodeURIComponent(barcode)}`
      );
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Fout bij ophalen rapport");
        return;
      }
      setActiveBarcode(json.barcode ?? json.tag);
      setAccountInfo(json.accountInfo ?? []);
      setUsedSubscriptions(json.usedSubscriptions ?? []);
      setStallingRows(json.stallingTransacties ?? []);
      setFinancialRows(json.financialTransacties ?? []);
    } catch {
      setError("Fout bij ophalen rapport");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = () => {
    const barcode = barcodeInput.replace(/\s+/g, "");
    if (!barcode) {
      setError("Vul een sleutelhanger barcode in.");
      return;
    }
    void loadReport(barcode);
  };

  useEffect(() => {
    if (!session || !router.isReady) return;
    const barcode = typeof router.query.barcode === "string" ? router.query.barcode.replace(/\s+/g, "") : "";
    if (!barcode) return;
    setBarcodeInput(barcode);
    void loadReport(barcode);
    // The barcode in the URL is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, router.isReady, router.query.barcode]);

  const handlePrintPdf = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const previousTitle = document.title;
    document.title = `${ts}-tag rapport - ${activeBarcode}`;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Inloggen vereist</h3>
          <p className="text-sm text-yellow-700">U moet ingelogd zijn om deze pagina te bekijken.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        html.tag-report-page,
        body.tag-report-page {
          overflow: auto !important;
          height: auto !important;
          min-height: 100%;
          max-height: none !important;
        }

        body.tag-report-page #__next,
        body.tag-report-page #__next > main {
          overflow: visible !important;
          height: auto !important;
          min-height: 100%;
          max-height: none !important;
        }

        .tag-report-print-area {
          width: 100%;
          max-width: none;
          overflow: visible;
        }

        .tag-report-table-wrap {
          overflow: visible;
        }

        .tag-report-table {
          width: max-content;
          min-width: 100%;
          table-layout: auto;
          white-space: normal;
          word-break: break-word;
        }

        .tag-report-table th,
        .tag-report-table td {
          white-space: normal;
          word-break: break-word;
          vertical-align: top;
        }

        @media print {
          html.tag-report-page,
          body.tag-report-page,
          body.tag-report-page #__next,
          body.tag-report-page #__next > main {
            overflow: visible !important;
            height: auto !important;
            width: auto !important;
            max-height: none !important;
          }

          @page {
            size: A4 landscape;
            margin: 8mm;
          }

          .no-print {
            display: none !important;
          }

          body {
            background: white;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .tag-report-print-area {
            padding: 0;
            max-width: none;
            width: 100%;
          }

          .tag-report-table-wrap {
            overflow: visible;
            border: none;
          }

          .tag-report-table {
            width: 100%;
            min-width: 0;
            table-layout: fixed;
            font-size: 7px;
            line-height: 1.2;
          }

          .tag-report-table th,
          .tag-report-table td {
            padding: 2px 3px;
            overflow: visible;
          }

          .tag-report-section {
            break-inside: auto;
            margin-bottom: 12px;
            overflow: visible;
          }

          .tag-report-table thead {
            display: table-header-group;
          }

          .tag-report-table tr {
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="w-full max-w-none px-4 py-8 tag-report-print-area">
        <div className="mb-4 no-print">
          <Link href="/test" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Terug naar test menu
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tag rapport</h1>
        <p className="text-sm text-gray-600 mb-6 no-print">
          Zoekt stalling- en financiële transacties voor een sleutelhanger barcode (12 cijfers,
          opgeslagen als PasID) over de volledige historie.
        </p>

        <div className="flex flex-wrap items-end gap-4 mb-6 no-print">
          <div>
            <label htmlFor="barcode-input" className="block text-sm font-medium text-gray-700 mb-1">
              Sleutelhanger barcode
            </label>
            <input
              id="barcode-input"
              type="text"
              inputMode="numeric"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="bijv. 010000474897"
              className="border border-gray-300 rounded-md px-3 py-2 w-64 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button
            onClick={handleCreateReport}
            disabled={loading}
            className="px-6 py-2"
            style={{ backgroundColor: "#3B82F6" }}
          >
            {loading ? "Laden…" : "Rapport maken"}
          </Button>
          {activeBarcode && !loading && (
            <Button
              onClick={handlePrintPdf}
              className="px-6 py-2"
              style={{ backgroundColor: "#059669" }}
            >
              Export PDF
            </Button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 mb-4 text-sm no-print">
            {error}
          </div>
        )}

        {activeBarcode && !loading && (
          <>
            <p className="text-sm text-gray-700 mb-6 tag-report-summary">
              Barcode <strong>{activeBarcode}</strong>: {stallingRows.length} stalling transactie
              {stallingRows.length !== 1 ? "s" : ""}, {financialRows.length} financiële transactie
              {financialRows.length !== 1 ? "s" : ""} (alle jaren).
            </p>

            <div className="space-y-10">
              <section className="tag-report-section">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Gekoppelde accounts</h2>
                <AccountLinks accounts={accountInfo} />
              </section>
              <LinkedReportSection
                title="Gekoppelde barcodes"
                empty="Geen barcodes op deze tag."
                linkHeader="Barcode"
                detailHeader="Gemeenten"
                rows={barcodeLinksFromTag(accountInfo, stallingRows)}
              />
              <SubscriptionTable title="Gebruikte abonnementen" rows={usedSubscriptions} />

              <section className="tag-report-section">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Stalling transacties ({stallingRows.length})
                </h2>
                <StallingTable rows={stallingRows} />
                <p className="mt-3 text-xs text-gray-500">
                  Bezoeken ouder dan 18 maanden zijn verwijderd vanwege de bewaartermijn voor privacy.
                </p>
              </section>

              <section className="tag-report-section">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Financiële transacties ({financialRows.length})
                </h2>
                {financialRows.length > 0 && (
                  <p className="text-xs text-gray-500 mb-3 no-print">
                    Betalingen voor deze sleutelhanger: stallingskosten van deze tag en abonnementen op deze pas.
                  </p>
                )}
                <FinancialTable rows={financialRows} />
                <p className="mt-3 text-xs text-gray-500">
                  Bij betalingen ouder dan 18 maanden is het account losgekoppeld vanwege de bewaartermijn voor privacy.
                </p>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default TagReportPage;
