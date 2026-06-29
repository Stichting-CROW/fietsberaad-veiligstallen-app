import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "~/components/Button";
import type {
  TagReportAccountInfo,
  TagReportFinancialRecord,
  TagReportStallingRecord,
} from "~/pages/api/protected/test/tag-report";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL");
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

function AccountInfoSection({ accounts }: { accounts: TagReportAccountInfo[] }) {
  if (accounts.length === 0) {
    return <p className="text-sm text-gray-600">Geen account of pas gekoppeld aan deze sleutelhanger.</p>;
  }

  return (
    <div className="space-y-4">
      {accounts.map((account, idx) => (
        <div
          key={account.accountID ?? `no-account-${idx}`}
          className="border border-gray-200 rounded-lg bg-white p-4"
        >
          <h3 className="text-base font-semibold text-gray-900 mb-3">
            {account.name ?? "Account zonder naam"}
            {account.accountID && (
              <span className="ml-2 text-xs font-normal text-gray-500 font-mono">
                {account.accountID}
              </span>
            )}
            {!account.accountID && (
              <span className="ml-2 text-xs font-normal text-gray-500">(geen account gekoppeld)</span>
            )}
          </h3>

          {account.accountID && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm mb-4">
              <div>
                <dt className="text-gray-500">E-mail</dt>
                <dd>{account.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Telefoon</dt>
                <dd>{account.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Mobiel</dt>
                <dd>{account.mobile ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Adres</dt>
                <dd>
                  {account.addressLine ?? "—"}
                  {account.zip || account.city ? (
                    <span className="text-gray-500">
                      {account.zip ? `, ${account.zip}` : ""}
                      {account.city ? ` ${account.city}` : ""}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Saldo</dt>
                <dd>{formatMoney(account.saldo)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Saldo bijgewerkt</dt>
                <dd>{formatDate(account.dateLastSaldoUpdate)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Registratie</dt>
                <dd>{formatDate(account.dateRegistration)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Laatste login</dt>
                <dd>{formatDate(account.lastLogin)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd>{account.status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Accounttype</dt>
                <dd>{account.accountType ?? "—"}</dd>
              </div>
            </dl>
          )}

          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Pas(sen) voor deze tag ({account.pasids.length})
          </h4>
          <div className="tag-report-table-wrap border border-gray-100 rounded-md">
            <table className="min-w-full text-sm tag-report-table">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">PasID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Naam</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Gemeente</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Barcode</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">RFID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">RFID bike</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Fietstype</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Nu geparkeerd</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Laatste check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {account.pasids.map((pas) => (
                  <tr key={pas.pasidRecordId}>
                    <td className="px-3 py-2 font-mono text-xs">{pas.pasID}</td>
                    <td className="px-3 py-2">{pas.naam ?? "—"}</td>
                    <td className="px-3 py-2">{pas.pastype}</td>
                    <td className="px-3 py-2">{pas.siteName ?? pas.siteID ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{pas.barcodeFiets ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{pas.RFID ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{pas.RFIDBike ?? "—"}</td>
                    <td className="px-3 py-2">{pas.bikeTypeName ?? pas.bikeTypeID ?? "—"}</td>
                    <td className="px-3 py-2">
                      {pas.currentlyParkedStallingTitle || pas.currentlyParkedSectionName ? (
                        <div>
                          <div>{pas.currentlyParkedStallingTitle ?? pas.currentlyParkedStallingsID}</div>
                          {pas.currentlyParkedSectionName && (
                            <div className="text-xs text-gray-500">{pas.currentlyParkedSectionName}</div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(pas.dateLastCheck)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
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
            <tr key={row.ID} className="hover:bg-gray-50">
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
                <ResolvedCell name={row.AccountName} id={row.AccountEmail} />
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
            <tr key={row.ID} className="hover:bg-gray-50">
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
                <ResolvedCell name={row.AccountName} id={row.AccountEmail} />
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
  const { data: session } = useSession();
  const [barcodeInput, setBarcodeInput] = useState("");
  const [activeBarcode, setActiveBarcode] = useState("");
  const [accountInfo, setAccountInfo] = useState<TagReportAccountInfo[]>([]);
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

  const handleCreateReport = async () => {
    const barcode = barcodeInput.replace(/\s+/g, "");
    if (!barcode) {
      setError("Vul een sleutelhanger barcode in.");
      return;
    }

    setLoading(true);
    setError(null);
    setAccountInfo([]);
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
      setStallingRows(json.stallingTransacties ?? []);
      setFinancialRows(json.financialTransacties ?? []);
    } catch {
      setError("Fout bij ophalen rapport");
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPdf = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const previousTitle = document.title;
    document.title = `${ts} - veiligstallen tag report - ${activeBarcode}`;
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
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Account informatie</h2>
                <AccountInfoSection accounts={accountInfo} />
              </section>

              <section className="tag-report-section">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Stalling transacties ({stallingRows.length})
                </h2>
                <StallingTable rows={stallingRows} />
              </section>

              <section className="tag-report-section">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Financiële transacties ({financialRows.length})
                </h2>
                {financialRows.length > 0 && (
                  <p className="text-xs text-gray-500 mb-3 no-print">
                    Saldo-opwaarderingen, stallingskosten, abonnementen en andere betalingen op het
                    account gekoppeld aan deze sleutelhanger.
                  </p>
                )}
                <FinancialTable rows={financialRows} />
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default TagReportPage;
