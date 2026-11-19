import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { Button } from "~/components/Button";
import { formatDateTimeNl } from "~/utils/datetime-nl";
import { accountKindLabel } from "~/utils/account-kind-label";
import {
  LinkedReportSection,
  linksFromAccountPasses,
  SubscriptionTable,
} from "~/components/test-reports/LinkedReportSection";
import type {
  AccountPasMatch,
  AccountReport,
  AccountReportAccount,
  AccountReportFinancial,
  AccountReportStalling,
} from "~/server/services/test/account-report";

function money(amount: number | null): string {
  if (amount == null) return "—";
  return `€ ${amount.toFixed(2)}`;
}

function when(value: string | null): string {
  return formatDateTimeNl(value);
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 break-all">{value && value.length > 0 ? value : "—"}</dd>
    </div>
  );
}

function AccountSection({ account, matchedPasId }: { account: AccountReportAccount; matchedPasId?: string }) {
  return (
    <section className="mb-8 account-report-section">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">Account</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm mb-6 border border-gray-200 rounded-lg bg-white p-4">
        <Field label="Accountnummer" value={account.ID} />
        <Field label="Naam" value={account.name} />
        <Field label="E-mail" value={account.email} />
        <Field label="Telefoon" value={account.phone} />
        <Field label="Mobiel" value={account.mobile} />
        <Field label="Adres" value={account.address} />
        <Field label="Postcode" value={account.zip} />
        <Field label="Plaats" value={account.city} />
        <Field label="Saldo" value={money(account.saldo)} />
        <Field label="Type" value={accountKindLabel(account.accountType)} />
        <Field label="Status" value={account.status} />
        <Field label="Nieuwsbrief" value={account.newsletter} />
        <Field label="Geregistreerd" value={when(account.dateRegistration)} />
        <Field label="Laatste login" value={when(account.lastLogin)} />
        <Field label="Saldo bijgewerkt" value={when(account.dateLastSaldoUpdate)} />
        <Field label="Gemeenten" value={account.gemeenten.join(", ")} />
      </dl>

      <h3 className="text-base font-semibold text-gray-900 mb-2">Passen</h3>
      {account.passes.length === 0 ? (
        <p className="text-sm text-gray-600">Geen passen op dit account.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg account-report-table-wrap">
          <table className="min-w-full text-sm account-report-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Sleutelhanger / pas</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Naam</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Fietstag</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Gemeente</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Nu gestald</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {account.passes.map((p) => (
                <tr
                  key={`${p.pasID}-${p.pastype}-${p.gemeente ?? ""}`}
                  className={matchedPasId && p.pasID === matchedPasId ? "bg-blue-50" : undefined}
                >
                  <td className="px-3 py-2 font-mono text-xs">{p.pasID}</td>
                  <td className="px-3 py-2">{p.pastype}</td>
                  <td className="px-3 py-2">{p.naam ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.barcodeFiets ?? "—"}</td>
                  <td className="px-3 py-2">{p.gemeente ?? "—"}</td>
                  <td className="px-3 py-2">{p.huidigeStalling ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FinancialSection({ rows }: { rows: AccountReportFinancial[] }) {
  return (
    <section className="mb-8 account-report-section">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">Financiële transacties</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">Geen financiële transacties.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg account-report-table-wrap">
          <table className="min-w-full text-sm account-report-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Datum</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Bedrag</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Route</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Code</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Omschrijving</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Betaalwijze</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Gemeente</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Stalling</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Soort</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Sleutelhanger</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Fietstag</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Abonnement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {rows.map((row) => (
                <tr key={row.ID}>
                  <td className="px-3 py-2 whitespace-nowrap">{when(row.transactionDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                  <td className="px-3 py-2">{row.route}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.code ?? "—"}</td>
                  <td className="px-3 py-2">{row.description ?? "—"}</td>
                  <td className="px-3 py-2">{row.status ?? "—"}</td>
                  <td className="px-3 py-2">{row.paymentMethod ?? "—"}</td>
                  <td className="px-3 py-2">{row.gemeente ?? "—"}</td>
                  <td className="px-3 py-2">{row.stalling ?? "—"}</td>
                  <td className="px-3 py-2">{row.soort}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.sleutelhanger ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.fietstag ?? "—"}</td>
                  <td className="px-3 py-2">{row.abonnement ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Betalingen ouder dan 18 maanden zijn losgekoppeld van het account vanwege de bewaartermijn voor privacy. Ze staan daarom niet meer in dit overzicht.
      </p>
    </section>
  );
}

function StallingSection({ rows }: { rows: AccountReportStalling[] }) {
  return (
    <section className="mb-8 account-report-section">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">Stallingstransacties</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">Geen stallingstransacties.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg account-report-table-wrap">
          <table className="min-w-full text-sm account-report-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Check-in</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Check-uit</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Stalling</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Soort</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Sectie</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Plek</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Sleutelhanger</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Pastype</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Fietstag in</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Fietstag uit</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Kosten</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Gemeente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {rows.map((row) => (
                <tr key={row.ID}>
                  <td className="px-3 py-2 whitespace-nowrap">{when(row.checkin)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{when(row.checkout)}</td>
                  <td className="px-3 py-2">{row.stalling ?? "—"}</td>
                  <td className="px-3 py-2">{row.soort}</td>
                  <td className="px-3 py-2">{row.sectie ?? "—"}</td>
                  <td className="px-3 py-2">{row.plek ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.sleutelhanger ?? "—"}</td>
                  <td className="px-3 py-2">{row.pastype ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.fietstagIn ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.fietstagUit ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.kosten)}</td>
                  <td className="px-3 py-2">{row.gemeente ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Bezoeken ouder dan 18 maanden zijn verwijderd vanwege de bewaartermijn voor privacy.
      </p>
    </section>
  );
}

const AccountReportPage: React.FC = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [accountInput, setAccountInput] = useState("");
  const [pasInput, setPasInput] = useState("");
  const [report, setReport] = useState<AccountReport | null>(null);
  const [matches, setMatches] = useState<AccountPasMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("account-report-page");
    document.body.classList.add("account-report-page");
    return () => {
      document.documentElement.classList.remove("account-report-page");
      document.body.classList.remove("account-report-page");
    };
  }, []);

  const loadReport = async (accountId: string, pasId: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (pasId) params.set("pasId", pasId);
    setLoading(true);
    setError(null);
    setReport(null);
    setMatches([]);
    try {
      const response = await fetch(`/api/protected/test/account-report?${params.toString()}`);
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Fout bij ophalen rapport");
        return;
      }
      if (Array.isArray(json.matches)) {
        setMatches(json.matches as AccountPasMatch[]);
        return;
      }
      const loaded = json as AccountReport;
      setReport(loaded);
      setAccountInput(loaded.account.ID);
    } catch {
      setError("Fout bij ophalen rapport");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session || !router.isReady) return;
    const accountId = typeof router.query.accountId === "string" ? router.query.accountId.trim() : "";
    if (!accountId) return;
    setAccountInput(accountId);
    void loadReport(accountId, "");
    // The account id in the URL is the trigger. loadReport is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, router.isReady, router.query.accountId]);

  const handleCreateReport = async () => {
    const accountId = accountInput.trim();
    const pasId = pasInput.replace(/\s+/g, "");
    if (!accountId && !pasId) {
      setError("Vul een accountnummer of een pas in.");
      return;
    }
    await loadReport(pasId ? "" : accountId, pasId);
  };

  const handlePrintPdf = () => {
    if (!report) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const previousTitle = document.title;
    document.title = `${ts}-account rapport - ${report.account.ID}`;
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
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Inloggen vereist</h3>
          <p className="text-sm text-yellow-700">U moet ingelogd zijn om deze pagina te bekijken.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        html.account-report-page,
        body.account-report-page {
          overflow: auto !important;
          height: auto !important;
          min-height: 100%;
          max-height: none !important;
        }

        body.account-report-page #__next,
        body.account-report-page #__next > main {
          overflow: visible !important;
          height: auto !important;
          min-height: 100%;
          max-height: none !important;
        }

        .account-report-print-area {
          width: 100%;
          max-width: none;
          overflow: visible;
        }

        .account-report-table-wrap {
          overflow: visible;
        }

        .account-report-table {
          width: max-content;
          min-width: 100%;
          table-layout: auto;
          white-space: normal;
          word-break: break-word;
        }

        .account-report-table th,
        .account-report-table td {
          white-space: normal;
          word-break: break-word;
          vertical-align: top;
        }

        @media print {
          html.account-report-page,
          body.account-report-page,
          body.account-report-page #__next,
          body.account-report-page #__next > main {
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

          .account-report-print-area {
            padding: 0;
            max-width: none;
            width: 100%;
          }

          .account-report-table-wrap {
            overflow: visible;
            border: none;
          }

          .account-report-table {
            width: 100%;
            min-width: 0;
            table-layout: fixed;
            font-size: 7px;
            line-height: 1.2;
          }

          .account-report-table th,
          .account-report-table td {
            padding: 2px 3px;
            overflow: visible;
          }

          .account-report-section {
            break-inside: auto;
            margin-bottom: 12px;
            overflow: visible;
          }

          .account-report-table thead {
            display: table-header-group;
          }

          .account-report-table tr {
            break-inside: avoid;
          }
        }
      `}</style>
    <div className="w-full max-w-none px-4 py-8 account-report-print-area">
      <div className="mb-4 no-print">
        <Link href="/test" className="text-blue-600 hover:text-blue-800 text-sm">
          ← Terug naar test menu
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Account rapport</h1>
      <p className="text-sm text-gray-600 mb-6 no-print">
        Vul een accountnummer in, of een pas (sleutelhanger) om het account te vinden. Voorloopnullen van de pas blijven staan. De route zegt hoe geld binnenkwam. Soort, sleutelhanger en fietstag zeggen waar een afschrijving naartoe ging.
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-8 no-print">
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreateReport();
        }}
      >
        <label className="flex flex-col text-sm font-semibold text-gray-700">
          Accountnummer
          <input
            type="text"
            value={accountInput}
            onChange={(e) => setAccountInput(e.target.value)}
            className="mt-1 h-10 w-96 max-w-full rounded-md border border-gray-300 px-3 font-mono text-sm font-normal"
          />
        </label>
        <label className="flex flex-col text-sm font-semibold text-gray-700">
          Pas / sleutelhanger
          <input
            type="text"
            value={pasInput}
            onChange={(e) => setPasInput(e.target.value)}
            className="mt-1 h-10 w-64 max-w-full rounded-md border border-gray-300 px-3 font-mono text-sm font-normal"
          />
        </label>
        <Button disabled={loading} className="h-10 px-4" style={{ backgroundColor: "#3B82F6" }}>
          {loading ? "Bezig…" : "Rapport"}
        </Button>
      </form>
      {report && !loading && (
        <Button
          onClick={handlePrintPdf}
          className="h-10 px-4"
          style={{ backgroundColor: "#059669" }}
        >
          Export PDF
        </Button>
      )}
      </div>
      {error && <div className="mb-4 font-semibold text-red-600 no-print">{error}</div>}
      {matches.length > 0 && (
        <div className="mb-8 no-print">
          <p className="text-sm text-gray-700 mb-2">Deze pas hoort bij meerdere accounts. Kies er één.</p>
          <ul className="space-y-2">
            {matches.map((match) => (
              <li key={match.accountId}>
                <button
                  type="button"
                  className="text-left text-sm text-blue-700 hover:underline font-mono"
                  onClick={() => void loadReport(match.accountId, pasInput.replace(/\s+/g, ""))}
                >
                  {match.accountId}
                  {match.name ? ` — ${match.name}` : ""}
                  {match.email ? ` — ${match.email}` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report && (
        <>
          <AccountSection account={report.account} matchedPasId={report.matchedPasId} />
          <LinkedReportSection
            title="Gekoppelde tags"
            empty="Geen tags op dit account."
            linkHeader="Tag"
            detailHeader="Gemeenten"
            rows={linksFromAccountPasses(report.account.passes).tags}
            sectionClassName="account-report-section mb-8"
            tableClassName="account-report-table"
          />
          <LinkedReportSection
            title="Gekoppelde barcodes"
            empty="Geen barcodes op dit account."
            linkHeader="Barcode"
            detailHeader="Gemeenten"
            rows={linksFromAccountPasses(report.account.passes).barcodes}
            sectionClassName="account-report-section mb-8"
            tableClassName="account-report-table"
          />
          <SubscriptionTable
            title="Gekoppelde abonnementen"
            rows={report.linkedSubscriptions}
            sectionClassName="account-report-section mb-8"
            tableClassName="account-report-table"
          />
          <SubscriptionTable
            title="Gebruikte abonnementen"
            rows={report.usedSubscriptions}
            sectionClassName="account-report-section mb-8"
            tableClassName="account-report-table"
          />
          <FinancialSection rows={report.financial} />
          <StallingSection rows={report.stalling} />
        </>
      )}
    </div>
    </>
  );
};

export default AccountReportPage;
