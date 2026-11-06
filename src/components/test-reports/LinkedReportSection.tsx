import Link from "next/link";
import type {
  TagReportAccountInfo,
  TagReportStallingRecord,
  TagReportUsedSubscription,
} from "~/pages/api/protected/test/tag-report";

export type LinkedReportRow = {
  key: string;
  href: string;
  label: string;
  detail?: string;
};

export function LinkedReportSection({
  title,
  empty,
  linkHeader,
  detailHeader,
  rows,
  sectionClassName = "tag-report-section",
  tableClassName = "tag-report-table",
}: {
  title: string;
  empty: string;
  linkHeader: string;
  detailHeader: string;
  rows: LinkedReportRow[];
  sectionClassName?: string;
  tableClassName?: string;
}) {
  return (
    <section className={sectionClassName}>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">{empty}</p>
      ) : (
        <table className={`min-w-full max-w-3xl text-sm ${tableClassName}`}>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">{linkHeader}</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">{detailHeader}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={row.href} className="text-blue-700 underline">
                    {row.label}
                  </Link>
                </td>
                <td className="px-3 py-2">{row.detail || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function addGemeente(current: string | undefined, gemeente: string | null | undefined): string {
  const name = gemeente?.trim();
  if (!name) return current ?? "";
  if (!current) return name;
  if (current.split(", ").includes(name)) return current;
  return `${current}, ${name}`;
}

export function barcodeLinksFromTag(
  accounts: TagReportAccountInfo[],
  stalling: TagReportStallingRecord[]
): LinkedReportRow[] {
  const details = new Map<string, string>();
  for (const account of accounts) {
    for (const pas of account.pasids) {
      const code = pas.barcodeFiets?.trim();
      if (!code) continue;
      details.set(code, addGemeente(details.get(code), pas.siteName ?? pas.siteID));
    }
  }
  for (const row of stalling) {
    for (const code of [row.BarcodeFiets_in, row.BarcodeFiets_uit]) {
      const trimmed = code?.trim();
      if (!trimmed) continue;
      details.set(trimmed, addGemeente(details.get(trimmed), row.GemeenteName));
    }
  }
  return [...details.entries()].map(([code, detail]) => ({
    key: code,
    href: `/test/barcode-report?barcodeFiets=${encodeURIComponent(code)}`,
    label: code,
    detail: detail || undefined,
  }));
}

export function tagLinksFromBarcode(
  accounts: TagReportAccountInfo[],
  stalling: TagReportStallingRecord[]
): LinkedReportRow[] {
  const details = new Map<string, string>();
  for (const account of accounts) {
    for (const pas of account.pasids) {
      const pasId = pas.pasID?.trim();
      if (!pasId) continue;
      details.set(pasId, addGemeente(details.get(pasId), pas.siteName ?? pas.siteID));
    }
  }
  for (const row of stalling) {
    const pasId = row.PasID?.trim();
    if (!pasId) continue;
    details.set(pasId, addGemeente(details.get(pasId), row.GemeenteName));
  }
  return [...details.entries()].map(([pasId, detail]) => ({
    key: pasId,
    href: `/test/tag-report?barcode=${encodeURIComponent(pasId)}`,
    label: pasId,
    detail: detail || undefined,
  }));
}

export function linksFromAccountPasses(
  passes: { pasID: string; barcodeFiets: string | null; gemeente: string | null }[]
): { tags: LinkedReportRow[]; barcodes: LinkedReportRow[] } {
  const tags = new Map<string, string>();
  const barcodes = new Map<string, string>();
  for (const pass of passes) {
    const pasId = pass.pasID?.trim();
    if (pasId) tags.set(pasId, addGemeente(tags.get(pasId), pass.gemeente));
    const code = pass.barcodeFiets?.trim();
    if (code) barcodes.set(code, addGemeente(barcodes.get(code), pass.gemeente));
  }
  return {
    tags: [...tags.entries()].map(([pasId, detail]) => ({
      key: pasId,
      href: `/test/tag-report?barcode=${encodeURIComponent(pasId)}`,
      label: pasId,
      detail: detail || undefined,
    })),
    barcodes: [...barcodes.entries()].map(([code, detail]) => ({
      key: code,
      href: `/test/barcode-report?barcodeFiets=${encodeURIComponent(code)}`,
      label: code,
      detail: detail || undefined,
    })),
  };
}

export function SubscriptionTable({
  title,
  rows,
  sectionClassName = "tag-report-section",
  tableClassName = "tag-report-table",
}: {
  title: string;
  rows: TagReportUsedSubscription[];
  sectionClassName?: string;
  tableClassName?: string;
}) {
  if (rows.length === 0) return null;
  const showTag = rows.some((row) => row.pasID);
  return (
    <section className={sectionClassName}>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <table className={`min-w-full text-sm ${tableClassName}`}>
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Nummer</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Abonnement</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Gemeente</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
            {showTag ? (
              <th className="px-3 py-2 text-left font-medium text-gray-600">Tag</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-2 font-mono text-xs">{row.number ?? "—"}</td>
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2">{row.gemeente ?? "—"}</td>
              <td className="px-3 py-2">{row.status ?? "—"}</td>
              {showTag ? (
                <td className="px-3 py-2 font-mono text-xs">
                  {row.pasID ? (
                    <Link href={`/test/tag-report?barcode=${encodeURIComponent(row.pasID)}`} className="text-blue-700 underline">
                      {row.pasID}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
